// Running a meeting: each attendee speaks in turn (a real model call each,
// short), the owner can join and write at any time, and the note taker writes
// the minutes at the end. Decisions AND action items become approval cards —
// nothing from a meeting runs before the owner's yes.
// Time-box and token budget are enforced; a meeting with nothing to decide is
// cancelled at the pre-check, at zero cost.
import type { Deps } from '../context';
import type { LlmBlock } from '../assistant/provider';
import { costMicros } from '../assistant/cost';
import { nowOf } from '../context';
import { addMeetingLine, addUsage, meetingDetail, OWNER_SEAT, propose, writeMinutes } from '../lib/office';
import { HttpError } from '../lib/errors';
import type { MeetingMinutes } from '../../../shared/src/office';
import { teamConfig, teamProvider } from './config';
import { run } from './runtime';
import { seatPolicy } from './policy';

const NOTE_TAKER = 'note-taker';

const transcriptOf = (lines: { speaker: string; body: string }[], cap = 5000) => {
  const text = lines.map((l) => `${l.speaker === OWNER_SEAT ? 'CEO' : l.speaker}: ${l.body}`).join('\n');
  return text.length > cap ? `…${text.slice(-cap)}` : text;
};

export interface RoundResult {
  status: 'spoke' | 'cancelled' | 'over-budget' | 'over-time' | 'ended';
  spoke: string[];
  tokens: number;
}

/** One round: every attendee (or only `only`) speaks once. */
export async function meetingRound(deps: Deps, id: string, only?: string[]): Promise<RoundResult> {
  const d = await meetingDetail(deps, id);
  if (!d) throw new HttpError('not_found');
  const m = d.meeting;
  if (m.status === 'ended' || m.status === 'cancelled') return { status: 'ended', spoke: [], tokens: 0 };
  // Pre-check: a meeting needs something to decide.
  if (!m.goal?.trim() && d.lines.length === 0) {
    await deps.db.system(async (q) => {
      await q.query(`update meetings set status = 'cancelled', ended_at = now() where id = $1`, [id]);
      await q.query(`insert into company_log (seat, kind, body, ref) values ('system', 'note', $1, $2)`, [`Meeting cancelled (nothing to decide): ${m.title}`, `meeting:${id}`]);
    });
    return { status: 'cancelled', spoke: [], tokens: 0 };
  }
  const now = nowOf(deps);
  const [row] = await deps.db.system((q) => q.query('select spent_tokens, started_at from meetings where id = $1', [id]));
  let spent = Number(row?.spent_tokens ?? 0);
  const started = row?.started_at ? new Date(row.started_at) : now;
  if (m.timeBoxMin && now.getTime() - started.getTime() > m.timeBoxMin * 60_000) return { status: 'over-time', spoke: [], tokens: 0 };
  const speakers = (only ?? m.attendees).filter((s) => s !== NOTE_TAKER && s !== OWNER_SEAT);
  const spoke: string[] = [];
  let lines = d.lines;
  for (const seat of speakers) {
    if (m.tokenBudget && spent >= m.tokenBudget) return { status: 'over-budget', spoke, tokens: spent };
    await deps.db.system((q) => q.query(`update meetings set speaking = $2, status = case when status = 'scheduled' then 'live' else status end, started_at = coalesce(started_at, now()) where id = $1`, [id, seat]));
    const r = await run(deps, {
      seat,
      context: 'meeting',
      text: 'Your turn to speak.',
      contextText: `Meeting: ${m.title}\nGoal / agenda: ${m.goal ?? ''}\nAttendees: ${m.attendees.join(', ')}${m.withOwner ? ' + the CEO' : ''}\n\nTranscript so far:\n${transcriptOf(lines) || '(nobody has spoken yet)'}`,
    });
    if (r.status !== 'ok') continue;
    spent += r.tokens;
    const line = await deps.db.system(async (q) => {
      const l = await addMeetingLine(q, id, seat, r.reply.slice(0, 8000));
      await q.query('update meetings set spent_tokens = $2 where id = $1', [id, spent]);
      return l;
    });
    lines = [...lines, line];
    spoke.push(seat);
  }
  await deps.db.system((q) => q.query('update meetings set speaking = null where id = $1', [id]));
  return { status: 'spoke', spoke, tokens: spent };
}

/** The owner writes in a live meeting; the one who called it (or the first attendee) answers him. */
export async function ownerSays(deps: Deps, id: string, text: string) {
  const line = await deps.db.system((q) => addMeetingLine(q, id, OWNER_SEAT, text));
  const d = await meetingDetail(deps, id);
  const chair = d!.meeting.calledBy !== OWNER_SEAT && d!.meeting.attendees.includes(d!.meeting.calledBy) ? d!.meeting.calledBy : d!.meeting.attendees.find((s) => s !== NOTE_TAKER);
  const round = chair ? await meetingRound(deps, id, [chair]) : null;
  return { line, round };
}

const MINUTES_TOOL = {
  name: 'minutes',
  description: 'The meeting minutes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      agenda: { type: 'array', items: { type: 'string' } },
      items: { type: 'array', items: { type: 'object', properties: { topic: { type: 'string' }, summary: { type: 'string' } }, required: ['topic', 'summary'] } },
      decisions: { type: 'array', items: { type: 'string' }, description: 'proposed decisions (each becomes an approval card)' },
      actions: { type: 'array', items: { type: 'object', properties: { seat: { type: 'string' }, what: { type: 'string' }, due: { type: 'string' } }, required: ['seat', 'what'] } },
      openQuestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['agenda', 'items', 'decisions', 'actions', 'openQuestions'],
  },
};

/** The note taker writes the minutes; the meeting ends; decisions and action items wait as approval cards. */
export async function closeMeeting(deps: Deps, id: string) {
  const d = await meetingDetail(deps, id);
  if (!d) throw new HttpError('not_found');
  if (d.meeting.status === 'ended' || d.meeting.status === 'cancelled') return { meeting: d.meeting, approvals: [] };
  const note = await deps.db.system((q) => seatPolicy(q, NOTE_TAKER));
  const model = teamConfig(deps).models[note?.model ?? 'standard'];
  const provider = teamProvider(deps, model);
  let minutes: MeetingMinutes = { agenda: d.meeting.goal ? [d.meeting.goal.slice(0, 300)] : [], items: [], decisions: [], actions: [], openQuestions: [], transcriptUrl: `meeting:${id}` };
  if (provider && d.lines.length) {
    const res = await provider.complete({
      system: [
        { text: `You are ${note?.name ?? 'the note taker'}, ${note?.title ?? 'meeting secretary'}. ${(note?.card.playbook ?? []).join(' ')}`, cache: true },
        { text: `Meeting: ${d.meeting.title}\nGoal: ${d.meeting.goal ?? ''}\nAttendees: ${d.meeting.attendees.join(', ')}${d.meeting.withOwner ? ' + CEO' : ''}. Mark the CEO's own words as "CEO:". Decisions are proposals. An action without an owner is an open question.` },
      ],
      messages: [{ role: 'user', content: `Transcript:\n${transcriptOf(d.lines, 12000)}` }],
      tools: [MINUTES_TOOL],
      toolChoice: 'any',
      maxTokens: 1500,
    });
    const out = res.content.find((b) => b.type === 'tool_use') as Extract<LlmBlock, { type: 'tool_use' }> | undefined;
    if (out) {
      const i = out.input as Partial<MeetingMinutes>;
      const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 1000)).filter(Boolean).slice(0, n) : []);
      minutes = {
        agenda: strs(i.agenda, 30),
        items: Array.isArray(i.items) ? i.items.slice(0, 30).map((x) => ({ topic: String(x.topic ?? '').slice(0, 300) || '—', summary: String(x.summary ?? '').slice(0, 4000) })) : [],
        decisions: strs(i.decisions, 20),
        actions: Array.isArray(i.actions) ? i.actions.slice(0, 40).filter((a) => /^[a-z][a-z0-9-]{1,40}$/.test(String(a.seat))).map((a) => ({ seat: String(a.seat), what: String(a.what ?? '').slice(0, 500), due: a.due ? String(a.due).slice(0, 40) : null })) : [],
        openQuestions: strs(i.openQuestions, 20),
        transcriptUrl: `meeting:${id}`,
      };
    }
    const tokens = res.usage.input + res.usage.output + res.usage.cacheRead + res.usage.cacheWrite;
    if (tokens) await deps.db.system((q) => addUsage(q, NOTE_TAKER, nowOf(deps), { tokens, costUsd: costMicros(provider.model, res.usage) / 1e6 }));
  }
  return deps.db.system(async (q) => {
    const r = await writeMinutes(q, id, NOTE_TAKER, minutes, deps);
    // Action items are proposals too: work enters a queue only after the owner's yes.
    for (const a of minutes.actions) {
      const [s] = await q.query('select 1 from seats where seat = $1', [a.seat]);
      if (!s) continue;
      r.approvals.push(
        await propose(
          q,
          NOTE_TAKER,
          {
            title: `${a.seat}: ${a.what}`.slice(0, 200),
            summary: `${d.meeting.title} — action item${a.due ? ` (due ${a.due})` : ''}`,
            why: 'Agreed in the meeting',
            whatChanges: a.what,
            discussedWith: d.meeting.attendees,
            risk: 'low',
            reversible: true,
            meeting: id,
            priority: 'normal',
            action: { kind: 'queue-task', seat: a.seat, title: a.what.slice(0, 300) },
          },
          deps,
        ),
      );
    }
    await q.query('update meetings set speaking = null where id = $1', [id]);
    return r;
  });
}
