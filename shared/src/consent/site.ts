// The consent banner for the static pages: the sales site, its concept pages
// (A, C) and anything else built as plain HTML. Bundled into site/consent.js by
// scripts/compliance/build-consent.ts — edit this file, not the bundle.
//
// The page sets window.__curaConsent = { strings, ids, policyUrl, ab?,
// marketingPixels?, logUrl?, surface? } before loading the script. With nothing
// in use there is no banner (nothing to consent to), but the API below still
// answers "no" for every optional category.
//
// Other scripts ask through window.curaConsent.allows('analytics') or listen to
// the 'curahold:consent' event; they never read the stored record themselves.
import { bannerText, categoriesInUse, consentEvent, decide, hasMeasurement, sha256Hex, allows, type ConsentConfig, type ConsentState, type OptionalCategory } from './core';
import { applyConsent, readStored, sendConsentEvent, store } from './browser';

interface PageConfig extends ConsentConfig {
  strings?: Record<string, string>;
  policyUrl?: string;
  logUrl?: string;
  surface?: 'site' | 'docs' | 'demo';
}

(function () {
  const w = window as unknown as Window & { __curaConsent?: PageConfig; curaConsent?: unknown };
  const found = w.__curaConsent;
  if (!found || typeof document === 'undefined') return;
  const cfg: PageConfig = found;
  const S = cfg.strings ?? {};
  const inUse = categoriesInUse(cfg);
  let state: ConsentState = readStored();

  const emit = () => w.dispatchEvent(new CustomEvent('curahold:consent', { detail: state }));
  w.curaConsent = {
    state: () => state,
    allows: (c: OptionalCategory | 'necessary') => allows(state, c),
    // Nothing to choose on a page that measures nothing: the dialog's helpers below are never set up there, so
    // opening it would throw.
    open: () => (hasMeasurement(cfg) ? showManage() : undefined),
  };
  if (!hasMeasurement(cfg)) return; // nothing optional on this page: nothing to ask

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const SVG = 'http://www.w3.org/2000/svg';
  /** A 16 px line mark (the path data is ours) for the start of a button. */
  const mark = (d: string): Element => {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 20 20', width: '16', height: '16', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  };
  const button = (cls: string, text: string | undefined, onClick: () => void, icon?: string) => {
    const b = el('button', cls, text ?? '');
    b.type = 'button';
    // An icon before the label, as on every button (the app's banner uses the same three marks), built with DOM calls
    // so no markup string is parsed.
    if (icon && typeof document.createElementNS === 'function') b.insertBefore(mark(icon), b.firstChild);
    b.addEventListener('click', onClick);
    return b;
  };
  const ICON_REJECT = 'M5.6 5.6l8.8 8.8M14.4 5.6l-8.8 8.8';
  const ICON_ACCEPT = 'M5 10.6l3.2 3.2L15.2 6.6';
  const ICON_MANAGE = 'M4 6h8M15 6h1M4 14h2M9 14h7M12 4.5v3M6 12.5v3';

  const host = el('div', 'cc-host');
  document.body.appendChild(host);
  const clear = () => (host.textContent = '');

  function decideNow(analytics: boolean, marketing: boolean) {
    state = decide({ analytics: inUse.analytics && analytics, marketing: inUse.marketing && marketing }, { previous: state });
    store(state, cfg);
    applyConsent(state, cfg);
    emit();
    showReopen();
    const locale = document.documentElement.lang || 'en';
    void sha256Hex(bannerText(S, inUse)).then((textHash) =>
      sendConsentEvent(cfg.logUrl, consentEvent(state, { inUse, textHash, locale, surface: cfg.surface ?? 'site' })),
    );
  }

  // Accept, reject and choose: side by side, the same kind of button (equal weight).
  function actions(withSave: { a: HTMLInputElement | null; m: HTMLInputElement | null } | null) {
    const row = el('div', 'cc-actions');
    row.appendChild(button('btn btn--ghost', S.rejectAll, () => decideNow(false, false), ICON_REJECT));
    if (withSave) row.appendChild(button('btn btn--ghost', S.save, () => decideNow(!!withSave.a?.checked, !!withSave.m?.checked), ICON_ACCEPT));
    else row.appendChild(button('btn btn--ghost', S.manage, showManage, ICON_MANAGE));
    row.appendChild(button('btn btn--ghost', S.acceptAll, () => decideNow(true, true), ICON_ACCEPT));
    return row;
  }

  function showBanner() {
    clear();
    const wrap = el('div', 'cc-banner');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', S.ariaBanner || S.title || 'Cookies');
    const text = el('div', 'cc-banner__text');
    text.appendChild(el('strong', 'cc-banner__title', S.title));
    text.appendChild(el('p', 'cc-banner__body', S.body));
    if (cfg.policyUrl && S.policy) {
      const link = el('a', 'cc-banner__policy', S.policy);
      link.href = cfg.policyUrl;
      text.appendChild(link);
    }
    wrap.appendChild(text);
    wrap.appendChild(actions(null));
    host.appendChild(wrap);
  }

  function category(name: string | undefined, body: string | undefined, control: HTMLElement, id?: string) {
    const li = el('li', 'cc-cat');
    const head = el(id ? 'label' : 'div', 'cc-cat__head');
    if (id) head.setAttribute('for', id);
    head.appendChild(el('span', 'cc-cat__name', name));
    head.appendChild(control);
    li.appendChild(head);
    li.appendChild(el('p', 'cc-cat__body', body));
    return li;
  }
  const toggle = (id: string, on: boolean) => {
    const i = el('input');
    i.type = 'checkbox';
    i.id = id;
    i.checked = on;
    return i;
  };

  function showManage() {
    clear();
    const opener = document.activeElement as HTMLElement | null;
    const scrim = el('div', 'cc-scrim');
    scrim.setAttribute('role', 'presentation');
    const dialog = el('div', 'cc-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', S.manageTitle ?? '');
    dialog.tabIndex = -1;
    // A visible Close at the end corner, 44 × 44, like every popup (MASTER-RULES 15). It decides nothing: it goes back
    // to the banner (or the reopen button once a choice is stored), as Esc and the scrim do, so the choice stays free.
    const x = button('cc-x', '', () => close(), ICON_REJECT);
    x.setAttribute('aria-label', S.close ?? '');
    x.title = S.close ?? '';
    dialog.appendChild(x);
    dialog.appendChild(el('h2', 'cc-dialog__title', S.manageTitle));
    dialog.appendChild(el('p', 'cc-dialog__lead', S.body));
    const list = el('ul', 'cc-cats');
    list.appendChild(category(S.necessaryTitle, S.necessaryBody, el('span', 'cc-cat__badge', S.alwaysOn)));
    // Nothing is ticked in advance: a box shows the stored grant, or off.
    const a = inUse.analytics ? toggle('cc-analytics', state.decided && state.analytics) : null;
    const m = inUse.marketing ? toggle('cc-marketing', state.decided && state.marketing) : null;
    if (a) list.appendChild(category(S.analyticsTitle, S.analyticsBody, a, a.id));
    if (m) list.appendChild(category(S.marketingTitle, S.marketingBody, m, m.id));
    dialog.appendChild(list);
    dialog.appendChild(actions({ a, m }));
    if (cfg.policyUrl && S.policy) {
      const link = el('a', 'cc-dialog__policy', S.policy);
      link.href = cfg.policyUrl;
      dialog.appendChild(link);
    }
    const close = () => {
      document.removeEventListener('keydown', onKey);
      if (state.decided) showReopen();
      else showBanner();
      opener?.focus?.();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    scrim.appendChild(dialog);
    host.appendChild(scrim);
    dialog.focus();
  }

  function showReopen() {
    clear();
    const b = button('cc-reopen', S.reopen, showManage);
    b.setAttribute('aria-label', S.reopen ?? '');
    host.appendChild(b);
  }

  // Any link or button marked data-consent-open (the footer's "Privacy choices") opens the choices.
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-consent-open]');
    if (!t) return;
    e.preventDefault();
    showManage();
  });

  // A stored, current choice applies at once; otherwise ask.
  applyConsent(state, cfg);
  if (state.decided) {
    emit();
    showReopen();
  } else showBanner();
})();
