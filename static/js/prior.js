// "What is a prior?" sections: master equation + families, the frame playground, and the training-pipeline explorer.
(function () {
  const tex = (el, src, display) => {
    if (window.katex) {
      try { katex.render(src, el, { displayMode: !!display, throwOnError: false }); return; } catch (e) {}
    }
    el.textContent = src;
  };
  const texAll = root => root.querySelectorAll('[data-tex]').forEach(el => tex(el, el.dataset.tex, el.dataset.display === '1'));
  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------------ 1. master equation + families
  const MASTER = '\\hat{x} \\;=\\; T_{\\color{#c8423f}X}\\; f(o)';
  const MASTER_X = '{\\color{#c8423f}X} \\in \\{\\text{world},\\ \\text{block},\\ \\text{pad},\\ \\text{gripper},\\ \\text{hole},\\ \\dots\\}';
  function families(cat) {
    const box = $('families'), list = $('family-list');
    if (!box) return;
    box.innerHTML = `<div class="master"><span data-tex="${MASTER}" data-display="1"></span><span class="master-x" data-tex="${MASTER_X}"></span></div>` +
      `<p class="legend-tex"><span class="it"><span data-tex="o"></span> observation</span> · <span class="it"><span data-tex="f"></span> network</span> · ` +
      `<span class="it"><span data-tex="\\hat{x}"></span> gripper target</span> · <span class="it"><span data-tex="T_X"></span> pose of <span data-tex="X"></span></span></p>` +
      `<div class="fam-row">` + cat.families.map((f, i) =>
        `<button class="fam${i === 0 ? ' active' : ''}" data-key="${f.key}"><span class="fam-key">${f.key}</span>` +
        `<span class="fam-name">${f.name}</span></button>`
      ).join('') + `</div>`;
    const show = key => {
      const f = cat.families.find(x => x.key === key);
      box.querySelectorAll('.fam').forEach(b => b.classList.toggle('active', b.dataset.key === key));
      list.innerHTML = `<ul>` + f.items.map(([id, name, assumes]) => {
        const used = cat.used[id];
        return `<li class="${used ? 'used' : ''}" title="${assumes.replace(/"/g, '&quot;')}"><span class="pid">${id}</span>${name}` +
          (used ? `<span class="in-appl">${used}</span>` : '') + `</li>`;
      }).join('') + `</ul><p class="fam-note"><span class="dot-used"></span> used by the APPL policies on this page · hover for the assumption</p>`;
    };
    box.addEventListener('click', e => { const b = e.target.closest('.fam'); if (b) show(b.dataset.key); });
    texAll(box);
    show(cat.families[0].key);
  }

  // ------------------------------------------------------------------ 2. playground: five demos, one prior at a time
  const PRIORS = [
    { key: 'world', label: 'World frame', tag: 'DP', x: '\\text{world}' },
    { key: 'block', label: 'Block frame', tag: 'h01', x: '\\text{block}' },
    { key: 'pad', label: 'Pad frame', tag: 'h02', x: '\\text{pad}' },
    { key: 'delta', label: 'Δ gripper', tag: 'h03', x: '\\text{gripper}' },
    { key: 'phase', label: 'Block → pad', tag: 'h04', x: '\\text{block} \\to \\text{pad}' },
  ];
  const PG_EQ = '\\hat{x}(t) = T_{\\color{#c8423f}X}\\,\\bar{x}(t)';
  const N = 5, S = 64, TG = 0.46;                     // demos, samples per path, grasp time
  const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) - 0.5; };
  const home = { s: [140, 360], b: [410, 150], p: [700, 320] };
  const spread = 34;
  const demos = [...Array(N)].map((_, i) => ({
    s: [home.s[0] + spread * rnd(i, 1), home.s[1] + spread * rnd(i, 2)],
    b: [home.b[0] + spread * rnd(i, 3), home.b[1] + spread * rnd(i, 4)],
    p: [home.p[0] + spread * rnd(i, 5), home.p[1] + spread * rnd(i, 6)],
  }));
  const bez = (a, c1, c2, b, u) => [0, 1].map(k => (1 - u) ** 3 * a[k] + 3 * (1 - u) ** 2 * u * c1[k] + 3 * (1 - u) * u * u * c2[k] + u ** 3 * b[k]);
  function path(d) {          // start -> block (approach from above-left) -> dwell -> arc -> pad
    const pts = [];
    for (let j = 0; j < S; j++) {
      const t = j / (S - 1);
      if (t < TG) {
        const u = t / TG;
        pts.push(bez(d.s, [d.s[0] + 40, d.s[1] - 170], [d.b[0] - 120, d.b[1] - 40], d.b, u));
      } else if (t < TG + 0.06) {
        pts.push(d.b.slice());
      } else {
        const u = (t - TG - 0.06) / (1 - TG - 0.06);
        pts.push(bez(d.b, [d.b[0] + 60, d.b[1] - 110], [d.p[0] - 40, d.p[1] - 160], d.p, u));
      }
    }
    return pts;
  }
  demos.forEach(d => { d.x = path(d); });
  const meanRel = key => [...Array(S)].map((_, j) => [0, 1].map(k =>
    demos.reduce((acc, d) => acc + d.x[j][k] - (key === 'world' ? 0 : d[key === 'block' ? 'b' : key === 'pad' ? 'p' : 's'][k]), 0) / N));
  const REL = { world: meanRel('world'), block: meanRel('block'), pad: meanRel('pad'), delta: meanRel('delta') };
  const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  function policy(key, sc) {
    const out = [];
    for (let j = 0; j < S; j++) {
      const t = j / (S - 1);
      const at = (k2, anchor) => [0, 1].map(k => REL[k2][j][k] + (anchor ? anchor[k] : 0));
      if (key === 'world') out.push(at('world'));
      if (key === 'block') out.push(at('block', sc.b));
      if (key === 'pad') out.push(at('pad', sc.p));
      if (key === 'delta') out.push(at('delta', sc.s));
      if (key === 'phase') {
        const w = smooth((t - TG - 0.06) / 0.3);
        const a = at('block', sc.b), c = at('pad', sc.p);
        out.push([0, 1].map(k => (1 - w) * a[k] + w * c[k]));
      }
    }
    return out;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function playground() {
    const svg = $('pg'), tabs = $('pg-tabs'), status = $('pg-status');
    if (!svg) return;
    const sc = { s: [home.s[0] - 8, home.s[1] + 4], b: [home.b[0] + 26, home.b[1] - 78], p: [home.p[0] + 92, home.p[1] + 30] };
    let cur = 'phase';
    tabs.innerHTML = PRIORS.map(p => `<button class="tab${p.key === cur ? ' active' : ''}" data-key="${p.key}">${p.label}<span class="tag">${p.tag}</span></button>`).join('');
    const ns = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent) => { const e = document.createElementNS(ns, name); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; };
    const pathD = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    // static layer: table, training areas, demos
    el('rect', { x: 8, y: 8, width: 884, height: 454, rx: 18, fill: '#fbfbfd', stroke: '#e5e5ea' });
    const zone = (c, color) => el('rect', { x: c[0] - spread / 2 - 22, y: c[1] - spread / 2 - 22, width: spread + 44, height: spread + 44, rx: 12,
      fill: 'none', stroke: color, 'stroke-dasharray': '5 5', 'stroke-width': 1.4, opacity: 0.8 });
    zone(home.s, '#8e8e93'); zone(home.b, '#c8423f'); zone(home.p, '#2e9e5b');
    demos.forEach(d => el('path', { d: pathD(d.x), fill: 'none', stroke: '#c7c7cc', 'stroke-width': 1.6 }));
    const frameG = el('g', {});
    const pol = el('path', { fill: 'none', stroke: '#0066cc', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const lead = el('path', { fill: 'none', stroke: '#0066cc', 'stroke-width': 2, 'stroke-dasharray': '4 5', opacity: 0.7 });
    const pad = el('rect', { width: 64, height: 64, rx: 8, fill: 'rgba(46,158,91,0.14)', stroke: '#2e9e5b', 'stroke-width': 2.5, class: 'drag' });
    const block = el('rect', { width: 34, height: 34, rx: 5, fill: '#e5484d', class: 'drag' });
    const grip = el('g', { class: 'drag' });
    el('circle', { r: 15, fill: '#1d1d1f' }, grip);
    el('path', { d: 'M -7 -4 L -7 7 M 7 -4 L 7 7', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }, grip);
    const pickMark = el('g', {}), placeMark = el('g', {});
    const dot = el('circle', { r: 7, fill: '#0066cc', stroke: '#fff', 'stroke-width': 2.5 });
    const mark = (g, p, ok) => {
      g.innerHTML = '';
      el('circle', { cx: p[0], cy: p[1], r: 13, fill: ok ? '#2e9e5b' : '#c8423f' }, g);
      el('path', { d: ok ? `M ${p[0] - 6} ${p[1]} l 4 4.5 l 8 -9` : `M ${p[0] - 5} ${p[1] - 5} l 10 10 M ${p[0] + 5} ${p[1] - 5} l -10 10`,
        stroke: '#fff', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    };
    const axes = (g, o, strong) => {
      const L = strong ? 46 : 30, sw = strong ? 3 : 2;
      el('line', { x1: o[0], y1: o[1], x2: o[0] + L, y2: o[1], stroke: '#e5484d', 'stroke-width': sw, 'stroke-linecap': 'round' }, g);
      el('line', { x1: o[0], y1: o[1], x2: o[0], y2: o[1] - L, stroke: '#30a46c', 'stroke-width': sw, 'stroke-linecap': 'round' }, g);
      el('circle', { cx: o[0], cy: o[1], r: strong ? 5 : 3.5, fill: '#1d1d1f' }, g);
    };
    let t0 = performance.now();
    function draw() {
      const x = policy(cur, sc);
      pol.setAttribute('d', pathD(x));
      lead.setAttribute('d', pathD([sc.s, x[0]]));
      pad.setAttribute('x', sc.p[0] - 32); pad.setAttribute('y', sc.p[1] - 32);
      block.setAttribute('x', sc.b[0] - 17); block.setAttribute('y', sc.b[1] - 17);
      grip.setAttribute('transform', `translate(${sc.s[0]},${sc.s[1]})`);
      const g = x[Math.round(TG * (S - 1)) + 1], end = x[S - 1];
      const okPick = dist(g, sc.b) < 20, okPlace = okPick && dist(end, sc.p) < 26;
      mark(pickMark, [g[0] + 26, g[1] - 26], okPick);
      mark(placeMark, [end[0] + 30, end[1] - 30], okPlace);
      frameG.innerHTML = '';
      const origin = { world: [40, 430], block: sc.b, pad: sc.p, delta: sc.s, phase: null }[cur];
      if (origin) axes(frameG, origin, true);
      else { axes(frameG, sc.b, true); axes(frameG, sc.p, true); }
      const p = PRIORS.find(q => q.key === cur);
      status.innerHTML = `<span class="pg-eq" data-tex="${PG_EQ}"></span>` +
        `<span class="pg-eq" data-tex="{\\color{#c8423f}X} = ${p.x}"></span>` +
        `<span class="pg-res"><span class="${okPick ? 'ok' : 'no'}">${okPick ? '✓' : '✗'}</span> pick ` +
        `<span class="${okPlace ? 'ok' : 'no'}">${okPlace ? '✓' : '✗'}</span> place</span>` +
        `<span class="pg-def"><span data-tex="\\bar{x}"></span> the demos, averaged in <span data-tex="X"></span>'s frame</span>`;
      texAll(status);
      svg._x = x;
    }
    function anim(now) {
      const x = svg._x;
      if (x) {
        const u = ((now - t0) / 3200) % 1.15;
        const j = Math.min(S - 1, Math.floor(Math.min(u, 1) * (S - 1)));
        dot.setAttribute('cx', x[j][0]); dot.setAttribute('cy', x[j][1]);
      }
      requestAnimationFrame(anim);
    }
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      cur = b.dataset.key;
      tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
      t0 = performance.now(); draw();
    });
    // dragging (pointer events: mouse and touch)
    let drag = null;
    const toSvg = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * 900 / r.width, (e.clientY - r.top) * 470 / r.height]; };
    const pick = [[block, 'b'], [pad, 'p'], [grip, 's']];
    pick.forEach(([node, key]) => node.addEventListener('pointerdown', e => { drag = key; svg.setPointerCapture(e.pointerId); e.preventDefault(); }));
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const q = toSvg(e);
      sc[drag] = [Math.max(40, Math.min(860, q[0])), Math.max(40, Math.min(430, q[1]))];
      draw();
    });
    const stop = () => { drag = null; };
    svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop);
    draw(); requestAnimationFrame(anim);
  }

  // ------------------------------------------------------------------ 3. pipeline: where each real prior acts
  const STAGES = [
    ['seg', 'split demos'],
    ['enc', 'observe <i>o</i>'],
    ['tgt', 'targets in <i>X</i>'],
    ['net', 'train <i>f</i>'],
    ['dec', 'decode <i>x̂</i>'],
    ['ik', 'IK → robot'],
    ['ifc', 'interface'],
  ];
  const EXAMPLES = [
    { label: 'Goal-pad frame', pid: 'red_transfer__h02', on: ['tgt', 'dec', 'ifc'],
      eq: ['\\hat{x} = p_{\\text{pad}} + f(o)'],
      iface: 'TCP position as an offset from the observed red goal',
      code: 'rows.append(target[:3, 3] - goal)              # encode_targets\ntarget = pose_matrix(goal + represented[:3], R)   # decode_action' },
    { label: 'Δ gripper', pid: 'place_blue__h03', on: ['tgt', 'dec', 'ifc'],
      eq: ['\\hat{x} = T_{\\text{gripper}}(t)\\; f(o)'],
      iface: 'local TCP transforms, decoded against the freshly measured TCP',
      code: 'relative = relative_pose(current, target)   # encode_targets\ntarget = current @ relative                 # decode_action' },
    { label: 'Object first', pid: 'align_and_insert_peg__h04', on: ['tgt', 'dec', 'ifc'],
      eq: ['\\hat{T}_{\\text{peg}} = T_{\\text{hole}}\\; f(o)', '\\hat{x} = \\hat{T}_{\\text{peg}}\\cdot \\text{grasp}'],
      iface: 'desired peg pose in the hole frame, converted through the observed grasp',
      code: 'desired_peg = hole @ relative_peg\npeg_to_tcp = relative_pose(peg, tcp)\nworld_tcp_target = desired_peg @ peg_to_tcp   # decode_action' },
    { label: 'Straight line', pid: 'blue_insert__h04', on: ['tgt', 'dec', 'ifc'],
      eq: ['\\hat{x} = p_{\\text{blue}} + \\alpha\\,(p_{\\text{slot}} - p_{\\text{blue}}) + r', '(\\alpha, r) = f(o)'],
      iface: 'progress along the source-to-destination segment plus a residual',
      code: 'progress, residual = _progress_and_residual(target, source, destination)   # encode_targets' },
    { label: 'Phase head', pid: 'open_drawer__h03', on: ['seg', 'net', 'ifc'],
      eq: ['L = L_{\\text{BC}} + 0.05\\, L_{\\text{phase}}'],
      iface: 'masked five-phase auxiliary supervision',
      code: 'phase_loss = cross_entropy(model.phase_logits(inputs), labels)\nloss = diffusion_loss + 0.05 * phase_loss   # compute_loss' },
    { label: 'Particle set', pid: 'controlled_pour_and_right__h04', on: ['enc', 'net', 'dec', 'ifc'],
      eq: ['f\\big(o,\\ \\{p_1, \\dots, p_{12}\\}\\big)', '\\hat{T}_{\\text{cup}} = T_{\\text{bowl}}\\; f(\\cdot)'],
      iface: 'permutation-invariant particle encoder; cup pose in the bowl frame',
      code: 'token = self.particle_encoder(particles)\nparticle_embedding = cat([token.mean(dim=2), token.max(dim=2).values])   # policy.py' },
  ];
  function pipeline() {
    const tabs = $('pl-tabs'), stages = $('pl-stages'), detail = $('pl-detail');
    if (!tabs) return;
    tabs.innerHTML = EXAMPLES.map((x, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-i="${i}">${x.label}</button>`).join('');
    stages.innerHTML = STAGES.map(([k, w]) => `<li data-k="${k}"><span class="st-word">${w}</span></li>`).join('');
    const show = i => {
      const x = EXAMPLES[i];
      tabs.querySelectorAll('.tab').forEach((b, j) => b.classList.toggle('active', j === i));
      stages.querySelectorAll('li').forEach(li => li.classList.toggle('on', x.on.includes(li.dataset.k)));
      detail.innerHTML = `<div class="pl-eqs">${x.eq.map(e => `<span data-tex="${e}" data-display="1"></span>`).join('')}</div>` +
        `<p class="pl-iface">interface · “${x.iface}”</p>` +
        `<details class="pl-code"><summary>${x.pid}</summary><pre><code>${x.code}</code></pre></details>`;
      texAll(detail);
    };
    tabs.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) show(+b.dataset.i); });
    show(0);
  }

  function start() {
    fetch('static/data/prior_catalog.json').then(r => r.json()).then(families).catch(() => {});
    playground();
    pipeline();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('load', () => document.querySelectorAll('[data-tex]').forEach(el => {
    if (!el.querySelector('.katex')) tex(el, el.dataset.tex, el.dataset.display === '1');
  }));
})();
