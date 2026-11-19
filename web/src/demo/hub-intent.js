// The demo hub's three questions (scripts/build-demo-hub.ts): which team, what
// first, what you use today. One answer per question; once all three are
// given, the tours to start with appear (worked out at build time by
// shared/src/tours.ts, pickTours), and "try it with your own file" for anyone
// coming from spreadsheets or a task tool. Arrow keys move within a question.
(function () {
  var root = document.querySelector('.hub-intent');
  var data = document.getElementById('hub-intent');
  if (!root || !data) return;
  var info;
  try {
    info = JSON.parse(data.textContent || '{}');
  } catch (e) {
    return;
  }
  var picked = {};
  var wait = root.querySelector('.hub-intent__wait');
  var picks = root.querySelector('.hub-intent__picks');
  var list = picks.querySelector('ol');
  var own = root.querySelector('.hub-intent__own');

  function render() {
    var key = [picked.team, picked.goal, picked.today].join('.');
    var answer = info.table[key];
    if (!answer) {
      wait.hidden = false;
      picks.hidden = true;
      return;
    }
    wait.hidden = true;
    picks.hidden = false;
    list.textContent = '';
    answer.tours.forEach(function (id) {
      var t = info.tours[id];
      if (!t) return;
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = t.href;
      a.textContent = t.title;
      var meta = document.createElement('span');
      meta.className = 'hub-intent__meta';
      meta.textContent = t.meta;
      li.appendChild(a);
      li.appendChild(meta);
      list.appendChild(li);
    });
    own.hidden = !answer.ownFile;
  }

  [].slice.call(root.querySelectorAll('.hub-intent__q')).forEach(function (q) {
    var name = q.getAttribute('data-q');
    var chips = [].slice.call(q.querySelectorAll('.hub-ichip'));
    q.setAttribute('role', 'radiogroup');
    chips.forEach(function (b, i) {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.tabIndex = i === 0 ? 0 : -1;
      b.addEventListener('click', function () {
        chips.forEach(function (x) {
          var on = x === b;
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
          x.setAttribute('aria-checked', on ? 'true' : 'false');
          x.tabIndex = on ? 0 : -1;
        });
        picked[name] = b.getAttribute('data-value');
        render();
      });
      b.addEventListener('keydown', function (e) {
        var rtl = document.documentElement.dir === 'rtl';
        var step = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? 1 : e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        var next = chips[(i + step + chips.length) % chips.length];
        next.focus();
        next.click();
      });
    });
  });
  render();
})();
