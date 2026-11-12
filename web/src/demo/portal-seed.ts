// The demo's customer portal: Quillfield Retail's Selin, with a task the team
// shared, a reply each way, and a request she opened herself.
import { deepEnglish } from '../../../scripts/seed-showcase.en';
import type { DemoServer } from './server';

export async function seedPortal(server: DemoServer, locale: 'tr' | 'en' = 'tr') {
  const { db } = server;
  const en = <T,>(body: T): T => (locale === 'en' ? deepEnglish(body) : body);
  const call = (method: string, path: string, body?: unknown) => server.call(method, path, body === undefined ? body : en(body));
  const portalCall = (method: string, path: string, body?: unknown) => server.portalCall(method, path, body === undefined ? body : en(body));
  await call('PUT', '/api/portal/settings', { enabled: true });
  const [ids] = await db.system((q) =>
    q.query(
      `select b.id as board, b.columns, a.id as account,
              (select t.id from tasks t where t.board_id = b.id and t.account_id = a.id and t.parent_id is null and t.archived_at is null and t.done_at is null order by t.created_at limit 1) as task
         from boards b, accounts a
        where b.org_id = a.org_id and b.visibility = 'team' and a.name = 'Quillfield Retail'
        order by b.created_at limit 1`,
    ),
  );
  if (!ids) return;
  const cols = ids.columns as { key: string }[];
  await call('PUT', `/api/boards/${ids.board}/portal`, {
    enabled: true,
    intake: cols[0].key,
    labels: { [cols[0].key]: 'Alındı', ...(cols[1] ? { [cols[1].key]: 'Üzerinde çalışılıyor' } : {}) },
    fields: ['due', 'assignee'],
  });
  await call('POST', '/api/portal/users', { accountId: ids.account, name: 'Selin Kaya', email: 'selin@quillfield.example' });
  if (ids.task) {
    await call('PUT', `/api/tasks/${ids.task}/portal`, { shared: true });
    await call('POST', `/api/tasks/${ids.task}/comments`, { body: 'Bir iç not: fiyat konusunda itiraz gelebilir, hazırlıklı olalım.' });
    await call('POST', `/api/tasks/${ids.task}/comments`, { body: 'Selin Hanım merhaba, sunumun taslağı cuma günü hazır olacak; önce size göndereceğiz.', visibility: 'customer' });
  }
  // Selin signs in with her invitation, replies, and opens a request of her own.
  let invite: { text: string } | undefined;
  for (let i = 0; i < 40 && !invite; i++) {
    await new Promise((r) => setTimeout(r, 50));
    invite = server.emails.filter((m) => m.to === 'selin@quillfield.example').at(-1);
  }
  const token = /#token=([A-Za-z0-9_-]+)/.exec(invite?.text ?? '')?.[1];
  if (!token) return;
  await portalCall('POST', '/papi/auth/verify', { token });
  if (ids.task) await portalCall('POST', `/papi/tasks/${ids.task}/comments`, { body: 'Teşekkürler! Mümkünse geçen çeyreğin kullanım grafiğini de ekleyebilir misiniz?' });
  await portalCall('POST', `/papi/boards/${ids.board}/tasks`, {
    title: 'Rapora iki kullanıcı ekleyelim',
    description: 'Ayşe ve Can haftalık rapora erişemiyor. Pazartesiye kadar açılabilir mi?',
  });
}
