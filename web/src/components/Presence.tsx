// Who else is on this task, customer or sprint right now, and who is typing
// there. The live channel says only which person ids are where (lib/live.ts,
// usePresence); names and faces come from the people list the app already has.
// Shows nothing when nobody else is there.
import type { Who } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Avatar } from './ui';
import './presence.css';

export function Presence({ who }: { who: Who }) {
  const { t, locale } = useI18n();
  const { me, person } = useStore();
  const others = who.filter(([id]) => id !== me.user.id).map(([id, typing]) => ({ p: person(id), typing }));
  if (!others.length) return null;
  const list = (names: string[]) => {
    try {
      return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
    } catch {
      return names.join(', ');
    }
  };
  const name = (p: (typeof others)[number]['p']) => p?.name ?? t('common.unknownUser');
  const typing = others.filter((o) => o.typing);
  // In the header, first names keep it short; the full names are in the label read aloud.
  const first = (p: (typeof others)[number]['p']) => name(p).split(/\s+/)[0];
  const typingLine = typing.length ? t('presence.typing', { name: list(typing.map((o) => first(o.p))) }) : '';
  const label = [
    t('presence.alsoHere', { names: list(others.map((o) => name(o.p))) }),
    typing.length ? t('presence.typing', { name: list(typing.map((o) => name(o.p))) }) : '',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <span className="presence" role="status" aria-label={label}>
      <span className="avatars" aria-hidden="true">
        {others.slice(0, 3).map((o, i) => (
          <span key={o.p?.id ?? i} className="presence__face" data-typing={o.typing || undefined}>
            <Avatar person={o.p} />
          </span>
        ))}
      </span>
      {typingLine && (
        <span className="presence__typing" aria-hidden="true">
          {typingLine}
        </span>
      )}
    </span>
  );
}
