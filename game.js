/* Ink Swing — one-tap swinger that paints a poster. No dependencies. */
(() => {
'use strict';
const WH = 1100, G = 1900, PUMP = 260, GRAB_R = 430, STEP = 1 / 120, MAXV = 1700, PIN_R = 11;
const HW = (localStorage.getItem('inkswing.theme') || 'halloween') === 'halloween';
const HPAL = [
  { name: 'Pumpkin', bg: '#170B22', ink: '#F3E6CF', cols: ['#FF7A1A', '#A04DFF', '#F3E6CF'], deco: 'bauhaus' },
  { name: 'Toxic Slime', bg: '#0A140E', ink: '#ECF5E4', cols: ['#7CFF3A', '#F4F4EC', '#8B3DFF'], deco: 'riso' },
  { name: 'Blood Moon', bg: '#17080D', ink: '#F3E3C3', cols: ['#E0142B', '#F3E3C3', '#9A8FA6'], deco: 'swiss' },
  { name: 'Candy Corn', bg: '#1A1022', ink: '#FFF4E0', cols: ['#FFB000', '#FF5A00', '#FFF4E0'], deco: 'memphis' },
];
const CPAL = [
  { name: 'Bauhaus', bg: '#F1E9DA', ink: '#141414', cols: ['#E63A2E', '#1F4FA3', '#F4C430', '#141414'], deco: 'bauhaus' },
  { name: 'Swiss', bg: '#F4F4F0', ink: '#111111', cols: ['#E30613', '#111111', '#8C8C8C'], deco: 'swiss' },
  { name: 'Risograph', bg: '#F7EFE3', ink: '#1B2A6B', cols: ['#FF48B0', '#0078BF', '#FFE800', '#00A95C'], deco: 'riso', blend: 'multiply' },
  { name: 'Memphis', bg: '#FFF1DC', ink: '#1A1A1A', cols: ['#FF6F91', '#2EC4B6', '#FFD23F', '#6A4C93'], deco: 'memphis' },
];
const PALETTES = HW ? HPAL : CPAL;
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

/* ---------- audio: pre-rendered WAVs (sfx/) via Web Audio, HTMLAudio fallback, robust iOS/Android unlock ---------- */
const A = { ctx: null, muted: store.get('inkswing.muted', false) === true, buf: {}, html: {}, vol: .5 };
const SFX = [...(HW ? ['pad'] : []), 'splat-yt', 'splash', 'drip1', 'drip2', 'chime', 'boost', 'swish'];
function loadBuffers() { for (const n of SFX) fetch(`sfx/${n}.wav`).then(r => r.arrayBuffer()).then(ab => new Promise((ok, no) => {
  const p = A.ctx.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); })).then(b => { A.buf[n] = b; if (n === 'swish') startSwish(); if (n === 'pad') startPad(); }).catch(() => {}); }
for (const n of SFX) { const a = new Audio(`sfx/${n}.wav`); a.preload = 'auto'; A.html[n] = a; } // fallback players
function unlock() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iOS 17+: ignore silent switch
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!A.ctx && AC) { try {
    const c = A.ctx = new AC(); A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : A.vol;
    A.an = c.createAnalyser(); A.an.fftSize = 2048; A.master.connect(A.an); A.an.connect(c.destination);
    A.swF = c.createBiquadFilter(); A.swF.type = 'bandpass'; A.swF.Q.value = .7; A.swF.frequency.value = 900; A.swG = c.createGain(); A.swG.gain.value = 0; A.swF.connect(A.swG).connect(A.master);
    c.onstatechange = () => { A.state = c.state; };
    loadBuffers();
  } catch (e) { A.ctx = null; } }
  if (A.ctx) {
    if (A.ctx.state !== 'running') { try { const p = A.ctx.resume(); p && p.catch && p.catch(() => {}); } catch {} } // also covers iOS 'interrupted'
    if (!A.primed) { A.primed = true; const s = A.ctx.createBufferSource(); s.buffer = A.ctx.createBuffer(1, 1, 22050); s.connect(A.ctx.destination); s.start(0); } // classic iOS unlock
  }
  if (!A.tag) { A.tag = new Audio('sfx/silence.wav'); A.tag.loop = true; A.tag.setAttribute('playsinline', ''); A.tag.volume = .01; } // keeps iOS session in "playback"
  if (A.tag.paused && !document.hidden) { const p = A.tag.play(); p && p.catch && p.catch(() => {}); }
}
['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'click', 'keydown'].forEach(ev => addEventListener(ev, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { A.tag && A.tag.pause(); A.ctx && A.ctx.suspend && A.ctx.suspend().catch(() => {}); }
  else if (A.ctx) { try { A.ctx.resume().catch(() => {}); } catch {} } });
const live = () => A.ctx && A.ctx.state === 'running';
function play(n, vol = 1, rate = 1, delay = 0) {
  if (A.muted || !vol) return;
  if (live() && A.buf[n]) { const c = A.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = A.buf[n]; s.playbackRate.value = rate; g.gain.value = Math.min(1.5, vol);
    s.connect(g).connect(A.master); s.start(c.currentTime + delay); return; }
  const h = A.html[n]; if (!h) return; const go = () => { const a = h.cloneNode(); a.volume = Math.min(1, vol * A.vol); try { a.playbackRate = rate; } catch {} const p = a.play(); p && p.catch && p.catch(() => {}); };
  delay ? setTimeout(go, delay * 1000) : go();
}
const rv = (a = .1) => 1 - a + Math.random() * 2 * a;
const sfx = {
  splat: (k = 1) => play('splat-yt', .6 * Math.min(1, .75 + .25 * k) * rv(.1), rv(.1)),
  death: () => { play('splash', .75, rv(.05)); if (Math.random() < .6) play(Math.random() < .5 ? 'drip1' : 'drip2', .25, rv(.12), 1.1 + Math.random() * .3); },
  chime: () => play('chime', .35), boost: () => play('boost', .4),
};
function startPad() { if (!A.ctx || A.padSrc || !A.buf.pad) return; const s = A.padSrc = A.ctx.createBufferSource(), g = A.ctx.createGain(); s.buffer = A.buf.pad; s.loop = true; g.gain.value = .22; s.connect(g).connect(A.master); s.start(); }
function startSwish() { if (!A.ctx || A.swSrc || !A.buf.swish) return; const s = A.swSrc = A.ctx.createBufferSource(); s.buffer = A.buf.swish; s.loop = true; s.connect(A.swF); s.start(); }
function swish(speed, on) { if (!live() || !A.swSrc) return; const t = A.ctx.currentTime, k = on ? Math.min(1, speed / 1700) : 0;
  A.swG.gain.setTargetAtTime(k * k * .3, t, .12); A.swF.frequency.setTargetAtTime(350 + speed * 1.1, t, .09); A.swSrc.playbackRate.setTargetAtTime(.85 + k * .35, t, .1); }
function setMute(m) { A.muted = !!m; store.set('inkswing.muted', A.muted); const b = document.getElementById('mute'); b.textContent = A.muted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', A.muted);
  if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : A.vol, A.ctx.currentTime, .03); if (A.tag && A.muted) A.tag.pause(); }
window.__audio = A;

/* ---------- state ---------- */
const S = { state: 'menu', mode: 'random', seed: 1, chill: localStorage.getItem('inkswing.chill') === '1' };
window.__is = S; // test hook
window.InkPaint = { drawSeg, drawDrip, shade, hexRgb, pal: () => pal() || PALETTES[0] }; // shared with home-brush.js (home-screen brush uses the game paint engine)
function genPins(upTo) {
  while (S.pins.length < upTo) {
    const i = S.pins.length, last = S.pins[i - 1], r = S.rng;
    const gap = 215 + Math.min(175, i * 4) + r() * (50 + Math.min(130, i * 3));
    const vari = 110 + Math.min(300, i * 9);
    const y = Math.max(130, Math.min(600, 300 + (r() - .5) * vari));
    S.pins.push({ x: last.x + gap, y }); genObstacle(i, last, gap, y); if (S.chill) { S.obs.length = 0; S.orbs.length = 0; } // same rng use keeps pin layout identical
    { const c = S.crng, roll = c(), ox = c(), oy = c(); // separate seeded stream: daily runs identical, pin layout untouched
      if (i >= 5 && i - S.lastCan >= 3 && roll < .13 + Math.min(.07, i * .0012)) { S.lastCan = i; S.cans.push({ x: last.x + gap * (.4 + ox * .2), y: Math.min(820, Math.max(last.y, y) + 120 + oy * 220), got: false }); } }
  }
}
function newRun(mode) {
  S.mode = mode; S.seed = mode === 'daily' ? +today() : (Math.random() * 1e9) | 0;
  S.rng = mulberry(S.seed); S.crng = mulberry((S.seed ^ 0x9E3779B9) >>> 0); S.lastCan = -9; S.cans = [];
  S.obs = []; S.orbs = []; S.saves = 1; S.graceT = 0; S.cur = 0; S.cleared = 0; S.cause = ''; S.pins = [{ x: 260, y: 300 }]; genPins(12);
  S.p = { x: 120, y: 470 }; S.v = { x: 0, y: 0 };
  S.pin = S.pins[0]; S.L = Math.hypot(S.p.x - 260, S.p.y - 300);
  S.holding = true; S.startX = S.p.x; S.maxX = S.p.x; S.bonus = 0; S.score = 0; S.palIdx = 0; S.palT = 1; S.prevPal = 0;
  S.colIdx = 0; S.trail = []; S.parts = []; S.ops = []; S.chunks = new Map(); S.minChunk = -99; S.k = Math.min(1.25, DPR * scale); S.drips = []; S.sdrips = []; S.sid = 0; S.poolT = 0; S.last = null; S.passed = 0; S.shake = 0; S.cam = 0; S.air = 0; S.lowY = 0; S.grabs = 0; S.t = 0; S.lastPin = null;
  S.trailStart = 0; S.boostT = 0; S.boostReached = false; S.boostCount = 0; S.state = 'play'; S.started = false; S.deadT = 0; S.poster = null;
  $('score').textContent = '0'; $('score').classList.remove('boost'); setPalLabel();
  document.body.classList.remove('onstart'); $('hud').classList.remove('hidden'); $('start').classList.remove('show'); $('over').classList.remove('show');
  if (!store.get('inkswing.seen', false)) $('hint').classList.remove('hidden');
  pushTrail(true);
}
const pal = () => PALETTES[S.palIdx % PALETTES.length];
const color = () => pal().cols[S.cur % NC];
function setPalLabel() { $('pal').textContent = pal().name; $('pal').style.background = pal().cols[0]; document.querySelector('meta[name=theme-color]').content = pal().bg; }
function toast(t, c) { const e = $('toast'); e.textContent = t; e.style.color = c || pal().ink; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); }
function pushTrail(force) {
  const p = S.p, sp = Math.hypot(S.v.x, S.v.y);
  if (force || !S.last) { S.sid++; S.strokeN = 0; S.last = { x: p.x, y: p.y, w: 3, nx: 0, ny: -1, wl: 1, wr: 1 }; return; }
  const last = S.last, dx = p.x - last.x, dy = p.y - last.y, d = Math.hypot(dx, dy);
  if (d < 6) return;
  S.strokeN++; const bo = S.boostT > 0, cs = pal().cols;
  const w = (9 + 17 * (1 - Math.min(1, sp / 1500))) * Math.min(1, .22 + S.strokeN * .11) * (bo ? 1.6 : 1); // pressure: slow = heavy; taper at stroke start
  const pt = { x: p.x, y: p.y, w, nx: -dy / d, ny: dx / d, wl: 1 + .12 * Math.sin(S.t * 21 + S.sid) + (Math.random() - .5) * .08, wr: 1 + .12 * Math.sin(S.t * 17 + 2 + S.sid) + (Math.random() - .5) * .08 };
  if (S.strokeN === 1) { last.nx = pt.nx; last.ny = pt.ny; }
  const c = bo ? cs[Math.floor(S.t * 14) % cs.length] : color(), m = !!pal().blend && !bo;
  paint({ t: 's', a: last, b: pt, c, dk: shade(c, -.38), lt: shade(c, .4), sid: S.sid, gl: bo, m, bx0: Math.min(last.x, p.x) - 40, bx1: Math.max(last.x, p.x) + 40 });
  S.last = pt; S.trail.push({ x: p.x, y: p.y });
  if (w > (HW ? 14 : 18) && Math.random() < (HW ? .13 : .06) && S.drips.length < 14) S.drips.push({ x: p.x + (Math.random() - .5) * w * .4, y: p.y + w * .3, len: 0, max: 25 + Math.random() * 110, v: 50 + Math.random() * 60, w: w * (.16 + Math.random() * .12), c, m });
}
/* ---------- paint engine: ops paint once into cached world chunks (offscreen canvases) and replay for the poster ---------- */
const CW = 1024, MAXP = 220;
function shade(h, t) { const c = hexRgb(h), f = t < 0 ? 0 : 255, k = Math.abs(t); return `rgb(${c.map(v => Math.round(lerp(v, f, k))).join(',')})`; }
function chunk(i) { let c = S.chunks.get(i); if (!c) { c = document.createElement('canvas'); c.width = Math.ceil(CW * S.k); c.height = Math.ceil(WH * S.k);
  c.g = c.getContext('2d'); c.g.setTransform(S.k, 0, 0, S.k, -i * CW * S.k, 0); S.chunks.set(i, c); } return c; }
function paint(op) { S.ops.push(op); for (let i = Math.floor(op.bx0 / CW); i <= Math.floor(op.bx1 / CW); i++) if (i >= S.minChunk) drawOp(chunk(i).g, op, 1); }
function drawOp(g, o, wk) { g.globalCompositeOperation = o.m ? 'multiply' : 'source-over';
  if (o.t === 's') drawSeg(g, o, wk); else if (o.t === 'b') drawBlob(g, o, wk);
  else if (o.t === 'd') { g.fillStyle = o.c; g.beginPath(); g.ellipse(o.x, o.y, o.r * wk * 1.25, o.r * wk * .9, o.a || 0, 0, 6.283); g.fill(); }
  else if (o.t === 'p') { const r = o.r * wk; g.fillStyle = o.c; g.beginPath(); g.ellipse(o.x, o.y, r * 1.15, r, 0, 0, 6.283); g.fill(); g.globalAlpha = .3; g.fillStyle = o.dk; g.beginPath(); g.arc(o.x + r * .15, o.y + r * .2, r * .6, 0, 6.283); g.fill();
    g.globalAlpha = .35; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(o.x - r * .35, o.y - r * .35, r * .3, r * .13, -.6, 0, 6.283); g.fill(); g.globalAlpha = 1; }
  else if (o.t === 'r') drawDrip(g, o, o.max, wk);
  else if (o.t === 'k') drawStamp(g, o);
  g.globalCompositeOperation = 'source-over'; }
/* screenprint stamps: flat marks for passed pins / smashed cans, two misregistered overprint passes */
function stampPath(g, o) { const r = o.r; g.beginPath();
  if (o.sh === 'ring') { g.arc(0, 0, r, 0, 6.283); g.arc(0, 0, r * .62, 0, 6.283, true); }
  else if (o.sh === 'cross') { const w = r * .32; g.rect(-r, -w, 2 * r, 2 * w); g.rect(-w, -r, 2 * w, r - w); g.rect(-w, w, 2 * w, r - w); }
  else if (o.sh === 'gate') { const w = r * .26; g.rect(-r, -r, w, 2 * r); g.rect(r - w, -r, w, 2 * r); g.rect(-r, -r, 2 * r, w); }
  else if (o.sh === 'bar') { const w = r * .2; g.rect(-r, -w, 2 * r, 2 * w); }
  else if (o.sh === 'half') { g.arc(0, 0, r, Math.PI, 0); g.closePath(); }
  else if (o.sh === 'tri') { g.moveTo(0, -r); g.lineTo(r * .95, r * .7); g.lineTo(-r * .95, r * .7); g.closePath(); }
  else { for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, rr = i % 2 ? r * .55 : r; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0); } g.closePath(); } }
function drawStamp(g, o) { g.globalCompositeOperation = HW ? 'source-over' : 'multiply';
  for (const [c, dx, dy, al] of [[o.c, 0, 0, .78], [o.c2, o.off, -o.off * .6, .38]]) { g.save(); g.translate(o.x + dx, o.y + dy); g.rotate(o.rot); g.globalAlpha = al; g.fillStyle = c; stampPath(g, o); g.fill('evenodd'); g.restore(); }
  g.globalAlpha = 1; }
function stamp(x, y, big, opt = {}) { const P = pal(), cs = P.cols, i = opt.ci ?? Math.floor(Math.random() * cs.length);
  const shapes = { bauhaus: ['ring', 'half', 'tri'], swiss: ['cross', 'gate', 'cross'], riso: ['ring', 'burst', 'half'], memphis: ['tri', 'gate', 'burst', 'ring'] }[P.deco];
  const r = big ? 150 + Math.random() * 70 : 80 + Math.random() * 90, sh = big ? 'burst' : shapes[Math.floor(Math.random() * shapes.length)];
  paint({ t: 'k', x, y, r: opt.r || r, sh: opt.sh || sh, rot: opt.rot ?? (P.deco === 'swiss' ? 0 : (Math.random() - .5) * 1.2), c: cs[i], c2: shade(cs[(i + 1) % cs.length], .5), off: 4 + Math.random() * 5, bx0: x - (opt.r || r) - 12, bx1: x + (opt.r || r) + 12 }); }
/* ---------- obstacles (Color Switch-style) ---------- */
const BR = 10, TOL = 12, NC = 3, GATE_H = 230; // brush radius, generous tolerance, gameplay colors, gate block height
function genObstacle(i, last, gap, y) { const r = S.rng; if (last.x < 2500 || r() > Math.min(.4, .2 + (i - 10) * .01)) return;
  const spd = (.55 + Math.min(.6, i * .01)) * (r() < .5 ? -1 : 1), x = last.x + gap * .58, kind = ['ring', 'cross', 'gate'][Math.floor(r() * 3)];
  const sh = [0, 1, 2].sort(() => r() - .5);
  let o; if (kind === 'ring') { const R = Math.min(gap * .34, 115 + r() * 40); o = { kind, x, y: Math.min(WH - R - 50, (last.y + y) / 2 + 200 + r() * 80), R, th: 20, cs: [sh[0], sh[1], sh[2], sh[r() * 3 | 0]].slice(0, (r(), 3)) }; }
  else if (kind === 'cross') { const R = 120 + r() * 40, arms = r() < .65 ? 2 : 4; o = { kind, x, y: Math.min(WH - R - 40, (last.y + y) / 2 + 210 + r() * 70), R, th: 18, arms, cs: arms === 2 ? [sh[0], sh[1]] : [sh[0], sh[1], sh[2], sh[0]] }; }
  else o = { kind, x, y: WH / 2, R: 14, th: 26, cs: sh, off: r() * GATE_H * 3 };
  o.rot = r() * 6.28; o.spd = spd; o.st = 0; o.touched = false; S.obs.push(o);
  const ox = o.x - (kind === 'gate' ? 0 : o.R) - 75 - r() * 20; S.orbs.push({ x: ox, y: kind === 'gate' ? Math.min(WH - 120, last.y + 250) : o.y, ci: sh[r() * 3 | 0], got: false }); }
function obsColorAt(o, p) { const dx = p.x - o.x, dy = p.y - o.y, hit = o.th / 2 + BR - TOL;
  if (o.kind === 'ring') { const d = Math.hypot(dx, dy); if (Math.abs(d - o.R) > hit) return -1; let a = (Math.atan2(dy, dx) - o.rot) % 6.2832; if (a < 0) a += 6.2832; return o.cs[Math.floor(a / (6.2832 / o.cs.length)) % o.cs.length]; }
  if (o.kind === 'cross') { for (let k = 0; k < o.arms; k++) { const a = o.rot + k * 6.2832 / o.arms, ex = Math.cos(a) * o.R, ey = Math.sin(a) * o.R, t = Math.max(0, Math.min(1, (dx * ex + dy * ey) / (o.R * o.R)));
      if (Math.hypot(dx - ex * t, dy - ey * t) < hit) return o.cs[k]; } return -1; }
  if (Math.abs(dx) > hit) return -1; const n = o.cs.length, m = (((p.y - o.off) % (GATE_H * n)) + GATE_H * n) % (GATE_H * n); return o.cs[Math.floor(m / GATE_H)]; }
function stepObstacles(dt) { const p = S.p; if (S.graceT > 0) S.graceT -= dt;
  for (const o of S.obs) { o.rot += o.spd * dt; if (o.kind === 'gate') o.off += o.spd * 90 * dt;
    if (o.st || o.x > p.x + 300 || o.x < p.x - 400) continue;
    const c = obsColorAt(o, p);
    if (c >= 0) { if (S.boostT > 0) { smash(o); continue; } if (c !== S.cur) { if (S.graceT > 0) continue; if (S.saves > 0) { S.saves--; S.graceT = .7; splat(p.x, p.y, pal().cols[c], 1.2); S.shake = 10; sfx.splat(1); toast('CAREFUL! SAVE USED', pal().cols[c]); vibrate([15, 30, 15]); continue; } S.cause = 'obstacle'; return die(); }
      if (!o.touched) { o.touched = true; splat(p.x, p.y, color(), .7); sfx.splat(.6); } }
    if (p.x > o.x + (o.kind === 'gate' ? 30 : o.R + 30)) clearObs(o); }
  for (const b of S.orbs) if (!b.got && Math.hypot(b.x - p.x, b.y - p.y) < 66) { b.got = true; S.cur = b.ci; splat(b.x, b.y, color(), .8); sfx.chime(); toast('NEW COLOR', color()); pushTrail(true); }
}
function obsStamp(o) { const P = pal(), sh = o.kind === 'ring' ? 'ring' : o.kind === 'cross' ? (o.arms === 2 ? 'bar' : 'cross') : 'gate';
  stamp(o.x, o.kind === 'gate' ? S.p.y : o.y, false, { sh, r: o.kind === 'gate' ? 110 : o.R + 10, rot: o.kind === 'cross' ? o.rot : P.deco === 'swiss' ? 0 : o.rot * .2, ci: o.cs[0] }); }
function clearObs(o) { o.st = 1; S.cleared++; obsStamp(o); if (o.touched) { S.bonus += 2; toast('CLEAN PASS +2', color()); sfx.chime(); vibrate(10); } }
function smash(o) { o.st = 2; S.cleared++; S.bonus += 2; obsStamp(o); splat(S.p.x, S.p.y, pal().cols[o.cs[0]], 1.6); S.shake = 14; toast('SMASH +2', pal().cols[0]); sfx.splat(1.3); }
function drawObstacles(g, x0, x1, P) { g.lineCap = 'butt';
  for (const o of S.obs) { if (o.st === 2 || o.x < x0 - 200 || o.x > x1 + 200) continue; g.globalAlpha = o.st ? .25 : 1; const col = k => P.cols[k];
    if (o.kind === 'ring') { const n = o.cs.length, seg = 6.2832 / n; g.lineWidth = o.th; for (let k = 0; k < n; k++) { g.strokeStyle = col(o.cs[k]); g.beginPath(); g.arc(o.x, o.y, o.R, o.rot + k * seg + .03, o.rot + (k + 1) * seg - .03); g.stroke(); } if (HW) drawWeb(g, o, P); }
    else if (o.kind === 'cross') { g.lineWidth = o.th; g.lineCap = 'round'; for (let k = 0; k < o.arms; k++) { const a = o.rot + k * 6.2832 / o.arms; g.strokeStyle = col(o.cs[k]); g.beginPath(); g.moveTo(o.x + Math.cos(a) * 14, o.y + Math.sin(a) * 14); g.lineTo(o.x + Math.cos(a) * o.R, o.y + Math.sin(a) * o.R); g.stroke(); if (HW) drawBat(g, o.x + Math.cos(a) * o.R, o.y + Math.sin(a) * o.R, 1.1, col(o.cs[k]), a + 1.57, S.t * 12 + k); }
      g.fillStyle = P.ink; g.beginPath(); g.arc(o.x, o.y, 12, 0, 6.283); g.fill(); g.lineCap = 'butt'; }
    else { const n = o.cs.length, H = GATE_H * n, start = ((o.off % H) + H) % H - H; for (let yy = start, k = 0; yy < WH; yy += GATE_H, k++) { g.fillStyle = col(o.cs[k % n]); if (HW) coffin(g, o.x, yy + 3, o.th + 10, GATE_H - 6); else g.fillRect(o.x - o.th / 2, yy + 3, o.th, GATE_H - 6); } }
  }
  g.globalAlpha = 1;
  for (const b of S.orbs) { if (b.got || b.x < x0 - 60 || b.x > x1 + 60) continue; const c = P.cols[b.ci], by = b.y + Math.sin(S.t * 5 + b.x) * 6;
    g.save(); g.translate(b.x, by); g.shadowColor = c; g.shadowBlur = 22; if (HW) { g.rotate(Math.sin(S.t * 2 + b.x) * .3); drawCandy(g, c, P); g.restore(); continue; } g.fillStyle = c; g.beginPath(); g.moveTo(0, -30); g.bezierCurveTo(16, -10, 20, 4, 20, 10); g.arc(0, 10, 20, 0, Math.PI); g.bezierCurveTo(-20, 4, -16, -10, 0, -30); g.fill();
    g.shadowBlur = 0; g.strokeStyle = P.ink; g.lineWidth = 3; g.stroke(); g.globalAlpha = .5; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-7, 6, 4, 8, -.4, 0, 6.283); g.fill(); g.restore(); }
}
/* ---------- Halloween theme art ---------- */
const HWC = { bone: '#F3E6CF', night: '#120A1C', glow: '#FFC94A' };
let MOON = null, FOG = null;
function moonCanvas(R) { if (MOON && MOON.R === R) return MOON; const c = document.createElement('canvas'), s = Math.ceil(R * 2 * DPR) + 4; c.width = c.height = s; const g = c.getContext('2d'); g.scale(DPR, DPR);
  g.fillStyle = HWC.bone; g.beginPath(); g.arc(R + 1, R + 1, R, 0, 6.283); g.fill(); g.save(); g.clip();
  const st = Math.max(5, R / 14); g.fillStyle = '#B9A47F'; // halftone shading toward lower-left
  for (let y = 0; y < 2 * R + 2; y += st) for (let x = 0; x < 2 * R + 2; x += st) { const k = Math.max(0, ((2 * R - x) + y) / (4 * R) - .35) * 1.6; if (k > .02) { g.beginPath(); g.arc(x + (y / st % 2) * st / 2, y, st * .5 * Math.min(1, k), 0, 6.283); g.fill(); } }
  g.fillStyle = 'rgba(150,128,100,.5)'; for (const [a, b, r] of [[.35, .4, .16], [.62, .3, .09], [.55, .66, .12], [.3, .72, .07]]) { g.beginPath(); g.arc(a * 2 * R, b * 2 * R, r * R, 0, 6.283); g.fill(); }
  g.restore(); c.R = R; return MOON = c; }
function fogCanvas() { if (FOG) return FOG; const c = document.createElement('canvas'); c.width = 600; c.height = 360; const g = c.getContext('2d'); g.fillStyle = HWC.bone;
  for (let y = 0; y < 360; y += 14) for (let x = 0; x < 600; x += 14) { const k = (y / 360) * (.55 + .45 * Math.sin(x / 600 * 6.283 * 2 + y / 60)); if (k > .05) { g.globalAlpha = .1 + k * .12; g.beginPath(); g.arc(x + (y / 14 % 2) * 7, y, 5.5 * k, 0, 6.283); g.fill(); } }
  return FOG = c; }
function drawBat(g, x, y, s, c, rot = 0, flap = S.t * 14) { const w = Math.sin(flap) * .5 + .5; g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.fillStyle = c; g.beginPath();
  g.moveTo(0, -4); g.quadraticCurveTo(10, -14 - w * 10, 26, -6 - w * 14); g.quadraticCurveTo(20, -2, 22, 4); g.quadraticCurveTo(14, 0, 10, 6); g.quadraticCurveTo(5, 2, 0, 8);
  g.quadraticCurveTo(-5, 2, -10, 6); g.quadraticCurveTo(-14, 0, -22, 4); g.quadraticCurveTo(-20, -2, -26, -6 - w * 14); g.quadraticCurveTo(-10, -14 - w * 10, 0, -4); g.fill();
  g.beginPath(); g.arc(0, -2, 5, 0, 6.283); g.moveTo(-4, -6); g.lineTo(-3, -11); g.lineTo(-1, -6); g.moveTo(4, -6); g.lineTo(3, -11); g.lineTo(1, -6); g.fill(); g.restore(); }
function drawNightSky(g, P) { const R = Math.min(W * .3, H * .16), m = moonCanvas(R), mx = W * .7, my = H * .2;
  g.save(); g.shadowColor = 'rgba(243,230,207,.45)'; g.shadowBlur = 60; g.drawImage(m, mx - R - 1, my - R - 1, m.width / DPR, m.height / DPR); g.restore();
  for (let i = 0; i < 6; i++) { const sp = 30 + hash(i, 5) * 50, x = ((hash(i, 9) * (W + 200) + S.t * sp) % (W + 200)) - 100, y = H * (.08 + .38 * hash(i, 3)) + Math.sin(S.t * 1.7 + i) * 18;
    drawBat(g, x, y, .6 + hash(i, 4) * .6, i % 2 ? '#05030A' : shade(P.bg, -.6), Math.sin(S.t + i) * .15, S.t * (10 + i) + i); } }
function drawFog(g, x0) { const f = fogCanvas(), px = x0 * .7, tile = 600; for (let k = Math.floor(px / tile) - 1; k <= Math.floor((px + viewW) / tile) + 1; k++) g.drawImage(f, x0 + (k * tile - px), WH - 360); }
function drawLantern(g, x, y, seed) { g.fillStyle = '#3A6B2A'; g.fillRect(x - 3, y - 20, 6, 8); g.fillStyle = '#FF7A1A'; g.beginPath(); g.ellipse(x, y, 18, 15, 0, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(120,40,0,.55)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 7, 15, 0, 0, 6.283); g.stroke();
  const fl = .75 + .25 * Math.sin(S.t * 9 + seed); g.save(); g.shadowColor = HWC.glow; g.shadowBlur = 14 * fl; g.fillStyle = `rgba(255,214,90,${.85 * fl + .15})`; g.beginPath();
  g.moveTo(x - 10, y - 2); g.lineTo(x - 5, y - 9); g.lineTo(x - 2, y - 2); g.moveTo(x + 10, y - 2); g.lineTo(x + 5, y - 9); g.lineTo(x + 2, y - 2);
  g.moveTo(x - 11, y + 4); g.lineTo(x - 6, y + 9); g.lineTo(x - 3, y + 5); g.lineTo(x, y + 10); g.lineTo(x + 3, y + 5); g.lineTo(x + 6, y + 9); g.lineTo(x + 11, y + 4); g.closePath(); g.fill(); g.restore(); }
function drawWeb(g, o, P) { g.save(); g.strokeStyle = P.ink; g.globalAlpha *= .35; g.lineWidth = 1.5; const R = o.R - o.th / 2;
  for (let k = 0; k < 8; k++) { const a = o.rot * .3 + k * .785; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R); g.stroke(); }
  for (const f of [.35, .65]) { g.beginPath(); for (let k = 0; k <= 8; k++) { const a = o.rot * .3 + k * .785, r = R * f; const px = o.x + Math.cos(a) * r, py = o.y + Math.sin(a) * r; k ? g.quadraticCurveTo(o.x + Math.cos(a - .39) * r * .85, o.y + Math.sin(a - .39) * r * .85, px, py) : g.moveTo(px, py); } g.stroke(); }
  g.restore(); }
function coffin(g, cx0, y, w, h) { g.beginPath(); g.moveTo(cx0 - w * .3, y); g.lineTo(cx0 + w * .3, y); g.lineTo(cx0 + w * .5, y + h * .28); g.lineTo(cx0 + w * .32, y + h); g.lineTo(cx0 - w * .32, y + h); g.lineTo(cx0 - w * .5, y + h * .28); g.closePath(); g.fill();
  g.save(); g.globalAlpha *= .35; g.fillStyle = '#000'; g.fillRect(cx0 - 1.5, y + h * .2, 3, h * .45); g.fillRect(cx0 - w * .2, y + h * .32, w * .4, 3); g.restore(); }
function drawCandy(g, c, P) { g.fillStyle = c; g.beginPath(); g.moveTo(-16, 0); g.lineTo(-32, -12); g.lineTo(-30, 0); g.lineTo(-32, 12); g.closePath(); g.moveTo(16, 0); g.lineTo(32, -12); g.lineTo(30, 0); g.lineTo(32, 12); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(0, 0, 19, 15, 0, 0, 6.283); g.fill(); g.shadowBlur = 0; g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * 9 - 10, -16); g.lineTo(k * 9 + 10, 16); g.stroke(); } g.restore(); g.strokeStyle = HWC.night; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, 0, 19, 15, 0, 0, 6.283); g.stroke(); }
function drawCauldron(g, cs, P) { g.fillStyle = cs[0]; g.beginPath(); g.ellipse(0, -22, 26, 8, 0, 0, 6.283); g.fill(); g.shadowBlur = 0;
  for (let k = 0; k < 3; k++) { const ph = (S.t * 1.6 + k * .33) % 1; g.globalAlpha = 1 - ph; g.beginPath(); g.arc(-12 + k * 12, -26 - ph * 30, 4 + k, 0, 6.283); g.fill(); } g.globalAlpha = 1;
  g.fillStyle = '#0A070D'; g.beginPath(); g.moveTo(-30, -22); g.quadraticCurveTo(-38, 18, 0, 22); g.quadraticCurveTo(38, 18, 30, -22); g.closePath(); g.fill(); g.fillRect(-20, 18, 6, 10); g.fillRect(14, 18, 6, 10);
  g.strokeStyle = P.ink; g.globalAlpha = .4; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; g.fillStyle = '#1F1726'; g.fillRect(-33, -26, 66, 7); g.fillStyle = cs[1]; g.fillRect(-12, -4, 24, 12); g.fillStyle = HWC.night; g.font = '10px "Archivo Black"'; g.textAlign = 'center'; g.fillText('INK', 0, 6); }
function drawDrip(g, o, len, wk) { const w = o.w * wk; g.fillStyle = o.c; g.strokeStyle = o.c; g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x, o.y + len); g.stroke();
  g.beginPath(); g.ellipse(o.x, o.y + len, w * .85, w * 1.05, 0, 0, 6.283); g.fill(); g.globalAlpha = .35; g.strokeStyle = '#fff'; g.lineWidth = Math.max(.6, w * .2);
  g.beginPath(); g.moveTo(o.x - w * .2, o.y + 2); g.lineTo(o.x - w * .2, o.y + Math.max(2, len - w * .4)); g.stroke(); g.globalAlpha = 1; }
function edge(p, side, wk) { const h = p.w * wk / 2 * (side > 0 ? p.wl : p.wr); return [p.x + p.nx * h * side, p.y + p.ny * h * side]; }
function drawSeg(g, o, wk) { const a = o.a, b = o.b, [alx, aly] = edge(a, 1, wk), [blx, bly] = edge(b, 1, wk), [brx, bry] = edge(b, -1, wk), [arx, ary] = edge(a, -1, wk);
  if (o.gl) { g.shadowColor = o.c; g.shadowBlur = 20 * wk; }
  g.fillStyle = o.c; g.beginPath(); g.moveTo(alx, aly); g.lineTo(blx, bly); g.lineTo(brx, bry); g.lineTo(arx, ary); g.closePath(); g.fill();
  g.beginPath(); g.arc(b.x, b.y, b.w * wk / 2 * Math.min(b.wl, b.wr), 0, 6.283); g.fill(); g.shadowBlur = 0;
  g.lineCap = 'round'; const bw = Math.min(a.w, b.w) * wk;
  for (let k = 0; k < 6; k++) { const fa = .08 + .84 * hash(o.sid * 7 + k, 99); g.strokeStyle = k % 2 ? o.dk : o.lt; g.globalAlpha = .22 + .22 * hash(o.sid * 13 + k, 7);
    g.lineWidth = Math.max(.6, bw * (.035 + .05 * hash(o.sid + k * 31, 3))); g.beginPath(); g.moveTo(lerp(alx, arx, fa), lerp(aly, ary, fa)); g.lineTo(lerp(blx, brx, fa), lerp(bly, bry, fa)); g.stroke(); }
  g.globalAlpha = .34; g.strokeStyle = '#fff'; g.lineWidth = Math.max(.8, bw * .09);
  g.beginPath(); g.moveTo(lerp(alx, arx, .2), lerp(aly, ary, .2)); g.lineTo(lerp(blx, brx, .2), lerp(bly, bry, .2)); g.stroke(); g.globalAlpha = 1; }
function drawBlob(g, o, wk) { const R = mulberry(o.seed), r = o.r * wk, n = 96, ph1 = R() * 6.28, ph2 = R() * 6.28, spikes = [], ns = 6 + Math.floor(R() * 7);
  for (let i = 0; i < ns; i++) spikes.push([R() * 6.283, .4 + R() * 1.2, .05 + R() * .07]);
  g.fillStyle = o.c; g.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * 6.283; let m = 1 + .16 * Math.sin(3 * a + ph1) + .09 * Math.sin(7 * a + ph2) + .04 * Math.sin(13 * a + ph1 * 2);
    for (const [sa, sl, sw] of spikes) { const da = Math.abs(((a - sa + 9.4248) % 6.2832) - 3.1416); if (da < sw * 2.5) m += sl * (1 - da / (sw * 2.5)) ** 2; }
    const px = o.x + Math.cos(a) * r * m, py = o.y + Math.sin(a) * r * m; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fill();
  for (const [sa, sl] of spikes) if (R() < .65) { const d = r * (1.35 + sl + R() * .4); g.beginPath(); g.arc(o.x + Math.cos(sa) * d, o.y + Math.sin(sa) * d, r * (.05 + R() * .08), 0, 6.283); g.fill(); }
  const k = 5 + Math.floor(R() * 7); for (let i = 0; i < k; i++) { const a = R() * 6.283, d = r * (1.5 + R() * 1.4), rr = r * (.06 + R() * .16); g.beginPath(); g.ellipse(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, rr * 1.5, rr, a, 0, 6.283); g.fill(); }
  g.globalAlpha = .28; g.fillStyle = o.dk; g.beginPath(); g.arc(o.x + r * .12, o.y + r * .14, r * .55, 0, 6.283); g.fill();
  g.globalAlpha = .35; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(o.x - r * .32, o.y - r * .36, r * .34, r * .13, -.6, 0, 6.283); g.fill(); g.globalAlpha = 1; }
/* ---------- input ---------- */
function press() { if (S.state !== 'play') return; S.holding = true; }
function release() { if (S.state !== 'play') return; S.holding = false;
  if (S.pin) { S.pin = null; S.started = true; S.air = 0; S.lowY = S.p.y; vibrate(6); } }
S.press = press; S.release = release;
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const isUI = e => e.target.closest && e.target.closest('button,.panel.show');
addEventListener('pointerdown', e => { if (!isUI(e)) { e.preventDefault(); press(); } }, { passive: false });
addEventListener('pointerup', e => { if (!isUI(e)) release(); });
addEventListener('pointercancel', release);
addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) { if (S.state === 'over') return newRun(S.mode); press(); } } });
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') release(); });
addEventListener('contextmenu', e => e.preventDefault());

/* ---------- physics ---------- */
function candidate() { let best = null, bd = GRAB_R;
  for (const pn of S.pins) { if (pn.x < S.p.x - 30) continue; if (pn.x > S.p.x + GRAB_R) break;
    const d = Math.hypot(pn.x - S.p.x, pn.y - S.p.y); if (d < bd && pn.y < S.p.y + 60) { bd = d; best = pn; } }
  return best; }
function grab(pn) {
  S.pin = pn; S.lastPin = pn; S.L = Math.hypot(S.p.x - pn.x, S.p.y - pn.y); S.grabs++; if (S.chill) S.cur = (S.cur + 1) % NC;
  pushTrail(true);
  const near = S.lowY > WH - 170, clean = S.L < 250 && Math.abs(S.p.x - pn.x) < 170;
  let txt = null, add = 0;
  if (near) { add = 3; txt = 'CLOSE CALL +3'; } else if (clean) { add = 1; txt = 'CLEAN +1'; }
  if (add) { S.bonus += add; toast(txt, color()); }
  splat(S.p.x, S.p.y, color(), near ? 1.6 : 1); S.shake = near ? 14 : 7; sfx.splat(near ? 1.3 : 1); vibrate(near ? 25 : 12);
  if (S.grabs === 2) { store.set('inkswing.seen', true); $('hint').classList.add('hidden'); }
}
function splat(x, y, c, k = 1) {
  const m = !!pal().blend; paint({ t: 'b', x, y, r: 22 * k, c, dk: shade(c, -.4), seed: (Math.random() * 1e9) | 0, m, bx0: x - 140 * k, bx1: x + 140 * k });
  if (HW) for (let i = 0; i < 2 + k * 2 && S.drips.length < 14; i++) S.drips.push({ x: x + (Math.random() - .5) * 40 * k, y: y + 10 * k, len: 0, max: 40 + Math.random() * 120 * k, v: 60 + Math.random() * 70, w: 4 + Math.random() * 6 * k, c, m });
  const n = Math.min(Math.round(16 * k), MAXP - S.parts.length);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 160 + Math.random() * 520 * Math.sqrt(k);
    S.parts.push({ x, y, vx: Math.cos(a) * s + S.v.x * .25, vy: Math.sin(a) * s + S.v.y * .25 - 120, r: 2 + Math.random() * 6, c, m, life: .25 + Math.random() * .55 }); }
}
function deathSplash() { const x = S.p.x, y = S.cause === 'obstacle' ? S.p.y : WH - 30, cs = pal().cols, c = color(); splat(x, y, c, 3.2); splat(x - 90, y - 40, cs[(S.cur + 1) % NC], 1.4);
  for (let i = 0; i < 50 && S.parts.length < MAXP; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, s = 500 + Math.random() * 900;
    S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3 + Math.random() * 8, c: cs[i % cs.length], m: false, life: .4 + Math.random() * .8 }); }
  for (let i = 0; i < 11; i++) S.sdrips.push({ x: Math.random() * W, len: 0, max: H * (.2 + Math.random() * .6), v: 260 + Math.random() * 520, w: 6 + Math.random() * 18, c: i % 3 ? c : cs[i % cs.length], d: Math.random() * .25 }); }
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
    stepObstacles(dt); if (S.state !== 'play') return;
    for (const cn of S.cans) if (!cn.got && Math.hypot(cn.x - p.x, cn.y - p.y) < 70) collect(cn);
    p.x += v.x * dt; p.y += v.y * dt;
    if (S.pin) { const dx = p.x - S.pin.x, dy = p.y - S.pin.y, r = Math.hypot(dx, dy);
      if (r > S.L) { const nx = dx / r, ny = dy / r; p.x = S.pin.x + nx * S.L; p.y = S.pin.y + ny * S.L; const vr = v.x * nx + v.y * ny; if (vr > 0) { v.x -= nx * vr; v.y -= ny * vr; } } }
    if (p.y < 30) { p.y = 30; if (v.y < 0) v.y *= -.3; }
    pushTrail();
    S.maxX = Math.max(S.maxX, p.x);
    const sc = Math.floor((S.maxX - S.startX) / 120) + S.bonus;
    if (sc !== S.score) { S.score = sc; const e = $('score'); e.textContent = sc; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump');
      const pi = Math.floor(sc / 10); if (pi !== S.palIdx) { sfx.chime(); S.prevPal = S.palIdx; S.palIdx = pi; S.palT = 0; setPalLabel(); toast(pal().name.toUpperCase(), pal().cols[0]); splat(p.x, p.y, pal().cols[0], 1.3); } }
    genPins(S.pins.length + (S.pins[S.pins.length - 1].x < p.x + 2500 ? 4 : 0));
    const opening = S.grabs < 3;
    if (opening && p.y > WH + 120) { const pn = S.lastPin || S.pin || S.pins[0]; S.pin = pn; S.L = 200; p.x = pn.x; p.y = pn.y + 200; v.x = 160; v.y = 0; S.air = 0; S.last = null; pushTrail(true);
      splat(p.x, p.y, pal().cols[0], .8); toast('TRY AGAIN', pal().cols[0]); vibrate(10); }
    else if (p.y > WH + 120 || (!opening && p.x < S.cam - 120)) die();
  }
  S.palT = Math.min(1, S.palT + dt * 1.5);
  for (const q of S.parts) { q.vy += G * .7 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    if (q.life <= 0 && q.y < WH && q.y > 0) paint({ t: 'd', x: q.x, y: q.y, r: q.r * .8, a: Math.atan2(q.vy, q.vx), c: q.c, m: q.m, bx0: q.x - 20, bx1: q.x + 20 }); }
  S.parts = S.parts.filter(q => q.life > 0);
  for (const d of S.drips) { d.len += d.v * dt; d.v *= Math.pow(.35, dt); if (d.len >= d.max || d.v < 8) { d.max = d.len; d.done = true; paint({ t: 'r', ...d, bx0: d.x - 20, bx1: d.x + 20 }); } }
  S.drips = S.drips.filter(d => !d.done);
  for (const d of S.sdrips) { if ((d.d -= dt) < 0) d.len = Math.min(d.max, d.len + d.v * dt); }
  if (S.state === 'play' && S.last && S.last.w > 16 && Math.hypot(S.v.x, S.v.y) < 260 && (S.poolT -= dt) < 0) { S.poolT = .22; const c = color();
    paint({ t: 'p', x: S.p.x, y: S.p.y, r: S.last.w * .62, c, dk: shade(c, -.4), m: !!pal().blend, bx0: S.p.x - 30, bx1: S.p.x + 30 }); }

  S.shake *= Math.pow(.02, dt);
  const open = S.state === 'play' && S.grabs < 3;
  if (open) { const tg = (S.pin ? S.pin.x : p.x) - viewW * .42; S.cam = lerp(S.cam, tg, Math.min(1, dt * 3)); S.cam = Math.min(Math.max(S.cam, p.x - viewW + 60), p.x - 60); }
  else { const target = p.x - viewW * .32; S.cam = Math.max(S.cam, lerp(S.cam, target, Math.min(1, dt * 6))); }
}
function boostUnlock() { S.boostReached = true; S.boostT = Math.max(S.boostT, 2); toast('INK BOOST!', pal().cols[0]); sfx.boost(); S.shake = 18; vibrate([20, 30, 20, 30, 40]);
  for (let i = 0; i < 4; i++) splat(S.p.x + (Math.random() - .5) * 200, S.p.y + (Math.random() - .5) * 200, pal().cols[i % pal().cols.length], 1.4);
  const sb = $('score'); sb.classList.add('boost'); }
function collect(cn) { cn.got = true; stamp(cn.x, cn.y, true); S.boostT = 2.6; S.boostCount++; const sp = Math.hypot(S.v.x, S.v.y) || 1;
  S.v.x = S.v.x / sp * Math.max(sp * 1.3, 1100) + 250; S.v.y = S.v.y / sp * Math.max(sp * 1.3, 1100) - 200;
  if (!S.boostReached) { boostUnlock(); toast('FIRST INK BOOST!', pal().cols[0]); }
  else toast('INK BOOST!', pal().cols[S.boostCount % pal().cols.length]); sfx.boost(); S.shake = 12; vibrate(30); splat(cn.x, cn.y, pal().cols[0], 1.5); }
function die() { sfx.death(); swish(0, false); deathSplash();
  S.state = 'dead'; S.shake = 22; vibrate([30, 40, 60]);
  const key = (S.mode === 'daily' ? 'inkswing.best.daily.' + today() : 'inkswing.best') + (S.chill ? '.chill' : '');
  S.best = Math.max(store.get(key, 0), S.score); store.set(key, S.best);
  if (S.mode === 'random') $('bestStart').textContent = S.best;
  setTimeout(gameOver, 1250);
}
async function gameOver() {
  S.state = 'over';
  $('finalScore').textContent = S.score; $('overBest').textContent = `Best ${S.best}`;
  $('overMode').textContent = (S.chill ? 'Chill · ' : '') + (S.mode === 'daily' ? `Daily seed · ${today()}` : 'Random run');
  $('hud').classList.add('hidden'); $('hint').classList.add('hidden'); $('over').classList.add('show');
  $('posterPrev').removeAttribute('src');
  S.poster = await makePoster(); $('posterPrev').src = URL.createObjectURL(S.poster);
}

/* ---------- rendering ---------- */
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
  if (HW) { g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); drawNightSky(g, P); g.restore(); drawFog(g, x0); }
  else { g.save(); g.translate(S.cam * .5, 0); drawDeco(g, x0 * .5, x0 * .5 + viewW, P, t); if (t < 1) drawDeco(g, x0 * .5, x0 * .5 + viewW, Q, 1 - t); g.restore(); }
  for (let i = Math.floor(x0 / CW); i <= Math.floor(x1 / CW); i++) { const c = S.chunks.get(i); if (c) g.drawImage(c, i * CW, 0, CW, WH); }
  const keep = Math.floor(x0 / CW) - 1; for (const i of [...S.chunks.keys()]) if (i < keep) { S.chunks.delete(i); S.minChunk = Math.max(S.minChunk, i + 1); }
  for (const d of S.drips) { g.globalCompositeOperation = d.m ? 'multiply' : 'source-over'; drawDrip(g, d, d.len, 1); } g.globalCompositeOperation = 'source-over';
  // pins
  const cand = !S.pin && S.state === 'play' && S.started ? candidate() : null;
  for (const pn of S.pins) { if (pn.x < x0 - 40 || pn.x > x1 + 40) continue;
    if (pn === cand) { g.strokeStyle = P.cols[0]; g.lineWidth = 4; g.setLineDash([10, 8]); g.lineDashOffset = -S.t * 40; g.beginPath(); g.arc(pn.x, pn.y, 30 + Math.sin(S.t * 10) * 3, 0, 6.28); g.stroke(); g.setLineDash([]); }
    if (HW) drawLantern(g, pn.x, pn.y, pn.x); else { g.fillStyle = P.ink; g.beginPath(); g.arc(pn.x, pn.y, PIN_R, 0, 6.28); g.fill(); g.fillStyle = P.bg; g.beginPath(); g.arc(pn.x, pn.y, 4, 0, 6.28); g.fill(); } }
  for (const cn of S.cans) { if (cn.got || cn.x < x0 - 60 || cn.x > x1 + 60) continue; const by = cn.y + Math.sin(S.t * 4 + cn.x) * 8, cs = P.cols;
    g.save(); g.translate(cn.x, by); g.rotate(Math.sin(S.t * 3 + cn.x) * .15); g.shadowColor = cs[0]; g.shadowBlur = 26 + Math.sin(S.t * 8) * 8; if (HW) { drawCauldron(g, cs, P); g.restore(); continue; }
    g.fillStyle = P.ink; g.fillRect(-24, -30, 48, 60); g.shadowBlur = 0; for (let k = 0; k < 3; k++) { g.fillStyle = cs[k % cs.length]; g.fillRect(-24, -14 + k * 10, 48, 10); }
    g.fillStyle = '#C9C9C9'; g.fillRect(-26, -34, 52, 8); g.strokeStyle = P.ink; g.lineWidth = 4; g.beginPath(); g.arc(0, -36, 16, Math.PI, 0); g.stroke();
    g.fillStyle = cs[0]; g.beginPath(); g.ellipse(14, -34, 9, 5, 0, 0, 6.28); g.fill(); g.restore(); }
  drawObstacles(g, x0, x1, P);
  // rope
  const p = S.p;
  if (S.pin && S.state !== 'over') { g.strokeStyle = P.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(S.pin.x, S.pin.y); g.lineTo(p.x, p.y); g.stroke(); }
  // particles
  for (const q of S.parts) { const sp = Math.hypot(q.vx, q.vy), st = 1 + Math.min(2.2, sp / 600); g.fillStyle = q.c; g.beginPath(); g.ellipse(q.x, q.y, q.r * st, q.r / Math.sqrt(st), Math.atan2(q.vy, q.vx), 0, 6.283); g.fill(); }
  // brush: handle points toward pin (or opposite of velocity in the air)
  let ang = S.pin ? Math.atan2(S.pin.y - p.y, S.pin.x - p.x) : Math.atan2(-S.v.y, -S.v.x) * .4 + (-Math.PI / 2) * .6;
  g.save(); g.translate(p.x, p.y); g.rotate(ang);
  g.fillStyle = '#C8102E'; g.fillRect(34, -7, 70, 14); g.fillStyle = P.ink; g.beginPath(); g.arc(104, 0, 7, -1.57, 1.57); g.fill();
  g.fillStyle = '#B9B9B9'; g.fillRect(14, -10, 22, 20);
  g.fillStyle = color(); g.beginPath(); g.moveTo(16, -11); g.quadraticCurveTo(-6, -14, -22, 0); g.quadraticCurveTo(-6, 14, 16, 11); g.closePath(); g.fill();
  g.restore();
  if (S.sdrips.length) { g.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const d of S.sdrips) { g.fillStyle = g.strokeStyle = d.c; g.beginPath(); g.ellipse(d.x, 0, d.w * 1.8, d.w * 1.2 + d.len * .08, 0, 0, 6.283); g.fill();
      if (d.len > 0) { g.lineCap = 'round'; g.lineWidth = d.w; g.beginPath(); g.moveTo(d.x, 0); g.lineTo(d.x, d.len); g.stroke(); g.beginPath(); g.ellipse(d.x, d.len, d.w * .8, d.w, 0, 0, 6.283); g.fill();
        g.globalAlpha = .3; g.strokeStyle = '#fff'; g.lineWidth = d.w * .2; g.beginPath(); g.moveTo(d.x - d.w * .22, 4); g.lineTo(d.x - d.w * .22, Math.max(4, d.len - d.w * .5)); g.stroke(); g.globalAlpha = 1; } }
    g.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * -S.cam * scale, 0); }
  if (S.state === 'play' && !S.started) { g.fillStyle = P.ink; g.font = `34px "Archivo Black",Impact,sans-serif`; g.textAlign = 'center'; g.fillText('RELEASE TO FLING →', S.pins[0].x + 40, S.pins[0].y - 60); }
}

/* ---------- poster ---------- */
async function makePoster() {
  try { await document.fonts.load('80px "Archivo Black"'); } catch {}
  const Wp = 1080, Hp = 1920, c = document.createElement('canvas'); c.width = Wp; c.height = Hp; const g = c.getContext('2d');
  const P0 = PALETTES[0], F = '"Archivo Black",Impact,sans-serif';
  const PC = HW ? { bg: '#120A1C', ink: '#F3E6CF', acc: '#FF7A1A', art: '#0B0612' } : { bg: P0.bg, ink: PC.ink, acc: PC.acc, art: PC.art };
  g.fillStyle = PC.bg; g.fillRect(0, 0, Wp, Hp);
  if (HW) { const m = moonCanvas(150); g.save(); g.shadowColor = 'rgba(243,230,207,.5)'; g.shadowBlur = 80; g.drawImage(m, 800, 215, 240, 240); g.restore(); for (let i = 0; i < 3; i++) drawBat(g, 600 + i * 95, 445 - (i % 2) * 18, 1.1 + (i % 2) * .3, '#F3E6CF', (i - 1) * .15, i * 2); }
  // header
  g.fillStyle = PC.ink; g.font = `190px ${F}`; g.textAlign = 'left'; g.fillText('INK', 54, 220); g.fillStyle = PC.acc; g.fillText('SWING', 54, 400); if (HW) { g.fillStyle = PC.ink; g.font = `34px ${F}`; g.fillText('HALLOWEEN EDITION', 60, 445); g.font = `190px ${F}`; }
  g.fillStyle = PC.ink; g.font = `bold 26px system-ui,sans-serif`; g.textAlign = 'right';
  g.fillText((S.chill ? 'CHILL MODE · ' : 'OBSTACLE MODE · ') + (S.mode === 'daily' ? `DAILY ${today()}` : `RUN #${String(S.seed % 100000).padStart(5, '0')}`), Wp - 60, 90);
  g.fillText(`${S.grabs} GRABS · ${S.cleared} OBSTACLES CLEARED`, Wp - 60, 128); if (S.boostReached) { g.fillStyle = PC.acc; g.fillText(`★ INK BOOST REACHED${S.boostCount ? ` · ${S.boostCount} CANS` : ''}`, Wp - 60, 204); g.fillStyle = PC.ink; } g.fillText(PALETTES.slice(0, Math.min(4, S.palIdx + 1)).map(p => p.name.toUpperCase()).join(' / '), Wp - 60, 166);
  // art: the whole trail, wrapped into stacked strips like lines of text
  const ax = 60, ay = HW ? 480 : 450, aw = 960, ah = HW ? 1020 : 1050;
  g.fillStyle = PC.art; g.fillRect(ax, ay, aw, ah);
  const pts = S.trail; let mn = Infinity, mx = -Infinity, my = Infinity, My = -Infinity; for (const q of pts) { mn = Math.min(mn, q.x); mx = Math.max(mx, q.x); my = Math.min(my, q.y); My = Math.max(My, Math.min(WH + 60, q.y)); }
  for (const o of S.ops) if (o.t === 'k') { my = Math.min(my, o.y - o.r); My = Math.max(My, Math.min(WH, o.y + o.r)); }
  const HY = Math.max(380, My - my + 160), y0 = my - 80;
  const L = Math.max(400, mx - mn + 80), n = Math.max(1, Math.round(Math.sqrt(L * ah / (aw * HY)))), sw = L / n, sh = ah / n, s = Math.min(aw / sw, sh / HY);
  for (let i = 0; i < n; i++) { g.save(); g.beginPath(); g.rect(ax, ay + i * sh, aw, sh); g.clip();
    g.translate(ax + (aw - sw * s) / 2, ay + i * sh + (sh - HY * s) / 2); g.scale(s, s); g.translate(-(mn - 40 + i * sw), -y0);
    const wk = Math.max(1, 1.1 / s), sx0 = mn - 40 + i * sw - 200, sx1 = sx0 + sw + 400;
    for (const o of S.ops) if (o.t === 'k' && o.bx1 > sx0 && o.bx0 < sx1) drawOp(g, o, 1); // stamps form the background composition
    for (const o of S.ops) if (o.t !== 'k' && o.bx1 > sx0 && o.bx0 < sx1) drawOp(g, o, wk); g.restore();
    if (i) { g.fillStyle = PC.ink; g.fillRect(ax, ay + i * sh - 1, aw, 2); } }
  g.strokeStyle = PC.ink; g.lineWidth = 6; g.strokeRect(ax, ay, aw, ah);
  // footer
  g.fillStyle = PC.ink; g.textAlign = 'left'; g.font = `260px ${F}`; g.fillText(S.score, 48, 1770);
  const sw2 = g.measureText(String(S.score)).width;
  g.font = `bold 30px system-ui,sans-serif`; g.fillText('POINTS', 60 + sw2, 1600); g.fillStyle = PC.acc; g.fillText(`BEST ${S.best}`, 60 + sw2, 1645);
  g.fillStyle = PC.ink; g.textAlign = 'center'; g.font = `44px ${F}`; g.fillText('CAN YOU OUT-SWING ME?', Wp / 2, 1865);
  if (HW) { drawLantern(g, Wp - 150, 1660, 1); g.save(); g.translate(Wp - 150, 1660); g.scale(4, 4); g.translate(-(Wp - 150), -1660); drawLantern(g, Wp - 150, 1660, 1); g.restore(); g.strokeStyle = PC.acc; g.lineWidth = 3; g.setLineDash([18, 12]); g.strokeRect(24, 24, Wp - 48, Hp - 48); g.setLineDash([]); }
  else { g.fillStyle = '#F4C430'; g.beginPath(); g.arc(Wp - 140, 1640, 70, 0, 6.28); g.fill(); g.fillStyle = '#1F4FA3'; g.fillRect(Wp - 250, 1660, 90, 90); }
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
if (HW) { document.body.classList.add('hw'); document.querySelector('.hb-logo img').src = 'img/logo-B-halloween.webp'; document.querySelector('#over h2').innerHTML = 'BOO!<br>INKED OUT'; (document.querySelector('.sub')||{}).textContent = 'Halloween Edition · Swing. Release. Paint the night.'; }
$('btnTheme').innerHTML = HW ? '🎃 <b>HALLOWEEN</b> EDITION' : '🎨 <b>CLASSIC</b> EDITION'; $('btnTheme').title = 'Switch to ' + (HW ? 'Classic' : 'Halloween');
$('btnTheme').onclick = () => { localStorage.setItem('inkswing.theme', HW ? 'classic' : 'halloween'); location.reload(); };
document.body.classList.add('onstart');
$('btnMenu').onclick = () => { document.body.classList.add('onstart'); $('over').classList.remove('show'); $('start').classList.add('show'); S.state = 'menu'; };
const modeUI = () => { const k = 'inkswing.best' + (S.chill ? '.chill' : ''); $('bestStart').textContent = store.get(k, 0); $('bestLabel').textContent = S.chill ? 'BEST · CHILL' : 'BEST · OBSTACLES';
  const c = $('btnChill'); c.classList.toggle('on', S.chill); c.setAttribute('aria-pressed', S.chill); $('chillState').textContent = S.chill ? 'ON' : 'OFF';
  $('chillSub').textContent = S.chill ? 'On: no obstacles, just paint' : 'No obstacles, just paint'; };
const P0 = PALETTES[0]; $('palLabel').textContent = 'PALETTE · ' + P0.name.toUpperCase(); $('palDots').innerHTML = [...new Set([...P0.cols, P0.ink])].slice(0, 4).map(c => `<i style="background:${c}"></i>`).join('');
const scoreSheet = () => { const t = today(), rows = [['Obstacles', 'inkswing.best'], ['Chill', 'inkswing.best.chill'], ['Daily · Obstacles', 'inkswing.best.daily.' + t], ['Daily · Chill', 'inkswing.best.daily.' + t + '.chill']];
  $('scoreList').innerHTML = rows.map(([n, k]) => `<li>${n}<b>${store.get(k, 0)}</b></li>`).join(''); $('scores').hidden = false; };
$('btnScoresClose').onclick = () => { $('scores').hidden = true; };
if (!(window.InkNative && InkNative.native)) $('btnLeaders').onclick = scoreSheet;
$('btnChill').onclick = () => { S.chill = !S.chill; localStorage.setItem('inkswing.chill', S.chill ? '1' : '0'); modeUI(); }; modeUI();
$('dailyTag').textContent = `${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · same course for all`;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
