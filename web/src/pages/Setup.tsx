// The first-run setup an administrator does alone, in about 15 minutes:
// company → where you talk → customers → people → rules → invite. Every
// step can be skipped and picked up later; progress is saved as you go.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import { SETUP_STEPS, type SetupStep } from '../../../shared/src/model';
import { AutomationList } from '../components/Automations';
import { Connections } from '../components/Connections';
import { Importer } from '../components/Importer';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { CompanyForm } from './Settings';

type Step = SetupStep | 'finish';
const ORDER: Step[] = [...SETUP_STEPS, 'finish'];
const MINUTES: Record<Step, number> = { company: 2, messaging: 3, accounts: 4, people: 4, automations: 2, finish: 0 };

export function SetupPage({ step }: { step: string | null }) {
  const { t, words } = useI18n();
  const { me, reloadMe } = useStore();
  const done = new Set(me.org.setup.done ?? []);
  const current: Step = (ORDER as string[]).includes(step ?? '') ? (step as Step) : (SETUP_STEPS.find((s) => !done.has(s)) ?? 'finish');
  const left = ORDER.filter((s) => s !== 'finish' && !done.has(s as SetupStep)).reduce((n, s) => n + MINUTES[s], 0);

  const go = (s: Step) => navigate(`/setup/${s}`);
  const complete = useCallback(
    async (s: SetupStep) => {
      await post('/setup/step', { step: s, done: true });
      await reloadMe();
      const next = ORDER[ORDER.indexOf(s) + 1] ?? 'finish';
      navigate(`/setup/${next}`);
    },
    [reloadMe],
  );

  const label = (s: Step) => t(`setup.step.${s}` as MessageKey, { accounts: words.other });
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{t('setup.title')}</h1>
        <span className="topbar__sub">{left > 0 ? t('setup.minutesLeft', { n: left }) : t('setup.almost')}</span>
        <div className="topbar__spacer" />
        <button className="btn btn--quiet btn--small" onClick={() => navigate('/my')}>
          {t('setup.later')}
        </button>
      </header>
      <div className="page wizard">
        <ol className="wizard__rail" aria-label={t('setup.title')}>
          {ORDER.map((s, i) => {
            const state = s === current ? 'current' : s !== 'finish' && done.has(s) ? 'done' : 'todo';
            return (
              <li key={s} data-state={state}>
                <button onClick={() => go(s)} aria-current={s === current ? 'step' : undefined}>
                  <span className="wizard__dot" aria-hidden="true">
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span className="wizard__label">{label(s)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <section className="wizard__panel">
          <h2 className="wizard__title">{label(current)}</h2>
          <p className="wizard__lead">{t(`setup.lead.${current}` as MessageKey, { accounts: words.other.toLocaleLowerCase() })}</p>
          {current === 'company' && <CompanyForm submitLabel={t('setup.saveContinue')} onSaved={() => complete('company')} />}
          {current === 'messaging' && <MessagingStep onNext={() => complete('messaging')} />}
          {current === 'accounts' && <AccountsStep onNext={() => complete('accounts')} />}
          {current === 'people' && <PeopleStep onNext={() => complete('people')} />}
          {current === 'automations' && (
            <>
              <AutomationList />
              <StepNav onNext={() => complete('automations')} />
            </>
          )}
          {current === 'finish' && <FinishStep done={done} onGo={go} />}
        </section>
      </div>
    </>
  );
}

function StepNav({ onNext, nextLabel, skip }: { onNext: () => void; nextLabel?: string; skip?: string }) {
  const { t } = useI18n();
  return (
    <div className="wizard__nav">
      <button className="btn btn--primary" onClick={onNext}>
        {nextLabel ?? t('setup.continue')}
      </button>
      {skip && <span className="field__hint">{skip}</span>}
    </div>
  );
}

function MessagingStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  return (
    <>
      <Connections back="setup" onChange={(l) => setCount(l.length)} />
      <StepNav onNext={onNext} skip={count ? undefined : t('setup.messaging.skip')} />
    </>
  );
}

function AccountsStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const [imported, setImported] = useState(false);
  return (
    <>
      <Importer compact onImported={() => setImported(true)} />
      <p className="field__hint" style={{ marginTop: 12 }}>
        {t('setup.accounts.crmLater')}
      </p>
      <StepNav onNext={onNext} skip={imported ? undefined : t('setup.accounts.skip')} />
    </>
  );
}

interface Suggestion {
  email: string;
  name: string;
  sources: string[];
  member: boolean;
  accounts: number;
}
type Role = 'admin' | 'manager' | 'member' | 'viewer';

function PeopleStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const { reloadPeople, people: members, toast } = useStore();
  const [data, setData] = useState<{ people: Suggestion[]; nameOnly: { name: string; accounts: number }[]; groups: { name: string; emails: string[] }[]; teams: string[] } | null>(null);
  const [picked, setPicked] = useState<Record<string, { on: boolean; name: string; role: Role; team: string }>>({});
  const [teams, setTeams] = useState<Record<string, { on: boolean; lead: string }>>({});
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void get('/setup/people').then((d) => {
      setData(d);
      const groupOf = (email: string) => d.groups.find((g: any) => g.emails.includes(email))?.name ?? '';
      const init: typeof picked = {};
      for (const p of d.people as Suggestion[]) {
        if (p.member) continue;
        // People who own accounts in the file are on by default; the rest of a big workspace is not.
        init[p.email] = { on: p.accounts > 0, name: p.name, role: 'member', team: groupOf(p.email) || (d.teams[0] ?? '') };
      }
      setPicked(init);
      setTeams(Object.fromEntries((d.teams as string[]).map((n, i) => [n, { on: i === 0, lead: '' }])));
    });
  }, []);

  // "ada@firma.com, Ada Demir" lines → extra people.
  const pasted = useMemo(
    () =>
      paste
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const email = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/.exec(l)?.[0]?.toLowerCase() ?? '';
          const name = l.replace(email, '').replace(/[<>,;]/g, ' ').trim() || email.split('@')[0];
          return { email, name };
        })
        .filter((p) => p.email && !members.some((m) => m.email === p.email)),
    [paste, members],
  );

  if (!data) return <p className="muted">{t('common.loading')}</p>;
  const chosen = Object.entries(picked).filter(([, v]) => v.on);
  const allPeople = [...chosen.map(([email, v]) => ({ email, ...v })), ...pasted.filter((p) => !picked[p.email]).map((p) => ({ ...p, on: true, role: 'member' as Role, team: Object.keys(teams).find((k) => teams[k].on) ?? '' }))];
  const paid = members.filter((m) => m.seat === 'full' && m.status !== 'deleted' && m.status !== 'disabled').length + allPeople.filter((p) => p.role !== 'viewer').length;
  const teamNames = Object.keys(teams).filter((k) => teams[k].on);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await post<{ created: number; teamsCreated: number }>('/setup/people', {
        people: allPeople.map((p) => ({ email: p.email, name: p.name, role: p.role, teams: p.team && teams[p.team]?.on ? [p.team] : [] })),
        teams: teamNames.map((name) => ({ name, leadEmail: teams[name].lead || null })),
      });
      toast(t('setup.people.added', { n: r.created, teams: r.teamsCreated }));
      await reloadPeople();
      onNext();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const suggestions = data.people.filter((p) => !p.member);
  return (
    <>
      {Object.keys(teams).length > 0 && (
        <div className="sheet" style={{ marginBottom: 14 }}>
          <h3 className="section__head">{t('setup.people.teams')}</h3>
          <div className="team-picks">
            {Object.entries(teams).map(([name, v]) => (
              <div key={name} className="team-pick" data-on={v.on ? 'true' : undefined}>
                <label className="checkbox">
                  <input type="checkbox" checked={v.on} onChange={(e) => setTeams({ ...teams, [name]: { ...v, on: e.target.checked } })} />
                  <strong>{name}</strong>
                </label>
                {v.on && (
                  <select className="select" value={v.lead} aria-label={t('setup.people.lead', { team: name })} onChange={(e) => setTeams({ ...teams, [name]: { ...v, lead: e.target.value } })}>
                    <option value="">{t('setup.people.noLead')}</option>
                    {[...members.filter((m) => m.status === 'active').map((m) => ({ email: m.email, name: m.name })), ...allPeople].map((p) => (
                      <option key={p.email} value={p.email}>
                        {t('setup.people.leadIs', { name: p.name })}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 ? (
        <table className="table people-picks">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label={t('setup.people.all')}
                  checked={suggestions.every((p) => picked[p.email]?.on)}
                  onChange={(e) => setPicked(Object.fromEntries(Object.entries(picked).map(([k, v]) => [k, { ...v, on: e.target.checked }])))}
                />
              </th>
              <th>{t('setup.people.person')}</th>
              <th className="hide-phone">{t('setup.people.from')}</th>
              <th>{t('setup.people.role')}</th>
              {teamNames.length > 0 && <th className="hide-phone">{t('setup.people.team')}</th>}
            </tr>
          </thead>
          <tbody>
            {suggestions.map((p) => {
              const v = picked[p.email];
              if (!v) return null;
              const upd = (x: Partial<typeof v>) => setPicked({ ...picked, [p.email]: { ...v, ...x } });
              return (
                <tr key={p.email} data-off={v.on ? undefined : 'true'}>
                  <td>
                    <input type="checkbox" aria-label={p.name} checked={v.on} onChange={(e) => upd({ on: e.target.checked })} />
                  </td>
                  <td>
                    <input className="input input--plain" value={v.name} aria-label={t('setup.people.name')} onChange={(e) => upd({ name: e.target.value })} />
                    <div className="muted">{p.email}</div>
                  </td>
                  <td className="hide-phone muted">
                    {p.sources.map((s) => t(`setup.people.source.${s === 'file' ? 'file' : 'chat'}` as MessageKey, { n: p.accounts })).join(' · ')}
                  </td>
                  <td>
                    <select className="select" value={v.role} aria-label={t('setup.people.role')} onChange={(e) => upd({ role: e.target.value as Role })}>
                      {(['member', 'manager', 'admin', 'viewer'] as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {t(`role.${r}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  {teamNames.length > 0 && (
                    <td className="hide-phone">
                      <select className="select" value={v.team} aria-label={t('setup.people.team')} onChange={(e) => upd({ team: e.target.value })}>
                        <option value="">{t('common.none')}</option>
                        {teamNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="sheet__hint">{t('setup.people.noSuggestions')}</p>
      )}

      {data.nameOnly.length > 0 && (
        <p className="notice" style={{ marginTop: 12 }}>
          {t('setup.people.nameOnly', { names: data.nameOnly.map((n) => n.name).join(', ') })}
        </p>
      )}

      <label className="field" style={{ marginTop: 14 }}>
        <span className="field__label">{t('setup.people.paste')}</span>
        <textarea className="textarea" rows={3} value={paste} placeholder={t('setup.people.pastePlaceholder')} onChange={(e) => setPaste(e.target.value)} />
        {pasted.length > 0 && <span className="field__hint">{t('setup.people.pasteCount', { n: pasted.length })}</span>}
      </label>

      <div className="wizard__nav">
        <button className="btn btn--primary" disabled={busy} onClick={allPeople.length || teamNames.length ? apply : onNext}>
          {allPeople.length ? t('setup.people.addN', { n: allPeople.length }) : t('setup.continue')}
        </button>
        <span className="field__hint">{t('setup.people.seats', { n: paid })}</span>
      </div>
      <p className="field__hint">{t('setup.people.noEmailYet')}</p>
    </>
  );
}

function FinishStep({ done, onGo }: { done: Set<SetupStep>; onGo: (s: SetupStep) => void }) {
  const { t, words } = useI18n();
  const { people, boards, reloadMe, toast } = useStore();
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const invited = people.filter((p) => p.status === 'invited').length;
  const finish = async () => {
    setBusy(true);
    try {
      const r = await post<{ invited: number }>('/setup/finish', { sendInvites: send });
      await reloadMe();
      toast(r.invited ? t('setup.finish.sent', { n: r.invited }) : t('setup.finish.ready'));
      navigate(boards[0] ? `/b/${boards[0].id}` : '/my');
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ul className="checklist">
        {SETUP_STEPS.map((s) => (
          <li key={s} data-done={done.has(s) ? 'true' : undefined}>
            <span aria-hidden="true">{done.has(s) ? '✓' : '○'}</span>
            <span>{t(`setup.step.${s}` as MessageKey, { accounts: words.other })}</span>
            {!done.has(s) && (
              <button className="btn btn--quiet btn--small" onClick={() => onGo(s)}>
                {t('setup.finish.goBack')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {invited > 0 && (
        <label className="checkbox" style={{ margin: '16px 0' }}>
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
          <span>{t('setup.finish.sendInvites', { n: invited })}</span>
        </label>
      )}
      <div className="wizard__nav">
        <button className="btn btn--primary" disabled={busy} onClick={finish}>
          {t('setup.finish.go')}
        </button>
        <span className="field__hint">{t('setup.finish.hint')}</span>
      </div>
    </>
  );
}
