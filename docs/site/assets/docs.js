// Search, copy buttons and the phone menu for the docs. No libraries.
(function () {
  var cfg = window.APP_DOCS || { lang: 'en', none: 'No results.', copied: 'Copied', copy: 'Copy' };
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
  // for as overlapping pairs ("顧客インポート" finds "顧客をインポートする"), everything else by word.
  var WIDE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
  var termsOf = function (text) {
    var out = [];
    fold(text).split(/[\s,.;:!?、。，．；：！？「」『』（）()]+/).filter(Boolean).forEach(function (w) {
      if (!WIDE.test(w) || w.length < 3) { out.push(w); return; }
      for (var i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
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
    var words = termsOf(term);
    if (!words.length) return [];
    var out = [];
    index.forEach(function (e) {
      var score = 0;
      var hit = null;
      var all = words.every(function (w) {
        var s = 0;
        if (e.t.indexOf(w) >= 0) s += 10;
        e.h.forEach(function (h) { if (h[2].indexOf(w) >= 0) { s += 5; hit = hit || h; } });
        if (e.x.indexOf(w) >= 0) s += 1;
        score += s;
        return s > 0;
      });
      if (!all) return;
      var at = e.x.indexOf(words[0]);
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
  var menu = document.querySelector('.top__menu');
  if (menu) menu.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    menu.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();
