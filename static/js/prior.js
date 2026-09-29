// "What is a prior?" One prior at a time.
//   Train: five demos, redrawn in the prior's frame, collapse into one motion ("Without": averaged as they are).
//   Test: drag the scene; the learned motion is re-attached to it and played.
(function () {
  const $ = id => document.getElementById(id);
  const W = 460, H = 340, S = 72, N = 5;
  const C = { ink: '#1d1d1f', demo: '#b8b8be', blue: '#0066cc', red: '#e5484d', green: '#30a46c', amber: '#d97706',
    orange: '#f97316', violet: '#8e4ec6', slate: '#3e63dd', steel: '#b9bec7', ok: '#2e9e5b', bad: '#c8423f' };

  // ---------------------------------------------------------------- planar poses {x, y, th} in SVG axes (y down)
  const P = (x, y, th = 0) => ({ x, y, th });
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const mul = (A, B) => P(A.x + Math.cos(A.th) * B.x - Math.sin(A.th) * B.y, A.y + Math.sin(A.th) * B.x + Math.cos(A.th) * B.y, A.th + B.th);
  const inv = A => P(-Math.cos(A.th) * A.x - Math.sin(A.th) * A.y, Math.sin(A.th) * A.x - Math.cos(A.th) * A.y, -A.th);
  const lerp = (A, B, u) => P(A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u, A.th + wrap(B.th - A.th) * u);
  const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);
  const meanPose = ps => P(ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.y, 0) / ps.length,
    Math.atan2(ps.reduce((a, p) => a + Math.sin(p.th), 0), ps.reduce((a, p) => a + Math.cos(p.th), 0)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) - 0.5; };

  // n poses on a cubic that leaves A along its heading and arrives at B along B's heading
  function seg(A, B, n) {
    const d = dist(A, B) * 0.38;
    const c1 = [A.x + d * Math.cos(A.th), A.y + d * Math.sin(A.th)], c2 = [B.x - d * Math.cos(B.th), B.y - d * Math.sin(B.th)];
    return [...Array(n)].map((_, j) => {
      const u = j / (n - 1), v = 1 - u;
      return P(v * v * v * A.x + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * B.x,
        v * v * v * A.y + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * B.y, A.th + wrap(B.th - A.th) * smooth(u));
    });
  }
  const line = (A, B, n) => [...Array(n)].map((_, j) => lerp(A, B, (j + 1) / n));
  // the robot starts where it is: a learned path is pulled onto the current start, fading out by mid-way
  const blend = (ps, s0) => ps.map((p, j) => {
    const k = 1 - smooth(j / (S - 1) / 0.5);
    return P(p.x + (s0.x - ps[0].x) * k, p.y + (s0.y - ps[0].y) * k, p.th + wrap(s0.th - ps[0].th) * k);
  });

  // ---------------------------------------------------------------- SVG pieces (strings)
  const f = v => v.toFixed(1);
  const tf = p => `transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.th * 57.29578)})"`;
  const pathD = ps => ps.map((p, i) => (i ? 'L' : 'M') + f(p.x) + ' ' + f(p.y)).join('');
  const stroke = (ps, col, w, extra = '') =>
    `<path d="${pathD(ps)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const seg2 = (a, b, col, w, extra = '') =>
    `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
  const axes = (p, L, a = 1, w = 2.2) =>
    `<g opacity="${f(a)}">${seg2(p, mul(p, P(L, 0)), C.red, w)}${seg2(p, mul(p, P(0, -L)), C.green, w)}<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(w + 1.6)}" fill="${C.ink}"/></g>`;
  const longAxes = (p, a) => `<g opacity="${f(a)}">${seg2(mul(p, P(-900, 0)), mul(p, P(900, 0)), C.red, 1.4)}` +
    `${seg2(mul(p, P(0, -900)), mul(p, P(0, 900)), C.green, 1.4)}</g>`;
  const drag = (key, body) => `<g class="drag" data-drag="${key}">${body}</g>`;
  function gripper(p, open, a = 1) {            // two fingers opening toward +x, TCP between the fingertips
    return `<g ${tf(p)} opacity="${f(a)}"><circle cx="-33" r="6.5" fill="${C.ink}"/>` +
      `<rect x="-28" y="${f(-open - 5)}" width="9" height="${f(2 * open + 10)}" rx="3" fill="${C.ink}"/>` +
      `<rect x="-21" y="${f(-open - 5)}" width="27" height="5" rx="2.5" fill="${C.ink}"/>` +
      `<rect x="-21" y="${f(open)}" width="27" height="5" rx="2.5" fill="${C.ink}"/></g>`;
  }
  const block = (p, a = 1, col = C.red, h = 17) => `<g ${tf(p)} opacity="${f(a)}"><rect x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}" rx="5" fill="${col}"/></g>`;
  const peg = (p, a = 1) => `<g ${tf(p)} opacity="${f(a)}"><rect x="-24" y="-6" width="48" height="12" rx="3" fill="${C.orange}"/></g>`;
  const hole = (p, a = 1) => `<g ${tf(p)} opacity="${f(a)}"><path d="M-32 -32H32V32H-32ZM-32 -8H6V8H-32Z" fill="${C.steel}" fill-rule="evenodd"/>` +
    `<rect x="-32" y="-8" width="38" height="16" fill="#e4e6ea"/></g>`;
  const cabinet = (p, q, a = 1) => `<g ${tf(p)} opacity="${f(a)}"><rect x="-88" y="-52" width="88" height="104" rx="6" fill="#e6d8bf"/>` +
    `<rect x="${f(-82 + q)}" y="-44" width="86" height="88" rx="4" fill="#f7f0e3" stroke="#d3c3a4" stroke-width="1.5"/>` +
    `<rect x="${f(4 + q)}" y="-2.5" width="6" height="5" fill="${C.ink}"/><circle cx="${f(11 + q)}" cy="0" r="5.5" fill="${C.ink}"/></g>`;
  const knob = p => drag('rot', `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="16" fill="transparent"/>` +
    `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="7" fill="#fff" stroke="#8e8e93" stroke-width="2"/>`);
  function chain(ps, col, w) {                  // delta moves: one arrow per chunk step
    let s = '';
    for (let j = 0; j < S - 1; j += 8) {
      const a = ps[j], b = ps[Math.min(j + 8, S - 1)], tip = P(b.x, b.y, Math.atan2(b.y - a.y, b.x - a.x));
      const l = mul(tip, P(-9, -5.5)), r = mul(tip, P(-9, 5.5));
      s += seg2(a, b, col, w) + `<path d="M${f(l.x)} ${f(l.y)}L${f(b.x)} ${f(b.y)}L${f(r.x)} ${f(r.y)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return s;
  }
  const badge = (p, ok, a = 1) => `<g transform="translate(${f(p.x)} ${f(p.y)})" opacity="${f(a)}"><circle r="14" fill="${ok ? C.ok : C.bad}"/>` +
    `<path d="${ok ? 'M-6 0l4 4.5l8-9' : 'M-5-5l10 10M5-5l-10 10'}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const hint = (p, time) => { const k = (time / 1400) % 1; return `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(24 + 26 * k)}" fill="none" stroke="${C.blue}" stroke-width="2" opacity="${f(0.55 * (1 - k))}"/>`; };
  const WORLD = P(26, H - 26, 0);

  // ---------------------------------------------------------------- the four priors
  const DELTA = seg(P(0, 0, 0), P(172, -66, -0.55), S);
  const SCENES = [
    { key: 'block', label: 'Object frame', what: 'the block', from: 'seen from the block', obj: 'block',
      icon: '<rect x="4" y="5" width="11" height="11" rx="2" fill="#e5484d"/><path d="M9.5 10.5H18M9.5 10.5V2" stroke="#1d1d1f" stroke-width="1.6" stroke-linecap="round"/>',
      demo: i => ({ grip: P(80 + 24 * rnd(i, 1), 272 + 16 * rnd(i, 2), -0.85 + 0.3 * rnd(i, 3)),
        block: P(262 + 120 * rnd(i, 4), 124 + 80 * rnd(i, 5), 1.2 * rnd(i, 6)) }),
      test: { grip: P(76, 276, -0.85), block: P(370, 236, 0.95) },
      anchor: c => c.block, start: c => c.grip, knob: P(62, 0),
      truth: c => { const pre = mul(c.block, P(-80, 0)); return [...seg(c.grip, pre, 50), ...line(pre, c.block, 22)]; },
      ok: (c, pr) => dist(pr.g[S - 1], c.block) < 9 && Math.abs(wrap(pr.g[S - 1].th - c.block.th)) < 0.3,
      mark: c => P(c.block.x + 30, c.block.y - 34),
      demoObjects: (c, T, a) => block(mul(T, c.block), a),
      testObjects: c => drag('move', block(c.block)),
      grip: (pr, j, done, ok) => gripper(pr.g[j], done ? (ok ? 17 : 7) : 23) },
    { key: 'delta', label: 'Δ gripper', what: 'the gripper', from: 'seen from the gripper', obj: 'grip', chain: true,
      icon: '<circle cx="3.5" cy="15" r="2.5" fill="#1d1d1f"/><path d="M5.5 13.5l4-3.5M10.5 9.5l4-2.5M14.5 7l3.5-4" stroke="#d97706" stroke-width="2" stroke-linecap="round"/>',
      demo: i => ({ grip: P(110 + 70 * rnd(i, 1), 232 + 90 * rnd(i, 2), -0.1 + 1.0 * rnd(i, 3)) }),
      test: { grip: P(240, 132, 0.9) },
      anchor: c => c.grip, start: c => c.grip, knob: P(-62, 0),
      truth: c => DELTA.map(p => mul(c.grip, p)),
      ok: (c, pr) => dist(pr.g[S - 1], mul(c.grip, DELTA[S - 1])) < 14,
      mark: c => { const e = mul(c.grip, DELTA[S - 1]); return P(e.x + 30, e.y - 30); },
      demoObjects: () => '',
      testObjects: c => drag('move', `<circle cx="${f(c.grip.x)}" cy="${f(c.grip.y)}" r="30" fill="transparent"/>` + block(c.grip, 0.25, C.slate, 11) + gripper(c.grip, 11, 0.25)),
      grip: (pr, j) => block(pr.g[j], 1, C.slate, 11) + gripper(pr.g[j], 11) },
    { key: 'peg', label: 'Object first', what: 'the hole', from: 'peg, seen from the hole', obj: 'hole', objectFirst: true,
      icon: '<path d="M11 3h8v14h-8zM11 8h6v4h-6z" fill="#b9bec7" fill-rule="evenodd"/><rect x="1" y="8.5" width="12" height="3" rx="1" fill="#f97316"/>',
      demo: i => ({ peg: P(96 + 20 * rnd(i, 1), 262 + 22 * rnd(i, 2), -0.45 + 0.3 * rnd(i, 3)), s: 32 * rnd(i, 4),
        hole: P(318 + 80 * rnd(i, 5), 154 + 90 * rnd(i, 6), 0.7 * rnd(i, 7)) }),
      test: { peg: P(94, 266, -0.45), s: 13, hole: P(376, 98, -0.6) },
      anchor: c => c.hole, start: c => c.peg, grasp: c => P(c.s, 0), knob: P(0, 52),
      truth: c => { const pre = mul(c.hole, P(-96, 0)); return [...seg(c.peg, pre, 50), ...line(pre, mul(c.hole, P(-20, 0)), 22)]; },
      ok: (c, pr) => { const e = pr.r[S - 1], g = mul(c.hole, P(-20, 0)); return dist(e, g) < 7 && Math.abs(wrap(e.th - g.th)) < 0.2; },
      mark: c => P(c.hole.x + 38, c.hole.y - 40),
      demoObjects: (c, T, a) => hole(mul(T, c.hole), a),
      testObjects: c => drag('move', hole(c.hole)),
      grip: (pr, j) => peg(pr.r[j]) + gripper(pr.g[j], 6),
      atStart: c => { const g = mul(c.peg, P(c.s, 0));
        return drag('slide', `<circle cx="${f(g.x)}" cy="${f(g.y)}" r="26" fill="transparent"/>` + peg(c.peg) + gripper(g, 6)); } },
    { key: 'drawer', label: 'Straight line', what: 'the drawer', from: 'seen along the drawer', obj: 'cab', rail: true,
      icon: '<rect x="2" y="5" width="9" height="10" rx="1.5" fill="#e6d8bf"/><path d="M1 10h18" stroke="#8e4ec6" stroke-width="1.8" stroke-dasharray="3 2"/><circle cx="14" cy="10" r="2.2" fill="#1d1d1f"/>',
      demo: i => ({ grip: P(404 + 16 * rnd(i, 1), 294 + 12 * rnd(i, 2), -2.5 + 0.3 * rnd(i, 3)),
        cab: P(214 + 80 * rnd(i, 4), 150 + 60 * rnd(i, 5), 0.2 + 0.9 * rnd(i, 6)) }),
      test: { grip: P(404, 296, -2.5), cab: P(128, 128, 1.0) },
      anchor: c => c.cab, start: c => c.grip, knob: P(-106, 0),
      truth: c => { const pre = mul(c.cab, P(64, 0, Math.PI)), k = mul(c.cab, P(11, 0, Math.PI));
        return [...seg(c.grip, pre, 36), ...line(pre, k, 14), ...line(k, mul(c.cab, P(101, 0, Math.PI)), 22)]; },
      ok: (c, pr) => dist(pr.g[49], mul(c.cab, P(11, 0))) < 10 && dist(pr.g[S - 1], mul(c.cab, P(101, 0))) < 16,
      mark: c => { const e = mul(c.cab, P(128, 0)); return P(e.x + 22, e.y - 26); },
      demoObjects: (c, T, a) => cabinet(mul(T, c.cab), 0, a),
      testObjects: (c, q) => drag('move', cabinet(c.cab, q)),
      grip: (pr, j, done, ok) => gripper(pr.g[j], j >= 49 && ok ? 5.5 : 12) },
  ];

  // ---------------------------------------------------------------- learning: the same five demos, with and without the prior
  function learn(sc) {
    const demos = [...Array(N)].map((_, i) => {
      const c = sc.demo(i), r = sc.truth(c), G = sc.grasp ? sc.grasp(c) : P(0, 0);
      return { c, r, g: r.map(p => mul(p, G)) };
    });
    const A = demos.map(d => sc.anchor(d.c));
    return { demos, A, D: meanPose(A),
      local: [...Array(S)].map((_, j) => meanPose(demos.map((d, i) => mul(inv(A[i]), d.r[j])))),
      world: [...Array(S)].map((_, j) => meanPose(demos.map(d => d.g[j]))) };
  }
  function predict(sc, L, c, on) {
    const G = sc.grasp ? sc.grasp(c) : P(0, 0);
    if (on) {
      const r = blend(L.local.map(p => mul(sc.anchor(c), p)), sc.start(c));
      return { r, g: r.map(p => mul(p, G)) };
    }
    const g = blend(L.world, mul(sc.start(c), G));
    return { r: g.map(p => mul(p, inv(G))), g };
  }

  function start() {
    const tabs = $('pr-tabs'), mode = $('pr-mode'), train = $('pr-train'), test = $('pr-test');
    if (!tabs) return;
    const trainCap = $('pr-train-cap'), testCap = $('pr-test-cap');
    const models = {}, ctx = {};
    SCENES.forEach(sc => { models[sc.key] = learn(sc); ctx[sc.key] = JSON.parse(JSON.stringify(sc.test)); });
    let sc = SCENES[0], on = true, t0 = performance.now(), dragging = null, grab = null, touched = false, visible = true;
    tabs.innerHTML = SCENES.map((s, i) => `<button class="tab${i ? '' : ' active'}" data-key="${s.key}" role="tab">` +
      `<svg viewBox="0 0 20 20" aria-hidden="true">${s.icon}</svg>${s.label}</button>`).join('');
    const restart = () => { t0 = performance.now(); };
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      sc = SCENES.find(s => s.key === b.dataset.key);
      tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
      restart();
    });
    mode.addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      on = b.dataset.on === '1';
      mode.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
      restart();
    });

    // ------------------------------------------------ train panel: demos slide into the prior's frame and merge
    function drawTrain(now) {
      const L = models[sc.key], t = ((now - t0) / 1000) % 7.4;
      const u = on ? smooth((t - 1.1) / 1.7) * (1 - smooth((t - 6.4) / 0.9)) : 0;
      const k = on ? smooth((t - 2.9) / 0.6) * (1 - smooth((t - 6.1) / 0.4)) : smooth((t - 1.4) / 0.6) * (1 - smooth((t - 6.1) / 0.4));
      trainCap.textContent = t < 1.1 || t > 6.6 ? `${N} demos` : on ? (t < 2.9 ? sc.from : 'one motion to learn') : (t < 1.4 ? `${N} demos` : 'one blurry average');
      let s = on ? '' : axes(WORLD, 34);
      L.demos.forEach((d, i) => {
        const T = mul(lerp(L.A[i], L.D, u), inv(L.A[i]));
        const path = (on ? d.r : d.g).map(p => mul(T, p));
        s += sc.demoObjects(d.c, T, 0.45);
        if (on && sc.rail) s += seg2(mul(T, mul(d.c.cab, P(-900, 0))), mul(T, mul(d.c.cab, P(900, 0))), C.violet, 1.3, 'stroke-dasharray="5 6" opacity=".55"');
        s += stroke(path, on && sc.objectFirst ? '#fdba74' : C.demo, 1.6);
        const fade = sc.chain ? 0.4 : 0.4 * (1 - u);   // start poses scatter in the prior's frame; only delta keeps them (they are its anchor)
        if (sc.objectFirst) s += peg(on ? path[0] : mul(T, d.r[0]), fade) + (on ? '' : gripper(path[0], 6, fade));
        else s += (sc.chain ? block(path[0], fade, C.slate, 11) : '') + gripper(path[0], sc.chain ? 11 : 23, fade);
        if (on) s += axes(lerp(L.A[i], L.D, u), 34, 0.9, 2);
      });
      if (k > 0.01) {
        const learned = on ? L.local.map(p => mul(L.D, p)) : L.world;
        const col = on && sc.objectFirst ? C.orange : on && sc.chain ? C.amber : C.blue;
        s += `<g opacity="${f(k)}">` + (on && sc.chain ? chain(learned, col, 3.2) : stroke(learned, col, 4)) + `</g>`;
      }
      train.innerHTML = s;
    }

    // ------------------------------------------------ test panel: drag the scene, the learned motion follows
    function drawTest(now) {
      const L = models[sc.key], c = ctx[sc.key], pr = predict(sc, L, c, on), ok = sc.ok(c, pr);
      const ghost = on && sc.objectFirst ? 1.5 : 0, move = 2.8, cyc = 0.6 + ghost + move + 1.6;
      const t = dragging ? 0 : ((now - t0) / 1000) % cyc;
      const gu = ghost ? smooth((t - 0.6) / ghost) : 1, ru = clamp((t - 0.6 - ghost) / move, 0, 1);
      const j = Math.round(smooth(ru) * (S - 1)), done = ru >= 1;
      testCap.textContent = `drag ${sc.what}`;
      const A = sc.anchor(c);
      let s = on ? '' : axes(WORLD, 34);
      if (on && sc.rail) s += seg2(mul(A, P(-900, 0)), mul(A, P(900, 0)), C.violet, 2, 'stroke-dasharray="7 7"');
      else if (on) s += longAxes(A, 0.28);
      const q = sc.rail && ok && j > 49 ? clamp(mul(inv(c.cab), pr.g[j]).x - 11, 0, 90) : 0;
      s += sc.testObjects(c, q) + knob(mul(A, sc.knob));
      if (on) s += axes(A, 44, 1, 2.6);
      // what the policy predicts; with "object first" the peg's path is shown before the robot moves
      if (on && sc.objectFirst) {
        const jg = Math.round(gu * (S - 1));
        s += stroke(pr.r, C.orange, 2, 'stroke-dasharray="3 6" opacity=".7"') + stroke(pr.r.slice(0, jg + 1), C.orange, 3.5);
        if (ru <= 0 && t > 0.6) s += peg(pr.r[jg], 0.45);
      }
      s += on && sc.chain ? chain(pr.g, C.amber, 3) : stroke(pr.g, C.blue, on && sc.objectFirst ? 2.4 : 3.2, 'opacity=".9"');
      if (on && sc.rail && j > 49) { const b = mul(A, P(mul(inv(A), pr.g[j]).x, 0)); s += `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="7" fill="${C.violet}"/>`; }
      // the robot
      s += ru <= 0 && sc.atStart ? sc.atStart(c) : sc.grip(pr, j, done, ok);
      if (done || dragging) s += badge(sc.mark(c), ok, dragging ? 1 : smooth((t - 0.6 - ghost - move) / 0.25));
      if (!touched) s += hint(c[sc.obj], now);
      test.innerHTML = s;
      test.dataset.ok = ok ? '1' : '0';
    }

    function frame(now) {
      if (visible) { drawTrain(now); drawTest(now); }
      requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe($('prior'));

    // ------------------------------------------------ dragging (mouse and touch)
    const toSvg = e => { const r = test.getBoundingClientRect(); return P((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height); };
    test.addEventListener('pointerdown', e => {
      const el = e.target.closest('[data-drag]'); if (!el) return;
      const o = ctx[sc.key][sc.obj], p = toSvg(e);
      dragging = el.dataset.drag; touched = true;
      grab = { dx: o.x - p.x, dy: o.y - p.y, th0: o.th, a0: Math.atan2(p.y - o.y, p.x - o.x) };
      test.setPointerCapture(e.pointerId); e.preventDefault();
    });
    test.addEventListener('pointermove', e => {
      if (!dragging) return;
      const c = ctx[sc.key], o = c[sc.obj], p = toSvg(e);
      if (dragging === 'move') { o.x = clamp(p.x + grab.dx, 30, W - 30); o.y = clamp(p.y + grab.dy, 30, H - 30); }
      if (dragging === 'rot') o.th = grab.th0 + wrap(Math.atan2(p.y - o.y, p.x - o.x) - grab.a0);
      if (dragging === 'slide') c.s = clamp(mul(inv(c.peg), p).x, -18, 18);
    });
    const stop = () => { if (dragging) { dragging = null; restart(); } };
    test.addEventListener('pointerup', stop); test.addEventListener('pointercancel', stop);
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
