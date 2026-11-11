// Inbound calls from the chat services (button presses, commands, installs).
// They arrive at the central address; each request is verified (Slack
// signature, Microsoft / Google signed token) and mapped to a company by the
// workspace it came from, then to a person by their chat identity.
import { Hono } from 'hono';
import { translate, normalizeLocale, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { connectionByExternal, upsertIdentity } from '../connectors/messaging';
import { CHAT_ISSUER, CHAT_JWKS, chatCard } from '../connectors/messaging/gchat';
import { slackApi, slackBlocks, verifySlackRequest } from '../connectors/messaging/slack';
import { adaptiveCard, BOT_ISSUERS, BOT_JWKS, botCall, teamsMember } from '../connectors/messaging/teams';
import type { LoadedConnection } from '../connectors/messaging/types';
import { fetchOf, nowOf, type AppEnv, type Deps } from '../context';
import { completeTask, createFromChat, snoozeTask, userByEmail, userByIdentity, type ChatOutcome } from '../lib/chatActions';
import { emailDomain } from '../lib/domains';
import { verifyRs256 } from '../lib/jwt';

export const hookRoutes = new Hono<AppEnv>();

const say = (locale: Locale, key: MessageKey, vars: Record<string, string | number> = {}) => translate(locale, key, vars);

function outcomeText(locale: Locale, kind: 'done' | 'snooze' | 'create', r: ChatOutcome): string {
  if (!r.ok) return say(locale, r.reason === 'read_only' ? 'chat.readOnly' : r.reason === 'not_member' ? 'chat.notLinked' : 'chat.notFound');
  if (kind === 'done') return say(locale, 'chat.done', { title: r.title });
  if (kind === 'snooze') return say(locale, 'chat.snoozed', { title: r.title, date: r.date ?? '' });
  return say(locale, 'chat.created', { title: r.title, url: r.url });
}

/** "new Call Ada about the renewal" / "yeni …" → a title; anything else → help. */
export function parseCommand(text: string): { kind: 'create'; title: string } | { kind: 'help' } {
  const clean = text.replace(/<at>[^<]*<\/at>/g, '').replace(/^@\S+\s*/, '').trim();
  const m = /^(new|yeni|task|görev)\s+([\s\S]+)$/i.exec(clean);
  return m ? { kind: 'create', title: m[2].trim() } : { kind: 'help' };
}

async function act(deps: Deps, conn: LoadedConnection, userId: string, kind: 'done' | 'snooze', taskId: string) {
  if (!/^[0-9a-f-]{36}$/.test(taskId)) return { ok: false as const, reason: 'not_found' as const };
  return kind === 'done' ? completeTask(deps, conn.orgId, userId, taskId) : snoozeTask(deps, conn.orgId, userId, taskId);
}

// ------------------------------------------------------------------- Slack

async function slackPerson(deps: Deps, conn: LoadedConnection, slackUserId: string) {
  const known = await userByIdentity(deps, conn.id, slackUserId);
  if (known) return known;
  const info = await slackApi(deps, String(conn.secret?.botToken ?? ''), 'users.info', { user: slackUserId }, true).catch(() => null);
  const email = info?.user?.profile?.email;
  if (!email) return null;
  const u = await userByEmail(deps, conn.orgId, email);
  if (u) await upsertIdentity(deps, conn, u.id, slackUserId);
  return u;
}

hookRoutes.post('/slack', async (c) => {
  const deps = c.get('deps');
  if (!deps.config.connectors.slack) return c.text('not configured', 404);
  const raw = await c.req.text();
  if (!(await verifySlackRequest(deps, raw, c.req.header('x-slack-request-timestamp'), c.req.header('x-slack-signature')))) {
    return c.text('bad signature', 401);
  }
  if ((c.req.header('content-type') ?? '').includes('application/json')) {
    const ev = JSON.parse(raw);
    if (ev.type === 'url_verification') return c.json({ challenge: ev.challenge });
    if (ev.type === 'event_callback' && (ev.event?.type === 'app_uninstalled' || ev.event?.type === 'tokens_revoked') && ev.team_id) {
      await deps.db.system((q) =>
        q.query(`update connections set status = 'error', last_error = 'app removed from workspace' where provider = 'slack' and external_id = $1`, [ev.team_id]),
      );
    }
    return c.json({ ok: true });
  }
  const form = new URLSearchParams(raw);
  const payload = form.get('payload') ? JSON.parse(form.get('payload')!) : null;
  const teamId = payload?.team?.id ?? form.get('team_id');
  const slackUser = payload?.user?.id ?? form.get('user_id');
  const conn = teamId ? await connectionByExternal(deps, 'slack', teamId) : null;
  if (!conn) return c.json({ response_type: 'ephemeral', text: say('en', 'chat.notConnected') });
  const person = slackUser ? await slackPerson(deps, conn, slackUser) : null;
  const [org] = await deps.db.system((q) => q.query('select locale from orgs where id = $1', [conn.orgId]));
  const locale = normalizeLocale(person?.locale ?? org?.locale);
  if (!person) return c.json({ response_type: 'ephemeral', text: say(locale, 'chat.notLinked') });

  if (!payload) {
    // Slash command: /tendwell <title>
    const text = (form.get('text') ?? '').trim();
    if (!text) return c.json({ response_type: 'ephemeral', text: say(locale, 'chat.helpSlack') });
    const r = await createFromChat(deps, conn.orgId, person.id, { title: text });
    return c.json({ response_type: 'ephemeral', text: outcomeText(locale, 'create', r) });
  }

  if (payload.type === 'message_action') {
    const msgText = String(payload.message?.text ?? '');
    const r = await createFromChat(deps, conn.orgId, person.id, { title: msgText.split('\n')[0], description: msgText });
    if (payload.response_url) {
      await fetchOf(deps)(payload.response_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response_type: 'ephemeral', text: outcomeText(locale, 'create', r) }),
      }).catch(() => undefined);
    }
    return c.body(null, 200);
  }

  if (payload.type === 'block_actions') {
    const a = (payload.actions ?? [])[0];
    const kind = a?.action_id === 'tw_done' ? 'done' : a?.action_id === 'tw_snooze' ? 'snooze' : null;
    if (!kind) return c.body(null, 200); // the "open" button is a plain link
    const r = await act(deps, conn, person.id, kind, String(a.value ?? ''));
    const note = outcomeText(locale, kind, r);
    if (payload.response_url) {
      // Replace the buttons with what happened, so nobody presses them twice.
      const original = (payload.message?.blocks ?? []) as any[];
      const blocks = original.filter((b) => b.type !== 'actions').concat([{ type: 'context', elements: [{ type: 'mrkdwn', text: note }] }]);
      const body = r.ok
        ? { replace_original: true, text: note, blocks: blocks.length > 1 ? blocks : slackBlocks({ title: note, openLabel: '' }, false) }
        : { response_type: 'ephemeral', replace_original: false, text: note };
      await fetchOf(deps)(payload.response_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(
        () => undefined,
      );
    }
    return c.body(null, 200);
  }
  return c.body(null, 200);
});

// ------------------------------------------------------------------- Teams

async function teamsReply(deps: Deps, activity: any, text: string) {
  await botCall(deps, activity.serviceUrl, `/v3/conversations/${encodeURIComponent(activity.conversation.id)}/activities`, 'POST', {
    type: 'message',
    text,
  }).catch(() => undefined);
}

hookRoutes.post('/teams', async (c) => {
  const deps = c.get('deps');
  const t = deps.config.connectors.teams;
  if (!t) return c.text('not configured', 404);
  const bearer = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const claims = bearer
    ? await verifyRs256(bearer, { jwksUrl: BOT_JWKS, issuers: BOT_ISSUERS, audience: t.appId, fetch: fetchOf(deps), now: nowOf(deps) }).catch(() => null)
    : null;
  if (!claims) return c.text('unauthorized', 401);
  const activity = await c.req.json();
  if (claims.serviceurl && String(claims.serviceurl).replace(/\/$/, '') !== String(activity.serviceUrl ?? '').replace(/\/$/, '')) {
    return c.text('unauthorized', 401);
  }
  const tenantId = activity.channelData?.tenant?.id ?? activity.conversation?.tenantId;
  const conn = tenantId ? await connectionByExternal(deps, 'teams', String(tenantId)) : null;
  if (!conn) {
    if (activity.type === 'message' || (activity.type === 'conversationUpdate' && activity.membersAdded?.length)) {
      await teamsReply(deps, activity, say('en', 'chat.notConnected'));
    }
    return c.json({});
  }
  const [org] = await deps.db.system((q) => q.query('select locale from orgs where id = $1', [conn.orgId]));
  const isPersonal = activity.conversation?.conversationType === 'personal';

  // Who is this? Remembered after the first time; Teams tells us the email.
  const from = activity.from ?? {};
  let person = from.aadObjectId ? await userByIdentity(deps, conn.id, String(from.aadObjectId)) : null;
  if (!person && from.id && activity.serviceUrl && activity.conversation?.id) {
    const m = await teamsMember(deps, activity.serviceUrl, activity.conversation.id, from.id).catch(() => null);
    const u = m?.email ? await userByEmail(deps, conn.orgId, m.email) : null;
    if (u && isPersonal) {
      await upsertIdentity(deps, conn, u.id, String(from.aadObjectId || from.id), {
        serviceUrl: activity.serviceUrl,
        conversationId: activity.conversation.id,
        userId: from.id,
      });
    }
    person = u;
  } else if (person && isPersonal && person.data?.conversationId !== activity.conversation?.id) {
    await upsertIdentity(deps, conn, person.id, String(from.aadObjectId || from.id), {
      serviceUrl: activity.serviceUrl,
      conversationId: activity.conversation.id,
      userId: from.id,
    });
  }
  const locale = normalizeLocale(person?.locale ?? org?.locale);

  if (activity.type === 'conversationUpdate' || activity.type === 'installationUpdate') {
    const botAdded = (activity.membersAdded ?? []).some((m: any) => m.id === activity.recipient?.id) || activity.action === 'add';
    if (!botAdded) return c.json({});
    if (isPersonal) {
      await teamsReply(deps, activity, person ? say(locale, 'chat.welcome', { name: person.name }) : say(locale, 'chat.notLinked'));
    } else if (activity.conversation?.id) {
      const name = activity.channelData?.channel?.name ?? activity.channelData?.team?.name ?? activity.conversation?.name ?? 'Teams';
      await deps.db.system(async (q) => {
        const [row] = await q.query('select config from connections where id = $1', [conn.id]);
        const channels = ((row?.config?.channels ?? []) as any[]).filter((x) => x.id !== activity.conversation.id);
        channels.push({ id: activity.conversation.id, name: String(name), serviceUrl: activity.serviceUrl });
        await q.query(`update connections set config = jsonb_set(config, '{channels}', $2::jsonb), updated_at = now() where id = $1`, [
          conn.id,
          JSON.stringify(channels.slice(-200)),
        ]);
      });
    }
    return c.json({});
  }

  if (activity.type === 'invoke' && activity.name === 'composeExtension/submitAction') {
    if (!person) return c.json({ composeExtension: { type: 'message', text: say(locale, 'chat.notLinked') } });
    const html = String(activity.value?.messagePayload?.body?.content ?? activity.value?.data?.title ?? '');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const r = await createFromChat(deps, conn.orgId, person.id, { title: String(activity.value?.data?.title || text), description: text });
    return c.json({ composeExtension: { type: 'message', text: outcomeText(locale, 'create', r) } });
  }

  if (activity.type === 'message') {
    if (!person) {
      await teamsReply(deps, activity, say(locale, 'chat.notLinked'));
      return c.json({});
    }
    const v = activity.value;
    if (v && (v.tw === 'done' || v.tw === 'snooze')) {
      const r = await act(deps, conn, person.id, v.tw, String(v.taskId ?? ''));
      const note = outcomeText(locale, v.tw, r);
      if (r.ok && activity.replyToId) {
        await botCall(deps, activity.serviceUrl, `/v3/conversations/${encodeURIComponent(activity.conversation.id)}/activities/${encodeURIComponent(activity.replyToId)}`, 'PUT', {
          type: 'message',
          attachments: [adaptiveCard({ title: r.title, note, url: r.url, openLabel: say(locale, 'notify.open') }, false)],
        }).catch(() => teamsReply(deps, activity, note));
      } else {
        await teamsReply(deps, activity, note);
      }
      return c.json({});
    }
    const cmd = parseCommand(String(activity.text ?? ''));
    if (cmd.kind === 'help') await teamsReply(deps, activity, say(locale, 'chat.help'));
    else await teamsReply(deps, activity, outcomeText(locale, 'create', await createFromChat(deps, conn.orgId, person.id, { title: cmd.title })));
    return c.json({});
  }
  return c.json({});
});

// ------------------------------------------------------------- Google Chat

hookRoutes.post('/gchat', async (c) => {
  const deps = c.get('deps');
  const g = deps.config.connectors.gchat;
  if (!g) return c.text('not configured', 404);
  const bearer = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const claims = bearer
    ? await verifyRs256(bearer, { jwksUrl: CHAT_JWKS, issuers: [CHAT_ISSUER], audience: g.projectNumber, fetch: fetchOf(deps), now: nowOf(deps) }).catch(() => null)
    : null;
  if (!claims) return c.text('unauthorized', 401);
  const ev = await c.req.json();
  const email = String(ev.user?.email ?? '').toLowerCase();
  const conn = email ? await connectionByExternal(deps, 'gchat', emailDomain(email)) : null;
  if (!conn) return c.json({ text: say('en', 'chat.notConnected') });
  const [org] = await deps.db.system((q) => q.query('select locale from orgs where id = $1', [conn.orgId]));
  const space = ev.space ?? {};
  const isDm = space.type === 'DM' || space.spaceType === 'DIRECT_MESSAGE' || space.singleUserBotDm === true;
  const chatUser = String(ev.user?.name ?? '');
  let person = chatUser ? await userByIdentity(deps, conn.id, chatUser) : null;
  if (!person) {
    const u = await userByEmail(deps, conn.orgId, email);
    if (u && isDm && /^spaces\//.test(String(space.name ?? ''))) await upsertIdentity(deps, conn, u.id, chatUser, { space: space.name });
    person = u;
  } else if (isDm && person.data?.space !== space.name && /^spaces\//.test(String(space.name ?? ''))) {
    await upsertIdentity(deps, conn, person.id, chatUser, { space: space.name });
  }
  const locale = normalizeLocale(person?.locale ?? org?.locale);

  if (ev.type === 'ADDED_TO_SPACE') {
    if (!isDm && /^spaces\//.test(String(space.name ?? ''))) {
      await deps.db.system(async (q) => {
        const [row] = await q.query('select config from connections where id = $1', [conn.id]);
        const channels = ((row?.config?.channels ?? []) as any[]).filter((x) => x.id !== space.name);
        channels.push({ id: space.name, name: String(space.displayName ?? space.name) });
        await q.query(`update connections set config = jsonb_set(config, '{channels}', $2::jsonb), updated_at = now() where id = $1`, [
          conn.id,
          JSON.stringify(channels.slice(-200)),
        ]);
      });
      return c.json({ text: say(locale, 'chat.addedToSpace') });
    }
    return c.json({ text: person ? say(locale, 'chat.welcome', { name: person.name }) : say(locale, 'chat.notLinked') });
  }
  if (ev.type === 'REMOVED_FROM_SPACE') {
    await deps.db.system(async (q) => {
      const [row] = await q.query('select config from connections where id = $1', [conn.id]);
      const channels = ((row?.config?.channels ?? []) as any[]).filter((x) => x.id !== space.name);
      await q.query(`update connections set config = jsonb_set(config, '{channels}', $2::jsonb) where id = $1`, [conn.id, JSON.stringify(channels)]);
    });
    return c.json({});
  }
  if (!person) return c.json({ text: say(locale, 'chat.notLinked') });

  if (ev.type === 'CARD_CLICKED') {
    const fn = String(ev.common?.invokedFunction ?? ev.action?.actionMethodName ?? '');
    const params: any[] = ev.action?.parameters ?? [];
    const taskId = String(ev.common?.parameters?.taskId ?? params.find((p) => p.key === 'taskId')?.value ?? '');
    const kind = fn === 'tw_done' ? 'done' : fn === 'tw_snooze' ? 'snooze' : null;
    if (!kind) return c.json({});
    const r = await act(deps, conn, person.id, kind, taskId);
    const note = outcomeText(locale, kind, r);
    if (!r.ok) return c.json({ actionResponse: { type: 'NEW_MESSAGE' }, text: note });
    return c.json({ actionResponse: { type: 'UPDATE_MESSAGE' }, ...chatCard({ title: r.title, note, url: r.url, openLabel: say(locale, 'notify.open') }, false) });
  }
  if (ev.type === 'MESSAGE') {
    const slash = ev.message?.slashCommand;
    const text = String(ev.message?.argumentText ?? ev.message?.text ?? '').trim();
    if (slash) {
      if (!text) return c.json({ text: say(locale, 'chat.help') });
      return c.json({ text: outcomeText(locale, 'create', await createFromChat(deps, conn.orgId, person.id, { title: text })) });
    }
    const cmd = parseCommand(text);
    if (cmd.kind === 'help') return c.json({ text: say(locale, 'chat.help') });
    return c.json({ text: outcomeText(locale, 'create', await createFromChat(deps, conn.orgId, person.id, { title: cmd.title })) });
  }
  return c.json({});
});
