// Search, copy buttons and the phone menu for the docs. No libraries.
(function () {
  var cfg = window.APP_DOCS || { lang: 'en', none: 'No results.', copied: 'Copied', copy: 'Copy' };
  var q = document.getElementById('q');
  var box = document.getElementById('results');
  var index = null;
  var fold = function (s) {
    return s.toLocaleLowerCase(cfg.lang === 'tr' ? 'tr' : 'en').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  };
  var esc = function (s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  function load() {
    if (index) return Promise.resolve(index);
    return fetch('/docs/' + cfg.lang + '/search.json').then(function (r) { return r.json(); }).then(function (d) {
      index = d.map(function (p) { return { p: p, t: fold(p.t), x: fold(p.x), h: p.h.map(function (h) { return [h[0], h[1], fold(h[1])]; }) }; });
      return index;
    });
  }
  function search(term) {
    var words = fold(term).split(/\s+/).filter(Boolean);
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
      out.push({ score: score, url: e.p.u + (hit ? '#' + hit[0] : ''), title: e.p.t + (hit ? ' › ' + hit[1] : ''), sub: (at > 50 ? '…' : '') + snip + '…' });
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
