/* Home-screen swinging brush. Reuses the game's own paint engine (drawSeg / drawDrip / shade / pal from game.js)
   so the home stroke matches in-game strokes: pressure width, start taper, wobbly edges, bristle streaks, highlight, drips, flecks. */
(() => {
  const box = document.querySelector('.hb-swing'), start = document.getElementById('start');
  const IP = window.InkPaint; if (!box || !IP) return;
  const { drawSeg, drawDrip, shade, hexRgb, pal } = IP;
  const cv = document.createElement('canvas'); cv.className = 'hb-brush'; box.appendChild(cv);
  const g = cv.getContext('2d'), paintC = document.createElement('canvas'), pg = paintC.getContext('2d');
  const HW = document.body.classList.contains('hw');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, t0 = performance.now(), last = null, sid = 1, strokeN = 0, ci = 0, prevS = 0, prevT = 0;
  const parts = [], drips = [];
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
    for (const c of [cv, paintC]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); pg.setTransform(dpr, 0, 0, dpr, 0, 0); last = null; }
  // colours: current palette, skipping ones that vanish on the paper home background
  const lum = h => { const c = hexRgb(h); return (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255; };
  const cols = () => { if (HW) return ['#FF7A1A', '#9BD84A', '#7BE04A', '#C5A84A']; const c = pal().cols.filter(h => lum(h) < .8); return c.length ? c : ['#E8392D']; };
  const pin = () => ({ x: W / 2, y: 8 }), L = () => Math.min(104, H - 34);
  const pos = t => { const a = .95 * Math.sin(t * 2.618); return { x: pin().x + Math.sin(a) * L(), y: pin().y + Math.cos(a) * L(), a }; };
  function push(p, v) { // same maths as game.js pushTrail()
    const sp = Math.hypot(v.x, v.y) * 4.5;  // home pendulum is small: scale speed into the game's 0-1500 range
    if (!last) { sid++; strokeN = 0; last = { x: p.x, y: p.y, w: 3, nx: 0, ny: -1, wl: 1, wr: 1 }; return; }
    const dx = p.x - last.x, dy = p.y - last.y, d = Math.hypot(dx, dy); if (d < 4) return;
    strokeN++; const tt = performance.now() / 1000;
    const w = (9 + 17 * (1 - Math.min(1, sp / 1500))) * Math.min(1, .22 + strokeN * .11) * .8;
    const pt = { x: p.x, y: p.y, w, nx: -dy / d, ny: dx / d, wl: 1 + .12 * Math.sin(tt * 21 + sid) + (Math.random() - .5) * .08, wr: 1 + .12 * Math.sin(tt * 17 + 2 + sid) + (Math.random() - .5) * .08 };
    if (strokeN === 1) { last.nx = pt.nx; last.ny = pt.ny; }
    const cs = cols(), c = cs[ci % cs.length];
    drawOpLocal({ t: 's', a: last, b: pt, c, dk: shade(c, -.38), lt: shade(c, .4), sid, gl: false, m: !!pal().blend });
    last = pt;
    if (w > 11 && Math.random() < .1 && drips.length < 8) drips.push({ x: p.x + (Math.random() - .5) * w * .4, y: p.y + w * .3, len: 0, max: 10 + Math.random() * 30, v: 30 + Math.random() * 40, w: w * (.16 + Math.random() * .12), c, m: !!pal().blend });
  }
  function drawOpLocal(o) { pg.globalCompositeOperation = o.m ? 'multiply' : 'source-over'; drawSeg(pg, o, 1); pg.globalCompositeOperation = 'source-over'; }
  function turn(p) { // stroke ends at each turnaround: new stroke, next colour, a few flecks (game splat particles)
    last = null; ci++; const c = cols()[(ci - 1) % cols().length];
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, s = 40 + Math.random() * 120; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: 1.2 + Math.random() * 2.5, c, life: .3 + Math.random() * .4 }); } }
  function brush(p, c) { // the in-game brush (game.js render), scaled to fit the home pendulum
    const P = pal(), q = pin(), ang = Math.atan2(q.y - p.y, q.x - p.x);
    const ink = HW ? '#F2E9DA' : '#111'; g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(p.x, p.y); g.stroke();
    g.fillStyle = ink; g.beginPath(); g.arc(q.x, q.y, 7, 0, 6.283); g.fill();
    g.save(); g.translate(p.x, p.y); g.rotate(ang); g.scale(.62, .62);
    g.fillStyle = HW ? '#B8743A' : '#C8102E'; g.fillRect(34, -7, 70, 14); g.fillStyle = '#111'; g.beginPath(); g.arc(104, 0, 7, -1.57, 1.57); g.fill();
    g.fillStyle = '#B9B9B9'; g.fillRect(14, -10, 22, 20);
    g.fillStyle = HW ? '#FF7A1A' : c; g.beginPath(); g.moveTo(16, -11); g.quadraticCurveTo(-6, -14, -22, 0); g.quadraticCurveTo(-6, 14, 16, 11); g.closePath(); g.fill();
    g.restore(); }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !start.classList.contains('show')) return;
    if (!W || Math.abs(cv.getBoundingClientRect().width - W) > 1) resize();
    const t = (now - t0) / 1000, dt = Math.min(.05, t - prevT); prevT = t;
    const p = pos(t), p2 = pos(t - .01), v = { x: (p.x - p2.x) / .01, y: (p.y - p2.y) / .01 };
    const s = Math.sign(Math.cos(t * 2.618)); if (prevS && s !== prevS) turn(p); prevS = s;
    pg.globalCompositeOperation = 'destination-out'; pg.fillStyle = 'rgba(0,0,0,.007)'; pg.fillRect(0, 0, W, H); pg.globalCompositeOperation = 'source-over'; // old paint fades
    push(p, v);
    for (const d of drips) { d.len = Math.min(d.max, d.len + d.v * dt); pg.globalCompositeOperation = d.m ? 'multiply' : 'source-over'; drawDrip(pg, d, d.len, 1); }
    pg.globalCompositeOperation = 'source-over'; for (let i = drips.length - 1; i >= 0; i--) if (drips[i].len >= drips[i].max) drips.splice(i, 1);
    g.clearRect(0, 0, W, H); g.drawImage(paintC, 0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy += 300 * dt; q.x += q.vx * dt; q.y += q.vy * dt; const sp = Math.hypot(q.vx, q.vy), st = 1 + Math.min(2.2, sp / 600);
      g.fillStyle = q.c; g.beginPath(); g.ellipse(q.x, q.y, q.r * st, q.r / Math.sqrt(st), Math.atan2(q.vy, q.vx), 0, 6.283); g.fill(); }
    const cs = cols(); brush(p, cs[ci % cs.length]);
  }
  if (RM) { // reduced motion: one static stroke + resting brush
    resize(); for (let k = 0; k <= 40; k++) { const tt = -.6 + 1.2 * k / 40, p = pos(tt), p2 = pos(tt - .01); push(p, { x: (p.x - p2.x) / .01, y: (p.y - p2.y) / .01 }); }
    g.drawImage(paintC, 0, 0, W, H); brush(pos(0), cols()[0]); return; }
  addEventListener('resize', () => { W = 0; }); requestAnimationFrame(frame);
})();
