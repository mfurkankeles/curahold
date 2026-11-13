// The sales site's only script: the monthly / yearly switch, the sign-in box
// (every company has its own address), and a line under the header once the
// page scrolls. No tracking, no cookies.
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Tell the stylesheet JS is here: only now may it hide sections before revealing them.
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

  // A hairline under the header once the page has scrolled.
  const top = document.querySelector('.top');
  const onScroll = () => top?.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Sections settle into place as they are reached. If motion is unwelcome, or
  // the browser has no observer, everything is simply shown at once.
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
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
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    reveals.forEach((el) => io.observe(el));
  }

  // Health scores on the product board count up once they are in view.
  const counters = document.querySelectorAll('[data-count]');
  const runCount = (el) => {
    const target = parseInt(el.dataset.count, 10) || 0;
    if (reduce) {
      el.textContent = String(target);
      return;
    }
    const dur = 950;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    };
    requestAnimationFrame(tick);
  };
  if (reduce || !('IntersectionObserver' in window)) {
    counters.forEach(runCount);
  } else {
    const co = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            runCount(e.target);
            co.unobserve(e.target);
          }
        }
      },
      { threshold: 0.6 },
    );
    counters.forEach((el) => co.observe(el));
  }

  // The hero figure leans a few pixels toward the pointer — the one reaction to
  // the cursor, and only when motion is welcome and there is a real pointer.
  const hero = document.querySelector('.hero');
  const hold = document.querySelector('.hold');
  if (!reduce && hero && hold && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      hold.style.setProperty('--px', (x * 10).toFixed(2) + 'px');
      hold.style.setProperty('--py', (y * 10).toFixed(2) + 'px');
    });
    hero.addEventListener('pointerleave', () => {
      hold.style.setProperty('--px', '0px');
      hold.style.setProperty('--py', '0px');
    });
  }
})();
