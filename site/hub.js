// The demo hub's filters: chips for role, goal and area; the role strip under
// the hero. Within a group any chip matches (or); across groups all must (and).
// The choice lives in the address (?role=csm,lead&goal=keep), so a link can be
// sent that opens on the same tours. Without this script every tour is shown.
(function () {
  var GROUPS = ['role', 'goal', 'area'];
  var state = { role: [], goal: [], area: [] };
  var cards = [].slice.call(document.querySelectorAll('.hub-card'));
  var areas = [].slice.call(document.querySelectorAll('.hub-area'));
  var chips = [].slice.call(document.querySelectorAll('.hub-chip'));
  var roles = [].slice.call(document.querySelectorAll('.hub-role'));
  var count = document.querySelector('.hub-results__count');
  var empty = document.querySelector('.hub-empty');
  var clear = document.querySelector('.hub-filters__clear');
  var picked = document.querySelector('.hub-filters__toggle span');
  var words = JSON.parse(document.getElementById('hub-words').textContent);

  var params = new URLSearchParams(location.search);
  GROUPS.forEach(function (g) {
    var v = params.get(g);
    if (v) state[g] = v.split(',').filter(Boolean);
  });

  function has(list, values) {
    if (!list.length) return true;
    for (var i = 0; i < values.length; i++) if (list.indexOf(values[i]) !== -1) return true;
    return false;
  }

  function apply(scroll) {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = has(state.role, c.dataset.roles.split(' ')) && has(state.goal, c.dataset.goals.split(' ')) && has(state.area, [c.dataset.area]);
      c.hidden = !ok;
      if (ok) shown++;
    });
    areas.forEach(function (a) {
      a.hidden = !a.querySelector('.hub-card:not([hidden])');
    });
    chips.forEach(function (ch) {
      ch.setAttribute('aria-pressed', String(state[ch.dataset.group].indexOf(ch.dataset.value) !== -1));
    });
    roles.forEach(function (r) {
      r.setAttribute('aria-pressed', String(state.role.length === 1 && state.role[0] === r.dataset.value));
    });
    var any = GROUPS.some(function (g) { return state[g].length > 0; });
    var n = GROUPS.reduce(function (s, g) { return s + state[g].length; }, 0);
    count.textContent = shown === 1 ? words.one : words.many.replace('{n}', shown);
    empty.hidden = shown > 0;
    clear.hidden = !any;
    if (picked) picked.textContent = n ? '(' + n + ')' : '';
    var q = new URLSearchParams(location.search);
    GROUPS.forEach(function (g) {
      if (state[g].length) q.set(g, state[g].join(','));
      else q.delete(g);
    });
    var s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    if (scroll) document.getElementById('tours').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  chips.forEach(function (ch) {
    ch.addEventListener('click', function () {
      var list = state[ch.dataset.group];
      var i = list.indexOf(ch.dataset.value);
      if (i === -1) list.push(ch.dataset.value);
      else list.splice(i, 1);
      apply(false);
    });
  });
  roles.forEach(function (r) {
    r.addEventListener('click', function () {
      var on = state.role.length === 1 && state.role[0] === r.dataset.value;
      state.role = on ? [] : [r.dataset.value];
      apply(!on);
    });
  });
  function reset() {
    GROUPS.forEach(function (g) { state[g] = []; });
    apply(false);
  }
  clear.addEventListener('click', reset);
  empty.querySelector('button').addEventListener('click', reset);
  var toggle = document.querySelector('.hub-filters__toggle');
  toggle.addEventListener('click', function () {
    var box = toggle.closest('.hub-filters');
    var open = box.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  var top = document.querySelector('.top');
  addEventListener('scroll', function () { top.classList.toggle('is-scrolled', scrollY > 8); }, { passive: true });
  apply(false);
})();
