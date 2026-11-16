// The sales site's only script: the product tour in the hero, the monthly /
// yearly switch, the sign-in box (every company has its own address), and the
// small things that follow the scroll. No tracking, no cookies.
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canWatch = 'IntersectionObserver' in window;
  // Tell the stylesheet the script is here: only now may it hide what it will reveal.
  root.classList.add('js');

  // Monthly or yearly: every element with data-month / data-year shows the chosen one.
  const buttons = document.querySelectorAll('[data-interval]');
  const show = (interval) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.interval === interval)));
    document.querySelectorAll('[data-month]').forEach((el) => {
      el.textContent = interval === 'month' ? el.dataset.month : el.dataset.year;
    });
  };
  buttons.forEach((b) => b.addEventListener('click', () => show(b.dataset.interval)));

  // Sign in: type the company's address, go to its sign-in page.
  const dialog = document.getElementById('signin');
  document.querySelectorAll('[data-signin]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      if (dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
        dialog.querySelector('input')?.focus();
      } else location.href = b.getAttribute('href') || '#';
    }),
  );
  dialog?.querySelector('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = String(new FormData(e.target).get('slug') || '');
    // "acme", "acme.curahold.com" or a pasted link all lead to the same place.
    const slug = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[./]/)[0].replace(/[^a-z0-9-]/g, '');
    if (slug) location.href = `https://${slug}.${dialog.dataset.base}/login`;
  });
  dialog?.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());

  // The header: a darker pane and a hairline once the page has scrolled.
  const top = document.querySelector('.top');
  const onScroll = () => top?.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // The sky moves only while someone can see it: its rings stop in a background tab,
  // and once the first screen is behind, the sky steps back and the tools strip stops.
  const away = () => root.classList.toggle('is-away', document.hidden);
  document.addEventListener('visibilitychange', away);
  away();
  const hero = document.querySelector('.hero');
  if (hero && canWatch) new IntersectionObserver(([e]) => root.classList.toggle('is-past', !e.isIntersecting)).observe(hero);

  // Sections settle into place as they are reached. If motion is unwelcome, or
  // the browser has no observer, everything is simply shown at once.
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reduce || !canWatch) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
    );
    reveals.forEach((el) => io.observe(el));
  }

  // The bento's tiles play only while they are on screen.
  if (!reduce && canWatch) {
    const live = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle('is-live', e.isIntersecting);
      },
      { threshold: 0.3 },
    );
    document.querySelectorAll('[data-live]').forEach((el) => live.observe(el));
  }

  // The product tour: four chapters, one film. The stylesheet does the playing; the
  // script only says which chapter is open. The open tab's progress bar is the clock:
  // when its animation ends the next chapter opens, so pausing the bar pauses the tour.
  const tour = document.querySelector('[data-tour]');
  if (tour) {
    const tabs = [...tour.querySelectorAll('[role="tab"]')];
    const groups = ['.sc', '[data-crumb]', '[data-now]'].map((s) => [...tour.querySelectorAll(s)]);
    const panel = tour.querySelector('[role="tabpanel"]');
    const film = tour.querySelector('.film');
    let cur = 0;
    const go = (i, focus) => {
      cur = (i + tabs.length) % tabs.length;
      const all = [tabs, ...groups];
      all.forEach((list) => list.forEach((el) => el.classList.remove('is-on')));
      // Read a layout value so a chapter opened again starts its scene from the top.
      void tour.offsetWidth;
      all.forEach((list) => list[cur]?.classList.add('is-on'));
      tabs.forEach((tb, k) => {
        tb.setAttribute('aria-selected', String(k === cur));
        tb.tabIndex = k === cur ? 0 : -1;
      });
      panel?.setAttribute('aria-labelledby', tabs[cur].id);
      tour.style.setProperty('--dur', `${tabs[cur].dataset.dur || 7000}ms`);
      if (focus) tabs[cur].focus();
    };
    const rtl = root.dir === 'rtl';
    tabs.forEach((tb, k) => {
      tb.addEventListener('click', () => go(k));
      tb.addEventListener('keydown', (e) => {
        const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (step) go(cur + step, true);
        else if (e.key === 'Home') go(0, true);
        else if (e.key === 'End') go(tabs.length - 1, true);
        else return;
        e.preventDefault();
      });
    });
    tour.addEventListener('animationend', (e) => {
      if (e.animationName === 'bar') go(cur + 1);
    });
    // Anything that should hold the film still: a pointer resting on it, a finger
    // held on it, keyboard focus on the chapters, the hero off screen, the tab hidden.
    const holds = new Set();
    const hold = (why, on) => {
      holds[on ? 'add' : 'delete'](why);
      tour.classList.toggle('is-paused', holds.size > 0);
    };
    film?.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && hold('hover', true));
    film?.addEventListener('pointerleave', () => hold('hover', false));
    film?.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && hold('touch', true));
    ['pointerup', 'pointercancel'].forEach((n) => window.addEventListener(n, () => hold('touch', false)));
    const tablist = tour.querySelector('[role="tablist"]');
    tablist?.addEventListener('focusin', (e) => e.target.matches(':focus-visible') && hold('focus', true));
    tablist?.addEventListener('focusout', () => hold('focus', false));
    document.addEventListener('visibilitychange', () => hold('hidden', document.hidden));
    if (canWatch && film) new IntersectionObserver(([e]) => hold('away', !e.isIntersecting), { threshold: 0.2 }).observe(film);
    tabs.forEach((tb, k) => (tb.tabIndex = k === cur ? 0 : -1));
    tour.style.setProperty('--dur', `${tabs[0]?.dataset.dur || 7000}ms`);
  }

  // The story: six steps of text, and a stage that follows them. The reading line
  // is the stage's middle on a wide screen, the middle of the space under it on a
  // phone. As each step crosses it, p runs from that step's number to the next;
  // the stylesheet draws every scene from p, so the story plays both ways with the
  // scroll. Nothing is measured while scrolling, and nothing runs off screen.
  const story = document.querySelector('[data-story]');
  if (story && canWatch) {
    const pin = story.querySelector('.story__pin');
    const steps = [...story.querySelectorAll('.story__step')];
    const wide = window.matchMedia('(min-width: 1040px)');
    const fmt = new Intl.NumberFormat(root.lang);
    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    // Numbers that count with the scroll: scene, start, end (of its action), from, to.
    const counts = [...story.querySelectorAll('[data-count]')].map((el) => {
      const [k, a, b, from, to] = el.dataset.count.split(',').map(Number);
      return { el, k, a, b, from, to, shown: from };
    });
    let blocks = [];
    let line = 0;
    let last = -1;
    let on = 0;
    let raf = 0;
    const measure = () => {
      blocks = steps.map((s) => {
        const r = s.getBoundingClientRect();
        return [r.top + window.scrollY, r.height];
      });
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      line = wide.matches ? top + pin.offsetHeight / 2 : (top + pin.offsetHeight + window.innerHeight) / 2;
    };
    const frame = () => {
      raf = 0;
      const y = window.scrollY + line;
      let p = 0;
      blocks.forEach(([top, h], i) => {
        if (y >= top) p = i + clamp((y - top) / h);
      });
      // Without motion the story moves a whole step at a time, each step complete.
      if (reduce) p = Math.min(Math.floor(p), steps.length - 1) + 0.75;
      if (Math.abs(p - last) < 0.001) return;
      last = p;
      pin.style.setProperty('--p', p.toFixed(3));
      const now = Math.min(Math.floor(p), steps.length - 1);
      if (now !== on) {
        steps[on].classList.remove('is-on');
        steps[now].classList.add('is-on');
        on = now;
      }
      for (const c of counts) {
        const s = clamp((clamp((p - c.k - 0.08) / 0.62) - c.a) / (c.b - c.a));
        const v = Math.round(c.from + (c.to - c.from) * s);
        if (v !== c.shown) c.el.textContent = fmt.format((c.shown = v));
      }
    };
    const ask = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const again = () => {
      measure();
      ask();
    };
    new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          again();
          window.addEventListener('scroll', ask, { passive: true });
        } else window.removeEventListener('scroll', ask);
      },
      { rootMargin: '100px 0px' },
    ).observe(story);
    if ('ResizeObserver' in window) new ResizeObserver(again).observe(story);
    window.addEventListener('resize', again);
  }
})();
