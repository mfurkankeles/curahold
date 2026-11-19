// Measurement for the sales site's versions, with consent only. Loaded on every
// landing page (classic, A, C). It does nothing until the visitor has accepted
// analytics cookies in the banner (site/consent.js), and nothing at all when no
// destination is configured.
//
// Events, each tagged with the variant (the A/B test's, or the page's own version):
//   go      — "Ürüne git" / "Ücretsiz dene" pressed (any [data-ab="go"])
//   demo    — "Canlı demo" pressed ([data-ab="demo"])
//   switch  — the header's version switch pressed ([data-ab="switch"])
//   time    — seconds on the page, sent once when the page is hidden
// The sign-up itself completes in the app, which reports its own event with the
// same variant read from the cura_ab cookie.
(function () {
  var cfg = window.__curaAb || {};
  var meta = document.querySelector('meta[name="cura-ab"]');
  var variant = meta ? meta.content : 'page.' + (cfg.page || 'main');
  var started = Date.now();
  var sentTime = false;

  // Asks the site's consent library (site/consent.js), which also applies the policy version and the 12-month limit.
  function consented() {
    try {
      return !!(window.curaConsent && window.curaConsent.allows('analytics'));
    } catch {
      return false;
    }
  }
  function send(name, extra) {
    if (!consented()) return;
    var data = { e: name, v: variant, l: document.documentElement.lang, p: location.pathname };
    for (var k in extra || {}) data[k] = extra[k];
    if (typeof window.gtag === 'function') window.gtag('event', 'cura_' + name, { variant: data.v, page_lang: data.l });
    if (cfg.endpoint && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(cfg.endpoint, new Blob([JSON.stringify(data)], { type: 'application/json' }));
      } catch {
        /* measurement never breaks the page */
      }
    }
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('[data-ab]') : null;
    if (a) send(a.getAttribute('data-ab'));
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && !sentTime) {
      sentTime = true;
      send('time', { s: Math.round((Date.now() - started) / 1000) });
    }
  });
})();
