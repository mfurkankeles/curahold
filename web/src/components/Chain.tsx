// A task's whole "blocks" chain in the task panel (GET /tasks/:id/chain): what has to finish
// first, step by step back, the task itself, and what waits for it, step by step on. The
// links section above already lists the direct links, so this shows only when the chain
// goes further than one step.
import { useEffect, useMemo, useState } from 'react';
import type { ChainNode, TaskChain, TaskDetail } from '../../../shared/src/model';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { Icon } from './icons';
import '../surfaces/product.css';

function byDepth(nodes: ChainNode[]): [number, ChainNode[]][] {
  const m = new Map<number, ChainNode[]>();
  for (const n of nodes) m.set(n.depth, [...(m.get(n.depth) ?? []), n]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export function ChainSection({ task }: { task: TaskDetail }) {
  const { t } = useI18n();
  const links = task.links ?? [];
  // Read again whenever the task's own links change (one added or taken away, one finished).
  const sig = links
    .filter((l) => l.kind !== 'relates')
    .map((l) => `${l.kind}:${l.taskId}:${l.done ? 1 : 0}`)
    .join(',');
  const [chain, setChain] = useState<TaskChain | null>(null);
  useEffect(() => {
    setChain(null);
    if (!sig) return;
    let live = true;
    get<{ chain: TaskChain }>(`/tasks/${task.id}/chain`)
      .then((r) => live && setChain(r.chain))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [task.id, sig, task.version]);
  const up = useMemo(() => byDepth(chain?.up ?? []).reverse(), [chain]);
  const down = useMemo(() => byDepth(chain?.down ?? []), [chain]);
  if (!chain || !(up.some(([d]) => d > 1) || down.some(([d]) => d > 1))) return null;
  const board = task.boardId;
  const row = (n: ChainNode, dir: 'up' | 'down') => (
    <li key={n.id} className="pm-chain__task" data-done={n.done || undefined}>
      <Icon name={n.done ? 'checkCircle' : dir === 'up' ? 'hourglass' : 'link'} size={15} />
      <button className="linkbtn linkbtn--plain pm-chain__title" onClick={() => setQuery('task', n.id)}>
        {n.title}
      </button>
      <span className="pm-chain__where">{n.boardId === board ? n.statusName : `${n.statusName} · ${n.boardName}`}</span>
    </li>
  );
  return (
    <section className="pm-chain" aria-labelledby="pm-chain-title">
      <h3 className="section__head" id="pm-chain-title">
        <span>
          <Icon name="link" size={16} className="icon--lead" />
          {t('pm.chain')}
        </span>
      </h3>
      <p className="pm-chain__hint">{t('pm.chain.hint')}</p>
      <ol className="pm-chain__steps">
        {up.map(([d, nodes]) => (
          <li key={`u${d}`} className="pm-chain__step" data-dir="up">
            <span className="pm-chain__at">{d === 1 ? t('pm.chain.waitsFor') : t('pm.chain.back', { n: d })}</span>
            <ul className="pm-chain__tasks">{nodes.map((n) => row(n, 'up'))}</ul>
          </li>
        ))}
        <li className="pm-chain__step" data-self="true">
          <span className="pm-chain__at">{t('pm.chain.self')}</span>
          <ul className="pm-chain__tasks">
            <li className="pm-chain__task">
              <Icon name="target" size={15} />
              <strong className="pm-chain__title">{task.title}</strong>
            </li>
          </ul>
        </li>
        {down.map(([d, nodes]) => (
          <li key={`d${d}`} className="pm-chain__step" data-dir="down">
            <span className="pm-chain__at">{d === 1 ? t('pm.chain.waiting') : t('pm.chain.on', { n: d })}</span>
            <ul className="pm-chain__tasks">{nodes.map((n) => row(n, 'down'))}</ul>
          </li>
        ))}
      </ol>
      {chain.more && <p className="field__hint">{t('pm.chain.more')}</p>}
    </section>
  );
}
