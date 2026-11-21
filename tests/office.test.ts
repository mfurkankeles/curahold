// The 3D Office's pure parts: the floor plan fits today's org chart, walking
// routes stay out of the desks, search finds people the way the owner types,
// and its words are complete in Turkish and English.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICE_EN, OFFICE_TR, alertText, officeWord } from '../shared/src/i18n/ownerOffice';
import { ORG_CHART } from '../shared/src/team/orgChart';
import { BOUNDS, COFFEE_SPOTS, DESK, MEETING_CHAIRS, ROOMS, assignDesks, capacity, roomAt, route, type DeskSpot } from '../web/src/office/layout';
import { fold, searchPeople, type Findable } from '../web/src/office/search';

const floor = ORG_CHART.filter((s) => s.team !== 'advisory');

describe('office floor plan', () => {
  it('gives every seat on the chart a desk in its own team room', () => {
    const desks = assignDesks(floor);
    expect(desks.size).toBe(floor.length);
    for (const s of floor) expect(desks.get(s.seat)!.room, s.seat).toBe(s.team);
    for (const r of ROOMS.filter((x) => x.kind === 'team')) expect(capacity(r), r.id).toBeGreaterThanOrEqual(floor.filter((s) => s.team === r.team).length);
  });

  it('keeps rooms inside the floor and apart from each other', () => {
    for (const r of ROOMS) {
      expect(r.x0).toBeGreaterThanOrEqual(BOUNDS.x0);
      expect(r.x1).toBeLessThanOrEqual(BOUNDS.x1);
      for (const o of ROOMS) if (o !== r) expect(r.x0 < o.x1 && r.x1 > o.x0 && r.z0 < o.z1 && r.z1 > o.z0, `${r.id} × ${o.id}`).toBe(false);
    }
  });

  it('puts desks inside their room and never two on one spot', () => {
    const desks = [...assignDesks(floor).values()];
    const seen = new Set<string>();
    for (const d of desks) {
      expect(roomAt(d.x, d.z)?.id).toBe(d.room);
      const k = `${d.x.toFixed(2)},${d.z.toFixed(2)}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('walks round the desks, never through one', () => {
    const desks = [...assignDesks(floor).values()];
    const inDesk = (x: number, z: number, d: DeskSpot) => Math.abs(x - d.desk.x) < DESK.w / 2 - 0.05 && Math.abs(z - d.desk.z) < DESK.d / 2 - 0.05;
    const checks: [DeskSpot, DeskSpot][] = [];
    for (let i = 0; i < desks.length; i += 3) checks.push([desks[i], desks[(i * 7 + 5) % desks.length]]);
    for (const [a, b] of checks) {
      const path = route(a, a.room, b, b.room);
      // Sample every segment every 10 cm.
      for (let i = 1; i < path.length; i++) {
        const [p, q] = [path[i - 1], path[i]];
        const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.1);
        for (let k = 0; k <= n; k++) {
          const x = p.x + ((q.x - p.x) * k) / n;
          const z = p.z + ((q.z - p.z) * k) / n;
          for (const d of desks) expect(inDesk(x, z, d), `${a.room}→${b.room} through a desk at ${d.desk.x},${d.desk.z}`).toBe(false);
        }
      }
    }
    // To the meeting table and the coffee bar too.
    expect(route(desks[0], desks[0].room, MEETING_CHAIRS[3], 'meeting').length).toBeGreaterThan(4);
    expect(route(desks[1], desks[1].room, COFFEE_SPOTS[0], 'commons').at(-1)).toEqual({ x: COFFEE_SPOTS[0].x, z: COFFEE_SPOTS[0].z });
  });
});

describe('office search', () => {
  const people: Findable[] = [
    { seat: 'cpo', name: 'Öykü', title: 'Chief Product Officer', titleTr: 'Ürün direktörü', team: 'product', teamName: 'Ürün ve tasarım', tasks: [] },
    {
      seat: 'content-marketing',
      name: 'Ilgın',
      title: 'Content Marketing Manager',
      titleTr: 'İçerik pazarlama yöneticisi',
      team: 'growth',
      teamName: 'Büyüme',
      tasks: ['Yardım makalesi: dışa aktarma'],
    },
    { seat: 'cfo', name: 'Ozan', title: 'Chief Financial Officer', titleTr: 'Finans direktörü', team: 'finance', teamName: 'Finans', tasks: [] },
  ];
  it('ignores accents and case in Turkish and English', () => {
    expect(fold('ÖYKÜ')).toBe('oyku');
    expect(fold('Ilgın')).toBe(fold('ilgin'));
    expect(fold('İçerik')).toBe('icerik');
    expect(searchPeople(people, 'oyku')[0].seat).toBe('cpo');
    expect(searchPeople(people, 'ılgın')[0].seat).toBe('content-marketing');
  });
  it('finds by title, Turkish title, team and current task, name first', () => {
    expect(
      searchPeople(people, 'chief')
        .map((h) => h.seat)
        .sort(),
    ).toEqual(['cfo', 'cpo']);
    expect(searchPeople(people, 'finans')[0].seat).toBe('cfo');
    expect(searchPeople(people, 'büyüme')[0]).toMatchObject({ seat: 'content-marketing', field: 'team' });
    expect(searchPeople(people, 'dışa aktar')[0]).toMatchObject({ seat: 'content-marketing', field: 'task', task: 'Yardım makalesi: dışa aktarma' });
    expect(searchPeople(people, 'oza')[0]).toMatchObject({ seat: 'cfo', field: 'name' });
    expect(searchPeople(people, '   ')).toEqual([]);
    expect(searchPeople(people, 'nobody here')).toEqual([]);
  });
});

describe('office words', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it('has the same keys and placeholders in Turkish and English, none empty', () => {
    expect(Object.keys(OFFICE_TR).sort()).toEqual(Object.keys(OFFICE_EN).sort());
    for (const [k, v] of Object.entries(OFFICE_EN)) {
      expect(v.trim(), k).not.toBe('');
      expect(ph(OFFICE_TR[k as keyof typeof OFFICE_EN]), k).toEqual(ph(v));
    }
    expect(officeWord('ja', 'title')).toBe('Office');
    expect(officeWord('tr', 'bar.approvals', { n: 3 })).toBe('3 onay bekliyor');
  });
  it('names only keys that exist (the room names are the dynamic family)', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'web/src/pages/OwnerOffice.tsx'), 'utf8');
    const named = [...src.matchAll(/\bow\('([a-zA-Z0-9_.-]+)'/g)].map((m) => m[1]);
    expect(named.filter((k) => !(k in OFFICE_EN))).toEqual([]);
    for (const r of ROOMS.filter((x) => x.kind !== 'team')) expect(`room.${r.id}` in OFFICE_EN || r.team, r.id).toBeTruthy();
  });

  it('says the monitor alerts in the reader language, with names', () => {
    const name = (s: string) => ({ 'performance-marketing': 'Aras' })[s] ?? s;
    expect(alertText('tr', 'performance-marketing used 80% of its weekly budget', name)).toBe('Aras haftalık bütçesinin %80’ini kullandı');
    expect(alertText('en', 'performance-marketing paused by the monitor: token-spike', name)).toBe('Aras was paused by the monitor (token spike)');
    expect(alertText('tr', 'something new', name)).toBe('something new');
  });
});
