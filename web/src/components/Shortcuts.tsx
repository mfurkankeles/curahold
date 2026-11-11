// Keys for people who live in Tendwell all day — and a sheet ("?") that lists
// them, so nobody has to remember them first.
import { useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { somethingOpen, typing, type ShellActions } from '../lib/shell';
import { Dialog } from './ui';

const mac = () => /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = () => (mac() ? '⌘' : 'Ctrl');

const GO: Record<string, string> = { h: '/home', m: '/my', c: '/calendar', a: '/accounts', s: '/settings', p: '/profile' };

/** Single keys outside text boxes: N new task, / search, ? this sheet, G then a letter to go somewhere. */
export function useShortcuts(actions: ShellActions, canWrite: boolean) {
  const pendingG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || typing(e) || somethingOpen()) return;
      const k = e.key;
      if (pendingG.current && Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const to = GO[k.toLowerCase()];
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      if (k === 'g' || k === 'G') {
        pendingG.current = Date.now();
        return;
      }
      if ((k === 'n' || k === 'N' || k === 'c' || k === 'C') && canWrite) {
        e.preventDefault();
        actions.quickAdd();
      } else if (k === '/') {
        e.preventDefault();
        actions.search();
      } else if (k === '?') {
        e.preventDefault();
        actions.shortcuts();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, canWrite]);
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t, words } = useI18n();
  const mod = modKey();
  const groups: { title: string; rows: [string[], string][] }[] = [
    {
      title: t('keys.group.anywhere'),
      rows: [
        [['N'], t('keys.newTask')],
        [[mod, 'K'], t('keys.search')],
        [['/'], t('keys.search')],
        [['?'], t('keys.sheet')],
        [['Esc'], t('keys.close')],
      ],
    },
    {
      title: t('keys.group.go'),
      rows: [
        [['G', 'H'], t('nav.home')],
        [['G', 'M'], t('nav.myTasks')],
        [['G', 'C'], t('nav.calendar')],
        [['G', 'A'], words.other],
        [['G', 'P'], t('nav.profile')],
        [['G', 'S'], t('nav.settings')],
      ],
    },
    {
      title: t('keys.group.quick'),
      rows: [
        [['Enter'], t('keys.quickAdd')],
        [['Shift', 'Enter'], t('keys.quickLine')],
        [[mod, 'Enter'], t('keys.quickAll')],
        [['@'], t('keys.quickPerson')],
        [['#'], t('keys.quickAccount', { account: words.one })],
        [['!'], t('keys.quickPriority')],
      ],
    },
  ];
  return (
    <Dialog title={t('keys.title')} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>{t('common.close')}</button>}>
      <p className="muted" style={{ margin: 0 }}>
        {t('keys.lead')}
      </p>
      <div className="keys">
        {groups.map((g) => (
          <section key={g.title} className="keys__group">
            <h3 className="keys__title">{g.title}</h3>
            <dl>
              {g.rows.map(([keys, what]) => (
                <div key={keys.join('+') + what} className="keys__row">
                  <dt>{what}</dt>
                  <dd>
                    {keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="keys__then">{keys[0] === 'G' ? t('keys.then') : '+'}</span>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
