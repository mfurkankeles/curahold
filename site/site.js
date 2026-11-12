// The sales site's only script: the monthly / yearly switch, the sign-in box
// (every company has its own address), and a line under the header once the
// page scrolls. No tracking, no cookies.
(() => {
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
})();
