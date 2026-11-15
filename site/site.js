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

  // The header: a hairline once the page has scrolled, and day colours once the night hero is behind it.
  const top = document.querySelector('.top');
  const hero = document.querySelector('.hero');
  const onScroll = () => {
    top?.classList.toggle('is-scrolled', window.scrollY > 8);
    if (hero) top?.classList.toggle('is-day', hero.getBoundingClientRect().bottom < 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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
})();
