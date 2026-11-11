// Entry point of the try-it-now demo (see vite.demo.config.ts).
import './memory';
import '../styles.css';
import './demo.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { storedLocale } from '../lib/i18n';
import { DEMO_DEVICE, signIn, startServer, type DemoServer } from './server';
import { ORIGIN, onFullNavigation, setCurrent } from './memory';

const PEOPLE = [
  { key: 'ada', name: 'Ada Demir', role: { tr: 'Yönetici', en: 'Admin' } },
  { key: 'mert', name: 'Mert Aksoy', role: { tr: 'Ekip lideri', en: 'Team lead' } },
  { key: 'zeynep', name: 'Zeynep Tunç', role: { tr: 'Müşteri yöneticisi', en: 'Customer manager' } },
  { key: 'sofia', name: 'Sofia Rossi', role: { tr: 'İzleyici', en: 'Viewer' } },
] as const;
type Key = (typeof PEOPLE)[number]['key'];

const TEXT = {
  tr: {
    tag: 'Demo',
    steps: {
      db: 'Postgres bu sekmede başlatılıyor. Hiçbir veri bir yere gönderilmiyor.',
      schema: 'Tablolar ve erişim kuralları kuruluyor.',
      data: 'Uydurma bir müşteri portföyü yükleniyor.',
      app: 'Uygulama açılıyor.',
    },
    failed: 'Demo açılamadı. Sayfayı yenileyip tekrar deneyin.',
    note: 'Uydurma verilerle, tamamen bu sekmede çalışıyor. Yenileyince sıfırlanır.',
    as: 'Kim olarak',
    tries: 'Neler denenir?',
    reset: 'Baştan başla',
    ideas: [
      'Bir müşteriyi aç (örneğin Velto Mobility): zaman çizelgesine görüşme notu ekle, sağlık skorunun yanındaki “Neden?”e bak.',
      'Ayarlar → Sağlık skoru’nda ağırlıkları değiştir; önizleme hangi müşterinin kaç puan alacağını hemen gösterir.',
      'Zildeki “Haftan” bildirimi: Pazartesi gelen haftalık özetin örneği.',
      'Ctrl K (Mac’te ⌘ K) ile müşteri, görev ya da kişi ara.',
      'Ana sayfada “Sayfayı düzenle” ile kart ekle; görünümü role göre ayarla.',
      'Bir panoda birden çok görev seç, toplu değiştir, sonra geri al.',
      'Bir görevi tekrarlayan yap: tamamlayınca bir sonraki kendiliğinden açılır.',
      'Ayarlar → Roller’de “Onun gözünden bak” ile bir üyenin ekranını gör.',
      'Yukarıdan Zeynep’e ya da Sofia’ya geç: aynı ekranlarda neyin değiştiğine bak.',
      'Ayarların’da API anahtarı oluştur ve Claude/ChatGPT bağlayıcı adresine bak; Ayarlar → Geliştirici’de webhook ekle.',
    ],
  },
  en: {
    tag: 'Demo',
    steps: {
      db: 'Starting Postgres in this tab. No data leaves your browser.',
      schema: 'Creating the tables and access rules.',
      data: 'Loading an invented customer portfolio.',
      app: 'Opening the app.',
    },
    failed: 'The demo could not start. Reload the page to try again.',
    note: 'Invented data, running entirely in this tab. Reloading starts over.',
    as: 'Viewing as',
    tries: 'What to try',
    reset: 'Start over',
    ideas: [
      'Open a customer (Velto Mobility, say): log a call on the timeline and check “Why?” next to the health score.',
      'In Settings → Health score, change the weights; the preview shows each customer’s score straight away.',
      'The “Your week” notice in the bell: an example of the Monday summary.',
      'Press Ctrl K (⌘ K on a Mac) to find a customer, task or person.',
      'On Home, use “Edit page” to add cards and set what each role sees.',
      'Select several tasks on a board, change them together, then undo.',
      'Make a task repeat: finishing it opens the next one by itself.',
      'In Settings → Roles, use “See it as them” to view a member’s screens.',
      'Switch to Zeynep or Sofia above and see what changes on the same screens.',
      'In Your settings, make an API key and find the Claude/ChatGPT connector address; add a webhook in Settings → Developers.',
    ],
  },
};
const lang = () => (storedLocale() ?? 'tr') as 'tr' | 'en';

const bootEl = document.getElementById('boot')!;
function step(pct: number, key: keyof typeof TEXT.tr.steps) {
  const t = TEXT[navigator.language?.startsWith('en') ? 'en' : 'tr'];
  document.getElementById('boot-step')!.textContent = t.steps[key];
  (document.getElementById('boot-bar') as HTMLElement).style.width = `${pct}%`;
}

function DemoBar({ current, onSwitch }: { current: Key; onSwitch: (k: Key) => void }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener('tw:navigate', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('tw:navigate', on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const l = lang();
  const t = TEXT[l];
  return (
    <div className="demobar">
      <span className="demobar__tag">{t.tag}</span>
      <span className="demobar__note">{t.note}</span>
      <label className="demobar__as">
        <span>{t.as}</span>
        <select value={current} onChange={(e) => onSwitch(e.target.value as Key)}>
          {PEOPLE.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} · {p.role[l]}
            </option>
          ))}
        </select>
      </label>
      <div className="demobar__more">
        <button type="button" aria-expanded={open} aria-label={t.tries} onClick={() => setOpen((o) => !o)}>
          <span className="demobar__long">{t.tries}</span>
          <span className="demobar__short" aria-hidden="true">?</span>
        </button>
        {open && (
          <div className="demobar__ideas" role="dialog" aria-label={t.tries}>
            <ul>
              {t.ideas.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <button type="button" className="demobar__reset" onClick={() => window.location.reload()}>
              {t.reset}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function main() {
  const server: DemoServer = await startServer(step);
  const sessions: Partial<Record<Key, string>> = {};
  sessions.ada = await signIn(server, 'ada@demo.example');
  const { seedShowcase } = await import('../../../scripts/seed-showcase');
  await seedShowcase(server.call, server.db);
  step(92, 'app');

  const [{ App }, { navigate }] = await Promise.all([import('../App'), import('../lib/router')]);
  const root = createRoot(document.getElementById('root')!);
  let generation = 0;
  const render = () =>
    root.render(
      <StrictMode>
        <App key={generation} />
      </StrictMode>,
    );
  // A "page load": start the app afresh on the same in-tab database.
  const reload = (to: string) => {
    setCurrent(to);
    generation += 1;
    render();
  };
  onFullNavigation(async (to) => {
    if (!to.startsWith('/api/')) return reload(to);
    // Server routes that answer with a redirect (connecting the demo CRM, say).
    const res = await server.request(to, { headers: { 'x-tendwell-device': DEMO_DEVICE } });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      const u = new URL(next, ORIGIN);
      if (u.origin === ORIGIN) reload(u.pathname + u.search + u.hash);
    }
  });
  // Links inside the app that it does not handle itself stay inside the demo.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    const href = a?.getAttribute('href');
    if (!a || !href || !href.startsWith('/') || a.target === '_blank') return;
    e.preventDefault();
    if (href.startsWith('/api/')) memoryNav(href);
    else navigate(href);
  });
  const memoryNav = (href: string) => (globalThis as any).twLocation.assign(href);

  let current: Key = 'ada';
  const bar = createRoot(document.getElementById('demobar')!);
  const drawBar = () => bar.render(<DemoBar current={current} onSwitch={switchTo} />);
  async function switchTo(k: Key) {
    sessions[k] ??= await signIn(server, `${k}@demo.example`);
    server.jar.set('tw_session', sessions[k]!);
    try {
      sessionStorage.removeItem('tw-preview-as');
    } catch {
      /* no storage */
    }
    current = k;
    drawBar();
    reload('/home');
  }

  setCurrent('/home');
  render();
  drawBar();
  step(100, 'app');
  setTimeout(() => bootEl.remove(), 250);
}

main().catch((err) => {
  console.error('[tendwell demo]', err);
  bootEl.classList.add('failed');
  const t = TEXT[navigator.language?.startsWith('en') ? 'en' : 'tr'];
  document.getElementById('boot-step')!.textContent = `${t.failed} (${err instanceof Error ? err.message.slice(0, 160) : 'error'})`;
});
