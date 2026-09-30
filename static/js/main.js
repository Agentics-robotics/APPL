// Rollout tabs (video + pre-rendered skill/prior panels) and BibTeX copy.
(function () {
  const player = document.getElementById('player');
  const tabs = Array.from(document.querySelectorAll('#rollouts .tab'));
  const panels = Array.from(document.querySelectorAll('#task-info [data-task]'));

  function select(task) {
    const panel = panels.find(p => p.dataset.task === task);
    if (!panel) return;
    tabs.forEach(b => b.classList.toggle('active', b.dataset.task === task));
    panels.forEach(p => { p.hidden = p !== panel; });
    if (panel.dataset.ready === 'false') {
      player.removeAttribute('src');
      player.poster = `static/img/${task}.png`;
    } else {
      player.src = `static/videos/${task}.mp4`;
      player.poster = `static/img/posters/${task}.jpg`;
      player.play().catch(() => {});
    }
  }

  tabs.forEach(b => b.addEventListener('click', () => select(b.dataset.task)));

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
