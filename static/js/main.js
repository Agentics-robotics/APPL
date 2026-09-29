// Rollout tabs (video + skill/prior chain from static/data/tasks.json) and BibTeX copy.
(function () {
  const player = document.getElementById('player');
  const info = document.getElementById('task-info');
  const tabs = Array.from(document.querySelectorAll('#rollouts .tab'));
  let tasks = {};

  function render(task) {
    const t = tasks[task];
    if (!t) return;
    const cols = t.skills.map((s, i) =>
      `<div class="iface-skill" style="border-top-color:${s.color}"><p class="iface-name"><span class="dot" style="background:${s.color}"></span>` +
      `<span class="step">${i + 1}</span>${s.label}</p>` +
      s.policies.map(p =>
        `<dl class="iface-policy"><dt>Prior</dt><dd>${p.prior}</dd><dt>Use when</dt><dd class="when">${p.when}</dd></dl>`
      ).join('') + `</div>`
    ).join('');
    info.innerHTML = `<p class="iface-title">The interface: each policy's prior, as the agent reads it</p><div class="iface">${cols}</div>`;
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
