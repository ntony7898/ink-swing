/* Ink Swing — one-tap swinger that paints a poster. No dependencies. */
(() => {
'use strict';
const WH = 1100, G = 1900, PUMP = 260, GRAB_R = 430, STEP = 1 / 120, MAXV = 1700, PIN_R = 11;
const PALETTES = [
  { name: 'Bauhaus', bg: '#F1E9DA', ink: '#141414', cols: ['#E63A2E', '#1F4FA3', '#F4C430', '#141414'], deco: 'bauhaus' },
  { name: 'Swiss', bg: '#F4F4F0', ink: '#111111', cols: ['#E30613', '#111111', '#8C8C8C'], deco: 'swiss' },
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

/* ---------- audio: pre-rendered WAVs (sfx/) via Web Audio, HTMLAudio fallback, robust iOS/Android unlock ---------- */
const A = { ctx: null, muted: store.get('inkswing.muted', false) === true, buf: {}, html: {}, vol: .8 };
const SFX = ['splat1', 'splat2', 'splat3', 'splash', 'drip1', 'drip2', 'chime', 'boost', 'swish'];
function loadBuffers() { for (const n of SFX) fetch(`sfx/${n}.wav`).then(r => r.arrayBuffer()).then(ab => new Promise((ok, no) => {
  const p = A.ctx.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); })).then(b => { A.buf[n] = b; if (n === 'swish') startSwish(); }).catch(() => {}); }
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
  splat: (k = 1) => play('splat' + (1 + Math.floor(Math.random() * 3)), .75 * k * rv(.1), rv(.08)),
  death: () => { play('splash', 1, rv(.05)); const n = 4 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) play(Math.random() < .5 ? 'drip1' : 'drip2', .45 * rv(.3), rv(.25), .3 + i * .16 + Math.random() * .14); },
  chime: () => play('chime', .55), boost: () => play('boost', .65),
};
function startSwish() { if (!A.ctx || A.swSrc || !A.buf.swish) return; const s = A.swSrc = A.ctx.createBufferSource(); s.buffer = A.buf.swish; s.loop = true; s.connect(A.swF); s.start(); }
function swish(speed, on) { if (!live() || !A.swSrc) return; const t = A.ctx.currentTime, k = on ? Math.min(1, speed / 1700) : 0;
  A.swG.gain.setTargetAtTime(k * k * .5, t, .09); A.swF.frequency.setTargetAtTime(350 + speed * 1.1, t, .09); A.swSrc.playbackRate.setTargetAtTime(.85 + k * .35, t, .1); }
function setMute(m) { A.muted = !!m; store.set('inkswing.muted', A.muted); const b = document.getElementById('mute'); b.textContent = A.muted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', A.muted);
  if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : A.vol, A.ctx.currentTime, .03); if (A.tag && A.muted) A.tag.pause(); }
window.__audio = A;

/* ---------- state ---------- */
const S = { state: 'menu', mode: 'random', seed: 1 };
window.__is = S; // test hook
function genPins(upTo) {
  while (S.pins.length < upTo) {
    const i = S.pins.length, last = S.pins[i - 1], r = S.rng;
    const gap = 215 + Math.min(175, i * 4) + r() * (50 + Math.min(130, i * 3));
    const vari = 110 + Math.min(300, i * 9);
    const y = Math.max(130, Math.min(600, 300 + (r() - .5) * vari));
    S.pins.push({ x: last.x + gap, y }); genObstacle(i, last, gap, y);
    if (S.boostReached && Math.random() < .3) S.cans.push({ x: last.x + gap * (.4 + Math.random() * .2), y: Math.min(820, Math.max(last.y, y) + 120 + Math.random() * 220), got: false });
  }
}
function newRun(mode) {
  S.mode = mode; S.seed = mode === 'daily' ? +today() : (Math.random() * 1e9) | 0;
  S.rng = mulberry(S.seed);
  S.obs = []; S.orbs = []; S.cur = 0; S.cleared = 0; S.cause = ''; S.pins = [{ x: 260, y: 300 }]; genPins(12);
  S.p = { x: 120, y: 470 }; S.v = { x: 0, y: 0 };
  S.pin = S.pins[0]; S.L = Math.hypot(S.p.x - 260, S.p.y - 300);
  S.holding = true; S.startX = S.p.x; S.maxX = S.p.x; S.bonus = 0; S.score = 0; S.palIdx = 0; S.palT = 1; S.prevPal = 0;
  S.colIdx = 0; S.trail = []; S.parts = []; S.ops = []; S.chunks = new Map(); S.minChunk = -99; S.k = Math.min(1.25, DPR * scale); S.drips = []; S.sdrips = []; S.sid = 0; S.poolT = 0; S.last = null; S.passed = 0; S.shake = 0; S.cam = 0; S.air = 0; S.lowY = 0; S.grabs = 0; S.t = 0;
  S.trailStart = 0; S.cans = []; S.boostT = 0; S.boostReached = false; S.boostCount = 0; S.state = 'play'; S.started = false; S.deadT = 0; S.poster = null;
  $('score').textContent = '0'; $('score').classList.remove('boost'); setPalLabel();
  $('hud').classList.remove('hidden'); $('start').classList.remove('show'); $('over').classList.remove('show');
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
  if (w > 18 && Math.random() < .06 && S.drips.length < 10) S.drips.push({ x: p.x + (Math.random() - .5) * w * .4, y: p.y + w * .3, len: 0, max: 25 + Math.random() * 110, v: 50 + Math.random() * 60, w: w * (.16 + Math.random() * .12), c, m });
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
function drawStamp(g, o) { g.globalCompositeOperation = 'multiply';
  for (const [c, dx, dy, al] of [[o.c, 0, 0, .78], [o.c2, o.off, -o.off * .6, .38]]) { g.save(); g.translate(o.x + dx, o.y + dy); g.rotate(o.rot); g.globalAlpha = al; g.fillStyle = c; stampPath(g, o); g.fill('evenodd'); g.restore(); }
  g.globalAlpha = 1; }
function stamp(x, y, big, opt = {}) { const P = pal(), cs = P.cols, i = opt.ci ?? Math.floor(Math.random() * cs.length);
  const shapes = { bauhaus: ['ring', 'half', 'tri'], swiss: ['cross', 'gate', 'cross'], riso: ['ring', 'burst', 'half'], memphis: ['tri', 'gate', 'burst', 'ring'] }[P.deco];
  const r = big ? 150 + Math.random() * 70 : 80 + Math.random() * 90, sh = big ? 'burst' : shapes[Math.floor(Math.random() * shapes.length)];
  paint({ t: 'k', x, y, r: opt.r || r, sh: opt.sh || sh, rot: opt.rot ?? (P.deco === 'swiss' ? 0 : (Math.random() - .5) * 1.2), c: cs[i], c2: shade(cs[(i + 1) % cs.length], .5), off: 4 + Math.random() * 5, bx0: x - (opt.r || r) - 12, bx1: x + (opt.r || r) + 12 }); }
/* ---------- obstacles (Color Switch-style) ---------- */
const BR = 10, TOL = 5, NC = 3, GATE_H = 170; // brush radius, generous tolerance, gameplay colors, gate block height
function genObstacle(i, last, gap, y) { const r = S.rng; if (last.x < 1450 || r() > Math.min(.8, .42 + (i - 6) * .02)) return;
  const spd = (.9 + Math.min(1.4, i * .025)) * (r() < .5 ? -1 : 1), x = last.x + gap * .58, kind = ['ring', 'cross', 'gate'][Math.floor(r() * 3)];
  const sh = [0, 1, 2].sort(() => r() - .5);
  let o; if (kind === 'ring') { const R = Math.min(gap * .34, 115 + r() * 40); o = { kind, x, y: Math.min(WH - R - 50, (last.y + y) / 2 + 200 + r() * 80), R, th: 20, cs: [sh[0], sh[1], sh[2], sh[r() * 3 | 0]].slice(0, r() < .5 ? 3 : 4) }; }
  else if (kind === 'cross') { const R = 120 + r() * 40, arms = r() < .4 ? 2 : 4; o = { kind, x, y: Math.min(WH - R - 40, (last.y + y) / 2 + 210 + r() * 70), R, th: 18, arms, cs: arms === 2 ? [sh[0], sh[1]] : [sh[0], sh[1], sh[2], sh[0]] }; }
  else o = { kind, x, y: WH / 2, R: 14, th: 26, cs: sh, off: r() * GATE_H * 3 };
  o.rot = r() * 6.28; o.spd = spd; o.st = 0; o.touched = false; S.obs.push(o);
  S.orbs.push({ x: last.x + 30 + r() * 40, y: Math.min(WH - 120, last.y + 230 + r() * 60), ci: sh[r() * 3 | 0], got: false }); }
function obsColorAt(o, p) { const dx = p.x - o.x, dy = p.y - o.y, hit = o.th / 2 + BR - TOL;
  if (o.kind === 'ring') { const d = Math.hypot(dx, dy); if (Math.abs(d - o.R) > hit) return -1; let a = (Math.atan2(dy, dx) - o.rot) % 6.2832; if (a < 0) a += 6.2832; return o.cs[Math.floor(a / (6.2832 / o.cs.length)) % o.cs.length]; }
  if (o.kind === 'cross') { for (let k = 0; k < o.arms; k++) { const a = o.rot + k * 6.2832 / o.arms, ex = Math.cos(a) * o.R, ey = Math.sin(a) * o.R, t = Math.max(0, Math.min(1, (dx * ex + dy * ey) / (o.R * o.R)));
      if (Math.hypot(dx - ex * t, dy - ey * t) < hit) return o.cs[k]; } return -1; }
  if (Math.abs(dx) > hit) return -1; const n = o.cs.length, m = (((p.y - o.off) % (GATE_H * n)) + GATE_H * n) % (GATE_H * n); return o.cs[Math.floor(m / GATE_H)]; }
function stepObstacles(dt) { const p = S.p;
  for (const o of S.obs) { o.rot += o.spd * dt; if (o.kind === 'gate') o.off += o.spd * 90 * dt;
    if (o.st || o.x > p.x + 300 || o.x < p.x - 400) continue;
    const c = obsColorAt(o, p);
    if (c >= 0) { if (S.boostT > 0) { smash(o); continue; } if (c !== S.cur) { S.cause = 'obstacle'; return die(); }
      if (!o.touched) { o.touched = true; splat(p.x, p.y, color(), .7); sfx.splat(.6); } }
    if (p.x > o.x + (o.kind === 'gate' ? 30 : o.R + 30)) clearObs(o); }
  for (const b of S.orbs) if (!b.got && Math.hypot(b.x - p.x, b.y - p.y) < 46) { b.got = true; S.cur = b.ci; splat(b.x, b.y, color(), .8); sfx.chime(); toast('NEW COLOR', color()); pushTrail(true); }
}
function obsStamp(o) { const P = pal(), sh = o.kind === 'ring' ? 'ring' : o.kind === 'cross' ? (o.arms === 2 ? 'bar' : 'cross') : 'gate';
  stamp(o.x, o.kind === 'gate' ? S.p.y : o.y, false, { sh, r: o.kind === 'gate' ? 110 : o.R + 10, rot: o.kind === 'cross' ? o.rot : P.deco === 'swiss' ? 0 : o.rot * .2, ci: o.cs[0] }); }
function clearObs(o) { o.st = 1; S.cleared++; obsStamp(o); if (o.touched) { S.bonus += 2; toast('CLEAN PASS +2', color()); sfx.chime(); vibrate(10); } }
function smash(o) { o.st = 2; S.cleared++; S.bonus += 2; obsStamp(o); splat(S.p.x, S.p.y, pal().cols[o.cs[0]], 1.6); S.shake = 14; toast('SMASH +2', pal().cols[0]); sfx.splat(1.3); }
function drawObstacles(g, x0, x1, P) { g.lineCap = 'butt';
  for (const o of S.obs) { if (o.st === 2 || o.x < x0 - 200 || o.x > x1 + 200) continue; g.globalAlpha = o.st ? .25 : 1; const col = k => P.cols[k];
    if (o.kind === 'ring') { const n = o.cs.length, seg = 6.2832 / n; g.lineWidth = o.th; for (let k = 0; k < n; k++) { g.strokeStyle = col(o.cs[k]); g.beginPath(); g.arc(o.x, o.y, o.R, o.rot + k * seg + .03, o.rot + (k + 1) * seg - .03); g.stroke(); } }
    else if (o.kind === 'cross') { g.lineWidth = o.th; g.lineCap = 'round'; for (let k = 0; k < o.arms; k++) { const a = o.rot + k * 6.2832 / o.arms; g.strokeStyle = col(o.cs[k]); g.beginPath(); g.moveTo(o.x + Math.cos(a) * 14, o.y + Math.sin(a) * 14); g.lineTo(o.x + Math.cos(a) * o.R, o.y + Math.sin(a) * o.R); g.stroke(); }
      g.fillStyle = P.ink; g.beginPath(); g.arc(o.x, o.y, 12, 0, 6.283); g.fill(); g.lineCap = 'butt'; }
    else { const n = o.cs.length, H = GATE_H * n, start = ((o.off % H) + H) % H - H; for (let yy = start, k = 0; yy < WH; yy += GATE_H, k++) { g.fillStyle = col(o.cs[k % n]); g.fillRect(o.x - o.th / 2, yy + 3, o.th, GATE_H - 6); } }
  }
  g.globalAlpha = 1;
  for (const b of S.orbs) { if (b.got || b.x < x0 - 60 || b.x > x1 + 60) continue; const c = P.cols[b.ci], by = b.y + Math.sin(S.t * 5 + b.x) * 6;
    g.save(); g.translate(b.x, by); g.shadowColor = c; g.shadowBlur = 22; g.fillStyle = c; g.beginPath(); g.moveTo(0, -30); g.bezierCurveTo(16, -10, 20, 4, 20, 10); g.arc(0, 10, 20, 0, Math.PI); g.bezierCurveTo(-20, 4, -16, -10, 0, -30); g.fill();
    g.shadowBlur = 0; g.strokeStyle = P.ink; g.lineWidth = 3; g.stroke(); g.globalAlpha = .5; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-7, 6, 4, 8, -.4, 0, 6.283); g.fill(); g.restore(); }
}
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
  S.pin = pn; S.L = Math.hypot(S.p.x - pn.x, S.p.y - pn.y); S.grabs++;
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
    while (S.pins[S.passed] && S.pins[S.passed].x < p.x - 60) { const pn = S.pins[S.passed++]; if (S.passed > 1) stamp(pn.x + (Math.random() - .5) * 60, Math.min(WH - 120, pn.y + 160 + Math.random() * 260), false); }
    const sc = Math.floor((S.maxX - S.startX) / 120) + S.bonus;
    if (sc !== S.score) { S.score = sc; const e = $('score'); e.textContent = sc; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump');
      if (sc >= 100 && !S.boostReached) boostUnlock();
      const pi = Math.floor(sc / 10); if (pi !== S.palIdx) { if (sc < 100 || S.boostReached && sc % 100 >= 10) sfx.chime(); S.prevPal = S.palIdx; S.palIdx = pi; S.palT = 0; setPalLabel(); toast(pal().name.toUpperCase(), pal().cols[0]); splat(p.x, p.y, pal().cols[0], 1.3); } }
    genPins(S.pins.length + (S.pins[S.pins.length - 1].x < p.x + 2500 ? 4 : 0));
    if (p.y > WH + 120 || p.x < S.cam - 120) die();
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
  const target = p.x - viewW * .32; S.cam = Math.max(S.cam, lerp(S.cam, target, Math.min(1, dt * 6)));
}
function boostUnlock() { S.boostReached = true; S.boostT = 2; toast('INK BOOST!', pal().cols[0]); sfx.boost(); S.shake = 18; vibrate([20, 30, 20, 30, 40]);
  for (let i = 0; i < 4; i++) splat(S.p.x + (Math.random() - .5) * 200, S.p.y + (Math.random() - .5) * 200, pal().cols[i % pal().cols.length], 1.4);
  const sb = $('score'); sb.classList.add('boost'); }
function collect(cn) { cn.got = true; stamp(cn.x, cn.y, true); S.boostT = 2.6; S.boostCount++; const sp = Math.hypot(S.v.x, S.v.y) || 1;
  S.v.x = S.v.x / sp * Math.max(sp * 1.3, 1100) + 250; S.v.y = S.v.y / sp * Math.max(sp * 1.3, 1100) - 200;
  toast('INK BOOST!', pal().cols[S.boostCount % pal().cols.length]); sfx.boost(); S.shake = 12; vibrate(30); splat(cn.x, cn.y, pal().cols[0], 1.5); }
function die() { sfx.death(); swish(0, false); deathSplash();
  S.state = 'dead'; S.shake = 22; vibrate([30, 40, 60]);
  const key = S.mode === 'daily' ? 'inkswing.best.daily.' + today() : 'inkswing.best';
  S.best = Math.max(store.get(key, 0), S.score); store.set(key, S.best);
  if (S.mode === 'random') $('bestStart').textContent = S.best;
  setTimeout(gameOver, 1250);
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
  for (let i = Math.floor(x0 / CW); i <= Math.floor(x1 / CW); i++) { const c = S.chunks.get(i); if (c) g.drawImage(c, i * CW, 0, CW, WH); }
  const keep = Math.floor(x0 / CW) - 1; for (const i of [...S.chunks.keys()]) if (i < keep) { S.chunks.delete(i); S.minChunk = Math.max(S.minChunk, i + 1); }
  for (const d of S.drips) { g.globalCompositeOperation = d.m ? 'multiply' : 'source-over'; drawDrip(g, d, d.len, 1); } g.globalCompositeOperation = 'source-over';
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
  g.fillStyle = P0.bg; g.fillRect(0, 0, Wp, Hp);
  // header
  g.fillStyle = '#141414'; g.font = `190px ${F}`; g.textAlign = 'left'; g.fillText('INK', 54, 220); g.fillStyle = '#E63A2E'; g.fillText('SWING', 54, 400);
  g.fillStyle = '#141414'; g.font = `bold 26px system-ui,sans-serif`; g.textAlign = 'right';
  g.fillText(S.mode === 'daily' ? `DAILY ${today()}` : `RUN #${String(S.seed % 100000).padStart(5, '0')}`, Wp - 60, 90);
  g.fillText(`${S.grabs} GRABS · ${S.cleared} OBSTACLES CLEARED`, Wp - 60, 128); if (S.boostReached) { g.fillStyle = '#E63A2E'; g.fillText(`★ INK BOOST REACHED${S.boostCount ? ` · ${S.boostCount} CANS` : ''}`, Wp - 60, 204); g.fillStyle = '#141414'; } g.fillText(PALETTES.slice(0, Math.min(4, S.palIdx + 1)).map(p => p.name.toUpperCase()).join(' / '), Wp - 60, 166);
  // art: the whole trail, wrapped into stacked strips like lines of text
  const ax = 60, ay = 450, aw = 960, ah = 1050;
  g.fillStyle = '#FFFFFF'; g.fillRect(ax, ay, aw, ah);
  const pts = S.trail; let mn = Infinity, mx = -Infinity, my = Infinity, My = -Infinity; for (const q of pts) { mn = Math.min(mn, q.x); mx = Math.max(mx, q.x); my = Math.min(my, q.y); My = Math.max(My, Math.min(WH + 60, q.y)); }
  for (const o of S.ops) if (o.t === 'k') { my = Math.min(my, o.y - o.r); My = Math.max(My, Math.min(WH, o.y + o.r)); }
  const HY = Math.max(380, My - my + 160), y0 = my - 80;
  const L = Math.max(400, mx - mn + 80), n = Math.max(1, Math.round(Math.sqrt(L * ah / (aw * HY)))), sw = L / n, sh = ah / n, s = Math.min(aw / sw, sh / HY);
  for (let i = 0; i < n; i++) { g.save(); g.beginPath(); g.rect(ax, ay + i * sh, aw, sh); g.clip();
    g.translate(ax + (aw - sw * s) / 2, ay + i * sh + (sh - HY * s) / 2); g.scale(s, s); g.translate(-(mn - 40 + i * sw), -y0);
    const wk = Math.max(1, 1.1 / s), sx0 = mn - 40 + i * sw - 200, sx1 = sx0 + sw + 400;
    for (const o of S.ops) if (o.t === 'k' && o.bx1 > sx0 && o.bx0 < sx1) drawOp(g, o, 1); // stamps form the background composition
    for (const o of S.ops) if (o.t !== 'k' && o.bx1 > sx0 && o.bx0 < sx1) drawOp(g, o, wk); g.restore();
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
