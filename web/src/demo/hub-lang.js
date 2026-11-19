// The demo hub's language chooser (scripts/build-demo-hub.ts writes it into every page).
// The first visit to the English root asks for a language; the choice is kept (the hub's own
// key plus the app's app_locale and app_locale_hint), so the hub, the tours, the live app and
// its sample company all open in it, and the root sends a returning visitor to it. ?lang=<l>
// in a link skips the question and opens that language. A language page visited directly
// counts as a choice. The language button in the header opens the chooser again.
(function () {
  var KEY = 'curahold_demo_lang';
  var box = document.getElementById('lang-pick');
  if (!box) return;
  var here = box.getAttribute('data-here');
  var root = box.getAttribute('data-root') === '1';
  var links = [].slice.call(box.querySelectorAll('a[data-l]'));
  var href = {};
  links.forEach(function (a) { href[a.getAttribute('data-l')] = a.getAttribute('href'); });
  function get(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage that forgets */ } }
  function keep(l) { set(KEY, l); set('app_locale', l); set('app_locale_hint', l); }
  function go(l) { if (l === here) close(); else location.href = href[l]; }

  var params = new URLSearchParams(location.search);
  var asked = params.get('lang');
  if (asked && href[asked]) {
    keep(asked);
    if (asked !== here) { location.replace(href[asked]); return; }
    params.delete('lang');
    var rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  } else if (root) {
    var before = get(KEY);
    if (before && before !== here && href[before]) { location.replace(href[before]); return; }
  } else {
    keep(here);
  }

  var first = root && !get(KEY);
  var opener = null;
  function open(isFirst) {
    first = !!isFirst;
    opener = document.activeElement;
    box.classList.add('is-open');
    box.classList.toggle('is-first', first);
    var now = box.querySelector('a[aria-current]') || links[0];
    if (now) now.focus({ preventScroll: true });
  }
  function close() {
    // Closing the first question without an answer is an answer: English, the root's language.
    if (first) keep(here);
    first = false;
    box.classList.remove('is-open', 'is-first');
    if (location.hash === '#lang-pick') history.replaceState(null, '', location.pathname + location.search);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      var l = a.getAttribute('data-l');
      keep(l);
      go(l);
    });
  });
  [].slice.call(document.querySelectorAll('.hub-lang__open')).forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); open(false); });
  });
  var x = box.querySelector('.hub-lang__close');
  if (x) x.addEventListener('click', function (e) { e.preventDefault(); close(); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    // Focus stays inside the chooser while it is open.
    var all = [].slice.call(box.querySelectorAll('a[href]'));
    var i = all.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
    else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
  });

  if (location.hash === '#lang-pick') open(false);
  else if (first) open(true);
})();
