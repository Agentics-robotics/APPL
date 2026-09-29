// Rollout tabs (video + skill/prior chain from static/data/tasks.json) and BibTeX copy.
(function () {
  const player = document.getElementById('player');
  const info = document.getElementById('task-info');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  let tasks = {};

  function render(task) {
    const t = tasks[task];
    if (!t) return;
    const chain = t.skills.map((s, i) =>
      `<span class="step"><span class="dot" style="background:${s.color}">${i + 1}</span>` +
      `<b>${s.label}</b><i>${s.priors.join(' → ')}</i></span>`
    ).join('<span class="arrow">→</span>');
    info.innerHTML = `<p class="desc">${t.description}</p>${chain}`;
  }

  function select(task) {
    tabs.forEach(b => b.classList.toggle('active', b.dataset.task === task));
    const t = tasks[task];
    if (t && t.ready === false) {
      player.removeAttribute('src');
      player.poster = `static/img/${task}.png`;
    } else {
      player.src = `static/videos/${task}.mp4`;
      player.poster = `static/img/posters/${task}.jpg`;
      player.play().catch(() => {});
    }
    render(task);
  }

  tabs.forEach(b => b.addEventListener('click', () => select(b.dataset.task)));
  fetch('static/data/tasks.json')
    .then(r => r.json())
    .then(list => { list.forEach(t => { tasks[t.task] = t; }); render('drawer_exchange'); })
    .catch(() => {});

  const copy = document.querySelector('.copy');
  if (copy) {
    copy.addEventListener('click', () => {
      const text = document.getElementById('bibtex-code').textContent;
      navigator.clipboard.writeText(text).then(() => {
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
      }).catch(() => {});
    });
  }
})();
