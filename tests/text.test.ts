// Text the way people type and read it: "isik" finds "Işık", names come back in
// the reader's dictionary order, and the database and the shared code fold
// letters the same way.
import { beforeAll, describe, expect, it } from 'vitest';
import { FOLD_SAMPLE, compareText, foldText, sameText } from '../shared/src/text';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
const NAMES = ['Işık Enerji', 'İstanbul Lojistik', 'Şeker Gıda', 'Çağrı Merkezi', 'Öztürk Yapı', 'Ünal Tekstil', 'Irmak Su', 'Cemre Ajans', 'Zeytin Tarım', 'Okyanus Deniz', 'Umut Vakfı', 'Sabah Medya'];

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'beta', 'ada@demo.example'); // the Turkish company
  for (const name of NAMES) expect((await ada.post('/api/accounts', { name })).status).toBe(201);
});

describe('folding', () => {
  it('makes one text of every way to type a Turkish word', () => {
    for (const [a, b] of [['Işık', 'isik'], ['IŞIK', 'isik'], ['İSTANBUL', 'istanbul'], ['ISTANBUL', 'istanbul'], ['Çağrı İş', 'cagri is'], ['Öztürk', 'ozturk'], ['Straße', 'strase'], ['Łódź', 'lodz']]) expect(foldText(a)).toBe(b);
    expect(sameText(' İade ', 'iade')).toBe(true);
  });

  it('is the same in the database as in the code', async () => {
    const samples = [FOLD_SAMPLE, 'Işık Enerji A.Ş.', 'İSTANBUL', 'ISTANBUL 34', 'çĞöŞü ÂÎÛ', 'Plain ASCII, 123 _%'];
    const rows = await env.db.system((q) => q.query('select fold_text(x) as f from unnest($1::text[]) with ordinality as t(x, n) order by n', [samples]));
    expect(rows.map((r: any) => r.f)).toEqual(samples.map(foldText));
  });
});

describe('searching', () => {
  const asks: [string, string][] = [
    ['isik', 'Işık Enerji'], ['ISIK', 'Işık Enerji'], ['ışık', 'Işık Enerji'], ['istanbul', 'İstanbul Lojistik'], ['İSTANBUL', 'İstanbul Lojistik'], ['ISTANBUL', 'İstanbul Lojistik'],
    ['seker', 'Şeker Gıda'], ['cagri', 'Çağrı Merkezi'], ['ozturk', 'Öztürk Yapı'], ['unal', 'Ünal Tekstil'], ['irmak', 'Irmak Su'], ['IRMAK', 'Irmak Su'],
  ];

  it('finds a customer however its letters were typed (Ctrl K and the customer list)', async () => {
    for (const [q, want] of asks) {
      const found = (await ada.get(`/api/search?q=${encodeURIComponent(q)}`)).json.accounts.map((a: any) => a.name);
      expect(found, `search "${q}"`).toContain(want);
      const listed = (await ada.get(`/api/accounts?q=${encodeURIComponent(q)}&limit=50`)).json.accounts.map((a: any) => a.name);
      expect(listed, `list "${q}"`).toContain(want);
    }
  });

  it('finds a task by its title, and a task that looks like the one being added', async () => {
    const board = env.b.boards.csBoard;
    await ada.post('/api/tasks', { boardId: board, title: 'Şeker Gıda için ığdır raporu' });
    expect((await ada.get('/api/search?q=igdir')).json.tasks.map((t: any) => t.title)).toContain('Şeker Gıda için ığdır raporu');
    const alike = (await ada.get(`/api/tasks/similar?title=${encodeURIComponent('SEKER GIDA IGDIR RAPORU')}&boardId=${board}`)).json;
    expect(JSON.stringify(alike)).toContain('ığdır raporu');
  });

  it('takes % and _ as plain characters', async () => {
    await ada.post('/api/accounts', { name: '%100 Doğal' });
    expect((await ada.get(`/api/search?q=${encodeURIComponent('%10')}`)).json.accounts.map((a: any) => a.name)).toEqual(['%100 Doğal']);
  });
});

describe('ordering', () => {
  it('lists names as a Turkish dictionary does, for someone reading in Turkish', async () => {
    const listed: string[] = (await ada.get('/api/accounts?limit=200')).json.accounts.map((a: any) => a.name).filter((n: string) => NAMES.includes(n));
    expect(listed).toEqual([...NAMES].sort((a, b) => compareText(a, b, 'tr')));
    // …c ç…, ı before i, …o ö…, …s ş…, …u ü…
    expect(listed).toEqual(['Cemre Ajans', 'Çağrı Merkezi', 'Irmak Su', 'Işık Enerji', 'İstanbul Lojistik', 'Okyanus Deniz', 'Öztürk Yapı', 'Sabah Medya', 'Şeker Gıda', 'Umut Vakfı', 'Ünal Tekstil', 'Zeytin Tarım']);
  });

  it('keeps letters with marks beside their plain letter for other languages', async () => {
    const en = await ada.req('GET', '/api/accounts?limit=200', undefined, { 'x-curahold-locale': 'en' });
    const listed: string[] = en.json.accounts.map((a: any) => a.name).filter((n: string) => NAMES.includes(n));
    expect(listed.indexOf('Çağrı Merkezi')).toBeLessThan(listed.indexOf('Cemre Ajans'));
    expect(listed.indexOf('Öztürk Yapı')).toBeGreaterThan(listed.indexOf('Okyanus Deniz'));
    expect(listed.indexOf('Öztürk Yapı')).toBeLessThan(listed.indexOf('Sabah Medya'));
  });
});

describe('the same name', () => {
  it('is refused twice, however the i is dotted', async () => {
    expect((await ada.post('/api/admin/teams', { name: 'İade Ekibi' })).status).toBe(201);
    const again = await ada.post('/api/admin/teams', { name: 'iade ekibi' });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });
});
