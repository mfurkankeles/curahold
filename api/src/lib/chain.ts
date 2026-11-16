// The "blocks" chain of tasks: everything a task waits for, step by step back, and
// everything that waits for it, step by step on. Links are stored as "A blocks B"
// (task_links from A to B); a loop is refused when a link is made (routes/tasks.ts),
// and the depth is capped here as well, so a loop from older data cannot run away.
// Row-level security applies as everywhere: a link whose other end this person
// cannot see is not there for them, so the chain stops at it.
import type { ChainNode, Column, TaskChain } from '../../../shared/src/model';
import type { Q, Row } from '../db';

const MAX_DEPTH = 25;
const MAX_NODES = 200;

/**
 * For every unfinished task among the rows: how many unfinished tasks it waits for through the whole
 * chain (`waits_for`) and how many wait for it (`holds_up`). The chain is followed through unfinished
 * tasks only: a finished one no longer holds anything up. One query for all the rows.
 */
export async function addChainCounts(q: Q, rows: Row[]): Promise<void> {
  const open = rows.filter((r) => r.done_at == null && r.archived_at == null).map((r) => r.id as string);
  if (!open.length) return;
  const counts = await q.query(
    `with recursive
       up(seed, id, depth) as (
           select l.to_id, l.from_id, 1 from task_links l
             join tasks t on t.id = l.from_id and t.archived_at is null and t.done_at is null
            where l.kind = 'blocks' and l.to_id = any($1::uuid[])
         union
           select up.seed, l.from_id, up.depth + 1 from up
             join task_links l on l.to_id = up.id and l.kind = 'blocks'
             join tasks t on t.id = l.from_id and t.archived_at is null and t.done_at is null
            where up.depth < $2),
       down(seed, id, depth) as (
           select l.from_id, l.to_id, 1 from task_links l
             join tasks t on t.id = l.to_id and t.archived_at is null and t.done_at is null
            where l.kind = 'blocks' and l.from_id = any($1::uuid[])
         union
           select down.seed, l.to_id, down.depth + 1 from down
             join task_links l on l.from_id = down.id and l.kind = 'blocks'
             join tasks t on t.id = l.to_id and t.archived_at is null and t.done_at is null
            where down.depth < $2)
     select seed, 'up' as dir, count(distinct id)::int as n from up where id <> seed group by seed
     union all
     select seed, 'down' as dir, count(distinct id)::int as n from down where id <> seed group by seed`,
    [open, MAX_DEPTH],
  );
  const by = new Map<string, { up: number; down: number }>();
  for (const c of counts) {
    const v = by.get(c.seed) ?? { up: 0, down: 0 };
    v[c.dir as 'up' | 'down'] = c.n;
    by.set(c.seed, v);
  }
  for (const r of rows) {
    const v = by.get(r.id);
    if (!v) continue;
    if (v.up) r.waits_for = v.up;
    if (v.down) r.holds_up = v.down;
  }
}


/**
 * One task's whole chain, both ways. A finished task is shown (ticked) but not looked past, as above.
 * Each task appears once, at the step nearest to the task; at most 200 each way.
 */
export async function chainOf(q: Q, id: string): Promise<TaskChain> {
  const walk = (dir: 'up' | 'down') => {
    const [near, far] = dir === 'up' ? ['to_id', 'from_id'] : ['from_id', 'to_id'];
    return q.query(
      `with recursive c(id, via, depth) as (
           select l.${far}, l.${near}, 1 from task_links l where l.kind = 'blocks' and l.${near} = $1
         union
           select l.${far}, l.${near}, c.depth + 1 from c
             join tasks p on p.id = c.id and p.archived_at is null and p.done_at is null
             join task_links l on l.${near} = c.id and l.kind = 'blocks'
            where c.depth < $2)
       select * from (
         select distinct on (c.id) c.id, c.via, c.depth, t.title, t.status, t.done_at, t.board_id, b.name as board_name, b.columns
           from c join tasks t on t.id = c.id and t.archived_at is null join boards b on b.id = t.board_id
          where c.id <> $1
          order by c.id, c.depth) x
        order by depth, title limit $3`,
      [id, MAX_DEPTH, MAX_NODES + 1],
    );
  };
  const node = (r: Row): ChainNode => ({
    id: r.id,
    title: r.title,
    status: r.status,
    statusName: ((r.columns ?? []) as Column[]).find((col) => col.key === r.status)?.name ?? r.status,
    done: r.done_at != null,
    boardId: r.board_id,
    boardName: r.board_name,
    depth: r.depth,
    via: r.via,
  });
  const up = await walk('up');
  const down = await walk('down');
  return { up: up.slice(0, MAX_NODES).map(node), down: down.slice(0, MAX_NODES).map(node), more: up.length > MAX_NODES || down.length > MAX_NODES };
}
