// Search, copy buttons, the phone menu and the menus that follow the reader. No libraries.
(function () {
  // The page's settings are a JSON block, not a script: the app's content policy runs no inline script.
  var el = document.getElementById('docs-cfg');
  var cfg = (el && JSON.parse(el.textContent)) || { lang: document.documentElement.lang || 'en', none: 'No results.', copied: 'Copied', copy: 'Copy' };
  var q = document.getElementById('q');
  var box = document.getElementById('results');
  var index = null;
  // One form for what is typed and what is indexed, in every script: case, accents and Turkish
  // dotless i; Arabic and Persian vowel marks, alef and yeh forms; Hebrew points.
  var fold = function (s) {
    var low;
    try { low = s.toLocaleLowerCase(cfg.lang); } catch (e) { low = s.toLowerCase(); }
    return low.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
      .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\u0622\u0623\u0625]/g, '\u0627').replace(/\u0649/g, '\u064a').replace(/\u06cc/g, '\u064a').replace(/\u06a9/g, '\u0643').replace(/\u0629/g, '\u0647')
      .replace(/[\u0591-\u05c7]/g, '').normalize('NFC');
  };
  // Chinese, Japanese and Korean are written without spaces: a run of their letters is searched
  // for as overlapping pairs. A short run needs every pair (so "インポート" does not find
  // "レポート"); in a longer one two in three are enough ("顧客インポート" finds "顧客をインポート"),
  // and the run found whole counts most. Everything else is searched for by word, every word needed.
  var WIDE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
  var groupsOf = function (text) {
    var out = [];
    fold(text).split(/[\s,.;:!?、。，．；：！？「」『』（）()]+/).filter(Boolean).forEach(function (w) {
      if (!WIDE.test(w) || w.length < 3) { out.push({ terms: [w], need: 1 }); return; }
      var pairs = [];
      for (var i = 0; i < w.length - 1; i++) pairs.push(w.slice(i, i + 2));
      out.push({ terms: pairs, need: pairs.length <= 4 ? pairs.length : Math.ceil((pairs.length * 2) / 3), whole: w });
    });
    return out;
  };
  var esc = function (s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  function load() {
    if (index) return Promise.resolve(index);
    return fetch((cfg.base || '/docs/') + cfg.lang + '/search.json').then(function (r) { return r.json(); }).then(function (d) {
      index = d.map(function (p) { return { p: p, t: fold(p.t), x: fold(p.x), h: p.h.map(function (h) { return [h[0], h[1], fold(h[1])]; }) }; });
      return index;
    });
  }
  function search(term) {
    var groups = groupsOf(term);
    if (!groups.length) return [];
    var out = [];
    index.forEach(function (e) {
      var score = 0;
      var hit = null;
      var first = -1;
      var all = groups.every(function (g) {
        var found = 0;
        g.terms.forEach(function (w) {
          // A pair counts little: "ポート" in a title is no reason to put "サポート" first.
          var s = 0;
          if (e.t.indexOf(w) >= 0) s += g.whole ? 2 : 10;
          e.h.forEach(function (h) { if (h[2].indexOf(w) >= 0) { s += g.whole ? 1 : 5; hit = hit || h; } });
          var at = e.x.indexOf(w);
          if (at >= 0) { s += 1; if (first < 0) first = at; }
          score += s;
          if (s > 0) found++;
        });
        if (g.whole) {
          if (e.t.indexOf(g.whole) >= 0) score += 30;
          var head = null;
          e.h.forEach(function (h) { if (h[2].indexOf(g.whole) >= 0) { score += 15; head = head || h; } });
          if (head) hit = head;
          var wx = e.x.indexOf(g.whole);
          if (wx >= 0) { score += 3; first = wx; }
        }
        return found >= g.need;
      });
      if (!all) return;
      var at = first;
      var snip = at >= 0 ? e.p.x.slice(Math.max(0, at - 50), at + 110) : '';
      out.push({ score: score, url: (cfg.base ? cfg.base + e.p.u.replace(/^\/docs\//, '') + (cfg.index || '') : e.p.u) + (hit ? '#' + hit[0] : ''), title: e.p.t + (hit ? ' › ' + hit[1] : ''), sub: (at > 50 ? '…' : '') + snip + '…' });
    });
    return out.sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
  }
  var sel = -1;
  function render(list) {
    sel = -1;
    box.hidden = false;
    box.innerHTML = list.length ? list.map(function (r) { return '<a href="' + r.url + '">' + esc(r.title) + '<small>' + esc(r.sub) + '</small></a>'; }).join('') : '<p>' + esc(cfg.none) + '</p>';
  }
  if (q) {
    q.addEventListener('input', function () {
      var v = q.value.trim();
      if (v.length < 2) { box.hidden = true; return; }
      load().then(function () { render(search(v)); });
    });
    q.addEventListener('keydown', function (e) {
      var links = box.querySelectorAll('a');
      if (e.key === 'Escape') { box.hidden = true; q.blur(); }
      if (!links.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach(function (a, i) { a.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
      }
      if (e.key === 'Enter') location.href = links[Math.max(0, sel)].getAttribute('href');
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.hidden = true; });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    });
  }
  document.querySelectorAll('.code .copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.closest('.code').querySelector('code').innerText;
      navigator.clipboard.writeText(text).then(function () {
        b.textContent = cfg.copied;
        setTimeout(function () { b.textContent = cfg.copy; }, 1400);
      }, function () {});
    });
  });
  // The left menu shows where the reader is. It opens where it was left on the last page, then
  // glides until the page's own item sits about a third from its top; on a phone the drawer
  // opens already there. Reduced motion: no glide, it is simply there.
  var nav = document.getElementById('nav');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NAV_KEY = 'docs_nav_scroll:' + cfg.lang;
  var current = nav && nav.querySelector('a[aria-current="page"]');
  var keepAt = function (box, item) {
    var top = item.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    return Math.max(0, Math.min(box.scrollHeight - box.clientHeight, top - box.clientHeight / 3 + item.offsetHeight / 2));
  };
  var showCurrent = function (glide) {
    if (!nav || !current || nav.scrollHeight <= nav.clientHeight) return;
    var to = keepAt(nav, current);
    if (Math.abs(nav.scrollTop - to) < 2) return;
    if (glide && !still) nav.scrollTo({ top: to, behavior: 'smooth' });
    else nav.scrollTop = to;
  };
  if (nav) {
    var before = null;
    try { before = sessionStorage.getItem(NAV_KEY); } catch (e) { /* storage off */ }
    if (before !== null) nav.scrollTop = Number(before) || 0;
    // After the first paint, so the glide starts from where the menu was.
    requestAnimationFrame(function () { requestAnimationFrame(function () { showCurrent(before !== null); }); });
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem(NAV_KEY, String(Math.round(nav.scrollTop))); } catch (e) { /* storage off */ }
    });
  }
  var menu = document.querySelector('.top__menu');
  if (menu) menu.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) showCurrent(false);
  });

  // "On this page" follows the reader: the section being read is marked, and the list keeps it in view.
  var toc = document.querySelector('.toc');
  var marks = toc ? [].slice.call(toc.querySelectorAll('a[href^="#"]')) : [];
  var heads = marks.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
  if (marks.length && heads.every(Boolean)) {
    var shown = -1;
    var follow = function () {
      var line = Math.min(160, innerHeight / 4);
      var at = 0;
      heads.forEach(function (h, i) { if (h.getBoundingClientRect().top <= line) at = i; });
      // At the very end of the page the last section is the one being read, however short.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) at = heads.length - 1;
      if (at === shown) return;
      if (shown >= 0) marks[shown].removeAttribute('aria-current');
      marks[at].setAttribute('aria-current', 'location');
      shown = at;
      if (toc.scrollHeight > toc.clientHeight) {
        var r = marks[at].getBoundingClientRect(), b = toc.getBoundingClientRect();
        if (r.top < b.top + 40 || r.bottom > b.bottom - 40) toc.scrollTo({ top: keepAt(toc, marks[at]), behavior: still ? 'auto' : 'smooth' });
      }
    };
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; follow(); });
    }, { passive: true });
    window.addEventListener('resize', follow);
    follow();
  }
})();
