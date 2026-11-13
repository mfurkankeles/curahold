// Consent for the marketing site: a banner, a manage dialog and a small re-open
// control, plus consent-gated loaders for GA4, the Meta pixel and the TikTok
// pixel. Vanilla, no framework. The words and the ids come from the page's
// window.__curaConsent config (set per page by scripts/build-site.ts).
//
// Two rules hold throughout:
//   1. Privacy-preserving default — nothing non-essential loads until the
//      visitor opts in. Reject keeps everything off.
//   2. Every loader is a no-op when its id is absent, and the whole banner is
//      skipped when no id is configured (there is then nothing to consent to).
(function () {
  var cfg = window.__curaConsent;
  if (!cfg || typeof document === 'undefined') return;
  var S = cfg.strings || {};
  var ids = cfg.ids || {};
  if (!(ids.ga4 || ids.meta || ids.tiktok)) return; // nothing non-essential to load

  var KEY = 'curahold_consent_v1';

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v || typeof v !== 'object') return { analytics: false, marketing: false, decided: false };
      return { analytics: v.analytics === true, marketing: v.marketing === true, decided: v.decided === true };
    } catch (e) {
      return { analytics: false, marketing: false, decided: false };
    }
  }
  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ analytics: state.analytics, marketing: state.marketing, decided: true, at: new Date().toISOString() }));
    } catch (e) {
      /* private mode: holds for this page */
    }
  }

  // ----------------------------------------------------------- loaders
  var loaded = { ga4: false, meta: false, tiktok: false };
  function addScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }
  function loadGa4(id) {
    if (loaded.ga4) return;
    loaded.ga4 = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
    addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
  }
  function loadMeta(id) {
    if (loaded.meta) return;
    loaded.meta = true;
    if (!window.fbq) {
      var n = (window.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
    }
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  }
  function loadTiktok(id) {
    if (loaded.tiktok) return;
    loaded.tiktok = true;
    window.TiktokAnalyticsObject = 'ttq';
    var q = (window.ttq = window.ttq || []);
    q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    q.setAndDefer = function (obj, method) {
      obj[method] = function () {
        obj.push([method].concat(Array.prototype.slice.call(arguments)));
      };
    };
    for (var i = 0; i < q.methods.length; i++) q.setAndDefer(q, q.methods[i]);
    addScript('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(id) + '&lib=ttq');
    if (q.load) q.load(id);
    if (q.page) q.page();
  }
  function apply(state) {
    if (ids.ga4) window['ga-disable-' + ids.ga4] = !(state.decided && state.analytics);
    if (ids.ga4 && state.decided && state.analytics) loadGa4(ids.ga4);
    if (ids.meta && state.decided && state.marketing) loadMeta(ids.meta);
    if (ids.tiktok && state.decided && state.marketing) loadTiktok(ids.tiktok);
  }

  // ----------------------------------------------------------- ui helpers
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(cls, text, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  var host = el('div', 'cc-host');
  document.body.appendChild(host);

  function clear() {
    host.textContent = '';
  }
  function decide(analytics, marketing) {
    var state = { analytics: analytics, marketing: marketing, decided: true };
    write(state);
    apply(state);
    showReopen();
  }

  function showBanner() {
    clear();
    var wrap = el('div', 'cc-banner');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', S.ariaBanner || 'Cookie consent');
    var text = el('div', 'cc-banner__text');
    text.appendChild(el('strong', 'cc-banner__title', S.title));
    text.appendChild(el('p', 'cc-banner__body', S.body));
    wrap.appendChild(text);
    var actions = el('div', 'cc-actions');
    actions.appendChild(button('btn btn--ghost', S.manage, showManage));
    actions.appendChild(button('btn btn--ghost', S.rejectAll, function () {
      decide(false, false);
    }));
    actions.appendChild(button('btn btn--primary', S.acceptAll, function () {
      decide(true, true);
    }));
    wrap.appendChild(actions);
    host.appendChild(wrap);
  }

  function category(name, body, control) {
    var li = el('li', 'cc-cat');
    var head = el(control ? 'label' : 'div', 'cc-cat__head');
    head.appendChild(el('span', 'cc-cat__name', name));
    head.appendChild(control);
    li.appendChild(head);
    li.appendChild(el('p', 'cc-cat__body', body));
    return li;
  }

  function showManage() {
    clear();
    var current = read();
    var scrim = el('div', 'cc-scrim');
    scrim.setAttribute('role', 'presentation');
    var dialog = el('div', 'cc-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', S.manageTitle);
    dialog.appendChild(el('h2', 'cc-dialog__title', S.manageTitle));
    dialog.appendChild(el('p', 'cc-dialog__lead', S.body));

    var list = el('ul', 'cc-cats');
    list.appendChild(category(S.necessaryTitle, S.necessaryBody, el('span', 'cc-cat__badge', S.alwaysOn)));
    var a = el('input');
    a.type = 'checkbox';
    a.checked = current.analytics;
    list.appendChild(category(S.analyticsTitle, S.analyticsBody, a));
    var m = el('input');
    m.type = 'checkbox';
    m.checked = current.marketing;
    list.appendChild(category(S.marketingTitle, S.marketingBody, m));
    dialog.appendChild(list);

    var actions = el('div', 'cc-actions');
    actions.appendChild(button('btn btn--ghost', S.rejectAll, function () {
      decide(false, false);
    }));
    actions.appendChild(button('btn btn--ghost', S.save, function () {
      decide(a.checked, m.checked);
    }));
    actions.appendChild(button('btn btn--primary', S.acceptAll, function () {
      decide(true, true);
    }));
    dialog.appendChild(actions);

    if (cfg.policyUrl && S.policy) {
      var link = el('a', 'cc-dialog__policy', S.policy);
      link.href = cfg.policyUrl;
      dialog.appendChild(link);
    }
    scrim.appendChild(dialog);
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) {
        if (read().decided) showReopen();
        else showBanner();
      }
    });
    host.appendChild(scrim);
  }

  function showReopen() {
    clear();
    var b = button('cc-reopen', S.reopen, showManage);
    b.setAttribute('aria-label', S.reopen);
    host.appendChild(b);
  }

  // Apply the stored choice at once (so a returning visitor who opted in is
  // tracked without a second click), then show the right control.
  var start = read();
  apply(start);
  if (start.decided) showReopen();
  else showBanner();
})();
