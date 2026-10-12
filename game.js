/* Ink Swing — one-tap swinger that paints a poster. No dependencies. */
(() => {
'use strict';
const WH = 1100, G = 1900, PUMP = 260, GRAB_R = 430, STEP = 1 / 120, MAXV = 1700, PIN_R = 11;
const PALETTES = [
  { name: 'Bauhaus', bg: '#F1E9DA', ink: '#141414', cols: ['#E63A2E', '#1F4FA3', '#F4C430', '#141414'], deco: 'bauhaus' },
  { name: 'Swiss', bg: '#F4F4F0', ink: '#111111', cols: ['#E30613', '#111111', '#E30613'], deco: 'swiss' },
  { name: 'Risograph', bg: '#F7EFE3', ink: '#1B2A6B', cols: ['#FF48B0', '#0078BF', '#FFE800', '#00A95C'], deco: 'riso', blend: 'multiply' },
  { name: 'Memphis', bg: '#FFF1DC', ink: '#1A1A1A', cols: ['#FF6F91', '#2EC4B6', '#FFD23F', '#6A4C93'], deco: 'memphis' },
];
const $ = id => document.getElementById(id);
const cv = $('c'), cx = cv.getContext('2d');
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = (n, s) => mulberry((n * 2654435761) ^ s)();
const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };

let W = 0, H = 0, DPR = 1, scale = 1, viewW = 0;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; scale = H / WH; viewW = W / scale; }
addEventListener('resize', resize); resize();

/* ---------- audio (synthesized Web Audio) ---------- */
const A = { ctx: null, muted: store.get('inkswing.muted', false) };
function audioInit() { if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = A.ctx = new AC(); A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : .55; A.master.connect(c.destination);
  const len = c.sampleRate; A.noise = c.createBuffer(1, len, c.sampleRate); const d = A.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = A.noise; src.loop = true; A.swF = c.createBiquadFilter(); A.swF.type = 'bandpass'; A.swF.Q.value = .8;
  A.swG = c.createGain(); A.swG.gain.value = 0; src.connect(A.swF).connect(A.swG).connect(A.master); src.start(); }
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noiseHit(f0, f1, peak, dec, delay = 0) { const c = A.ctx; if (!c) return; const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = A.noise; fl.type = 'lowpass'; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dec); env(g, t, .005, peak, dec);
  s.connect(fl).connect(g).connect(A.master); s.start(t, Math.random() * .5); s.stop(t + dec + .05); }
function tone(f0, f1, peak, dec, delay = 0, type = 'sine') { const c = A.ctx; if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec); env(g, t, .008, peak, dec); o.connect(g).connect(A.master); o.start(t); o.stop(t + dec + .05); }
const sfx = {
  splat: (k = 1) => { noiseHit(2200, 260, .32 * k, .2); tone(150, 55, .25 * k, .16); },
  death: () => { noiseHit(3000, 200, .4, .45); [0, .18, .34, .52].forEach((d, i) => tone(900 - i * 120, 300 - i * 40, .12, .12, d + .1)); },
  chime: () => [523.25, 659.25, 783.99].forEach((f, i) => { tone(f, f, .09, .7, i * .06, 'triangle'); tone(f * 2, f * 2, .03, .5, i * .06); }),
  boost: () => { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f * 1.01, .1, .45, i * .05, 'triangle')); noiseHit(5000, 800, .12, .5); },
};
function swish(speed, on) { if (!A.ctx) return; const t = A.ctx.currentTime, k = on ? Math.min(1, speed / 1700) : 0;
  A.swG.gain.setTargetAtTime(k * k * .07, t, .08); A.swF.frequency.setTargetAtTime(300 + speed * 1.3, t, .08); }
function setMute(m) { A.muted = m; store.set('inkswing.muted', m); const b = document.getElementById('mute'); b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-pressed', m);
  if (A.master) A.master.gain.setTargetAtTime(m ? 0 : .55, A.ctx.currentTime, .05); }

/* ---------- state ---------- */
const S = { state: 'menu', mode: 'random', seed: 1 };
window.__is = S; // test hook
function genPins(upTo) {
  while (S.pins.length < upTo) {
    const i = S.pins.length, last = S.pins[i - 1], r = S.rng;
    const gap = 215 + Math.min(175, i * 4) + r() * (50 + Math.min(130, i * 3));
    const vari = 110 + Math.min(300, i * 9);
    const y = Math.max(130, Math.min(600, 300 + (r() - .5) * vari));
    S.pins.push({ x: last.x + gap, y });
    if (S.boostReached && Math.random() < .3) S.cans.push({ x: last.x + gap * (.4 + Math.random() * .2), y: Math.min(820, Math.max(last.y, y) + 120 + Math.random() * 220), got: false });
  }
}
function newRun(mode) {
  S.mode = mode; S.seed = mode === 'daily' ? +today() : (Math.random() * 1e9) | 0;
  S.rng = mulberry(S.seed);
  S.pins = [{ x: 260, y: 300 }]; genPins(12);
  S.p = { x: 120, y: 470 }; S.v = { x: 0, y: 0 };
  S.pin = S.pins[0]; S.L = Math.hypot(S.p.x - 260, S.p.y - 300);
  S.holding = true; S.startX = S.p.x; S.maxX = S.p.x; S.bonus = 0; S.score = 0; S.palIdx = 0; S.palT = 1; S.prevPal = 0;
  S.colIdx = 0; S.trail = []; S.splats = []; S.parts = []; S.shake = 0; S.cam = 0; S.air = 0; S.lowY = 0; S.grabs = 0; S.t = 0;
  S.trailStart = 0; S.cans = []; S.boostT = 0; S.boostReached = false; S.boostCount = 0; S.state = 'play'; S.started = false; S.deadT = 0; S.poster = null;
  $('score').textContent = '0'; $('score').classList.remove('boost'); setPalLabel();
  $('hud').classList.remove('hidden'); $('start').classList.remove('show'); $('over').classList.remove('show');
  if (!store.get('inkswing.seen', false)) $('hint').classList.remove('hidden');
  pushTrail(true);
}
const pal = () => PALETTES[S.palIdx % PALETTES.length];
const color = () => { const c = pal().cols; return c[S.colIdx % c.length]; };
function setPalLabel() { $('pal').textContent = pal().name; $('pal').style.background = pal().cols[0]; document.querySelector('meta[name=theme-color]').content = pal().bg; }
function toast(t, c) { const e = $('toast'); e.textContent = t; e.style.color = c || pal().ink; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); }
function pushTrail(force) {
  const p = S.p, last = S.trail[S.trail.length - 1], sp = Math.hypot(S.v.x, S.v.y);
  if (!force && last && Math.hypot(p.x - last.x, p.y - last.y) < 5) return;
  const bo = S.boostT > 0, cs = pal().cols;
  S.trail.push({ x: p.x, y: p.y, c: bo ? cs[Math.floor(S.t * 14) % cs.length] : color(), w: Math.max(9, Math.min(30, 8 + sp / 55)) * (bo ? 1.7 : 1), b: !!pal().blend, brk: !!force, g: bo });
}

/* ---------- input ---------- */
function press() { if (S.state !== 'play') return; S.holding = true; }
function release() { if (S.state !== 'play') return; S.holding = false;
  if (S.pin) { S.pin = null; S.started = true; S.air = 0; S.lowY = S.p.y; vibrate(6); } }
S.press = press; S.release = release;
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const isUI = e => e.target.closest && e.target.closest('button,.panel.show');
addEventListener('pointerdown', e => { audioInit(); if (!isUI(e)) { e.preventDefault(); press(); } }, { passive: false });
addEventListener('pointerup', e => { if (!isUI(e)) release(); });
addEventListener('pointercancel', release);
addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'ArrowUp') { audioInit(); e.preventDefault(); if (!e.repeat) { if (S.state === 'over') return newRun(S.mode); press(); } } });
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') release(); });
addEventListener('contextmenu', e => e.preventDefault());

/* ---------- physics ---------- */
function candidate() { let best = null, bd = GRAB_R;
  for (const pn of S.pins) { if (pn.x < S.p.x - 30) continue; if (pn.x > S.p.x + GRAB_R) break;
    const d = Math.hypot(pn.x - S.p.x, pn.y - S.p.y); if (d < bd && pn.y < S.p.y + 60) { bd = d; best = pn; } }
  return best; }
function grab(pn) {
  S.pin = pn; S.L = Math.hypot(S.p.x - pn.x, S.p.y - pn.y); S.grabs++; S.colIdx++;
  pushTrail(true);
  const near = S.lowY > WH - 170, clean = S.L < 250 && Math.abs(S.p.x - pn.x) < 170;
  let txt = null, add = 0;
  if (near) { add = 3; txt = 'CLOSE CALL +3'; } else if (clean) { add = 1; txt = 'CLEAN +1'; }
  if (add) { S.bonus += add; toast(txt, color()); }
  splat(S.p.x, S.p.y, color(), near ? 1.6 : 1); S.shake = near ? 14 : 7; sfx.splat(near ? 1.3 : 1); vibrate(near ? 25 : 12);
  if (S.grabs === 2) { store.set('inkswing.seen', true); $('hint').classList.add('hidden'); }
}
function splat(x, y, c, k = 1) {
  const seed = (Math.random() * 1e9) | 0; S.splats.push({ x, y, c, k, seed });
  for (let i = 0; i < 14 * k; i++) { const a = Math.random() * 6.28, s = 150 + Math.random() * 450 * k;
    S.parts.push({ x, y, vx: Math.cos(a) * s + S.v.x * .3, vy: Math.sin(a) * s + S.v.y * .3, r: 3 + Math.random() * 7, c, life: .6 + Math.random() * .5 }); }
}
function step(dt) {
  const p = S.p, v = S.v; S.t += dt;
  if (S.state === 'play') {
    if (!S.pin && S.holding && S.started) { const c = candidate(); if (c) grab(c); }
    v.y += G * dt;
    if (S.pin) { const dx = p.x - S.pin.x, dy = p.y - S.pin.y, r = Math.hypot(dx, dy) || 1, tx = -dy / r, ty = dx / r, vt = v.x * tx + v.y * ty;
      if (dy > 0) { const s = Math.sign(vt) || 1; const pm = S.boostT > 0 ? 2 : 1; v.x += tx * s * PUMP * pm * dt; v.y += ty * s * PUMP * pm * dt; }
      if (S.L > 230) S.L -= 90 * dt; // reel in a little: tighter, faster swings
    } else { S.air += dt; S.lowY = Math.max(S.lowY, p.y); }
    v.x *= .9995; v.y *= .9995;
    const mv = S.boostT > 0 ? 2300 : MAXV, sp = Math.hypot(v.x, v.y); if (sp > mv) { v.x *= mv / sp; v.y *= mv / sp; }
    if (S.boostT > 0) S.boostT -= dt;
    for (const cn of S.cans) if (!cn.got && Math.hypot(cn.x - p.x, cn.y - p.y) < 70) collect(cn);
    p.x += v.x * dt; p.y += v.y * dt;
    if (S.pin) { const dx = p.x - S.pin.x, dy = p.y - S.pin.y, r = Math.hypot(dx, dy);
      if (r > S.L) { const nx = dx / r, ny = dy / r; p.x = S.pin.x + nx * S.L; p.y = S.pin.y + ny * S.L; const vr = v.x * nx + v.y * ny; if (vr > 0) { v.x -= nx * vr; v.y -= ny * vr; } } }
    if (p.y < 30) { p.y = 30; if (v.y < 0) v.y *= -.3; }
    pushTrail();
    S.maxX = Math.max(S.maxX, p.x);
    const sc = Math.floor((S.maxX - S.startX) / 120) + S.bonus;
    if (sc !== S.score) { S.score = sc; const e = $('score'); e.textContent = sc; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump');
      if (sc >= 100 && !S.boostReached) boostUnlock();
      const pi = Math.floor(sc / 10); if (pi !== S.palIdx) { if (sc < 100 || S.boostReached && sc % 100 >= 10) sfx.chime(); S.prevPal = S.palIdx; S.palIdx = pi; S.palT = 0; setPalLabel(); toast(pal().name.toUpperCase(), pal().cols[0]); splat(p.x, p.y, pal().cols[0], 1.3); } }
    genPins(S.pins.length + (S.pins[S.pins.length - 1].x < p.x + 2500 ? 4 : 0));
    if (p.y > WH + 120 || p.x < S.cam - 120) die();
  }
  S.palT = Math.min(1, S.palT + dt * 1.5);
  for (const q of S.parts) { q.vy += G * .6 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  S.parts = S.parts.filter(q => q.life > 0);
  S.shake *= Math.pow(.02, dt);
  const target = p.x - viewW * .32; S.cam = Math.max(S.cam, lerp(S.cam, target, Math.min(1, dt * 6)));
}
function boostUnlock() { S.boostReached = true; S.boostT = 2; toast('INK BOOST!', pal().cols[0]); sfx.boost(); S.shake = 18; vibrate([20, 30, 20, 30, 40]);
  for (let i = 0; i < 4; i++) splat(S.p.x + (Math.random() - .5) * 200, S.p.y + (Math.random() - .5) * 200, pal().cols[i % pal().cols.length], 1.4);
  const sb = $('score'); sb.classList.add('boost'); }
function collect(cn) { cn.got = true; S.boostT = 2.6; S.boostCount++; const sp = Math.hypot(S.v.x, S.v.y) || 1;
  S.v.x = S.v.x / sp * Math.max(sp * 1.3, 1100) + 250; S.v.y = S.v.y / sp * Math.max(sp * 1.3, 1100) - 200;
  toast('INK BOOST!', pal().cols[S.boostCount % pal().cols.length]); sfx.boost(); S.shake = 12; vibrate(30); splat(cn.x, cn.y, pal().cols[0], 1.5); }
function die() { sfx.death(); swish(0, false);
  S.state = 'dead'; S.shake = 22; vibrate([30, 40, 60]);
  const key = S.mode === 'daily' ? 'inkswing.best.daily.' + today() : 'inkswing.best';
  S.best = Math.max(store.get(key, 0), S.score); store.set(key, S.best);
  if (S.mode === 'random') $('bestStart').textContent = S.best;
  setTimeout(gameOver, 750);
}
async function gameOver() {
  S.state = 'over';
  $('finalScore').textContent = S.score; $('overBest').textContent = `Best ${S.best}`;
  $('overMode').textContent = S.mode === 'daily' ? `Daily seed · ${today()}` : 'Random run';
  $('hud').classList.add('hidden'); $('hint').classList.add('hidden'); $('over').classList.add('show');
  $('posterPrev').removeAttribute('src');
  S.poster = await makePoster(); $('posterPrev').src = URL.createObjectURL(S.poster);
}

/* ---------- rendering ---------- */
function blob(g, x, y, r, c, seed) { // organic ink splat
  const R = mulberry(seed); g.fillStyle = c; g.beginPath(); const n = 12;
  for (let i = 0; i <= n; i++) { const a = i / n * 6.283, rr = r * (.7 + R() * .5); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.fill(); for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = r * (1.2 + R() * 1.3); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (.08 + R() * .2), 0, 6.28); g.fill(); }
}
function drawTrail(g, pts, from, x0, x1, wk = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = Math.max(1, from); i < pts.length; i++) { const a = pts[i - 1], b = pts[i];
    if (b.brk && i > 1 && a.c !== b.c) continue;
    if (x1 !== undefined && (Math.max(a.x, b.x) < x0 - 40 || Math.min(a.x, b.x) > x1 + 40)) continue;
    g.globalCompositeOperation = b.b && !b.g ? 'multiply' : 'source-over';
    g.strokeStyle = b.c; g.lineWidth = b.w * wk; g.shadowColor = b.c; g.shadowBlur = b.g ? 24 : 0; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-over';
}
function drawDeco(g, x0, x1, P, alpha) { // parallax design-movement motifs
  g.save(); g.globalAlpha = alpha;
  const tile = 700, s0 = Math.floor(x0 / tile) - 1, s1 = Math.floor(x1 / tile) + 1;
  for (let i = s0; i <= s1; i++) { const R = mulberry(i * 7919 + P.name.length * 31), bx = i * tile; g.fillStyle = P.cols[(i & 3) % P.cols.length];
    if (P.deco === 'bauhaus') { g.globalAlpha = alpha * .16; g.beginPath(); g.arc(bx + R() * tile, 200 + R() * 700, 90 + R() * 160, 0, 6.28); g.fill();
      g.fillStyle = P.cols[(i + 1) % 3]; g.fillRect(bx + R() * tile, 500 + R() * 400, 60 + R() * 180, 30 + R() * 30); }
    else if (P.deco === 'swiss') { g.globalAlpha = alpha * .12; g.fillStyle = P.ink; for (let k = 0; k < 7; k++) g.fillRect(bx + k * 100, 0, 2, WH);
      g.fillStyle = P.cols[0]; g.globalAlpha = alpha * .14; g.fillRect(bx + R() * 400, 720 + R() * 200, 280, 280); }
    else if (P.deco === 'riso') { g.globalAlpha = alpha * .18; const cx0 = bx + R() * tile, cy0 = 200 + R() * 700, rad = 180;
      for (let yy = -rad; yy <= rad; yy += 22) for (let xx = -rad; xx <= rad; xx += 22) { const d = Math.hypot(xx, yy); if (d < rad) { g.beginPath(); g.arc(cx0 + xx, cy0 + yy, 7 * (1 - d / rad) + 1, 0, 6.28); g.fill(); } } }
    else { g.globalAlpha = alpha * .22; g.strokeStyle = P.cols[i % 4]; g.lineWidth = 10; g.beginPath(); const sy = 150 + R() * 800; g.moveTo(bx, sy);
      for (let k = 1; k < 8; k++) g.lineTo(bx + k * 40, sy + (k & 1 ? 30 : -30)); g.stroke();
      g.fillStyle = P.cols[(i + 2) % 4]; g.save(); g.translate(bx + 300 + R() * 300, 300 + R() * 600); g.rotate(R() * 3); g.fillRect(-40, -40, 80, 80); g.restore();
      g.beginPath(); g.arc(bx + R() * tile, 200 + R() * 700, 40, 0, 6.28); g.lineWidth = 12; g.strokeStyle = P.ink; g.stroke(); }
  }
  g.restore();
}
function render() {
  const g = cx; g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const P = pal(), Q = PALETTES[S.prevPal % 4], t = S.palT;
  g.fillStyle = S.pins ? mixHex(Q.bg, P.bg, t) : PALETTES[0].bg; g.fillRect(0, 0, W, H);
  if (!S.pins) return;
  const sh = S.shake, ox = (Math.random() - .5) * sh, oy = (Math.random() - .5) * sh;
  g.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * (-S.cam * scale + ox), DPR * oy);
  const x0 = S.cam, x1 = S.cam + viewW;
  g.save(); g.translate(S.cam * .5, 0); drawDeco(g, x0 * .5, x0 * .5 + viewW, P, t); if (t < 1) drawDeco(g, x0 * .5, x0 * .5 + viewW, Q, 1 - t); g.restore();
  for (const s of S.splats) if (s.x > x0 - 200 && s.x < x1 + 200) { g.globalCompositeOperation = PALETTES.find(p => p.cols.includes(s.c))?.blend ? 'multiply' : 'source-over'; blob(g, s.x, s.y, 26 * s.k, s.c, s.seed); }
  g.globalCompositeOperation = 'source-over';
  while (S.trailStart < S.trail.length - 2 && S.trail[S.trailStart].x < x0 - 1500) S.trailStart++;
  drawTrail(g, S.trail, S.trailStart, x0, x1);
  // pins
  const cand = !S.pin && S.state === 'play' && S.started ? candidate() : null;
  for (const pn of S.pins) { if (pn.x < x0 - 40 || pn.x > x1 + 40) continue;
    if (pn === cand) { g.strokeStyle = P.cols[0]; g.lineWidth = 4; g.setLineDash([10, 8]); g.lineDashOffset = -S.t * 40; g.beginPath(); g.arc(pn.x, pn.y, 30 + Math.sin(S.t * 10) * 3, 0, 6.28); g.stroke(); g.setLineDash([]); }
    g.fillStyle = P.ink; g.beginPath(); g.arc(pn.x, pn.y, PIN_R, 0, 6.28); g.fill(); g.fillStyle = P.bg; g.beginPath(); g.arc(pn.x, pn.y, 4, 0, 6.28); g.fill(); }
  for (const cn of S.cans) { if (cn.got || cn.x < x0 - 60 || cn.x > x1 + 60) continue; const by = cn.y + Math.sin(S.t * 4 + cn.x) * 8, cs = P.cols;
    g.save(); g.translate(cn.x, by); g.rotate(Math.sin(S.t * 3 + cn.x) * .15); g.shadowColor = cs[0]; g.shadowBlur = 26 + Math.sin(S.t * 8) * 8;
    g.fillStyle = P.ink; g.fillRect(-24, -30, 48, 60); g.shadowBlur = 0; for (let k = 0; k < 3; k++) { g.fillStyle = cs[k % cs.length]; g.fillRect(-24, -14 + k * 10, 48, 10); }
    g.fillStyle = '#C9C9C9'; g.fillRect(-26, -34, 52, 8); g.strokeStyle = P.ink; g.lineWidth = 4; g.beginPath(); g.arc(0, -36, 16, Math.PI, 0); g.stroke();
    g.fillStyle = cs[0]; g.beginPath(); g.ellipse(14, -34, 9, 5, 0, 0, 6.28); g.fill(); g.restore(); }
  // rope
  const p = S.p;
  if (S.pin && S.state !== 'over') { g.strokeStyle = P.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(S.pin.x, S.pin.y); g.lineTo(p.x, p.y); g.stroke(); }
  // particles
  for (const q of S.parts) { g.globalAlpha = Math.min(1, q.life * 2); g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 6.28); g.fill(); }
  g.globalAlpha = 1;
  // brush: handle points toward pin (or opposite of velocity in the air)
  let ang = S.pin ? Math.atan2(S.pin.y - p.y, S.pin.x - p.x) : Math.atan2(-S.v.y, -S.v.x) * .4 + (-Math.PI / 2) * .6;
  g.save(); g.translate(p.x, p.y); g.rotate(ang);
  g.fillStyle = '#C8102E'; g.fillRect(34, -7, 70, 14); g.fillStyle = P.ink; g.beginPath(); g.arc(104, 0, 7, -1.57, 1.57); g.fill();
  g.fillStyle = '#B9B9B9'; g.fillRect(14, -10, 22, 20);
  g.fillStyle = color(); g.beginPath(); g.moveTo(16, -11); g.quadraticCurveTo(-6, -14, -22, 0); g.quadraticCurveTo(-6, 14, 16, 11); g.closePath(); g.fill();
  g.restore();
  if (S.state === 'play' && !S.started) { g.fillStyle = P.ink; g.font = `34px "Archivo Black",Impact,sans-serif`; g.textAlign = 'center'; g.fillText('RELEASE TO FLING →', S.pins[0].x + 40, S.pins[0].y - 60); }
}

/* ---------- poster ---------- */
async function makePoster() {
  try { await document.fonts.load('80px "Archivo Black"'); } catch {}
  const Wp = 1080, Hp = 1920, c = document.createElement('canvas'); c.width = Wp; c.height = Hp; const g = c.getContext('2d');
  const P0 = PALETTES[0], F = '"Archivo Black",Impact,sans-serif';
  g.fillStyle = P0.bg; g.fillRect(0, 0, Wp, Hp);
  // header
  g.fillStyle = '#141414'; g.font = `190px ${F}`; g.textAlign = 'left'; g.fillText('INK', 54, 220); g.fillStyle = '#E63A2E'; g.fillText('SWING', 54, 400);
  g.fillStyle = '#141414'; g.font = `bold 26px system-ui,sans-serif`; g.textAlign = 'right';
  g.fillText(S.mode === 'daily' ? `DAILY ${today()}` : `RUN #${String(S.seed % 100000).padStart(5, '0')}`, Wp - 60, 90);
  g.fillText(`${S.grabs} GRABS`, Wp - 60, 128); if (S.boostReached) { g.fillStyle = '#E63A2E'; g.fillText(`★ INK BOOST REACHED${S.boostCount ? ` · ${S.boostCount} CANS` : ''}`, Wp - 60, 204); g.fillStyle = '#141414'; } g.fillText(PALETTES.slice(0, Math.min(4, S.palIdx + 1)).map(p => p.name.toUpperCase()).join(' / '), Wp - 60, 166);
  // art: the whole trail, wrapped into stacked strips like lines of text
  const ax = 60, ay = 450, aw = 960, ah = 1050;
  g.fillStyle = '#FFFFFF'; g.fillRect(ax, ay, aw, ah);
  const pts = S.trail; let mn = Infinity, mx = -Infinity, my = Infinity, My = -Infinity; for (const q of pts) { mn = Math.min(mn, q.x); mx = Math.max(mx, q.x); my = Math.min(my, q.y); My = Math.max(My, Math.min(WH + 60, q.y)); }
  const HY = Math.max(380, My - my + 160), y0 = my - 80;
  const L = Math.max(400, mx - mn + 80), n = Math.max(1, Math.round(Math.sqrt(L * ah / (aw * HY)))), sw = L / n, sh = ah / n, s = Math.min(aw / sw, sh / HY);
  for (let i = 0; i < n; i++) { g.save(); g.beginPath(); g.rect(ax, ay + i * sh, aw, sh); g.clip();
    g.translate(ax + (aw - sw * s) / 2, ay + i * sh + (sh - HY * s) / 2); g.scale(s, s); g.translate(-(mn - 40 + i * sw), -y0);
    for (const sp of S.splats) blob(g, sp.x, sp.y, 26 * sp.k * Math.max(1, .9 / s), sp.c, sp.seed);
    drawTrail(g, pts, 1, undefined, undefined, Math.max(1, 1.1 / s)); g.restore();
    if (i) { g.fillStyle = '#141414'; g.fillRect(ax, ay + i * sh - 1, aw, 2); } }
  g.strokeStyle = '#141414'; g.lineWidth = 6; g.strokeRect(ax, ay, aw, ah);
  // footer
  g.fillStyle = '#141414'; g.textAlign = 'left'; g.font = `260px ${F}`; g.fillText(S.score, 48, 1770);
  const sw2 = g.measureText(String(S.score)).width;
  g.font = `bold 30px system-ui,sans-serif`; g.fillText('POINTS', 60 + sw2, 1600); g.fillStyle = '#E63A2E'; g.fillText(`BEST ${S.best}`, 60 + sw2, 1645);
  g.fillStyle = '#141414'; g.textAlign = 'center'; g.font = `44px ${F}`; g.fillText('CAN YOU OUT-SWING ME?', Wp / 2, 1865);
  g.fillStyle = '#F4C430'; g.beginPath(); g.arc(Wp - 140, 1640, 70, 0, 6.28); g.fill(); g.fillStyle = '#1F4FA3'; g.fillRect(Wp - 250, 1660, 90, 90);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
S.makePoster = makePoster;
async function share() {
  if (!S.poster) return; const file = new File([S.poster], `ink-swing-${S.score}.png`, { type: 'image/png' });
  const text = `I painted ${S.score} points on Ink Swing${S.mode === 'daily' ? ' (daily seed)' : ''}. Can you out-swing me?`;
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title: 'Ink Swing', text }); } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(S.poster); a.download = file.name; a.click();
}

/* ---------- loop & UI ---------- */
let last = performance.now(), acc = 0;
function frame(now) { const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (S.pins) { acc += dt; while (acc >= STEP) { step(STEP); acc -= STEP; } }
  if (S.pins) swish(Math.hypot(S.v.x, S.v.y), S.state === 'play' && S.started);
  render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
$('btnRandom').onclick = () => newRun('random');
$('btnDaily').onclick = () => newRun('daily');
$('btnRetry').onclick = () => newRun(S.mode);
$('btnShare').onclick = share;
$('mute').onclick = () => setMute(!A.muted); setMute(A.muted);
$('btnMenu').onclick = () => { $('over').classList.remove('show'); $('start').classList.add('show'); S.state = 'menu'; };
$('bestStart').textContent = store.get('inkswing.best', 0);
$('dailyTag').textContent = `${today().slice(0, 4)}·${today().slice(4, 6)}·${today().slice(6)} · same pins for everyone`;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
