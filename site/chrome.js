// The shared header's behaviour on every page and version of the sales site:
// mega-menu panels (click, or hover on a mouse), the phone sheet, Escape and
// outside clicks to close, focus returned to the button, and the darker pane
// once the page has scrolled. Without this script the panels still open on
// hover and focus (site/chrome.css), so nothing is out of reach.
(function () {
  var hx = document.querySelector('[data-hx]');
  if (!hx) return;
  var items = Array.prototype.slice.call(hx.querySelectorAll('.hx__item'));
  var burger = hx.querySelector('.hx__burger');
  var menu = hx.querySelector('.hx__menu');
  var bar = hx.querySelector('.hx__bar');
  var wide = { get matches() { return !hx.classList.contains('is-compact'); } };
  var mouse = window.matchMedia('(hover: hover) and (pointer: fine)');
  var openItem = null;
  var timer = 0;

  function setOpen(item, on) {
    var btn = item.querySelector('button.hx__top');
    if (!btn) return;
    item.classList.toggle('is-open', on);
    btn.setAttribute('aria-expanded', String(on));
    if (on) openItem = item;
    else if (openItem === item) openItem = null;
  }
  function closeAll(except) {
    items.forEach(function (it) {
      if (it !== except) setOpen(it, false);
    });
  }
  // On a phone the open menu is a modal sheet: it says so, and keeps focus inside.
  function sheet(on) {
    hx.classList.toggle('is-open', on);
    if (on) {
      menu.setAttribute('role', 'dialog');
      menu.setAttribute('aria-modal', 'true');
      menu.setAttribute('aria-label', burger.getAttribute('data-label'));
    } else {
      menu.removeAttribute('role');
      menu.removeAttribute('aria-modal');
      menu.removeAttribute('aria-label');
    }
    burger.setAttribute('aria-expanded', String(on));
    burger.setAttribute('aria-label', on ? burger.getAttribute('data-close-label') : burger.getAttribute('data-label'));
    document.documentElement.classList.toggle('hx-lock', on);
    if (!on) closeAll();
  }
  burger.setAttribute('data-label', burger.getAttribute('aria-label'));

  items.forEach(function (item) {
    var btn = item.querySelector('button.hx__top');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var on = !item.classList.contains('is-open');
      if (wide.matches) closeAll(item);
      setOpen(item, on);
    });
    // On a mouse, the panel follows the pointer with a short grace period, so a diagonal
    // move from the word to the panel does not close it.
    item.addEventListener('mouseenter', function () {
      if (!wide.matches || !mouse.matches) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        closeAll(item);
        setOpen(item, true);
      }, openItem ? 0 : 90);
    });
    item.addEventListener('mouseleave', function () {
      if (!wide.matches || !mouse.matches) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        setOpen(item, false);
      }, 220);
    });
  });

  burger.addEventListener('click', function () {
    sheet(!hx.classList.contains('is-open'));
  });
  var tops = Array.prototype.slice.call(hx.querySelectorAll('.hx__top'));
  document.addEventListener('keydown', function (e) {
    // Left and right move between the top-level words of the menu (mirrored right to left).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && wide.matches) {
      var at = tops.indexOf(document.activeElement);
      if (at >= 0) {
        var rtl = document.documentElement.dir === 'rtl';
        var step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
        tops[(at + step + tops.length) % tops.length].focus();
        e.preventDefault();
        return;
      }
    }
    // Tab stays inside the open phone sheet: from the last control back to the button, and round.
    if (e.key === 'Tab' && hx.classList.contains('is-open')) {
      var focusables = [burger].concat(Array.prototype.filter.call(menu.querySelectorAll('a, button, summary'), function (el) {
        return el.offsetParent !== null;
      }));
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      return;
    }
    if (e.key !== 'Escape') return;
    if (openItem) {
      var btn = openItem.querySelector('button.hx__top');
      setOpen(openItem, false);
      if (btn) btn.focus();
    } else if (hx.classList.contains('is-open')) {
      sheet(false);
      burger.focus();
    }
    var lang = hx.querySelector('.hx__lang[open]');
    if (lang) lang.removeAttribute('open');
  });
  document.addEventListener('click', function (e) {
    if (!hx.contains(e.target)) {
      closeAll();
      var lang = hx.querySelector('.hx__lang[open]');
      if (lang) lang.removeAttribute('open');
    }
  });
  // Tabbing out of an open panel on a desktop closes it.
  hx.addEventListener('focusout', function (e) {
    if (!wide.matches || !openItem) return;
    if (!openItem.contains(e.relatedTarget)) setOpen(openItem, false);
  });
  // A link inside the sheet that only moves on the same page closes the sheet.
  menu.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (a && hx.classList.contains('is-open')) sheet(false);
  });
  // Fold the bar into the sheet when the window is narrow or the words do not fit.
  function fit() {
    var was = hx.classList.contains('is-compact');
    hx.classList.remove('is-compact');
    var compact = window.innerWidth < 1240 || bar.scrollWidth > bar.clientWidth + 1 || menu.scrollWidth > menu.clientWidth + 1;
    hx.classList.toggle('is-compact', compact);
    if (was && !compact) sheet(false);
    if (!compact) closeAll();
  }
  var fitTimer = 0;
  var lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fit, 120);
  });
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  // Sign in: type the company's address, go to its sign-in page. Pages without the
  // dialog follow the link to the landing page's.
  var dialog = document.getElementById('signin');
  Array.prototype.forEach.call(document.querySelectorAll('[data-signin]'), function (b) {
    b.addEventListener('click', function (e) {
      if (!dialog || typeof dialog.showModal !== 'function') return;
      e.preventDefault();
      if (hx.classList.contains('is-open')) sheet(false);
      dialog.showModal();
      var input = dialog.querySelector('input');
      if (input) input.focus();
    });
  });
  if (dialog) {
    var form = dialog.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = String(new FormData(form).get('slug') || '');
      // "acme", "acme.curahold.com" or a pasted link all lead to the same place.
      var slug = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[./]/)[0].replace(/[^a-z0-9-]/g, '');
      if (slug) location.href = 'https://' + slug + '.' + dialog.getAttribute('data-base') + '/login';
    });
    var closeBtn = dialog.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });
  }
  // Flat at the top, lifted once the page moves; on a phone, out of the way while reading
  // down and back on the first move up (never while the menu is open, never with reduced motion).
  var scrolled = false;
  var lastY = window.scrollY;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  function onScroll() {
    var y = window.scrollY;
    var s = y > 8;
    if (s !== scrolled) {
      scrolled = s;
      hx.classList.toggle('is-scrolled', s);
    }
    if (!wide.matches && !still.matches && Math.abs(y - lastY) > 6) {
      hx.classList.toggle('is-away', y > lastY && y > 120 && !hx.contains(document.activeElement));
      lastY = y;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
