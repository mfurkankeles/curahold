// Entry point of the try-it-now demo (see vite.demo.config.ts).
import './memory';
import '../styles.css';
import '../reports.css';
import '../motion.css';
import './demo.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browserLocale, storedLocale } from '../lib/i18n';
import { startTheme } from '../lib/theme';
import { DEMO_DEVICE, signIn, startServer, type DemoServer } from './server';
import { ORIGIN, current as currentPath, onFullNavigation, setCurrent } from './memory';

startTheme();

const PEOPLE = [
  { key: 'ada', name: 'Ada Demir', role: { tr: 'Yönetici', en: 'Admin' } },
  { key: 'mert', name: 'Mert Aksoy', role: { tr: 'Ekip lideri', en: 'Team lead' } },
  { key: 'zeynep', name: 'Zeynep Tunç', role: { tr: 'Müşteri yöneticisi', en: 'Customer manager' } },
  { key: 'sofia', name: 'Sofia Rossi', role: { tr: 'İzleyici', en: 'Viewer' } },
  // Not someone in the company: a customer's person, in the customer portal.
  { key: 'customer', name: 'Selin Kaya', role: { tr: 'Müşteri · Quillfield portalı', en: 'Customer · Quillfield portal' } },
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
    stuck: 'Demo oturumu açılamadı.',
    note: 'Uydurma verilerle, tamamen bu sekmede çalışıyor. Yenileyince sıfırlanır.',
    as: 'Kim olarak',
    tries: 'Neler denenir?',
    reset: 'Baştan başla',
    ideas: [
      'N tuşuna bas ve yaz: “Acme ile yenileme görüşmesi cuma @Zeynep #Velto !yüksek”. Tarih, kişi, müşteri ve öncelik kendiliğinden dolar; birkaç satır yapıştırırsan her biri ayrı görev olur.',
      'Görevlerim’de bir görevin önündeki yuvarlağa tıkla: tamamlanır; alttaki bildirimden geri al.',
      'Müşteriler → Kartlar: hangi müşterinin neden ilgi beklediğini gör; Yenilemeler ve Ürünler görünümlerine de bak.',
      'Müşteriler → Fırsatlar: bir fırsatı başka aşamaya sürükle ya da Kazanıldı’ya bırak; üstteki tahmin hemen değişir.',
      'Raporlar → Raporlar: “Yeni rapor” ile kendi raporunu kur (ör. Fırsatlar → Durum: Açık → Aşamaya göre grupla → Tutar toplamı → Sütun), ya da hazır bir raporu açıp değiştir. Raporlar → Paneller: hazır bir paneli “Ekle” ile sayfana al; ana sayfadaki Satış hunisi ve Ekip performansı sekmeleri böyle eklendi.',
      'İçgörü → Raporlar ve Ekip: çeyrek hedefinin gidişatı, işlerin durumu, kimin ne taşıdığı ve bir kişi için 1:1 hazırlığı. İş → Zaman çizelgesi haftaları gösterir.',
      'Müşteriler → Değerlendirmeler: iş değerlendirmesi geciken ve yaklaşan müşteriler. “Yapıldı” ile kaydet; sıradaki tarih ilerler. Ritim ve hedefler Ayarlar → Hedefler ve ritim’de.',
      'CS — Genel panosunda bir görev aç: Takip et, Görev bağla (“şunu bekliyor”), süre ekle, Kontrol listesi ve en altta Geçmiş. Panoda Filtre ve Görünümler’i dene.',
      'Bir müşteri sayfasında “Plan uygula” ile onboarding görevlerini tek tıkla ekle.',
      'CS — Genel panosunda Arşiv’e bak: 90 günü geçen tamamlanmış görevler orada, “Geri getir” ile döner. Yukarı ok düğmesi başka araçtan CSV/Excel ile görev aktarır.',
      'Sol alttaki adına tıkla: koyu temayı, dili ve ? ile klavye kısayollarını dene.',
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
      'Yukarıdan Selin Kaya’ya (müşteri) geç: Quillfield’ın portalında yalnızca kendisiyle paylaşılanları görür; yeni talep açıp yanıt yaz. Sonra Zeynep olarak CS — Genel panosunda o görevi aç ve “Müşteriye yanıt” ver.',
      'Sol alttaki menünden Yardım ve destek ile talep formunu dene; “Curahold desteğinin hesabıma bakmasına izin ver” kutusunu işaretleyince üstte bir şerit belirir.',
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
    stuck: 'The demo could not sign you in.',
    note: 'Invented data, running entirely in this tab. Reloading starts over.',
    as: 'Viewing as',
    tries: 'What to try',
    reset: 'Start over',
    ideas: [
      'Press N and write: “Renewal call with Acme friday @Zeynep #Velto !high”. The date, person, customer and priority fill themselves in; paste several lines and each becomes a task.',
      'In My tasks, click the circle in front of a task: it is done; undo from the notice at the bottom.',
      'Customers → Cards: see which customer needs attention and why; try the Renewals and Products views too.',
      'Customers → Opportunities: drag a deal to another stage or drop it on Won; the forecast on top changes straight away.',
      'Reports → Reports: build your own with “New report” (say Opportunities → Status: Open → group by Stage → sum of Amount → Columns), or open a ready-made one and change it. Reports → Dashboards: “Add” puts a ready-made dashboard on your home; the Sales pipeline and Team performance tabs were added that way.',
      'Insight → Reports and Team: how the quarter’s target is going, where the work stands, who is carrying what, and a 1:1 view for one person. Work → Timeline shows the weeks ahead.',
      'Customers → Reviews: customers whose business review is late or coming up. Log one with “Done” and the next date moves. The rhythm and the targets are in Settings → Targets and rhythm.',
      'Open a task on CS — General: Follow, Link a task (“waits for”), add time, Checklist, and History at the bottom. Try Filter and Views on the board.',
      'On a customer’s page, “Apply a plan” adds the onboarding tasks in one click.',
      'Look at Archive on CS — General: finished tasks older than 90 days are there, and “Bring back” returns one. The up-arrow button imports tasks from another tool’s CSV or Excel file.',
      'Click your name at the bottom left: try dark mode, the language, and the keyboard shortcuts with ?.',
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
      'Switch to Selin Kaya (a customer) above: in Quillfield’s portal she sees only what was shared with her; open a request and reply. Then, as Zeynep, open that task on CS — General and “Reply to customer”.',
      'Try Help and support in your menu at the bottom left: the help request form; ticking “Let Curahold support look at my account” shows a strip on top.',
    ],
  },
};
// One language for the whole demo: the sample data is written in the language the visitor reads.
const demoLocale: 'tr' | 'en' = (storedLocale() ?? browserLocale()) === 'en' ? 'en' : 'tr';
const lang = () => (storedLocale() ?? demoLocale) as 'tr' | 'en';


const bootEl = document.getElementById('boot')!;
function step(pct: number, key: keyof typeof TEXT.tr.steps) {
  const t = TEXT[demoLocale];
  document.getElementById('boot-step')!.textContent = t.steps[key];
  (document.getElementById('boot-bar') as HTMLElement).style.width = `${pct}%`;
}

function DemoBar({ current, onSwitch, problem }: { current: Key; onSwitch: (k: Key) => void; problem: string | null }) {
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
      <label className="demobar__as demobar__who">
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
      {problem && (
        <div className="demobar__problem" role="alert">
          <span>
            {t.stuck} <small>({problem})</small>
          </span>
          <button type="button" onClick={() => window.location.reload()}>
            {t.reset}
          </button>
        </div>
      )}
    </div>
  );
}

async function main() {
  const server: DemoServer = await startServer(step, demoLocale);
  const sessions: Partial<Record<Key, string>> = {};
  sessions.ada = await signIn(server, 'ada@demo.example');
  const { seedShowcase } = await import('../../../scripts/seed-showcase');
  await seedShowcase(server.call, server.db, demoLocale);
  const { seedPortal } = await import('./portal-seed');
  await seedPortal(server, demoLocale).catch((e) => console.warn('[demo] portal seed', e));
  step(92, 'app');

  const [{ App }, { navigate }, { PortalApp }] = await Promise.all([import('../App'), import('../lib/router'), import('../../portal/Portal')]);
  await import('../../portal/portal.css');
  const root = createRoot(document.getElementById('root')!);
  let generation = 0;
  let current: Key = 'ada';
  // The customer sees the portal (its own small app); everyone else, Curahold.
  const render = () =>
    root.render(<StrictMode>{current === 'customer' ? <PortalApp key={generation} /> : <App key={generation} />}</StrictMode>);
  // A "page load": start the app afresh on the same in-tab database.
  const reload = (to: string) => {
    setCurrent(to);
    generation += 1;
    render();
  };
  // The demo has no inbox: whenever the app would show its sign-in page (after
  // "Sign out", or a session that ended), the person in the bar is signed in again.
  // If that does not help three times in a row, a notice with "Start over" says so,
  // with the reason: a sign-in page nobody can use is never the last word here.
  let tries: number[] = [];
  let inFlight: Promise<boolean> | null = null;
  let problem: string | null = null;
  const signedOutPage = (to: string) => /^\/(login|auth\/verify)(?:[/?#]|$)/.test(to);
  function signBackIn(): Promise<boolean> {
    if (current === 'customer') return Promise.resolve(false);
    if (inFlight) return inFlight;
    const now = Date.now();
    tries = tries.filter((t) => now - t < 20000);
    if (tries.length >= 3) {
      problem = server.denied.last ?? 'sign-in';
      drawBar();
      return Promise.resolve(false);
    }
    tries.push(now);
    inFlight = (async () => {
      sessions[current] = await signIn(server, `${current}@demo.example`);
      server.jar.set('tw_session', sessions[current]!);
      reload('/home');
      return true;
    })()
      .catch((e) => {
        problem = e instanceof Error ? e.message.slice(0, 80) : 'sign-in';
        drawBar();
        return false;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }
  window.addEventListener('tw:navigate', () => {
    if (signedOutPage(currentPath())) void signBackIn();
  });
  onFullNavigation(async (to) => {
    if (signedOutPage(to) && (await signBackIn())) return;
    if (!to.startsWith('/api/')) return reload(to);
    // Server routes that answer with a redirect (connecting the demo CRM, say).
    const res = await server.request(to, { headers: { 'x-curahold-device': DEMO_DEVICE } });
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

  const bar = createRoot(document.getElementById('demobar')!);
  const drawBar = () => bar.render(<DemoBar current={current} onSwitch={switchTo} problem={problem} />);
  async function switchTo(k: Key) {
    if (k === 'customer') {
      await server.portalSignIn('selin@quillfield.example').catch(() => undefined);
      current = k;
      drawBar();
      reload('/');
      return;
    }
    // A fresh sign-in each time: a session ended by "Sign out" is never reused.
    sessions[k] = await signIn(server, `${k}@demo.example`);
    server.jar.set('tw_session', sessions[k]!);
    try {
      sessionStorage.removeItem('tw-preview-as');
    } catch {
      /* no storage */
    }
    current = k;
    problem = null;
    tries = [];
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
  console.error('[curahold demo]', err);
  bootEl.classList.add('failed');
  const t = TEXT[demoLocale];
  document.getElementById('boot-step')!.textContent = `${t.failed} (${err instanceof Error ? err.message.slice(0, 160) : 'error'})`;
});
