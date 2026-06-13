// ============================================================
// NEW VISUAL MODES — stackable treatments
// ============================================================
console.log('[IW] visual-modes.js loading · state=' + typeof state + ' EMOTIONS=' + typeof EMOTIONS + ' W=' + typeof W);
const modeState = {
  // Line trace state
  trace: {
    path: [],
    head: { x: 0.5, y: 0.5, a: 0 },
    hue: 200,
  },
  // Flow field particles (persistent)
  flow: [],
  // Mandala ring pulses
  rings: [],
  ringTimer: 0,
  // Curl-noise particles (smoother / more organic than flowField)
  curl: [],
  // Strange-attractor accumulator (single moving point that leaves a trail)
  attractor: { x: 0.1, y: 0.0, type: 0, _last: -1 },
  // Substrate cracks (Tarbell-style branching growth)
  substrate: { cracks: [], grid: null, gridW: 0, gridH: 0, fillCount: 0, capacity: 0 },
  // Reaction-diffusion (Gray-Scott) low-res buffers
  rdLow: { u: null, v: null, _newU: null, _newV: null, w: 0, h: 0, canvas: null, ctx: null, imageData: null },
  // Sumi-e generative ink-wash strokes
  sumie: { strokes: [], _spawnT: 0 },
  // Op Art (Bridget Riley) — phase counter for moving stripes/circles
  opart: { phase: 0, mode: 0, _switchT: 0 },
  // Lissajous oscilloscope curves
  lissa: { phase: 0, freqA: 3, freqB: 4, _switchT: 0 },
  // Voronoi cellular tessellation (low-res buffer)
  voronoi: { seeds: [], canvas: null, ctx: null, imageData: null, w: 0, h: 0 },
  // Boids flocking — bird/fish swarm motion
  boids: [],
  // Chladni nodal-line patterns (audio-reactive)
  chladni: { t: 0, canvas: null, ctx: null, imageData: null },
  // DLA — diffusion-limited aggregation (coral / lightning growth)
  dla: { grid: null, gridW: 0, gridH: 0, fillCount: 0, capacity: 0, walkers: [], colors: [] },
  // Spectrogram waterfall (FFT scrolling)
  spectro: { canvas: null, ctx: null, _freqBuf: null },
  // Metaballs (lava lamp)
  meta: { balls: [], canvas: null, ctx: null },
  // Synthwave / vaporwave grid + sun
  synth: { t: 0 },
  // Conway's Game of Life
  life: { grid: null, next: null, w: 0, h: 0, _t: 0, _resetT: 0 },
  // L-System tree (recursive plant)
  lsys: { _depth: 4, _rule: 0, _t: 0 },
  // Harmonograph (multi-pendulum curves)
  harmono: { t: 0 },
  // Truchet tiles (random tile maze)
  truchet: { t: 0 },
  // N-body gravity simulation
  nbody: { particles: [] },
  // Spirograph (hypotrochoid)
  spiro: { t: 0 },
  // Marbling (paper marble / ebru noise field)
  marbling: { t: 0, canvas: null, ctx: null, imageData: null },
  // Hilbert space-filling curve
  hilbert: { points: null, order: 0, t: 0 },
  // Lenia continuous cellular automaton
  lenia: { grid: null, next: null, w: 0, h: 0, _t: 0, canvas: null, ctx: null, imageData: null, K: null, kSize: 0 },
  // Double pendulum (chaotic trail)
  pendulum: { state: null, trail: [] },
  // Galaxy (logarithmic spiral particle field)
  galaxy: { stars: [] },
  // Penrose tiling (Robinson triangle deflation)
  penrose: { triangles: null, depth: 0 },
  // Newton's pendulum wave (multiple pendulums with different periods)
  pwave: {},
  // Mandelbrot fractal (low-res buffer + slow zoom/pan)
  mandel: { canvas: null, ctx: null, imageData: null, _t: 0 },
  // Wireworld (4-state CA: empty/head/tail/conductor)
  wireworld: { grid: null, next: null, w: 0, h: 0, _t: 0 },
};

function ensureFlow(){
  if(modeState.flow.length === 0){
    for(let i=0;i<160;i++){
      modeState.flow.push({
        x: Math.random()*W, y: Math.random()*H,
        px: 0, py: 0, life: Math.random(),
      });
    }
  }
}

// dominant emotion helpers
function dominantEmo(){
  let dom=null, max=0;
  for(const e of EMOTIONS){ if(state.values[e.id] > max){ max = state.values[e.id]; dom = e; } }
  dom = dom || EMOTIONS.find(e=>e.id==='hope');
  // In lightMode (cream paper canvas), clamp emotion .light to dark range so all
  // downstream HSL-based drawing produces visible content on the bright background.
  // Most emotions sit at light 50-70 (pastels) which vanish on cream — the cap
  // forces 18-22% lightness, which after the typical +20 offset in draw funcs
  // still lands around mid-gray, visible against cream.
  if(state.lightMode){
    return { ...dom, light: Math.min(dom.light, 20) };
  }
  return dom;
}

function drawLineTrace(g, dt, T){
  const t = modeState.trace;
  const speed = (1.5 + state.motionSpeed*2 + (reactor.vol||0)*4) * dt * 0.06;
  const turbN = noise2(t.head.x*4 + state.t*0.0003, t.head.y*4) * (1 + state.turbulence*2);
  t.head.a += turbN * 0.15;
  // tendency to curve back toward center if escaping
  const dx = (CX - t.head.x)/W, dy = (CY - t.head.y)/H;
  const dist = Math.hypot(dx, dy);
  if(dist > 0.42) t.head.a = lerp(t.head.a, Math.atan2(dy, dx), 0.04);
  t.head.x += Math.cos(t.head.a) * speed * SCALE * 10;
  t.head.y += Math.sin(t.head.a) * speed * SCALE * 10;
  // wrap
  if(t.head.x < -20) t.head.x = W+10; if(t.head.x > W+20) t.head.x = -10;
  if(t.head.y < -20) t.head.y = H+10; if(t.head.y > H+20) t.head.y = -10;
  t.path.push({x:t.head.x, y:t.head.y, t:state.t});
  // trim by age
  const maxAge = 7000 + state.trails*8000;
  while(t.path.length > 2 && state.t - t.path[0].t > maxAge) t.path.shift();
  if(t.path.length < 2) return;

  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  g.lineCap='round'; g.lineJoin='round';
  // multi-pass for glow
  const passes = [
    { w: 7*SCALE, a: 0.10 + state.bloom*0.15 },
    { w: 3*SCALE, a: 0.35 },
    { w: 1.2*SCALE, a: 0.95 },
  ];
  for(const pass of passes){
    g.beginPath();
    for(let i=0;i<t.path.length;i++){
      const p = t.path[i];
      const age = (state.t - p.t)/maxAge;
      const alpha = (1-age) * pass.a;
      if(i===0){ g.moveTo(p.x, p.y); continue; }
      // segment color by age
      const h = lerp(dom.hue[0], dom.hue[1], (i/t.path.length + state.t*0.0001)%1);
      g.strokeStyle = `hsla(${h}, ${dom.sat}%, ${dom.light+10}%, ${alpha})`;
      g.lineWidth = pass.w;
      g.beginPath();
      g.moveTo(t.path[i-1].x, t.path[i-1].y);
      g.lineTo(p.x, p.y);
      g.stroke();
    }
  }
  g.restore();
}

function drawFlowField(g, dt, T){
  ensureFlow();
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  const speed = (0.5 + state.motionSpeed*1.5 + (reactor.vol||0)*3);
  for(const p of modeState.flow){
    const ang = noise2(p.x*0.005 + state.t*0.00015, p.y*0.005) * Math.PI * 2 * (1 + state.turbulence*1.5);
    p.px = p.x; p.py = p.y;
    p.x += Math.cos(ang) * speed * SCALE;
    p.y += Math.sin(ang) * speed * SCALE;
    p.life += dt*0.0006;
    if(p.x<0||p.x>W||p.y<0||p.y>H||p.life>1){
      p.x = Math.random()*W; p.y = Math.random()*H; p.px = p.x; p.py = p.y;
      p.life = 0;
    }
    const a = (Math.sin(p.life*Math.PI)) * 0.55 * state.glow;
    const h = lerp(dom.hue[0], dom.hue[1], (p.life + state.t*0.0001)%1);
    g.strokeStyle = `hsla(${h}, ${dom.sat}%, ${dom.light+12}%, ${a})`;
    g.lineWidth = 0.9 + (reactor.mid||0)*1.4;
    g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
  }
  g.restore();
}

// ─── Curl-noise field ─────────────────────────────────────────────────────
// Particles flow along a divergence-free vector field (curl of noise).
// Produces silky, smoke-like motion that breathes with audio.
// Inspired by Bridson 2007 + classic creative-coding implementations.
function ensureCurl(){
  if(modeState.curl.length === 0){
    const N = 420;  // denser field
    for(let i=0;i<N;i++){
      modeState.curl.push({
        x: Math.random()*W, y: Math.random()*H,
        px: 0, py: 0, life: Math.random(), hueOffset: Math.random()*60-30,
      });
    }
  }
}
function _curlVec(x, y, t){
  // Approximate curl of 2D noise: d/dy(N1), -d/dx(N1) using two noise samples.
  const eps = 0.001;
  const n1 = noise2(x + eps, y) - noise2(x - eps, y);
  const n2 = noise2(x, y + eps) - noise2(x, y - eps);
  return { vx: n2 / (2*eps), vy: -n1 / (2*eps) };
}
function drawCurlNoise(g, dt, T){
  ensureCurl();
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const speed = (0.6 + state.motionSpeed*1.4 + (reactor.vol||0)*2.5) * mScale;
  const turb = 1 + state.turbulence*1.2;
  const scale = 0.0018 * turb;
  for(const p of modeState.curl){
    const v = _curlVec(p.x*scale + state.t*0.00008, p.y*scale, state.t*0.0001);
    p.px = p.x; p.py = p.y;
    p.x += v.vx * speed * 90 * SCALE;
    p.y += v.vy * speed * 90 * SCALE;
    p.life += dt*0.00045;
    if(p.x<-20||p.x>W+20||p.y<-20||p.y>H+20||p.life>1){
      // respawn from a random edge or random spot, with a tiny halo
      p.x = Math.random()*W; p.y = Math.random()*H;
      p.px = p.x; p.py = p.y; p.life = 0;
    }
    const a = Math.sin(p.life*Math.PI) * 0.85 * (0.5 + state.glow*0.6);
    const h = lerp(dom.hue[0], dom.hue[1], (p.life + state.t*0.00008)%1) + p.hueOffset;
    g.strokeStyle = `hsla(${h}, ${dom.sat+5}%, ${dom.light+22}%, ${a})`;
    g.lineWidth = 1.4 + (reactor.mid||0)*2.2 + state.bloom*1.2;
    g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
  }
  g.restore();
}

// ─── Strange Attractor ────────────────────────────────────────────────────
// Renders thousands of points per frame from a chaotic 2D iterated map.
// Picks between Clifford / De Jong / Hopalong; coefficients are gently
// modulated by audio + emotion so the figure breathes and morphs.
function drawAttractor(g, dt, T){
  const a = modeState.attractor;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  // Pick attractor variant; cycle every ~30 sec OR on big audio shift
  const cyclePeriod = 30000 / Math.max(0.5, mScale);
  const tnow = state.t;
  if(a._last < 0 || tnow - a._last > cyclePeriod){
    a.type = (a.type + 1) % 3;
    a._last = tnow;
    a.x = 0.1; a.y = 0.0;
  }
  // Time-modulated coefficients
  const ph = tnow * 0.00007;
  const bassMod = (reactor.bass||0) * 0.25;
  const A = 1.4 + Math.sin(ph)*0.4 + bassMod;
  const B = -1.6 + Math.cos(ph*1.3)*0.3;
  const C = 1.0 + Math.sin(ph*0.7)*0.2;
  const D = 0.7 + Math.cos(ph*0.9)*0.2;
  // Center+scale to canvas
  const scale = Math.min(W, H) * 0.32;  // larger figure
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const pointsPerFrame = Math.floor(3500 * mScale * (0.6 + state.motionSpeed*0.6));
  for(let i=0;i<pointsPerFrame;i++){
    let nx, ny;
    if(a.type === 0){
      // Clifford
      nx = Math.sin(A * a.y) + C * Math.cos(A * a.x);
      ny = Math.sin(B * a.x) + D * Math.cos(B * a.y);
    } else if(a.type === 1){
      // De Jong
      nx = Math.sin(A * a.y) - Math.cos(B * a.x);
      ny = Math.sin(C * a.x) - Math.cos(D * a.y);
    } else {
      // Hopalong-ish: more spiky / dragon-like
      const sgn = a.x < 0 ? -1 : 1;
      nx = a.y - sgn * Math.sqrt(Math.abs(B * a.x - C));
      ny = A - a.x;
    }
    a.x = nx; a.y = ny;
    const px = CX + nx * scale;
    const py = CY + ny * scale;
    if(px < 0 || px >= W || py < 0 || py >= H) continue;
    const h = lerp(dom.hue[0], dom.hue[1], (i / pointsPerFrame));
    const al = 0.12 + 0.08*state.glow + (reactor.treble||0)*0.15;
    g.fillStyle = `hsla(${h}, ${dom.sat+5}%, ${dom.light+25}%, ${al})`;
    const sz = 1 + Math.floor(state.bloom * 1.5);
    g.fillRect(px, py, sz, sz);
  }
  g.restore();
}

// ─── Substrate (Tarbell-style branching growth) ───────────────────────────
// Lines grow from seed points, hit each other perpendicularly and spawn
// children. Looks like leaf-veins / city map / crystal lattice. Pure 2D.
function _spawnSubstrateCrack(parent){
  const s = modeState.substrate;
  if(s.cracks.length >= 220) return;
  const dom = dominantEmo();
  let x, y, a;
  if(parent){
    x = parent.x; y = parent.y;
    a = parent.a + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
    a += (Math.random() - 0.5) * 0.15;
  } else {
    x = Math.random() * W;
    y = Math.random() * H;
    a = Math.random() * TAU;
  }
  s.cracks.push({
    x, y, px: x, py: y, a,
    hue: lerp(dom.hue[0], dom.hue[1], Math.random()),
    sat: dom.sat,
    lit: dom.light + (Math.random()*20 - 10),
  });
}
function ensureSubstrate(){
  const s = modeState.substrate;
  if(!s.grid){
    s.gridW = Math.max(80, Math.floor(W/6));
    s.gridH = Math.max(45, Math.floor(H/6));
    s.grid = new Uint8Array(s.gridW * s.gridH);
    s.capacity = s.gridW * s.gridH;
    s.fillCount = 0;
    for(let i=0;i<3;i++) _spawnSubstrateCrack(null);
  }
}
function drawSubstrate(g, dt, T){
  ensureSubstrate();
  const s = modeState.substrate;
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const stepLen = (1.5 + state.motionSpeed*0.8 + (reactor.vol||0)*1.0) * mScale * SCALE;
  // When canvas fills up, soft-reset for cyclic regrowth
  if(s.fillCount > s.capacity * 0.62){
    s.grid.fill(0); s.fillCount = 0; s.cracks.length = 0;
    for(let i=0;i<3;i++) _spawnSubstrateCrack(null);
    return;
  }
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(let i = s.cracks.length-1; i>=0; i--){
    const c = s.cracks[i];
    c.px = c.x; c.py = c.y;
    c.x += Math.cos(c.a) * stepLen;
    c.y += Math.sin(c.a) * stepLen;
    const gx = Math.floor(c.x / W * s.gridW);
    const gy = Math.floor(c.y / H * s.gridH);
    if(gx < 0 || gx >= s.gridW || gy < 0 || gy >= s.gridH){
      s.cracks.splice(i, 1);
      const n = Math.random() < 0.6 ? 1 : (Math.random() < 0.6 ? 2 : 0);
      for(let k=0;k<n;k++) _spawnSubstrateCrack(c);
      continue;
    }
    const gIdx = gy * s.gridW + gx;
    if(s.grid[gIdx]){
      s.cracks.splice(i, 1);
      const n = Math.random() < 0.65 ? 1 : (Math.random() < 0.55 ? 2 : 0);
      for(let k=0;k<n;k++) _spawnSubstrateCrack(c);
      continue;
    }
    s.grid[gIdx] = 1; s.fillCount++;
    const a = 0.7 + state.glow * 0.3;
    g.strokeStyle = `hsla(${c.hue}, ${c.sat+5}%, ${c.lit+10}%, ${a})`;
    g.lineWidth = 1.6 + state.bloom * 1.2 + (reactor.bass||0)*1.5;
    g.beginPath(); g.moveTo(c.px, c.py); g.lineTo(c.x, c.y); g.stroke();
    // subtle sand-edge texture
    if(Math.random() < 0.35){
      const perpA = c.a + Math.PI/2;
      const off = (Math.random() - 0.5) * 3;
      g.fillStyle = `hsla(${c.hue}, ${c.sat}%, ${c.lit-12}%, ${a*0.35})`;
      g.fillRect(c.x + Math.cos(perpA)*off, c.y + Math.sin(perpA)*off, 1, 1);
    }
  }
  g.restore();
  if(s.cracks.length === 0){
    for(let i=0;i<3;i++) _spawnSubstrateCrack(null);
  }
}

// ─── Reaction-Diffusion (Gray-Scott) ──────────────────────────────────────
// Low-res (192×108) buffer simulation → upscale to canvas.
// Produces Turing patterns: coral, leopard spots, mitosis cell-division.
function _hslToRgbInt(h, s, l){
  h = ((h % 360) + 360) % 360 / 360;
  s = s / 100; l = l / 100;
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs((h*6) % 2 - 1));
  const m = l - c/2;
  let r, gg, b;
  if(h < 1/6){ r=c; gg=x; b=0; }
  else if(h < 2/6){ r=x; gg=c; b=0; }
  else if(h < 3/6){ r=0; gg=c; b=x; }
  else if(h < 4/6){ r=0; gg=x; b=c; }
  else if(h < 5/6){ r=x; gg=0; b=c; }
  else { r=c; gg=0; b=x; }
  return [(r+m)*255, (gg+m)*255, (b+m)*255];
}
function ensureRD(){
  const s = modeState.rdLow;
  const wantW = 192, wantH = 108;
  if(!s.u || s.w !== wantW){
    s.w = wantW; s.h = wantH;
    s.u = new Float32Array(wantW * wantH); s.u.fill(1);
    s.v = new Float32Array(wantW * wantH);
    s._newU = new Float32Array(wantW * wantH);
    s._newV = new Float32Array(wantW * wantH);
    for(let k=0;k<6;k++){
      const cx = 10 + Math.floor(Math.random()*(wantW-20));
      const cy = 10 + Math.floor(Math.random()*(wantH-20));
      const r = 5;
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
        if(dx*dx+dy*dy <= r*r) s.v[(cy+dy)*wantW + (cx+dx)] = 1;
      }
    }
    if(!s.canvas){
      s.canvas = document.createElement('canvas');
      s.ctx = s.canvas.getContext('2d');
    }
    s.canvas.width = wantW; s.canvas.height = wantH;
    s.imageData = s.ctx.createImageData(wantW, wantH);
  }
}
function drawRD(g, dt, T){
  ensureRD();
  const s = modeState.rdLow;
  const W2 = s.w, H2 = s.h;
  const u = s.u, v = s.v, nU = s._newU, nV = s._newV;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const Du = 1.0, Dv = 0.5;
  const F = 0.045 + (reactor.bass||0) * 0.015;
  const K = 0.062 + (reactor.treble||0) * 0.004;
  const steps = mScale < 0.5 ? 1 : 2;
  for(let step=0; step<steps; step++){
    for(let y=0;y<H2;y++){
      const yp = (y+H2-1)%H2;
      const yn = (y+1)%H2;
      const ip = yp*W2, ic = y*W2, ino = yn*W2;
      for(let x=0;x<W2;x++){
        const xp = (x+W2-1)%W2;
        const xn = (x+1)%W2;
        const i = ic + x;
        const lapU = u[ip+x] + u[ino+x] + u[ic+xp] + u[ic+xn] - 4*u[i];
        const lapV = v[ip+x] + v[ino+x] + v[ic+xp] + v[ic+xn] - 4*v[i];
        const uvv = u[i] * v[i] * v[i];
        nU[i] = u[i] + (Du*lapU - uvv + F*(1-u[i]));
        nV[i] = v[i] + (Dv*lapV + uvv - (F+K)*v[i]);
      }
    }
    u.set(nU); v.set(nV);
  }
  // Beat-triggered seed drops to keep patterns evolving
  if((reactor.bass||0) > 0.5 && state.beatFlash > 0.4 && Math.random() < 0.12){
    const cx = Math.floor(Math.random()*W2);
    const cy = Math.floor(Math.random()*H2);
    const r = 4;
    for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      if(dx*dx+dy*dy <= r*r){
        const ix = ((cy+dy+H2)%H2)*W2 + ((cx+dx+W2)%W2);
        v[ix] = Math.min(1, v[ix] + 0.6);
      }
    }
  }
  const data = s.imageData.data;
  const c0 = _hslToRgbInt(dom.hue[0], dom.sat, dom.light);
  const c1 = _hslToRgbInt(dom.hue[1], dom.sat, dom.light + 22);
  for(let i=0;i<v.length;i++){
    const vv = Math.min(1, v[i] * 2.2);  // boost contrast
    const o = i*4;
    data[o]   = c0[0] + (c1[0] - c0[0]) * vv;
    data[o+1] = c0[1] + (c1[1] - c0[1]) * vv;
    data[o+2] = c0[2] + (c1[2] - c0[2]) * vv;
    data[o+3] = Math.floor(vv * 255);  // full alpha for sharper pattern
  }
  s.ctx.putImageData(s.imageData, 0, 0);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.globalAlpha = 0.9 + state.glow * 0.1;
  g.drawImage(s.canvas, 0, 0, W, H);
  g.restore();
}

// ─── Sumi-e (generative 水墨) ─────────────────────────────────────────────
// Brush strokes spawn at random spots, drift with pressure-tapered radius,
// bleed via soft radial gradients, age out. Bass = ink splashes. Treble = fine
// dots. Light mode → black ink on cream. Dark mode → glowy emotion ink.
function _makeSumieStroke(dom, isSplash){
  const cx = Math.random() * W;
  const cy = Math.random() * H;
  const dir = Math.random() * TAU;
  const segments = isSplash ? 3 : 6 + Math.floor(Math.random()*12);
  const segLen = isSplash ? rand(8, 24) : rand(14, 36);
  const points = [];
  let x = cx, y = cy, curDir = dir;
  for(let i=0;i<segments;i++){
    points.push({
      x, y,
      r: rand(8, 32) * (1 - i/segments*0.55) * (isSplash ? 1.4 : 1),
    });
    curDir += (Math.random() - 0.5) * 0.55;
    x += Math.cos(curDir) * segLen;
    y += Math.sin(curDir) * segLen;
  }
  return {
    points,
    hue: lerp(dom.hue[0], dom.hue[1], Math.random()),
    sat: state.lightMode ? 10 : (dom.sat - 15 + Math.random()*30),
    lit: state.lightMode ? 10 + Math.random()*15 : (dom.light + Math.random()*15),
    life: 0,
    maxLife: rand(2200, 5500),
  };
}
function drawSumie(g, dt, T){
  const s = modeState.sumie;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  // Spawn rate scales with audio + motion
  const rate = (1 + state.motionSpeed*3 + (reactor.vol||0)*3) * mScale;
  s._spawnT += dt;
  if(s._spawnT > 1000/Math.max(0.5, rate)){
    s._spawnT = 0;
    s.strokes.push(_makeSumieStroke(dom, false));
    // Big bass → splash burst
    if((reactor.bass||0) > 0.55 && Math.random() < 0.6){
      for(let k=0;k<5;k++) s.strokes.push(_makeSumieStroke(dom, true));
    }
  }
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(let i = s.strokes.length-1; i>=0; i--){
    const st = s.strokes[i];
    st.life += dt;
    const t01 = st.life / st.maxLife;
    if(t01 > 1){ s.strokes.splice(i, 1); continue; }
    // Quick fade-in (first 5%), long body, slow fade-out
    const alpha = (t01 < 0.05 ? t01*20 : (1 - t01)*0.85) * (0.55 + state.glow*0.5);
    for(const p of st.points){
      const r = p.r * (1 - t01*0.25);
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r*2.2);
      grad.addColorStop(0, `hsla(${st.hue}, ${st.sat}%, ${st.lit}%, ${alpha})`);
      grad.addColorStop(0.6, `hsla(${st.hue}, ${st.sat}%, ${st.lit}%, ${alpha*0.45})`);
      grad.addColorStop(1, `hsla(${st.hue}, ${st.sat}%, ${st.lit}%, 0)`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(p.x, p.y, r*2.2, 0, TAU); g.fill();
    }
  }
  g.restore();
  while(s.strokes.length > 80) s.strokes.shift();
}

// ─── Op Art (Bridget Riley moiré) ─────────────────────────────────────────
// Hard high-contrast bands — concentric circles or vertical stripes with
// sin warp. Switches between modes on big bass hits. Strong VJ presence.
function drawOpArt(g, dt, T){
  const op = modeState.opart;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  op.phase += dt * 0.0009 * (1 + state.motionSpeed*0.6 + (reactor.bass||0)*0.7) * mScale;
  // Switch mode every 8-12 sec or on hard bass
  op._switchT += dt;
  if(op._switchT > rand(8000, 13000) || ((reactor.bass||0) > 0.7 && state.beatFlash > 0.5 && op._switchT > 3000)){
    op.mode = (op.mode + 1) % 3;
    op._switchT = 0;
  }
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  if(op.mode === 0){
    // Concentric circles drifting from offset center
    const cx = CX + Math.sin(op.phase*0.7) * W*0.25;
    const cy = CY + Math.cos(op.phase*0.5) * H*0.2;
    const rings = 36;
    const maxR = Math.hypot(W, H) * 0.65;
    const lw = maxR/rings * 0.9;
    for(let i=0; i<rings; i++){
      const r = ((i + (op.phase%1)) / rings) * maxR;
      const h = lerp(dom.hue[0], dom.hue[1], i/rings);
      g.strokeStyle = i%2 === 0
        ? `hsla(${h}, ${dom.sat+10}%, ${dom.light+18}%, 0.9)`
        : `hsla(${h}, 0%, ${state.lightMode? 18:92}%, 0.55)`;
      g.lineWidth = lw;
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    }
  } else if(op.mode === 1){
    // Vertical zebra stripes with sin warp
    const stripes = 28;
    const sw = W/stripes;
    for(let i=0; i<stripes; i++){
      const x = ((i + (op.phase%1)) % stripes) * sw;
      const h = lerp(dom.hue[0], dom.hue[1], i/stripes);
      g.fillStyle = i%2 === 0
        ? `hsla(${h}, ${dom.sat+10}%, ${dom.light+18}%, 0.9)`
        : `hsla(${h}, 0%, ${state.lightMode? 18:92}%, 0.55)`;
      const warp = Math.sin(state.t*0.0011 + i*0.4) * 24;
      g.fillRect(x + warp, 0, sw + 1, H);
    }
  } else {
    // Checkerboard pulse
    const cols = 14, rows = Math.floor(14 * H/W);
    const cw = W/cols, rh = H/rows;
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        const phase = (r+c+op.phase) % 2;
        const h = lerp(dom.hue[0], dom.hue[1], (r+c)/(rows+cols));
        if(phase < 1){
          g.fillStyle = `hsla(${h}, ${dom.sat+10}%, ${dom.light+18}%, 0.92)`;
        } else {
          g.fillStyle = `hsla(${h}, 0%, ${state.lightMode? 18:92}%, 0.55)`;
        }
        g.fillRect(c*cw, r*rh, cw+1, rh+1);
      }
    }
  }
  g.restore();
}

// ─── Lissajous oscilloscope ───────────────────────────────────────────────
// Two sin waves at different frequencies → closed curve traced as dots.
// Trails 0.9+ accumulates intricate webs. Frequency ratio cycles → new shapes.
function drawLissajous(g, dt, T){
  const l = modeState.lissa;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  // Cycle frequency ratio
  l._switchT += dt;
  if(l._switchT > rand(16000, 28000)){
    const ratios = [[3,2],[3,4],[5,4],[5,6],[7,6],[5,7],[4,3],[7,5],[9,7],[7,8]];
    const r = ratios[Math.floor(Math.random()*ratios.length)];
    l.freqA = r[0]; l.freqB = r[1];
    l._switchT = 0;
  }
  l.phase += dt * 0.0006 * (1 + state.motionSpeed*0.4) * mScale;
  const cx = CX, cy = CY;
  const R = Math.min(W, H) * 0.42;
  const samples = 720;
  const phaseShift = l.phase + (reactor.bass||0)*0.6;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(let i=0; i<samples; i++){
    const tt = i / samples * TAU * 2;
    const x = cx + Math.sin(tt * l.freqA + l.phase) * R;
    const y = cy + Math.sin(tt * l.freqB + phaseShift) * R;
    const h = lerp(dom.hue[0], dom.hue[1], (i/samples + state.t*0.00015)%1);
    const a = 0.35 + 0.45*state.glow + (reactor.treble||0)*0.3;
    g.fillStyle = `hsla(${h}, ${dom.sat+10}%, ${dom.light+22}%, ${a})`;
    const sz = 1.5 + state.bloom*1.5;
    g.fillRect(x - sz/2, y - sz/2, sz, sz);
  }
  g.restore();
}

// ─── Voronoi (cellular tessellation) ──────────────────────────────────────
// Low-res buffer brute-force: each pixel goes to its nearest seed. Seeds drift.
function ensureVoronoi(){
  const v = modeState.voronoi;
  if(!v.canvas){
    v.w = 120; v.h = 68;
    v.canvas = document.createElement('canvas');
    v.canvas.width = v.w; v.canvas.height = v.h;
    v.ctx = v.canvas.getContext('2d');
    v.imageData = v.ctx.createImageData(v.w, v.h);
    v.seeds = [];
    const dom = dominantEmo();
    for(let i=0; i<16; i++){
      const h = lerp(dom.hue[0], dom.hue[1], Math.random());
      v.seeds.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random()-0.5)*0.00015,
        vy: (Math.random()-0.5)*0.00015,
        color: _hslToRgbInt(h, dom.sat+5, dom.light + 5 + Math.random()*22),
      });
    }
  }
}
function drawVoronoi(g, dt, T){
  ensureVoronoi();
  const v = modeState.voronoi;
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  for(const s of v.seeds){
    s.x += s.vx * dt * mScale * (1 + (reactor.vol||0));
    s.y += s.vy * dt * mScale * (1 + (reactor.vol||0));
    if(s.x < 0){ s.x = 0; s.vx = -s.vx; }
    if(s.x > 1){ s.x = 1; s.vx = -s.vx; }
    if(s.y < 0){ s.y = 0; s.vy = -s.vy; }
    if(s.y > 1){ s.y = 1; s.vy = -s.vy; }
  }
  const data = v.imageData.data;
  const sds = v.seeds;
  const t0 = state.t*0.0008;
  for(let y=0; y<v.h; y++){
    const ny = y / v.h;
    for(let x=0; x<v.w; x++){
      const nx = x / v.w;
      let minD = 999, secondD = 999;
      let nearest = sds[0];
      for(let k=0;k<sds.length;k++){
        const s = sds[k];
        const dx = nx - s.x, dy = ny - s.y;
        const d = dx*dx + dy*dy;
        if(d < minD){ secondD = minD; minD = d; nearest = s; }
        else if(d < secondD){ secondD = d; }
      }
      // Edge: when the two nearest are equidistant, darken
      const edgeDist = secondD - minD;
      const edgeStrength = edgeDist < 0.001 ? 0.25 : (edgeDist < 0.004 ? 0.5 + edgeDist*125 : 1);
      const pulse = 0.85 + 0.15*Math.sin(t0 + minD*30);
      const k = edgeStrength * pulse;
      const o = (y*v.w + x)*4;
      data[o]   = nearest.color[0] * k;
      data[o+1] = nearest.color[1] * k;
      data[o+2] = nearest.color[2] * k;
      data[o+3] = Math.floor((0.7 + state.glow*0.3) * 240);
    }
  }
  v.ctx.putImageData(v.imageData, 0, 0);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.globalAlpha = 0.85 + state.glow * 0.15;
  g.drawImage(v.canvas, 0, 0, W, H);
  g.restore();
}

// ─── Beat Strobe ──────────────────────────────────────────────────────────
// Full-screen flash sync'd to detected beats. Uses state.beatFlash which is
// driven by reactor.bass envelope. Subtle white in dark mode, dark in light.
function drawBeatStrobe(g, dt, T){
  const f = state.beatFlash;
  if(f < 0.12) return;
  const dom = dominantEmo();
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  // Choose flash color: emotion-tinted white in dark, near-black in light
  if(state.lightMode){
    g.fillStyle = `rgba(20,18,28,${Math.min(0.85, f*0.65)})`;
  } else {
    const h = lerp(dom.hue[0], dom.hue[1], 0.5);
    g.fillStyle = `hsla(${h}, ${Math.max(0, dom.sat-20)}%, ${Math.min(96, dom.light+45)}%, ${Math.min(0.95, f*0.9)})`;
  }
  g.fillRect(0, 0, W, H);
  g.restore();
}

// ─── BPM Kaleido (state mutation, called from frame loop) ─────────────────
// Cycles state.kaleido through [0,4,6,8,12] segments every N beats.
// Saves and restores user's kaleido when toggled off.
function tickBpmKaleido(now){
  if(!state.modes.bpmKaleido){
    // Restore on disable
    if(state._bpmKaleidoOriginal != null){
      state.kaleido = state._bpmKaleidoOriginal;
      state._bpmKaleidoOriginal = null;
    }
    return;
  }
  // Save original on first activation
  if(state._bpmKaleidoOriginal == null){
    state._bpmKaleidoOriginal = state.kaleido;
    state._bpmKaleidoBeats = 0;
  }
  // Detect beat edge via beatFlash rising. Add cooldown so 60fps doesn't
  // double-count one beat.
  if(state.beatFlash > 0.45 && now - (state._bpmKaleidoLastBeat || 0) > 180){
    state._bpmKaleidoLastBeat = now;
    state._bpmKaleidoBeats = (state._bpmKaleidoBeats || 0) + 1;
    // Cycle every 4 beats (1 bar in 4/4)
    if(state._bpmKaleidoBeats % 4 === 0){
      const opts = [0, 4, 6, 8, 12, 16];
      const idx = Math.floor(state._bpmKaleidoBeats / 4) % opts.length;
      state.kaleido = opts[idx];
    }
  }
}

// ─── Boids (flocking) ─────────────────────────────────────────────────────
// Reynolds 1986 — particles obey cohesion / alignment / separation rules and
// self-organise into flocks. Color from emotion. Audio modulates speed.
function ensureBoids(){
  if(modeState.boids.length === 0){
    const N = 140;
    const dom = dominantEmo();
    for(let i=0;i<N;i++){
      modeState.boids.push({
        x: Math.random()*W, y: Math.random()*H,
        vx: (Math.random()-0.5)*120, vy: (Math.random()-0.5)*120,
        hue: lerp(dom.hue[0], dom.hue[1], Math.random()) + (Math.random()-0.5)*20,
      });
    }
  }
}
function drawBoids(g, dt, T){
  ensureBoids();
  const boids = modeState.boids;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const speedMul = (0.5 + state.motionSpeed + (reactor.vol||0)*1.4) * mScale;
  const dts = dt/1000;
  const visRad = 60, sepRad = 24, maxSpeed = 180;
  const visRadSq = visRad*visRad, sepRadSq = sepRad*sepRad;
  for(let i=0;i<boids.length;i++){
    const b = boids[i];
    let ax=0, ay=0, acount=0;
    let cx=0, cy=0, ccount=0;
    let sx=0, sy=0;
    for(let j=0;j<boids.length;j++){
      if(i === j) continue;
      const o = boids[j];
      const dx = o.x - b.x, dy = o.y - b.y;
      const d2 = dx*dx + dy*dy;
      if(d2 < visRadSq){
        ax += o.vx; ay += o.vy; acount++;
        cx += o.x;  cy += o.y;  ccount++;
        if(d2 < sepRadSq && d2 > 0.01){
          const d = Math.sqrt(d2);
          sx -= dx/d; sy -= dy/d;
        }
      }
    }
    if(acount){ b.vx += (ax/acount - b.vx) * 0.05; b.vy += (ay/acount - b.vy) * 0.05; }
    if(ccount){ b.vx += (cx/ccount - b.x) * 0.001; b.vy += (cy/ccount - b.y) * 0.001; }
    b.vx += sx * 0.6; b.vy += sy * 0.6;
    const sp = Math.hypot(b.vx, b.vy);
    if(sp > maxSpeed){ b.vx = b.vx/sp * maxSpeed; b.vy = b.vy/sp * maxSpeed; }
    b.x += b.vx * dts * speedMul;
    b.y += b.vy * dts * speedMul;
    if(b.x < 0) b.x += W; else if(b.x > W) b.x -= W;
    if(b.y < 0) b.y += H; else if(b.y > H) b.y -= H;
  }
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(const b of boids){
    const ang = Math.atan2(b.vy, b.vx);
    const sz = 4 + state.bloom*4 + (reactor.bass||0)*3;
    g.save();
    g.translate(b.x, b.y);
    g.rotate(ang);
    g.fillStyle = `hsla(${b.hue}, ${dom.sat+5}%, ${dom.light+18}%, ${0.7 + state.glow*0.3})`;
    g.beginPath();
    g.moveTo(sz, 0);
    g.lineTo(-sz*0.6, -sz*0.55);
    g.lineTo(-sz*0.3, 0);
    g.lineTo(-sz*0.6, sz*0.55);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}

// ─── Chladni (sound figures) ──────────────────────────────────────────────
// 18th-century physics: cos(nπx)cos(mπy) - cos(mπx)cos(nπy) = 0 produces
// nodal lines that form different symmetric patterns for each (n, m). Here
// n and m are driven by audio so the figure morphs with the music.
function ensureChladni(){
  const c = modeState.chladni;
  if(!c.canvas){
    c.canvas = document.createElement('canvas');
    c.canvas.width = 192; c.canvas.height = 108;
    c.ctx = c.canvas.getContext('2d');
    c.imageData = c.ctx.createImageData(192, 108);
  }
}
function drawChladni(g, dt, T){
  ensureChladni();
  const c = modeState.chladni;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  c.t += dt * 0.00012 * (1 + state.motionSpeed) * mScale;
  // n, m audio-modulated
  const n = 2 + Math.abs(Math.sin(c.t)) * 6 + (reactor.bass||0) * 5;
  const m = 3 + Math.abs(Math.cos(c.t * 0.73)) * 6 + (reactor.treble||0) * 4;
  const W2 = c.canvas.width, H2 = c.canvas.height;
  const data = c.imageData.data;
  const c0 = _hslToRgbInt(dom.hue[0], dom.sat, dom.light);
  const c1 = _hslToRgbInt(dom.hue[1], dom.sat, dom.light + 28);
  const PI = Math.PI;
  for(let y=0; y<H2; y++){
    const ny = y / H2;
    const yy1 = m * PI * ny, yy2 = n * PI * ny;
    for(let x=0; x<W2; x++){
      const nx = x / W2;
      const z = Math.cos(n*PI*nx)*Math.cos(yy1) - Math.cos(m*PI*nx)*Math.cos(yy2);
      const zAbs = Math.abs(z);
      // Bright on nodal lines (zAbs ≈ 0)
      const inv = Math.max(0, 1 - zAbs * 3);
      const t = inv;
      const o = (y*W2 + x)*4;
      data[o]   = c0[0] + (c1[0] - c0[0]) * t;
      data[o+1] = c0[1] + (c1[1] - c0[1]) * t;
      data[o+2] = c0[2] + (c1[2] - c0[2]) * t;
      data[o+3] = Math.floor(t * 230);
    }
  }
  c.ctx.putImageData(c.imageData, 0, 0);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.85 + state.glow * 0.15;
  g.drawImage(c.canvas, 0, 0, W, H);
  g.restore();
}

// ─── DLA (diffusion-limited aggregation) ──────────────────────────────────
// Walkers random-walk on a grid; when adjacent to an existing cell, they
// stick. Builds coral / lightning / dendrite-like structures over time.
function _spawnDLAWalker(){
  const d = modeState.dla;
  const edge = Math.floor(Math.random()*4);
  let gx, gy;
  if(edge === 0){ gx = 0; gy = Math.floor(Math.random()*d.gridH); }
  else if(edge === 1){ gx = d.gridW-1; gy = Math.floor(Math.random()*d.gridH); }
  else if(edge === 2){ gx = Math.floor(Math.random()*d.gridW); gy = 0; }
  else { gx = Math.floor(Math.random()*d.gridW); gy = d.gridH-1; }
  d.walkers.push({ gx, gy });
}
function ensureDLA(){
  const d = modeState.dla;
  if(!d.grid){
    d.gridW = Math.max(80, Math.floor(W/8));
    d.gridH = Math.max(45, Math.floor(H/8));
    d.grid = new Uint8Array(d.gridW * d.gridH);
    d.colors = new Float32Array(d.gridW * d.gridH);
    d.capacity = d.gridW * d.gridH;
    d.fillCount = 0;
    d.walkers = [];
    const dom = dominantEmo();
    // central seed
    const cx = Math.floor(d.gridW/2), cy = Math.floor(d.gridH/2);
    d.grid[cy*d.gridW + cx] = 1;
    d.colors[cy*d.gridW + cx] = lerp(dom.hue[0], dom.hue[1], 0.5);
    d.fillCount = 1;
    for(let i=0;i<80;i++) _spawnDLAWalker();
  }
}
function drawDLA(g, dt, T){
  ensureDLA();
  const d = modeState.dla;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  // Soft-reset when filled (cyclic regrowth)
  if(d.fillCount > d.capacity * 0.4){
    d.grid.fill(0); d.colors.fill(0); d.fillCount = 0; d.walkers.length = 0;
    const cx = Math.floor(d.gridW/2), cy = Math.floor(d.gridH/2);
    d.grid[cy*d.gridW + cx] = 1;
    d.colors[cy*d.gridW + cx] = lerp(dom.hue[0], dom.hue[1], 0.5);
    d.fillCount = 1;
    for(let i=0;i<80;i++) _spawnDLAWalker();
    return;
  }
  // Walk many steps per frame (audio-boosted)
  const steps = Math.floor((3 + (reactor.bass||0)*6 + (reactor.vol||0)*4) * mScale);
  for(let s=0; s<steps; s++){
    for(let i = d.walkers.length-1; i>=0; i--){
      const w = d.walkers[i];
      const dir = Math.floor(Math.random()*4);
      if(dir === 0) w.gx++;
      else if(dir === 1) w.gx--;
      else if(dir === 2) w.gy++;
      else w.gy--;
      if(w.gx <= 0 || w.gx >= d.gridW-1 || w.gy <= 0 || w.gy >= d.gridH-1){
        d.walkers.splice(i, 1);
        _spawnDLAWalker();
        continue;
      }
      const gw = d.gridW;
      const idx = w.gy*gw + w.gx;
      if(d.grid[idx]){
        // already filled — re-spawn
        d.walkers.splice(i, 1);
        _spawnDLAWalker();
        continue;
      }
      // Check 4 neighbours for an existing cell
      if(d.grid[idx-1] || d.grid[idx+1] || d.grid[idx-gw] || d.grid[idx+gw]){
        d.grid[idx] = 1;
        d.colors[idx] = lerp(dom.hue[0], dom.hue[1], Math.random()) + (Math.random()-0.5)*30;
        d.fillCount++;
        d.walkers.splice(i, 1);
        _spawnDLAWalker();
      }
    }
  }
  // Render the structure (full pass — Chrome handles a few thousand fillRects fine)
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const cw = W / d.gridW;
  const ch = H / d.gridH;
  const a = 0.7 + state.glow * 0.3;
  for(let y=0;y<d.gridH;y++){
    const baseI = y*d.gridW;
    for(let x=0;x<d.gridW;x++){
      const idx = baseI + x;
      if(!d.grid[idx]) continue;
      const hue = d.colors[idx];
      g.fillStyle = `hsla(${hue}, ${dom.sat+5}%, ${dom.light+18}%, ${a})`;
      g.fillRect(x*cw, y*ch, cw+1, ch+1);
    }
  }
  g.restore();
}

// ─── Spectrogram waterfall ────────────────────────────────────────────────
// FFT line per frame, scrolls up. Direct visualisation of audio over time.
function ensureSpectrogram(){
  const s = modeState.spectro;
  if(!s.canvas){
    s.canvas = document.createElement('canvas');
    s.canvas.width  = 320;
    s.canvas.height = 200;
    s.ctx = s.canvas.getContext('2d');
  }
}
function drawSpectrogram(g, dt, T){
  ensureSpectrogram();
  const s = modeState.spectro;
  const dom = dominantEmo();
  const cw = s.canvas.width, ch = s.canvas.height;
  // Get spectrum — real if analyser available, synthetic otherwise
  let spectrum;
  let N;
  if(reactor.analyser){
    N = reactor.analyser.frequencyBinCount;
    if(!s._freqBuf || s._freqBuf.length !== N) s._freqBuf = new Uint8Array(N);
    reactor.analyser.getByteFrequencyData(s._freqBuf);
    spectrum = s._freqBuf;
  } else {
    // Synthetic spectrum from emotion mix so the user sees SOMETHING
    N = 128;
    if(!s._fakeBuf || s._fakeBuf.length !== N) s._fakeBuf = new Uint8Array(N);
    const t0 = state.t * 0.002;
    let domWeight = 0;
    for(const e of EMOTIONS) domWeight += state.values[e.id]/100;
    const baseAmp = 80 + domWeight * 25;
    for(let i=0;i<N;i++){
      const fr = i / N;
      const wave = Math.sin(t0 + fr*9) * 0.5 + Math.sin(t0*1.7 + fr*23) * 0.3 + Math.cos(t0*0.6 + fr*4)*0.2;
      s._fakeBuf[i] = Math.max(0, Math.min(255, baseAmp + wave * 100 - fr*60));
    }
    spectrum = s._fakeBuf;
  }
  // Scroll up by 1 px
  s.ctx.drawImage(s.canvas, 0, -1);
  s.ctx.clearRect(0, ch-1, cw, 1);
  const usableBins = Math.floor(N * 0.65);
  for(let x = 0; x < cw; x++){
    const t = x / cw;
    const binIdx = Math.min(usableBins-1, Math.floor(Math.pow(t, 1.8) * usableBins));
    const v = spectrum[binIdx] / 255;
    if(v < 0.04) continue;
    const hue = lerp(dom.hue[0], dom.hue[1], v) + (1-t)*40;
    s.ctx.fillStyle = `hsla(${hue}, ${dom.sat+15}%, ${28 + v*55}%, ${Math.min(1, v*1.5)})`;
    s.ctx.fillRect(x, ch-1, 1, 1);
  }
  // Also draw a vivid live-bar from the bottom of the screen (so it's punchy
  // even when scrolling history is too dim to see)
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.globalAlpha = 0.85 + state.glow*0.15;
  g.imageSmoothingEnabled = true;
  g.drawImage(s.canvas, 0, 0, W, H);
  // Live bars
  const bars = 64;
  const barW = W / bars;
  for(let i=0;i<bars;i++){
    const t2 = i / bars;
    const binIdx = Math.min(usableBins-1, Math.floor(Math.pow(t2, 1.8) * usableBins));
    const v = spectrum[binIdx] / 255;
    const barH = v * H * 0.35;
    const hue = lerp(dom.hue[0], dom.hue[1], v) + (1-t2)*40;
    g.fillStyle = `hsla(${hue}, ${dom.sat+15}%, ${40 + v*40}%, ${0.75 + state.glow*0.25})`;
    g.fillRect(i*barW, H-barH, barW-1, barH);
  }
  g.restore();
}

// ─── Metaballs (lava lamp) ────────────────────────────────────────────────
// N moving radial gradients merge visually via additive blending.
function ensureMeta(){
  const m = modeState.meta;
  if(m.balls.length === 0){
    const dom = dominantEmo();
    for(let i=0;i<6;i++){
      m.balls.push({
        x: Math.random(), y: Math.random(),       // normalized 0-1
        vx: (Math.random()-0.5)*0.0006,
        vy: (Math.random()-0.5)*0.0006,
        r: 0.10 + Math.random()*0.10,             // normalized radius
        hue: lerp(dom.hue[0], dom.hue[1], Math.random()) + (Math.random()-0.5)*40,
      });
    }
  }
  if(!m.canvas){
    m.canvas = document.createElement('canvas');
    m.canvas.width = 384; m.canvas.height = 216;  // low-res buffer, ~6× cheaper
    m.ctx = m.canvas.getContext('2d');
  }
}
function drawMetaballs(g, dt, T){
  ensureMeta();
  const m = modeState.meta;
  const balls = m.balls;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const speedMul = (0.4 + state.motionSpeed*0.8 + (reactor.vol||0)*1.3) * mScale;
  for(const b of balls){
    b.x += b.vx * dt * speedMul;
    b.y += b.vy * dt * speedMul;
    if(b.x < b.r){ b.x = b.r; b.vx = -b.vx; }
    if(b.x > 1-b.r){ b.x = 1-b.r; b.vx = -b.vx; }
    if(b.y < b.r){ b.y = b.r; b.vy = -b.vy; }
    if(b.y > 1-b.r){ b.y = 1-b.r; b.vy = -b.vy; }
  }
  // Render to LOW-RES buffer (384×216), then scale up
  const bw = m.canvas.width, bh = m.canvas.height;
  const ctx = m.ctx;
  ctx.clearRect(0,0,bw,bh);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bassPump = 1 + (reactor.bass||0)*0.7;
  for(const b of balls){
    const px = b.x * bw, py = b.y * bh;
    const r = b.r * Math.min(bw, bh) * bassPump;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0,   `hsla(${b.hue}, ${dom.sat+15}%, ${dom.light+28}%, ${0.95})`);
    grad.addColorStop(0.4, `hsla(${b.hue}, ${dom.sat+10}%, ${dom.light+18}%, 0.45)`);
    grad.addColorStop(1,   `hsla(${b.hue}, ${dom.sat}%, ${dom.light}%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // Composite onto main canvas
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.globalAlpha = 0.9 + state.glow*0.1;
  g.drawImage(m.canvas, 0, 0, W, H);
  g.restore();
}

// ─── Synthwave Grid (80s vector floor + sun) ──────────────────────────────
function drawSynthwave(g, dt, T){
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const sy = modeState.synth;
  sy.t += dt * 0.001 * (1 + (reactor.bass||0)*0.6) * mScale;
  const horizonY = H * 0.55;
  // Sun
  const sunR = Math.min(W, H) * 0.18;
  const sunY = horizonY - sunR * 0.35 + Math.sin(sy.t*0.7) * 8;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  // Sun gradient (half disc above horizon)
  const sunGrad = g.createLinearGradient(W/2, sunY - sunR, W/2, sunY + sunR);
  const h1 = lerp(dom.hue[0], dom.hue[1], 0.15);
  const h2 = lerp(dom.hue[0], dom.hue[1], 0.85);
  sunGrad.addColorStop(0, `hsla(${h1}, ${dom.sat+15}%, ${dom.light+25}%, 0.95)`);
  sunGrad.addColorStop(1, `hsla(${h2}, ${dom.sat+15}%, ${dom.light}%,    0.95)`);
  g.fillStyle = sunGrad;
  g.beginPath();
  g.arc(W/2, sunY, sunR, Math.PI, 0, false);
  g.lineTo(W/2 - sunR, sunY);
  g.closePath();
  g.fill();
  // Sun retro stripes (cut into the disc)
  g.fillStyle = state.lightMode ? '#f5edde' : '#0a0a14';
  for(let i=0;i<6;i++){
    const sH = sunR / 9;
    const yy = sunY - sunR*0.7 + (i/5) * sunR * 0.95;
    g.fillRect(W/2 - sunR, yy, sunR*2, sH);
  }
  // Grid lines (horizontal, perspective toward horizon)
  const lineCol = `hsla(${lerp(dom.hue[0], dom.hue[1], 0.6)}, ${dom.sat+10}%, ${dom.light+22}%, ${0.7 + state.glow*0.3})`;
  g.strokeStyle = lineCol;
  g.lineWidth = 1.4 + state.bloom*0.8;
  const nH = 18;
  const scroll = (sy.t * 0.4) % 1;
  for(let i=0; i<nH; i++){
    const f = (i + scroll) / nH;
    const y = horizonY + Math.pow(f, 2.2) * (H - horizonY) * 1.2;
    if(y > H) continue;
    if(y < horizonY) continue;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  // Grid lines (vertical, fan out from vanishing point)
  const vx = W/2;
  const nV = 24;
  for(let i = -nV; i <= nV; i++){
    const xAtBottom = vx + (i / nV) * W * 0.95;
    g.beginPath();
    g.moveTo(vx, horizonY);
    g.lineTo(xAtBottom, H);
    g.stroke();
  }
  g.restore();
}

// ─── Conway's Game of Life ────────────────────────────────────────────────
// Classic CA. Random seed, evolves every ~80 ms. Audio scales evolution speed.
function ensureLife(){
  const l = modeState.life;
  if(!l.grid){
    l.w = 96; l.h = 54;
    l.grid = new Uint8Array(l.w * l.h);
    l.next = new Uint8Array(l.w * l.h);
    for(let i=0;i<l.grid.length;i++) l.grid[i] = Math.random() < 0.32 ? 1 : 0;
  }
}
function drawLife(g, dt, T){
  ensureLife();
  const l = modeState.life;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const stepMs = 100 / (1 + (reactor.bass||0)*1.5 + state.motionSpeed*0.5) / mScale;
  l._t += dt;
  if(l._t > stepMs){
    l._t = 0;
    const w = l.w, h = l.h, grid = l.grid, next = l.next;
    let liveCount = 0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i = y*w + x;
        let n = 0;
        // 8 neighbours with wrap
        for(let dy=-1;dy<=1;dy++){
          const ny = (y+dy+h)%h * w;
          for(let dx=-1;dx<=1;dx++){
            if(dx===0 && dy===0) continue;
            n += grid[ny + (x+dx+w)%w];
          }
        }
        next[i] = grid[i] ? ((n===2 || n===3) ? 1 : 0) : (n===3 ? 1 : 0);
        liveCount += next[i];
      }
    }
    l.grid = next; l.next = grid;
    // If everything dies / stuck → reseed (every ~20 sec also reseed for variety)
    l._resetT += dt;
    if(liveCount < 5 || l._resetT > 25000){
      l._resetT = 0;
      for(let i=0;i<l.grid.length;i++) l.grid[i] = Math.random() < 0.32 ? 1 : 0;
    }
  }
  // Render
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const cw = W / l.w, ch = H / l.h;
  for(let y=0;y<l.h;y++){
    const baseI = y*l.w;
    for(let x=0;x<l.w;x++){
      if(!l.grid[baseI+x]) continue;
      const hue = lerp(dom.hue[0], dom.hue[1], (x+y)/(l.w+l.h));
      g.fillStyle = `hsla(${hue}, ${dom.sat+5}%, ${dom.light+18}%, ${0.75+state.glow*0.25})`;
      g.fillRect(x*cw, y*ch, cw+1, ch+1);
    }
  }
  g.restore();
}

// ─── L-System Tree ────────────────────────────────────────────────────────
// Recursive grammar generates a string → turtle graphics draws it. Depth + rule
// cycle on audio. Pure canvas 2D.
function _lsysGenerate(axiom, rules, depth){
  let s = axiom;
  for(let i=0;i<depth;i++){
    let next = '';
    for(let j=0;j<s.length;j++){
      const ch = s[j];
      next += (rules[ch] || ch);
    }
    s = next;
    if(s.length > 8000) break;  // safety
  }
  return s;
}
function drawLSystem(g, dt, T){
  const l = modeState.lsys;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  l._t += dt;
  // Cycle rule every ~10 sec
  const ruleSet = [
    { axiom:'F', rules:{ F:'F[+F]F[-F]F' },              ang: Math.PI/7,  depth: 4 },  // bushy
    { axiom:'X', rules:{ X:'F-[[X]+X]+F[+FX]-X', F:'FF' }, ang: Math.PI/9,  depth: 4 },  // plant
    { axiom:'F', rules:{ F:'FF+[+F-F-F]-[-F+F+F]' },     ang: Math.PI/8,  depth: 3 },  // tree
    { axiom:'F', rules:{ F:'F+F-F-F+F' },                ang: Math.PI/2,  depth: 4 },  // koch
  ];
  if(l._t > 10000){ l._t = 0; l._rule = (l._rule + 1) % ruleSet.length; }
  const cfg = ruleSet[l._rule];
  const path = _lsysGenerate(cfg.axiom, cfg.rules, cfg.depth);
  const ang0 = cfg.ang + Math.sin(state.t*0.0005) * 0.05 * mScale;
  // Bass adds dynamic angle perturbation per branch
  const bassWobble = (reactor.bass||0) * 0.15;
  // Start at bottom center
  let x = W/2, y = H * 0.95;
  let angle = -Math.PI/2;
  const baseStep = Math.min(W, H) * 0.32 / Math.pow(2, cfg.depth - 2.5);
  const stack = [];
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.strokeStyle = `hsla(${lerp(dom.hue[0], dom.hue[1], 0.5)}, ${dom.sat+10}%, ${dom.light+18}%, ${0.65+state.glow*0.3})`;
  g.lineWidth = 1.5 + state.bloom * 0.8;
  g.beginPath();
  for(let i=0;i<path.length;i++){
    const ch = path[i];
    if(ch === 'F' || ch === 'X'){
      const len = baseStep * (0.85 + Math.sin(i*0.13)*0.15);
      const nx = x + Math.cos(angle) * len;
      const ny = y + Math.sin(angle) * len;
      g.moveTo(x, y); g.lineTo(nx, ny);
      x = nx; y = ny;
    } else if(ch === '+') angle += ang0 + bassWobble*(Math.random()-0.5);
    else if(ch === '-') angle -= ang0 + bassWobble*(Math.random()-0.5);
    else if(ch === '['){ stack.push({x,y,angle}); }
    else if(ch === ']'){ const s = stack.pop(); if(s){ x=s.x; y=s.y; angle=s.angle; } }
  }
  g.stroke();
  g.restore();
}

// ─── Harmonograph ─────────────────────────────────────────────────────────
// Multi-pendulum drawing. Sin waves with decay → looped rose / spiral curves.
function drawHarmonograph(g, dt, T){
  const h = modeState.harmono;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  h.t += dt * 0.0006 * mScale;
  const cx = CX, cy = CY;
  const R = Math.min(W, H) * 0.38;
  // 4-pendulum frequencies driven by audio
  const f1 = 2.0 + (reactor.bass||0)*0.6;
  const f2 = 3.0 + (reactor.treble||0)*0.6;
  const f3 = 2.5 + (reactor.mid||0)*0.4;
  const f4 = 3.5 + (reactor.vol||0)*0.3;
  const p1 = h.t, p2 = h.t*0.83 + Math.PI/4;
  const p3 = h.t*1.17 + Math.PI/3, p4 = h.t*0.61;
  const decay = 0.0012;
  const samples = 1600;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(let i=0;i<samples;i++){
    const tau = i * 0.06;
    const d = Math.exp(-decay * tau);
    const x = cx + ((Math.sin(tau*f1 + p1) + Math.sin(tau*f3 + p3))*0.5) * R * d;
    const y = cy + ((Math.sin(tau*f2 + p2) + Math.sin(tau*f4 + p4))*0.5) * R * d;
    const hue = lerp(dom.hue[0], dom.hue[1], i/samples);
    const a = 0.35 + 0.45*state.glow + (reactor.treble||0)*0.25;
    g.fillStyle = `hsla(${hue}, ${dom.sat+10}%, ${dom.light+22}%, ${a})`;
    const sz = 1.4 + state.bloom*1.2;
    g.fillRect(x - sz/2, y - sz/2, sz, sz);
  }
  g.restore();
}

// ─── Truchet Tiles ────────────────────────────────────────────────────────
// Classic Smith tiles — each cell randomly picks one of two quarter-arc
// configurations. Tiled randomly, arcs connect into intricate maze patterns.
function drawTruchet(g, dt, T){
  const dom = dominantEmo();
  const tr = modeState.truchet;
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  tr.t += dt * 0.0007 * mScale * (1 + (reactor.bass||0)*0.8);
  const cs = Math.max(28, Math.min(W, H) * (0.06 + state.density*0.04));
  const cols = Math.ceil(W / cs) + 1;
  const rows = Math.ceil(H / cs) + 1;
  const phase = Math.floor(tr.t * 2);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.lineWidth = Math.max(2, cs * 0.16 * (1 + (reactor.mid||0)*0.7));
  g.lineCap = 'round';
  for(let row=0; row<rows; row++){
    for(let col=0; col<cols; col++){
      const seed = Math.sin(col*12.9898 + row*78.233 + phase*3.7) * 43758;
      const flip = ((seed - Math.floor(seed)) < 0.5);
      // Per-tile hue variation so the field has color, not just white wash
      const hueShift = Math.sin(col*0.7 + row*0.4 + phase*0.3) * 30;
      const hue = lerp(dom.hue[0], dom.hue[1], (col + row) / (cols + rows)) + hueShift;
      const lit = state.lightMode ? Math.max(15, dom.light - 10) : Math.min(70, dom.light + 8);
      g.strokeStyle = `hsla(${hue}, ${Math.min(95, dom.sat+25)}%, ${lit}%, ${0.85 + state.glow*0.15})`;
      const x = col * cs, y = row * cs;
      g.beginPath();
      if(flip){
        g.arc(x, y, cs/2, 0, Math.PI/2);
        g.moveTo(x+cs, y+cs);
        g.arc(x+cs, y+cs, cs/2, Math.PI, 1.5*Math.PI);
      } else {
        g.arc(x+cs, y, cs/2, Math.PI/2, Math.PI);
        g.moveTo(x, y+cs);
        g.arc(x, y+cs, cs/2, -Math.PI/2, 0);
      }
      g.stroke();
    }
  }
  g.restore();
}

// ─── N-Body Gravity ───────────────────────────────────────────────────────
// O(N²) mutual gravity. Each particle pulls every other. Forms galaxy-like
// clusters / orbits. N=60 (manageable). Audio modulates G constant.
function ensureNbody(){
  if(modeState.nbody.particles.length === 0){
    const N = 60;
    for(let i=0;i<N;i++){
      const r = Math.random() * Math.min(W, H) * 0.32;
      const ang = Math.random() * TAU;
      // Start with slight orbital velocity for spin
      modeState.nbody.particles.push({
        x: CX + Math.cos(ang) * r,
        y: CY + Math.sin(ang) * r,
        vx: -Math.sin(ang) * (40 + Math.random()*30),
        vy:  Math.cos(ang) * (40 + Math.random()*30),
        mass: 1 + Math.random()*2,
      });
    }
  }
}
function drawNbody(g, dt, T){
  ensureNbody();
  const ps = modeState.nbody.particles;
  const dom = dominantEmo();
  const dts = Math.min(50, dt) / 1000;
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const G = (350 + (reactor.bass||0)*900) * mScale;
  // Compute forces
  for(let i=0;i<ps.length;i++){
    const p = ps[i];
    let fx = 0, fy = 0;
    for(let j=0;j<ps.length;j++){
      if(i === j) continue;
      const o = ps[j];
      const dx = o.x - p.x, dy = o.y - p.y;
      const d2 = dx*dx + dy*dy + 200;
      const d = Math.sqrt(d2);
      const f = G * o.mass / d2;
      fx += f * dx / d;
      fy += f * dy / d;
    }
    p.vx += fx * dts;
    p.vy += fy * dts;
    // gentle damping so it doesn't explode
    p.vx *= 0.998;
    p.vy *= 0.998;
  }
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(const p of ps){
    p.x += p.vx * dts;
    p.y += p.vy * dts;
    // wrap
    if(p.x < -50) p.x += W+100;
    if(p.x > W+50) p.x -= W+100;
    if(p.y < -50) p.y += H+100;
    if(p.y > H+50) p.y -= H+100;
    const speed = Math.hypot(p.vx, p.vy);
    const hue = lerp(dom.hue[0], dom.hue[1], Math.min(1, speed/300));
    const sz = 1.5 + p.mass * 1.4 + state.bloom*1.5;
    g.fillStyle = `hsla(${hue}, ${dom.sat+10}%, ${dom.light+22}%, ${0.7 + state.glow*0.3})`;
    g.beginPath(); g.arc(p.x, p.y, sz, 0, TAU); g.fill();
  }
  g.restore();
}

// ─── Spirograph (hypotrochoid) ────────────────────────────────────────────
// Nested rotating circles draw rose / star curves. Outer R, inner r, pen offset d.
// Audio drives r and d → curve morphs in real time.
function drawSpirograph(g, dt, T){
  const dom = dominantEmo();
  const sp = modeState.spiro;
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  sp.t += dt * 0.0008 * mScale;
  const R = Math.min(W, H) * 0.36;
  const r = R * (0.28 + Math.sin(sp.t*0.3)*0.1 + (reactor.bass||0)*0.12);
  const d = r * (0.6 + Math.sin(sp.t*0.5)*0.25 + (reactor.treble||0)*0.4);
  const cx = CX, cy = CY;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const samples = 1400;
  const wraps = 8;
  for(let i=0;i<samples;i++){
    const ang = (i / samples) * TAU * wraps + sp.t;
    const x = cx + (R-r) * Math.cos(ang) + d * Math.cos((R-r)/r * ang);
    const y = cy + (R-r) * Math.sin(ang) - d * Math.sin((R-r)/r * ang);
    const hue = lerp(dom.hue[0], dom.hue[1], (i/samples + sp.t*0.05)%1);
    const a = 0.4 + 0.4*state.glow + (reactor.treble||0)*0.25;
    g.fillStyle = `hsla(${hue}, ${dom.sat+10}%, ${dom.light+22}%, ${a})`;
    const sz = 1.5 + state.bloom*1.2;
    g.fillRect(x - sz/2, y - sz/2, sz, sz);
  }
  g.restore();
}

// ─── Marbling 大理石紋 ─────────────────────────────────────────────────────
// Layered sin/cos noise field with displacement → ebru-style marbled paper.
function drawMarbling(g, dt, T){
  const m = modeState.marbling;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  m.t += dt * 0.00018 * mScale * (1 + state.motionSpeed*0.4);
  const W2 = 240, H2 = 135;
  if(!m.canvas){
    m.canvas = document.createElement('canvas');
    m.canvas.width = W2; m.canvas.height = H2;
    m.ctx = m.canvas.getContext('2d');
    m.imageData = m.ctx.createImageData(W2, H2);
  }
  const data = m.imageData.data;
  const c0 = _hslToRgbInt(dom.hue[0], dom.sat, dom.light);
  const c1 = _hslToRgbInt(dom.hue[1], dom.sat, dom.light + 26);
  const c2 = _hslToRgbInt(lerp(dom.hue[0], dom.hue[1], 0.5) + 40, dom.sat, dom.light + 12);
  const t = m.t;
  const bassWarp = (reactor.bass||0) * 3;
  for(let y=0;y<H2;y++){
    const ny = y * 0.036;
    for(let x=0;x<W2;x++){
      const nx = x * 0.036;
      // Displaced sin layers create flowing veins
      const a = Math.sin(nx + t + Math.cos(ny*1.3 + t*0.7)*2.5);
      const b = Math.cos(ny*0.8 + t*0.5 + Math.sin(nx*0.9 + t*0.4)*2.2 + bassWarp);
      const c = Math.sin((nx+ny)*0.6 + t*1.2);
      const blend1 = (a + b) * 0.5 * 0.5 + 0.5;
      const blend2 = (c + 1) * 0.5;
      const o = (y*W2+x)*4;
      // 3-color blend
      const r1 = c0[0] + (c1[0]-c0[0]) * blend1;
      const g1 = c0[1] + (c1[1]-c0[1]) * blend1;
      const b1 = c0[2] + (c1[2]-c0[2]) * blend1;
      data[o]   = r1 * (1-blend2*0.3) + c2[0] * blend2*0.3;
      data[o+1] = g1 * (1-blend2*0.3) + c2[1] * blend2*0.3;
      data[o+2] = b1 * (1-blend2*0.3) + c2[2] * blend2*0.3;
      data[o+3] = 220;
    }
  }
  m.ctx.putImageData(m.imageData, 0, 0);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.globalAlpha = 0.85 + state.glow*0.15;
  g.drawImage(m.canvas, 0, 0, W, H);
  g.restore();
}

// ─── Hilbert Curve 空間填充曲線 ───────────────────────────────────────────
function _hilbertD2XY(d, n){
  let rx, ry, t = d;
  let x = 0, y = 0;
  for(let s = 1; s < n; s *= 2){
    rx = 1 & (t/2);
    ry = 1 & (t ^ rx);
    if(ry === 0){
      if(rx === 1){ x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t/4);
  }
  return [x, y];
}
function drawHilbert(g, dt, T){
  const h = modeState.hilbert;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const order = 6;
  const n = 1 << order;
  const total = n * n;
  if(!h.points || h.order !== order){
    h.points = [];
    for(let d = 0; d < total; d++) h.points.push(_hilbertD2XY(d, n));
    h.order = order;
  }
  h.t += dt * 0.0004 * (1 + (reactor.bass||0)*1.5) * mScale;
  // ping-pong progress: 0 → 1 → 0
  const phase = h.t % 2;
  const progress = phase < 1 ? phase : 2 - phase;
  const drawCount = Math.floor(progress * total);
  const sq = Math.min(W, H) * 0.85;
  const cellSize = sq / n;
  const ox = (W - sq) / 2 + cellSize/2;
  const oy = (H - sq) / 2 + cellSize/2;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.lineWidth = 1.4 + state.bloom * 0.7;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const segLen = 24;
  for(let i = 0; i < drawCount; i += segLen){
    const end = Math.min(drawCount, i + segLen + 1);
    if(end - i < 2) break;
    const hue = lerp(dom.hue[0], dom.hue[1], i / total);
    g.strokeStyle = `hsla(${hue}, ${dom.sat+10}%, ${dom.light+22}%, ${0.65 + state.glow*0.3})`;
    g.beginPath();
    const [sx, sy] = h.points[i];
    g.moveTo(ox + sx*cellSize, oy + sy*cellSize);
    for(let j = i+1; j < end; j++){
      const [px, py] = h.points[j];
      g.lineTo(ox + px*cellSize, oy + py*cellSize);
    }
    g.stroke();
  }
  g.restore();
}

// ─── Lenia 連續細胞自動機 ─────────────────────────────────────────────────
// Convolution kernel + Gaussian growth → produces alien organism-like patterns
// (jellyfish, cells, slimemold). Smaller grid keeps the conv loop fast enough.
function ensureLenia(){
  const l = modeState.lenia;
  if(!l.grid){
    l.w = 84; l.h = 48;
    l.grid = new Float32Array(l.w * l.h);
    l.next = new Float32Array(l.w * l.h);
    // Seed with random round blobs
    for(let k=0;k<5;k++){
      const cx = Math.floor(Math.random()*l.w);
      const cy = Math.floor(Math.random()*l.h);
      for(let dy=-5;dy<=5;dy++) for(let dx=-5;dx<=5;dx++){
        const d = Math.sqrt(dx*dx+dy*dy);
        if(d > 5) continue;
        const x = (cx+dx+l.w)%l.w;
        const y = (cy+dy+l.h)%l.h;
        l.grid[y*l.w+x] = Math.max(l.grid[y*l.w+x], 1 - d/5);
      }
    }
    // Pre-compute kernel (ring peaked around r=2.5)
    const kr = 4;
    l.kSize = kr*2 + 1;
    l.K = new Float32Array(l.kSize * l.kSize);
    let kSum = 0;
    for(let dy=-kr;dy<=kr;dy++) for(let dx=-kr;dx<=kr;dx++){
      const r = Math.sqrt(dx*dx+dy*dy);
      const v = r > kr ? 0 : Math.exp(-((r-2.5)*(r-2.5))/0.5);
      l.K[(dy+kr)*l.kSize + (dx+kr)] = v;
      kSum += v;
    }
    for(let i=0;i<l.K.length;i++) l.K[i] /= kSum;
    l.canvas = document.createElement('canvas');
    l.canvas.width = l.w; l.canvas.height = l.h;
    l.ctx = l.canvas.getContext('2d');
    l.imageData = l.ctx.createImageData(l.w, l.h);
  }
}
function drawLenia(g, dt, T){
  ensureLenia();
  const l = modeState.lenia;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  l._t += dt;
  // Update step at ~25 Hz (every 40 ms) — sped up by audio
  const stepMs = 40 / (1 + (reactor.bass||0)*1.2) / mScale;
  if(l._t > stepMs){
    l._t = 0;
    const w = l.w, h = l.h, grid = l.grid, next = l.next, K = l.K, kr = 4, kSize = l.kSize;
    const mu = 0.15, sig = 0.014, dT = 0.1;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let u = 0;
        for(let dy=-kr;dy<=kr;dy++){
          const ny = (y+dy+h)%h * w;
          const kBase = (dy+kr)*kSize;
          for(let dx=-kr;dx<=kr;dx++){
            const nx = (x+dx+w)%w;
            u += K[kBase + (dx+kr)] * grid[ny + nx];
          }
        }
        const growth = 2 * Math.exp(-((u-mu)*(u-mu))/(2*sig*sig)) - 1;
        const nv = grid[y*w+x] + dT * growth;
        next[y*w+x] = nv < 0 ? 0 : (nv > 1 ? 1 : nv);
      }
    }
    l.grid = next; l.next = grid;
  }
  // Render
  const data = l.imageData.data;
  const c0 = _hslToRgbInt(dom.hue[0], dom.sat, dom.light);
  const c1 = _hslToRgbInt(dom.hue[1], dom.sat, dom.light + 28);
  for(let i=0;i<l.grid.length;i++){
    const v = l.grid[i];
    const o = i*4;
    data[o]   = c0[0] + (c1[0]-c0[0]) * v;
    data[o+1] = c0[1] + (c1[1]-c0[1]) * v;
    data[o+2] = c0[2] + (c1[2]-c0[2]) * v;
    data[o+3] = Math.floor(v * 240);
  }
  l.ctx.putImageData(l.imageData, 0, 0);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.85 + state.glow*0.15;
  g.drawImage(l.canvas, 0, 0, W, H);
  g.restore();
}

// ─── Double Pendulum 雙擺 ────────────────────────────────────────────────
// Chaotic physical system. Trail traces beautiful unpredictable curves.
function ensurePendulum(){
  const p = modeState.pendulum;
  if(!p.state){
    p.state = { theta1: Math.PI*0.65, theta2: Math.PI*0.45, omega1: 0, omega2: 0 };
    p.trail = [];
  }
}
function drawPendulum(g, dt, T){
  ensurePendulum();
  const p = modeState.pendulum;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const s = p.state;
  const L1 = Math.min(W, H) * 0.22;
  const L2 = Math.min(W, H) * 0.18;
  const m1 = 1, m2 = 1;
  const gravity = 0.4 + (reactor.bass||0)*0.5;
  const steps = 6;
  const dh = Math.min(50, dt) / 1000 / steps * mScale;
  for(let i=0;i<steps;i++){
    const sin12 = Math.sin(s.theta1 - s.theta2);
    const cos12 = Math.cos(s.theta1 - s.theta2);
    const den1 = L1 * (2*m1 + m2 - m2*Math.cos(2*s.theta1 - 2*s.theta2));
    const den2 = L2 * (2*m1 + m2 - m2*Math.cos(2*s.theta1 - 2*s.theta2));
    const num1 = -gravity*(2*m1+m2)*Math.sin(s.theta1)
                 - m2*gravity*Math.sin(s.theta1-2*s.theta2)
                 - 2*sin12*m2*(s.omega2*s.omega2*L2 + s.omega1*s.omega1*L1*cos12);
    const num2 = 2*sin12*(s.omega1*s.omega1*L1*(m1+m2) + gravity*(m1+m2)*Math.cos(s.theta1) + s.omega2*s.omega2*L2*m2*cos12);
    s.omega1 += (num1/den1) * dh;
    s.omega2 += (num2/den2) * dh;
    s.theta1 += s.omega1 * dh;
    s.theta2 += s.omega2 * dh;
  }
  const x1 = CX + L1 * Math.sin(s.theta1);
  const y1 = CY + L1 * Math.cos(s.theta1);
  const x2 = x1 + L2 * Math.sin(s.theta2);
  const y2 = y1 + L2 * Math.cos(s.theta2);
  p.trail.push({ x: x2, y: y2 });
  if(p.trail.length > 1400) p.trail.shift();
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.lineWidth = 1.5 + state.bloom * 0.8;
  for(let i = 1; i < p.trail.length; i++){
    const a = i / p.trail.length;
    const hue = lerp(dom.hue[0], dom.hue[1], a);
    g.strokeStyle = `hsla(${hue}, ${dom.sat+10}%, ${dom.light+22}%, ${a * (0.65 + state.glow*0.35)})`;
    g.beginPath();
    g.moveTo(p.trail[i-1].x, p.trail[i-1].y);
    g.lineTo(p.trail[i].x, p.trail[i].y);
    g.stroke();
  }
  // Pendulum arms
  g.strokeStyle = `hsla(${lerp(dom.hue[0], dom.hue[1], 0.5)}, ${dom.sat}%, ${Math.min(95, dom.light+35)}%, 0.85)`;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(CX, CY); g.lineTo(x1, y1); g.lineTo(x2, y2);
  g.stroke();
  g.fillStyle = g.strokeStyle;
  g.beginPath(); g.arc(x1, y1, 4, 0, TAU); g.fill();
  g.beginPath(); g.arc(x2, y2, 6, 0, TAU); g.fill();
  g.restore();
}

// ─── Galaxy 對數螺旋星系 ──────────────────────────────────────────────────
function ensureGalaxy(){
  if(modeState.galaxy.stars.length === 0){
    const N = 500;
    for(let i=0;i<N;i++){
      const r = Math.pow(Math.random(), 0.5);  // skewed toward edges
      const arm = Math.floor(Math.random()*4);
      modeState.galaxy.stars.push({
        r,
        arm,
        baseAngle: arm * Math.PI/2 + (Math.random()-0.5)*0.45,
        speed: 0.7 + Math.random() * 0.6,
        size: 0.5 + Math.random()*1.8,
      });
    }
  }
}
function drawGalaxy(g, dt, T){
  ensureGalaxy();
  const stars = modeState.galaxy.stars;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const t = state.t * 0.00025 * mScale;
  const cx = CX, cy = CY;
  const R = Math.min(W, H) * 0.45;
  const bassPulse = 1 + (reactor.bass||0)*0.15;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(const s of stars){
    const r = s.r * R * bassPulse;
    // Logarithmic spiral arm twist — outer stars trail behind
    const twist = Math.log(s.r + 0.1) * 2.2;
    const angle = s.baseAngle + t / (0.3 + s.r * 1.5) * s.speed + twist;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const hue = lerp(dom.hue[0], dom.hue[1], s.r);
    const a = (0.85 - s.r * 0.3) * (0.6 + state.glow*0.4);
    g.fillStyle = `hsla(${hue}, ${dom.sat+10}%, ${dom.light+22}%, ${a})`;
    g.beginPath();
    g.arc(x, y, s.size + state.bloom*0.6, 0, TAU);
    g.fill();
  }
  // Central bright core
  const coreGrad = g.createRadialGradient(cx, cy, 0, cx, cy, R*0.25);
  coreGrad.addColorStop(0, `hsla(${lerp(dom.hue[0], dom.hue[1], 0.5)}, ${dom.sat+10}%, ${Math.min(95, dom.light+35)}%, 0.7)`);
  coreGrad.addColorStop(1, `hsla(${lerp(dom.hue[0], dom.hue[1], 0.5)}, ${dom.sat}%, ${dom.light}%, 0)`);
  g.fillStyle = coreGrad;
  g.beginPath(); g.arc(cx, cy, R*0.25, 0, TAU); g.fill();
  g.restore();
}

// ─── Penrose Tiling 五重非週期密鋪 ────────────────────────────────────────
// Robinson triangle deflation algorithm. Generates aperiodic 5-fold symmetric
// pattern. Pre-generated once; rotated/scaled in render.
function _makePenroseTriangles(depth){
  const PHI = (1 + Math.sqrt(5)) / 2;
  let triangles = [];
  for(let i = 0; i < 10; i++){
    const a1 = ((i - 1) * 36 - 180) * Math.PI / 180;
    const a2 = (i * 36 - 180) * Math.PI / 180;
    let v1 = [Math.cos(a1), Math.sin(a1)];
    let v2 = [Math.cos(a2), Math.sin(a2)];
    if(i % 2 === 0){ const tmp = v1; v1 = v2; v2 = tmp; }
    triangles.push({ k: 0, A: [0,0], B: v1, C: v2 });
  }
  for(let n = 0; n < depth; n++){
    const next = [];
    for(const t of triangles){
      const A = t.A, B = t.B, C = t.C;
      if(t.k === 0){
        const P = [A[0] + (B[0]-A[0])/PHI, A[1] + (B[1]-A[1])/PHI];
        next.push({ k:0, A:C, B:P, C:B });
        next.push({ k:1, A:P, B:C, C:A });
      } else {
        const Q = [B[0] + (A[0]-B[0])/PHI, B[1] + (A[1]-B[1])/PHI];
        const R = [B[0] + (C[0]-B[0])/PHI, B[1] + (C[1]-B[1])/PHI];
        next.push({ k:1, A:R, B:C, C:A });
        next.push({ k:1, A:Q, B:R, C:B });
        next.push({ k:0, A:R, B:Q, C:A });
      }
    }
    triangles = next;
  }
  return triangles;
}
function drawPenrose(g, dt, T){
  const p = modeState.penrose;
  const dom = dominantEmo();
  const wantDepth = 5;
  if(!p.triangles || p.depth !== wantDepth){
    p.triangles = _makePenroseTriangles(wantDepth);
    p.depth = wantDepth;
  }
  const cx = CX, cy = CY;
  const scale = Math.min(W, H) * 0.48;
  const rot = state.t * 0.00006 * (1 + (reactor.bass||0)*0.5);
  const cos = Math.cos(rot), sin = Math.sin(rot);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const fillThin = `hsla(${dom.hue[0]}, ${dom.sat+5}%, ${dom.light+18}%, ${0.55 + state.glow*0.25})`;
  const fillThick = `hsla(${dom.hue[1]}, ${dom.sat+10}%, ${dom.light+26}%, ${0.55 + state.glow*0.25})`;
  const strokeCol = `hsla(${lerp(dom.hue[0], dom.hue[1], 0.5)}, ${dom.sat}%, ${dom.light+10}%, ${0.5 + state.glow*0.3})`;
  g.lineWidth = Math.max(0.6, state.bloom * 0.8);
  for(const t of p.triangles){
    const ax = t.A[0]*scale, ay = t.A[1]*scale;
    const bx = t.B[0]*scale, by = t.B[1]*scale;
    const cx2 = t.C[0]*scale, cy2 = t.C[1]*scale;
    const Ax = cx + ax*cos - ay*sin, Ay = cy + ax*sin + ay*cos;
    const Bx = cx + bx*cos - by*sin, By = cy + bx*sin + by*cos;
    const Cx = cx + cx2*cos - cy2*sin, Cy = cy + cx2*sin + cy2*cos;
    g.fillStyle = t.k === 0 ? fillThin : fillThick;
    g.strokeStyle = strokeCol;
    g.beginPath();
    g.moveTo(Ax, Ay);
    g.lineTo(Bx, By);
    g.lineTo(Cx, Cy);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

// ─── Newton's Pendulum Wave ───────────────────────────────────────────────
function drawPendulumWave(g, dt, T){
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const t = state.t * 0.001 * mScale * (1 + (reactor.bass||0)*0.4);
  const n = 17;
  const Y0 = H * 0.22;
  const span = W * 0.78;
  const spacing = span / (n-1);
  const startX = (W - span) / 2;
  const length = Math.min(W, H) * 0.45;
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  for(let i=0;i<n;i++){
    // Each pendulum has a unique frequency — Newton's wave demonstration
    const cps = (50 + i) / 60;
    const angle = Math.sin(t * cps * Math.PI * 2) * (Math.PI * 0.32);
    const x = startX + i * spacing;
    const x2 = x + Math.sin(angle) * length;
    const y2 = Y0 + Math.cos(angle) * length;
    const hue = lerp(dom.hue[0], dom.hue[1], i/n);
    g.strokeStyle = `hsla(${hue}, ${dom.sat+5}%, ${dom.light+18}%, ${0.5 + state.glow*0.3})`;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x, Y0); g.lineTo(x2, y2); g.stroke();
    // Ball
    const r = 8 + state.bloom*4 + (reactor.bass||0)*4;
    g.fillStyle = `hsla(${hue}, ${dom.sat+15}%, ${Math.min(95, dom.light+30)}%, ${0.85 + state.glow*0.15})`;
    g.beginPath(); g.arc(x2, y2, r, 0, TAU); g.fill();
  }
  g.restore();
}

// ─── Mandelbrot 碎形 ──────────────────────────────────────────────────────
function drawMandelbrot(g, dt, T){
  const m = modeState.mandel;
  const dom = dominantEmo();
  const W2 = 240, H2 = 135;
  if(!m.canvas){
    m.canvas = document.createElement('canvas');
    m.canvas.width = W2; m.canvas.height = H2;
    m.ctx = m.canvas.getContext('2d');
    m.imageData = m.ctx.createImageData(W2, H2);
  }
  m._t += dt * 0.0001 * (1 + (reactor.bass||0)*0.5);
  const zoomBase = 0.7 + (Math.sin(m._t*0.7) * 0.5 + 0.5) * 1.5;
  const cx = -0.5 + Math.cos(m._t*0.4) * 0.25;
  const cy = Math.sin(m._t*0.55) * 0.15;
  const maxIter = 56;
  const data = m.imageData.data;
  const c0 = _hslToRgbInt(dom.hue[0], dom.sat, dom.light);
  const c1 = _hslToRgbInt(dom.hue[1], dom.sat, dom.light+28);
  const c2 = _hslToRgbInt(lerp(dom.hue[0], dom.hue[1], 0.5) + 60, dom.sat, dom.light+8);
  for(let py=0;py<H2;py++){
    const ny = cy + (py - H2/2) / H2 * 2 / zoomBase;
    for(let px=0;px<W2;px++){
      const nx = cx + (px - W2/2) / H2 * 2 / zoomBase;
      let zx = 0, zy = 0;
      let iter = 0;
      while(iter < maxIter){
        const zx2 = zx*zx, zy2 = zy*zy;
        if(zx2 + zy2 > 4) break;
        const newZx = zx2 - zy2 + nx;
        zy = 2*zx*zy + ny;
        zx = newZx;
        iter++;
      }
      const o = (py*W2+px)*4;
      if(iter === maxIter){
        data[o]=10; data[o+1]=10; data[o+2]=20; data[o+3]=180;
      } else {
        const t01 = iter / maxIter;
        const t2 = (t01 + m._t * 0.3) % 1;
        const r = t2 < 0.5 ? lerp(c0[0], c1[0], t2*2) : lerp(c1[0], c2[0], (t2-0.5)*2);
        const gg = t2 < 0.5 ? lerp(c0[1], c1[1], t2*2) : lerp(c1[1], c2[1], (t2-0.5)*2);
        const b = t2 < 0.5 ? lerp(c0[2], c1[2], t2*2) : lerp(c1[2], c2[2], (t2-0.5)*2);
        data[o]=r; data[o+1]=gg; data[o+2]=b; data[o+3]=235;
      }
    }
  }
  m.ctx.putImageData(m.imageData, 0, 0);
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.88 + state.glow*0.12;
  g.drawImage(m.canvas, 0, 0, W, H);
  g.restore();
}

// ─── Wireworld (4-state circuit CA) ───────────────────────────────────────
// 0=empty 1=head 2=tail 3=conductor. Auto-seeds a simple loop circuit.
function ensureWireworld(){
  const wd = modeState.wireworld;
  if(!wd.grid){
    wd.w = 80; wd.h = 45;
    wd.grid = new Uint8Array(wd.w * wd.h);
    wd.next = new Uint8Array(wd.w * wd.h);
    // Seed circuits: 3 concentric loops with electron heads
    const cx = Math.floor(wd.w/2), cy = Math.floor(wd.h/2);
    function drawLoop(r){
      for(let a=0; a<360; a+=4){
        const ang = a * Math.PI/180;
        const x = Math.round(cx + Math.cos(ang) * r);
        const y = Math.round(cy + Math.sin(ang) * r);
        if(x>=0 && x<wd.w && y>=0 && y<wd.h) wd.grid[y*wd.w + x] = 3;
      }
    }
    drawLoop(8); drawLoop(14); drawLoop(20);
    // Add 4 electrons (head+tail pairs) on each loop
    function seedElectron(r, startAng){
      const angH = startAng * Math.PI/180;
      const angT = (startAng-4) * Math.PI/180;
      const hx = Math.round(cx + Math.cos(angH) * r), hy = Math.round(cy + Math.sin(angH) * r);
      const tx = Math.round(cx + Math.cos(angT) * r), ty = Math.round(cy + Math.sin(angT) * r);
      if(hx>=0 && hx<wd.w && hy>=0 && hy<wd.h) wd.grid[hy*wd.w + hx] = 1;
      if(tx>=0 && tx<wd.w && ty>=0 && ty<wd.h) wd.grid[ty*wd.w + tx] = 2;
    }
    seedElectron(8, 0); seedElectron(8, 180);
    seedElectron(14, 90); seedElectron(14, 270);
    seedElectron(20, 45); seedElectron(20, 225);
  }
}
function drawWireworld(g, dt, T){
  ensureWireworld();
  const wd = modeState.wireworld;
  const dom = dominantEmo();
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  wd._t += dt;
  const stepMs = 90 / (1 + (reactor.bass||0)*1.2) / mScale;
  if(wd._t > stepMs){
    wd._t = 0;
    const w = wd.w, h = wd.h;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i = y*w + x;
        const c = wd.grid[i];
        if(c === 0) wd.next[i] = 0;
        else if(c === 1) wd.next[i] = 2;
        else if(c === 2) wd.next[i] = 3;
        else { // conductor — becomes head if 1 or 2 neighbours are heads
          let n = 0;
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
            if(dx===0 && dy===0) continue;
            const nx = (x+dx+w)%w, ny = (y+dy+h)%h;
            if(wd.grid[ny*w+nx] === 1) n++;
          }
          wd.next[i] = (n === 1 || n === 2) ? 1 : 3;
        }
      }
    }
    const tmp = wd.grid; wd.grid = wd.next; wd.next = tmp;
  }
  // Render
  g.save();
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'lighter';
  const cw = W / wd.w, ch = H / wd.h;
  const headCol = `hsla(${dom.hue[0]+40}, ${dom.sat+15}%, ${Math.min(95, dom.light+35)}%, ${0.9 + state.glow*0.1})`;
  const tailCol = `hsla(${dom.hue[1]}, ${dom.sat+5}%, ${dom.light+15}%, 0.7)`;
  const condCol = `hsla(${lerp(dom.hue[0], dom.hue[1], 0.5)}, ${dom.sat-10}%, ${dom.light-5}%, 0.35)`;
  for(let y=0;y<wd.h;y++){
    for(let x=0;x<wd.w;x++){
      const c = wd.grid[y*wd.w+x];
      if(c === 0) continue;
      g.fillStyle = c === 1 ? headCol : (c === 2 ? tailCol : condCol);
      g.fillRect(x*cw, y*ch, cw+1, ch+1);
    }
  }
  g.restore();
}

function drawMandalaRings(g, dt, T){
  modeState.ringTimer += dt;
  const interval = 60000 / Math.max(40, state.bpm * (state.musicOn || reactor.mode!=='off' ? 1 : 0.6));
  if(modeState.ringTimer > interval){
    modeState.ringTimer = 0;
    const dom = dominantEmo();
    modeState.rings.push({ r:0, life:0, hue: lerp(dom.hue[0], dom.hue[1], Math.random()), sat: dom.sat, lit: dom.light+10 });
  }
  if(modeState.rings.length > 24) modeState.rings.shift();
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i = modeState.rings.length-1; i>=0; i--){
    const r = modeState.rings[i];
    r.life += dt;
    r.r = r.life * 0.0006 * Math.max(W,H) * (1 + (reactor.bass||0)*0.6);
    const lifeT = r.life / 4000;
    if(lifeT > 1){ modeState.rings.splice(i,1); continue; }
    const a = (1 - lifeT) * 0.5 * state.glow;
    g.strokeStyle = `hsla(${r.hue}, ${r.sat}%, ${r.lit}%, ${a})`;
    g.lineWidth = 1.5 + 6*(1-lifeT) * state.bloom;
    g.beginPath(); g.arc(CX, CY, r.r, 0, TAU); g.stroke();
    // inner second ring
    g.strokeStyle = `hsla(${r.hue+20}, ${r.sat}%, ${r.lit+8}%, ${a*0.5})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(CX, CY, r.r * 0.6, 0, TAU); g.stroke();
  }
  g.restore();
}

function drawWaveform(g, dt, T){
  if(!reactor.analyser || reactor.mode === 'off'){
    // fallback: synthetic wave from emotion mix
    const dom = dominantEmo();
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `hsla(${dom.hue[0]}, ${dom.sat}%, ${dom.light+15}%, ${0.35 * state.glow})`;
    g.lineWidth = 1.5;
    g.beginPath();
    for(let x=0;x<=W;x+=4){
      const y = CY + Math.sin(x*0.012 + state.t*0.002)*40*SCALE + Math.sin(x*0.04 + state.t*0.0008)*15*SCALE;
      if(x===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.stroke(); g.restore();
    return;
  }
  // real audio waveform
  const dom = dominantEmo();
  const buf = new Uint8Array(reactor.analyser.fftSize);
  reactor.analyser.getByteTimeDomainData(buf);
  g.save(); g.globalCompositeOperation = 'lighter';
  // multi-pass glow
  const passes = [
    { w: 6*SCALE, a: 0.12 + state.bloom*0.2 },
    { w: 2.5*SCALE, a: 0.4 },
    { w: 1*SCALE, a: 0.9 },
  ];
  for(const pass of passes){
    g.strokeStyle = `hsla(${dom.hue[0]+state.hueShift}, ${Math.min(100, dom.sat+state.vibrance/3)}%, ${dom.light+18}%, ${pass.a})`;
    g.lineWidth = pass.w;
    g.beginPath();
    const N = buf.length;
    for(let i=0;i<N;i++){
      const x = i/(N-1) * W;
      const v = (buf[i]-128)/128;
      const y = CY + v * 0.35 * H;
      if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.stroke();
  }
  g.restore();
}

function drawConstellation(g, dt, T){
  const dom = dominantEmo();
  const n = Math.floor(40 + state.density*40);
  // stable positions via deterministic noise
  const pts = [];
  for(let i=0;i<n;i++){
    const seed = i*9301 + 49297;
    const tx = (Math.sin(seed*0.013)*0.5+0.5);
    const ty = (Math.sin(seed*0.027 + 1.7)*0.5+0.5);
    const drift = state.t * 0.00003 * (0.3 + state.motionSpeed);
    pts.push({
      x: (tx + Math.sin(seed*0.001 + drift)*0.08) * W,
      y: (ty + Math.cos(seed*0.0017 + drift)*0.08) * H,
    });
  }
  g.save(); g.globalCompositeOperation = 'lighter';
  // dots
  for(const p of pts){
    g.fillStyle = `hsla(${lerp(dom.hue[0], dom.hue[1], (p.x+p.y)/(W+H))}, ${dom.sat}%, ${dom.light+18}%, ${0.8*state.glow})`;
    g.beginPath(); g.arc(p.x, p.y, 1.6 + (reactor.treble||0)*2, 0, TAU); g.fill();
  }
  // connections to near neighbors
  const maxDist = Math.min(W,H)*0.16 * (1 + (reactor.vol||0)*0.6);
  g.lineWidth = 0.6;
  for(let i=0;i<pts.length;i++){
    for(let j=i+1;j<pts.length;j++){
      const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y;
      const d = Math.hypot(dx,dy);
      if(d < maxDist){
        const a = (1 - d/maxDist) * 0.35 * state.glow;
        g.strokeStyle = `hsla(${dom.hue[0]+20}, ${dom.sat}%, ${dom.light+10}%, ${a})`;
        g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[j].x, pts[j].y); g.stroke();
      }
    }
  }
  g.restore();
}

function drawSpiral(g, dt, T){
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  const arms = 5;
  const tw = state.t*0.0004*(0.4 + state.motionSpeed + (reactor.mid||0)*1.5);
  for(let a=0;a<arms;a++){
    g.beginPath();
    for(let i=0;i<160;i++){
      const t = i/160;
      const ang = a/arms*TAU + t*TAU*2.2 + tw;
      const rad = t*Math.min(W,H)*0.5 * (0.5 + (reactor.bass||0)*0.5 + state.bloom*0.4);
      const x = CX + Math.cos(ang)*rad;
      const y = CY + Math.sin(ang)*rad;
      if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.strokeStyle = `hsla(${lerp(dom.hue[0],dom.hue[1],a/arms)}, ${dom.sat}%, ${dom.light+10}%, ${0.45*state.glow})`;
    g.lineWidth = 1.4 + Math.sin(state.t*0.002+a)*0.8;
    g.stroke();
  }
  g.restore();
}

// ===== New visual modes =====
function drawRipples(g, dt, T){
  if(!modeState.ripples) modeState.ripples = [];
  modeState.rippleTimer = (modeState.rippleTimer||0) + dt;
  const interval = Math.max(180, 800 - state.motionSpeed*250 - (reactor.bass||0)*450);
  if(modeState.rippleTimer > interval || (state.beatFlash > 0.6 && modeState.rippleTimer > 120)){
    modeState.rippleTimer = 0;
    const dom = dominantEmo();
    modeState.ripples.push({
      x: Math.random()*W, y: Math.random()*H,
      r: 0, life: 0, maxLife: 2200 + Math.random()*1400,
      hue: lerp(dom.hue[0], dom.hue[1], Math.random()),
      sat: dom.sat, lit: dom.light + 12,
      rings: 1 + Math.floor(Math.random()*3),
    });
  }
  if(modeState.ripples.length > 28) modeState.ripples.shift();
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i=modeState.ripples.length-1;i>=0;i--){
    const r = modeState.ripples[i];
    r.life += dt;
    const lt = r.life / r.maxLife;
    if(lt > 1){ modeState.ripples.splice(i,1); continue; }
    const baseR = lt * 280 * SCALE * (1 + state.turbulence*0.4);
    const a = (1-lt) * 0.6 * state.glow;
    for(let k=0;k<r.rings;k++){
      const rr = baseR - k*22*SCALE;
      if(rr<=0) continue;
      g.strokeStyle = `hsla(${r.hue+k*8},${r.sat}%,${r.lit}%,${a*(1-k*0.3)})`;
      g.lineWidth = 1.6 + (1-lt)*2.2;
      g.beginPath(); g.arc(r.x, r.y, rr, 0, TAU); g.stroke();
    }
  }
  g.restore();
}

function drawCrystals(g, dt, T){
  const dom = dominantEmo();
  const n = Math.floor(8 + state.density*16);
  const baseRot = state.t * 0.0002 * state.motionSpeed;
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i=0;i<n;i++){
    const ang = (i/n)*TAU + baseRot + Math.sin(state.t*0.0008+i)*0.05;
    const beat = 0.6 + Math.sin(state.t*0.0015 + i*1.7)*0.3 + (reactor.bass||0)*0.5;
    const len = Math.min(W,H) * 0.46 * beat;
    const wd  = Math.min(W,H) * 0.05 * (0.5 + (reactor.mid||0)) * (0.6 + state.glow*0.6);
    g.save();
    g.translate(CX, CY);
    g.rotate(ang);
    const h = lerp(dom.hue[0], dom.hue[1], i/n);
    const grd = g.createLinearGradient(0,0,len,0);
    grd.addColorStop(0,    `hsla(${h},${dom.sat}%,${dom.light+18}%,${0.65*state.glow})`);
    grd.addColorStop(0.45, `hsla(${h+15},${dom.sat}%,${dom.light+8}%,${0.35*state.glow})`);
    grd.addColorStop(1,    `hsla(${h},${dom.sat}%,${dom.light}%,0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len*0.55, -wd);
    g.lineTo(len, 0);
    g.lineTo(len*0.55, wd);
    g.closePath();
    g.fill();
    // edge highlight
    g.strokeStyle = `hsla(${h+30},${dom.sat}%,${dom.light+25}%,${0.5*state.glow})`;
    g.lineWidth = 0.7;
    g.stroke();
    g.restore();
  }
  g.restore();
}

function drawRibbons(g, dt, T){
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  const ribbons = 3 + Math.floor(state.density*1.5);
  for(let r=0;r<ribbons;r++){
    const phase = state.t * 0.0003 * (0.4 + state.motionSpeed) + r * 1.7;
    const yBase = (0.2 + 0.6*r/(ribbons-1)) * H;
    g.beginPath();
    for(let i=0;i<=120;i++){
      const t = i/120;
      const x = t * W * 1.1 - W*0.05;
      const y = yBase
              + Math.sin(t*7 + phase) * 70 * SCALE * (0.6 + state.turbulence + (reactor.bass||0)*0.8)
              + Math.sin(t*17 + phase*1.4) * 20 * SCALE
              + Math.sin(t*3 + phase*0.6) * 35 * SCALE;
      if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    const h = lerp(dom.hue[0], dom.hue[1], r/Math.max(1,ribbons-1));
    g.strokeStyle = `hsla(${h}, ${dom.sat}%, ${dom.light+10}%, ${0.5*state.glow})`;
    g.lineWidth = 8 + Math.sin(phase)*5 + (reactor.mid||0)*8;
    g.lineCap = 'round';
    g.stroke();
    // highlight line above
    g.strokeStyle = `hsla(${h+20}, ${dom.sat}%, ${dom.light+25}%, ${0.55*state.glow})`;
    g.lineWidth = 1.2;
    g.stroke();
  }
  g.restore();
}

function drawTunnel(g, dt, T){
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  const layers = 16;
  const speed = (state.t * 0.0004 * (0.5 + state.motionSpeed + (reactor.bass||0)*1.2)) % 1;
  const sides = 6;
  for(let i=0;i<layers;i++){
    const z = ((i + speed) % layers) / layers;
    const r = Math.pow(z, 1.7) * Math.max(W,H) * 0.9;
    if(r <= 0) continue;
    const a = (1 - z) * 0.45 * state.glow * (0.6 + (reactor.vol||0)*0.8);
    const h = lerp(dom.hue[0], dom.hue[1], z);
    g.strokeStyle = `hsla(${h},${dom.sat}%,${dom.light+15}%,${a})`;
    g.lineWidth = (1-z)*4 + 0.6;
    g.beginPath();
    for(let s=0;s<=sides;s++){
      const ang = s/sides*TAU + state.t*0.0003 + z*1.5;
      const x = CX + Math.cos(ang)*r;
      const y = CY + Math.sin(ang)*r;
      if(s===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.closePath();
    g.stroke();
  }
  g.restore();
}

function drawHalftone(g, dt, T){
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  const spacing = Math.max(14, 36 - state.density*18) * SCALE;
  const baseSize = 1.2 * SCALE;
  for(let y=spacing/2;y<H;y+=spacing){
    for(let x=spacing/2;x<W;x+=spacing){
      const nx = (x-CX)/W, ny = (y-CY)/H;
      const d = Math.hypot(nx, ny);
      const n = noise2(nx*5 + state.t*0.0006*state.motionSpeed, ny*5 + state.t*0.0004);
      const audio = (reactor.bass||0)*Math.sin(d*10 - state.t*0.003);
      const size = baseSize + (n*1.6 + audio + 1) * 4 * (state.glow + 0.3);
      if(size <= 0.1) continue;
      const h = lerp(dom.hue[0], dom.hue[1], (d*1.5 + n*0.4)%1);
      g.fillStyle = `hsla(${h},${dom.sat}%,${dom.light+12}%,${0.6*state.glow*(1-d*0.5)})`;
      g.beginPath(); g.arc(x, y, size, 0, TAU); g.fill();
    }
  }
  g.restore();
}

function drawPetals(g, dt, T){
  if(!modeState.petals) modeState.petals = [];
  const target = Math.floor(20 + state.density*30);
  while(modeState.petals.length < target){
    modeState.petals.push({
      x: Math.random()*W, y: -Math.random()*H*0.5,
      vy: 0.3 + Math.random()*0.7,
      vx: (Math.random()-0.5)*0.5,
      r: 4 + Math.random()*10,
      rot: Math.random()*TAU, vRot: (Math.random()-0.5)*0.04,
      seed: Math.random(),
    });
  }
  if(modeState.petals.length > target) modeState.petals.length = target;
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  for(const p of modeState.petals){
    const wind = noise2(p.x*0.005 + state.t*0.0003, p.y*0.005) * 1.5;
    p.vx += wind*0.02*state.turbulence*0.4;
    p.x += (p.vx + wind*0.5) * state.motionSpeed * dt*0.06;
    p.y += (p.vy + (reactor.bass||0)*0.6) * state.motionSpeed * dt*0.08;
    p.rot += p.vRot * (1 + state.motionSpeed*0.5);
    if(p.y > H + 20){ p.y = -20; p.x = Math.random()*W; }
    if(p.x < -20) p.x = W+10; if(p.x > W+20) p.x = -10;
    const h = lerp(dom.hue[0], dom.hue[1], p.seed);
    const sz = p.r * SCALE * (0.8 + state.glow*0.6);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    const grd = g.createRadialGradient(0,0,0, 0,0,sz);
    grd.addColorStop(0, `hsla(${h},${dom.sat}%,${dom.light+22}%,${0.85*state.glow})`);
    grd.addColorStop(1, `hsla(${h},${dom.sat}%,${dom.light}%,0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(0, 0, sz, sz*0.55, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  g.restore();
}

function drawAurora(g, dt, T){
  const dom = dominantEmo();
  g.save(); g.globalCompositeOperation = 'lighter';
  const curtains = 5;
  for(let i=0;i<curtains;i++){
    const phase = state.t*0.0003*(0.4+state.motionSpeed) + i*1.3;
    const cx = (0.15 + 0.7*i/(curtains-1) + Math.sin(phase)*0.1) * W;
    const wd = (60 + Math.sin(phase*1.4)*40 + (reactor.mid||0)*60) * SCALE;
    const h1 = lerp(dom.hue[0], dom.hue[1], i/curtains);
    const h2 = lerp(dom.hue[1], dom.hue[0], i/curtains);
    const grd = g.createLinearGradient(cx-wd, 0, cx+wd, 0);
    grd.addColorStop(0,    `hsla(${h1},${dom.sat}%,${dom.light+5}%,0)`);
    grd.addColorStop(0.5,  `hsla(${(h1+h2)/2},${dom.sat}%,${dom.light+18}%,${0.5*state.glow*(0.6+(reactor.vol||0)*0.6)})`);
    grd.addColorStop(1,    `hsla(${h2},${dom.sat}%,${dom.light+5}%,0)`);
    g.fillStyle = grd;
    // wavy vertical band
    g.beginPath();
    for(let y=0;y<=H+10;y+=10){
      const wob = Math.sin(y*0.005 + phase*2)*30*SCALE + Math.sin(y*0.012+phase)*15*SCALE;
      const left = cx - wd + wob;
      if(y===0) g.moveTo(left, y); else g.lineTo(left, y);
    }
    for(let y=H+10;y>=0;y-=10){
      const wob = Math.sin(y*0.005 + phase*2)*30*SCALE + Math.sin(y*0.012+phase)*15*SCALE;
      const right = cx + wd + wob;
      g.lineTo(right, y);
    }
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ============================================================
// Ink wash · 水墨 — proper sumi-e style with SOLID BLACK ink core,
// dry-brush striations (飛白), wet bleeding halo, and ink pools that
// drip downward like real sumi-e accidents. Reference: real ink-on-paper
// where the saturated wet centre is near-100% black, only the bleed
// edges + dry breakup are translucent.
// ============================================================
let _inkStrokes = [];
let _inkSpawnT = 0;

// Warm-black ink color (matches sumi-e pigment, not pure neutral black).
const INK_CORE   = '12,8,6';     // very dark, near black
const INK_WET    = '20,15,10';   // wet bleed halo, slightly warm
const INK_HALO   = '40,30,22';   // outer paper soak

function _seedInkStroke(){
  const fromLeft = Math.random() < 0.5;
  const horizontal = Math.random() < 0.5;
  const startSide = Math.random();
  let x0, y0, x1, y1;
  if(horizontal){
    const cy = Math.random()*H;
    x0 = fromLeft ? -80*SCALE : W+80*SCALE;
    x1 = fromLeft ? W+80*SCALE : -80*SCALE;
    y0 = cy + (Math.random()-0.5)*H*0.2;
    y1 = cy + (Math.random()-0.5)*H*0.2;
  } else {
    const cx = Math.random()*W;
    x0 = cx + (Math.random()-0.5)*W*0.2;
    x1 = cx + (Math.random()-0.5)*W*0.2;
    y0 = startSide < 0.5 ? -80*SCALE : H+80*SCALE;
    y1 = startSide < 0.5 ? H+80*SCALE : -80*SCALE;
  }
  const N = 26;
  const bend = (Math.random()-0.5) * Math.min(W,H) * 0.45;
  const mx = (x0+x1)/2 + (horizontal ? 0 : bend);
  const my = (y0+y1)/2 + (horizontal ? bend : 0);
  const pts = [];
  // Where the brush starts running dry (later in stroke = more wet ink visible)
  const dryStart = 0.45 + Math.random()*0.35;
  // Per-stroke fibre seed — gives consistent dry-brush pattern along a single stroke
  const fibreSeed = Math.random() * 1000;
  for(let i=0;i<=N;i++){
    const u = i/N;
    const px = (1-u)*(1-u)*x0 + 2*(1-u)*u*mx + u*u*x1;
    const py = (1-u)*(1-u)*y0 + 2*(1-u)*u*my + u*u*y1;
    // Calligraphic taper — thin at start, thick mid, thin at end with bias
    const taper = Math.sin(u*Math.PI) * 0.85 + Math.sin(u*Math.PI*0.5) * 0.15;
    // Wetness: full ink until dryStart, then breaks up
    let wet = 1;
    if(u > dryStart){
      const dr = (u - dryStart) / (1 - dryStart);
      wet = Math.max(0.05, 1 - dr*0.85);
      // Periodic gaps from brush fibres separating
      if(Math.sin(u*38 + fibreSeed*0.3) < -0.2) wet *= 0.3;
      if(Math.sin(u*73 + fibreSeed*0.7) < -0.4) wet *= 0.5;
    }
    pts.push({ x: px, y: py, taper, wet });
  }
  // Ink pools — small dark concentrations that slowly grow and may drip
  const pools = [];
  const poolN = 1 + Math.floor(Math.random()*3);
  for(let i=0;i<poolN;i++){
    const u = 0.15 + Math.random()*0.65;
    const idx = Math.floor(u*N);
    pools.push({
      x: pts[idx].x + (Math.random()-0.5)*30*SCALE,
      y: pts[idx].y + (Math.random()-0.5)*30*SCALE,
      r0: (8 + Math.random()*20) * SCALE,
      rGrowth: (18 + Math.random()*40) * SCALE,
      // ~40% chance of having a drip running down (gravity)
      hasDrip: Math.random() < 0.4,
      dripStartU: u,
    });
  }
  // Pre-roll dry-brush fibre offsets (so they're consistent each frame)
  const fibreCount = 4 + Math.floor(Math.random()*3);
  const fibreOffsets = [];
  for(let f=0; f<fibreCount; f++){
    fibreOffsets.push(((f / (fibreCount-1)) - 0.5) * 2);  // -1 .. +1
  }
  return {
    pts,
    bodyWidth: (22 + Math.random()*70) * SCALE,
    life: 0,
    drawSpeed: 0.7 + Math.random()*0.8,
    fadeStart: 3.0 + Math.random()*4.0,
    fadeDuration: 4 + Math.random()*5,
    pools,
    fibreOffsets,
    isBeatSplash: (reactor.bass||0) > 0.45 && Math.random() < 0.35,
  };
}

// Build a brush-stroke polygon by offsetting each centerline point perpendicular
// to the local direction. Returns {leftEdge[], rightEdge[]} arrays of {x,y}.
// widthFn(idx, pt) -> half-width at that point. jitterFn(idx)->small offset.
function _buildStrokePolygon(pts, count, widthFn, jitterFn){
  const left = [], right = [];
  for(let i=0; i<count; i++){
    const p = pts[i];
    const p0 = pts[Math.max(0, i-1)];
    const p1 = pts[Math.min(count-1, i+1)];
    let dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx,dy) || 1;
    const nx = -dy/len, ny = dx/len;
    const hw = widthFn(i, p);
    const j  = jitterFn ? jitterFn(i) : 0;
    left.push({  x: p.x + nx*(hw + j),       y: p.y + ny*(hw + j) });
    right.push({ x: p.x - nx*(hw - j*0.6),   y: p.y - ny*(hw - j*0.6) });
  }
  return { left, right };
}
function _fillStrokePolygon(g, poly, fillStyle){
  g.fillStyle = fillStyle;
  g.beginPath();
  g.moveTo(poly.left[0].x, poly.left[0].y);
  for(let i=1; i<poly.left.length; i++) g.lineTo(poly.left[i].x, poly.left[i].y);
  for(let i=poly.right.length-1; i>=0; i--) g.lineTo(poly.right[i].x, poly.right[i].y);
  g.closePath();
  g.fill();
}

function drawInkWash(g, dt, T){
  const dts = dt/1000;
  const interval = Math.max(0.40, 1.5 - state.motionSpeed*0.5 - (reactor.mid||0)*0.4);
  _inkSpawnT += dts;
  let safety = 3;
  while(_inkSpawnT > interval && safety-- > 0){
    _inkSpawnT -= interval;
    _inkStrokes.push(_seedInkStroke());
  }
  if(_inkStrokes.length > 18) _inkStrokes.splice(0, _inkStrokes.length - 18);

  g.save();
  g.lineCap = 'butt';
  g.lineJoin = 'round';

  for(let i=_inkStrokes.length-1; i>=0; i--){
    const s = _inkStrokes[i];
    s.life += dts;
    const totalLife = s.fadeStart + s.fadeDuration;
    if(s.life > totalLife){ _inkStrokes.splice(i,1); continue; }
    const sweep = Math.min(1, s.life * s.drawSpeed * 0.55);
    const fade = s.life < s.fadeStart ? 1
               : 1 - Math.min(1, (s.life - s.fadeStart) / s.fadeDuration);
    if(fade <= 0) continue;
    const drawCount = Math.max(3, Math.floor(s.pts.length * sweep));

    // Edge jitter — gives the brush organic irregularity instead of geometric capsules.
    // Cached so it doesn't pulse on every frame.
    if(!s.edgeJitter){
      s.edgeJitter = [];
      for(let k=0; k<s.pts.length; k++){
        s.edgeJitter.push((Math.sin(k*1.7) + Math.sin(k*4.3)*0.6 + Math.sin(k*9.1)*0.3) * s.bodyWidth * 0.06);
      }
    }
    const jitter = (i) => s.edgeJitter[i] || 0;

    // ─── Width functions per layer ───
    // Strong taper so the brush truly thins at tips. Width also responds to wetness
    // (dry sections feather narrower).
    const wForCore = (idx, p) => s.bodyWidth * 0.42 * (0.15 + p.taper * 0.85) * Math.min(1, p.wet * 1.4);
    const wForWet  = (idx, p) => s.bodyWidth * 0.55 * (0.30 + p.taper * 0.75);
    const wForHalo = (idx, p) => s.bodyWidth * 0.95 * (0.40 + p.taper * 0.65);

    // ─── LAYER 1 — Paper-soak HALO (very faint outer bleed) ───
    g.shadowColor = `rgba(${INK_WET},0.4)`;
    g.shadowBlur = 22 * SCALE;
    const haloPoly = _buildStrokePolygon(s.pts, drawCount, wForHalo, (k)=>jitter(k)*1.3);
    _fillStrokePolygon(g, haloPoly, `rgba(${INK_HALO},${0.16 * fade})`);

    // ─── LAYER 2 — Wet bleed edge (mid alpha, soft) ───
    g.shadowBlur = 6 * SCALE;
    const wetPoly = _buildStrokePolygon(s.pts, drawCount, wForWet, (k)=>jitter(k));
    _fillStrokePolygon(g, wetPoly, `rgba(${INK_WET},${0.45 * fade})`);

    // ─── LAYER 3 — SOLID BLACK CORE (the real "ink"). No shadow blur. ───
    // Drawn as a polygon so the edges follow the taper smoothly instead of
    // segmented capsules.
    g.shadowBlur = 0;
    // Build a wet-only polygon: collapse width to 0 on dry sections so the
    // core path naturally narrows / vanishes in feiBai (飛白) regions.
    const corePoly = _buildStrokePolygon(s.pts, drawCount, (idx, p) => {
      if(p.wet < 0.55) return 0.01;        // collapse — dry sections show as gaps
      return wForCore(idx, p);
    }, (k)=>jitter(k)*0.5);
    _fillStrokePolygon(g, corePoly, `rgba(${INK_CORE},${0.96 * fade})`);

    // ─── LAYER 4 — Dry-brush striations (飛白) for wet < 0.55 segments ───
    for(let k=1;k<drawCount;k++){
      const p0 = s.pts[k-1], p1 = s.pts[k];
      if(p1.wet >= 0.55) continue;
      if(p1.wet < 0.05) continue;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy/len, ny = dx/len;
      const halfW = s.bodyWidth * 0.5 * (0.3 + p1.taper*0.7);
      for(const fOff of s.fibreOffsets){
        const fibreWet = p1.wet * (0.55 + Math.abs(fOff)*0.45);
        if(Math.sin(k*5 + fOff*23 + s.fibreOffsets.length*7) < (0.5 - p1.wet*0.7)) continue;
        const off = fOff * halfW * 0.9;
        g.strokeStyle = `rgba(${INK_CORE},${(0.62 + fibreWet*0.3) * fade})`;
        g.lineWidth = Math.max(0.6, halfW * 0.14);
        g.beginPath();
        g.moveTo(p0.x + nx*off, p0.y + ny*off);
        g.lineTo(p1.x + nx*off, p1.y + ny*off);
        g.stroke();
      }
    }

    // ─── LAYER 5 — Ink pools + drips ───
    for(const pool of s.pools){
      const poolGrow = Math.min(1, Math.max(0, s.life * 0.5 - 0.4));
      if(poolGrow <= 0) continue;
      const r = pool.r0 + poolGrow * pool.rGrowth;
      // Outer wet halo
      g.shadowColor = `rgba(${INK_WET},0.5)`;
      g.shadowBlur = 14 * SCALE;
      g.fillStyle = `rgba(${INK_WET},${0.20 * fade})`;
      g.beginPath(); g.arc(pool.x, pool.y, r * 1.0, 0, TAU); g.fill();
      // Solid centre — slightly irregular shape via 3 overlapping ellipses
      g.shadowBlur = 2 * SCALE;
      g.fillStyle = `rgba(${INK_CORE},${0.94 * fade})`;
      g.beginPath(); g.arc(pool.x, pool.y, r * 0.5, 0, TAU); g.fill();
      g.beginPath(); g.arc(pool.x + r*0.12, pool.y - r*0.08, r * 0.42, 0, TAU); g.fill();
      g.beginPath(); g.arc(pool.x - r*0.10, pool.y + r*0.05, r * 0.40, 0, TAU); g.fill();
      // Drip — narrow tapered streak with bead at tip
      if(pool.hasDrip && poolGrow > 0.4){
        const dripT = (poolGrow - 0.4) / 0.6;
        const dripLen = r * 0.6 + dripT * r * 3.5;
        const tipR = r * 0.18 * (1 - dripT*0.3);
        g.shadowBlur = 1 * SCALE;
        g.fillStyle = `rgba(${INK_CORE},${0.88 * fade})`;
        g.beginPath();
        g.moveTo(pool.x - r*0.18, pool.y + r*0.3);
        g.quadraticCurveTo(pool.x - r*0.05, pool.y + dripLen*0.6, pool.x - tipR*0.5, pool.y + dripLen);
        g.lineTo(pool.x + tipR*0.5, pool.y + dripLen);
        g.quadraticCurveTo(pool.x + r*0.05, pool.y + dripLen*0.6, pool.x + r*0.18, pool.y + r*0.3);
        g.closePath();
        g.fill();
        g.fillStyle = `rgba(${INK_CORE},${0.96 * fade})`;
        g.beginPath();
        g.arc(pool.x, pool.y + dripLen + tipR*0.5, tipR, 0, TAU);
        g.fill();
      }
    }

    // ─── LAYER 6 — Beat splash (bass-triggered ink spatters) ───
    if(s.isBeatSplash && !s.splashSpawned){
      s.splashSpawned = true;
      s.splashes = [];
      const center = s.pts[Math.floor(s.pts.length*0.6)];
      const splatN = 4 + Math.floor(Math.random()*6);
      for(let k=0;k<splatN;k++){
        const ang = Math.random()*TAU;
        const dist = (20 + Math.random()*150)*SCALE;
        s.splashes.push({
          x: center.x + Math.cos(ang)*dist,
          y: center.y + Math.sin(ang)*dist,
          r: (2 + Math.random()*10)*SCALE,
        });
      }
    }
    if(s.splashes){
      g.shadowBlur = 2 * SCALE;
      for(const sp of s.splashes){
        g.fillStyle = `rgba(${INK_CORE},${0.85 * fade})`;
        g.beginPath(); g.arc(sp.x, sp.y, sp.r, 0, TAU); g.fill();
      }
    }
  }
  g.shadowBlur = 0;
  g.restore();
}

// ============================================================
// SUMINAGASHI 墨流し — floating ink drops on water that swirl + mix
// Each drop = a closed polygon of N vertices around a center. Vertex radius
// grows over time (drop spreading) and each vertex is advected by a curl-noise
// flow field — that's the marbling/swirl. Multiple drops layer with multiply
// blend so colors mix like real Suminagashi ink on water.
// ============================================================
const SUMI_COLORS = [
  '20,15,12',    // 墨   sumi — warm black
  '20,40,90',    // 深藍 kon — deep indigo
  '170,40,30',   // 朱紅 shu — vermillion
  '35,75,50',    // 松葉緑 matsu — pine green
];
let _sumiDrops = [];
let _sumiSpawnT = 0;
let _sumiFlowT  = 0;
let _sumiColorIdx = 0;

function _seedSumiDrop(forceColor){
  // Each drop = concentric thin rings (NOT a filled blob) — that's the wood-
  // grain look of real Suminagashi. Vertices per ring are advected by curl
  // noise so the rings ripple and weave into each other.
  const N = 72;                              // verts per ring (smooth curves)
  const RINGS = 7;                           // concentric rings per drop
  const ringStep = (5 + Math.random()*3) * SCALE;  // radial gap between rings
  const cx = (0.15 + Math.random()*0.7) * W;
  const cy = (0.15 + Math.random()*0.7) * H;
  // Cycle through the 4 traditional colors so consecutive drops contrast
  let color;
  if(forceColor != null) color = SUMI_COLORS[forceColor % SUMI_COLORS.length];
  else {
    _sumiColorIdx = (_sumiColorIdx + 1 + (Math.random()<0.3 ? 1 : 0)) % SUMI_COLORS.length;
    color = SUMI_COLORS[_sumiColorIdx];
  }
  // Each ring has its own vertex array (shared angles, different base radii)
  const rings = [];
  for(let r=0; r<RINGS; r++){
    const baseR = (3 + r*ringStep) * (1 + Math.random()*0.05);
    const verts = [];
    for(let i=0;i<N;i++){
      verts.push({
        a: (i/N) * TAU,
        dx: 0, dy: 0,
        rj: 1 + (Math.random()-0.5) * 0.04,
      });
    }
    rings.push({ baseR, verts });
  }
  return {
    cx, cy, color, rings,
    life: 0,
    spread: 9 + Math.random()*10,             // px/s — slower because rings already extend outward
    fadeStart: 11 + Math.random()*7,
    fadeDuration: 9 + Math.random()*7,
    flowScale: 0.0020 + Math.random()*0.0014,
    flowStrength: 28 + Math.random()*22,      // stronger flow → more dramatic swirl
    flowSeed: Math.random() * 1000,
  };
}

// Curl of pseudo-noise field — divergence-free velocity, gives swirl/marbling
function _sumiCurl(x, y, k, t){
  const e = 30;   // sampling stencil (paper units)
  const n1 = noise2((x      )*k, (y - e)*k + t);
  const n2 = noise2((x      )*k, (y + e)*k + t);
  const n3 = noise2((x - e  )*k, (y    )*k + t);
  const n4 = noise2((x + e  )*k, (y    )*k + t);
  return {
    vx: (n2 - n1),
    vy: -(n4 - n3),
  };
}

function drawSuminagashi(g, dt, T){
  const dts = dt / 1000;
  _sumiFlowT += dts * 0.18;   // slow flow drift

  // Spawn rate — gentle baseline + bass pushes more drops
  const bass = (reactor.bass || 0);
  const vol  = (reactor.vol  || 0);
  const mid  = (reactor.mid  || 0);
  const mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const rate = (0.55 + vol*1.4 + state.motionSpeed*0.4) * mScale;
  _sumiSpawnT += dts;
  let safety = 4;
  while(_sumiSpawnT > 1/Math.max(0.2, rate) && safety-- > 0){
    _sumiSpawnT -= 1/Math.max(0.2, rate);
    _sumiDrops.push(_seedSumiDrop());
  }
  // Bass hit = splash of 2-3 contrasting drops near center
  if(bass > 0.55 && state.beatFlash > 0.5){
    if(!_sumiDrops._lastBeat || (state.beatCount || 0) > _sumiDrops._lastBeat){
      _sumiDrops._lastBeat = state.beatCount || ((_sumiDrops._lastBeat||0)+1);
      const baseColor = Math.floor(Math.random()*SUMI_COLORS.length);
      for(let k=0;k<3;k++){
        const d = _seedSumiDrop((baseColor + k) % SUMI_COLORS.length);
        // bias near center for bass impact
        d.cx = CX + (Math.random()-0.5)*W*0.35;
        d.cy = CY + (Math.random()-0.5)*H*0.35;
        d.r0 *= 0.7;
        _sumiDrops.push(d);
      }
    }
  }

  if(_sumiDrops.length > 18) _sumiDrops.splice(0, _sumiDrops.length - 18);

  g.save();
  // Stroke-only rendering — multiply on light paper (proper sumi feel),
  // 'source-over' on dark so dark lines stay visible without lightening.
  g.globalCompositeOperation = state.lightMode ? 'multiply' : 'source-over';
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // Mid-range adds extra swirl perturbation — wash 流動 with the music
  const swirlBoost = 1 + mid*1.6 + bass*0.8;

  for(let di = _sumiDrops.length-1; di >= 0; di--){
    const d = _sumiDrops[di];
    d.life += dts;
    const totalLife = d.fadeStart + d.fadeDuration;
    if(d.life > totalLife){ _sumiDrops.splice(di, 1); continue; }

    const fade = d.life < d.fadeStart
      ? (d.life < 0.35 ? d.life/0.35 : 1)
      : 1 - (d.life - d.fadeStart) / d.fadeDuration;
    if(fade <= 0) continue;

    // How much extra radius the drop has spread on the water since spawn
    const growth = d.life * d.spread;

    // ─── For each concentric ring: advect verts by curl, stroke as polyline ───
    for(let ri = 0; ri < d.rings.length; ri++){
      const ring = d.rings[ri];
      const r = ring.baseR + growth;

      // Advect every vert by the local curl-noise velocity
      for(const v of ring.verts){
        const px = d.cx + v.dx + Math.cos(v.a) * r * v.rj;
        const py = d.cy + v.dy + Math.sin(v.a) * r * v.rj;
        const f = _sumiCurl(px, py, d.flowScale, _sumiFlowT + d.flowSeed);
        v.dx += f.vx * d.flowStrength * dts * swirlBoost;
        v.dy += f.vy * d.flowStrength * dts * swirlBoost;
      }

      // Slightly fade outer rings (older edge of the drop) so the core reads cleaner
      const ringFade = 1 - (ri / (d.rings.length * 1.4));
      const lineAlpha = (state.lightMode ? 0.75 : 0.85) * fade * ringFade;
      g.strokeStyle = `rgba(${d.color}, ${lineAlpha})`;
      g.lineWidth = (0.7 + (ri === 0 ? 0.4 : 0)) * SCALE;

      g.beginPath();
      for(let i=0;i<ring.verts.length;i++){
        const v = ring.verts[i];
        const x = d.cx + v.dx + Math.cos(v.a) * r * v.rj;
        const y = d.cy + v.dy + Math.sin(v.a) * r * v.rj;
        if(i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
  }

  g.restore();
}

// ============================================================
// 8-Bit · pixelation post-effect with palette quantization
// Throttled — the GPU→CPU readback (getImageData) is the most expensive
// Canvas op there is. Recompute every ~3 frames (or more under perf pressure),
// cache the quantized buffer, just composite it the rest of the time.
// ============================================================
let _px8Cv = null, _px8Ctx = null;
let _px8FrameCounter = 0;
let _px8Ready = false;
function drawPixel8(g, dt, T){
  if(!_px8Cv){
    _px8Cv = document.createElement('canvas');
    _px8Ctx = _px8Cv.getContext('2d', { willReadFrequently: true, alpha:false });
  }
  // Recompute interval scales with perf — bad fps = recompute less often.
  const q = (window._perf && _perf.quality) || 1;
  const interval = q < 0.5 ? 6 : q < 0.75 ? 4 : 3;
  _px8FrameCounter++;
  const shouldRecompute = !_px8Ready || (_px8FrameCounter % interval === 0);
  if(shouldRecompute){
    // Resolution scales with perf too. Bass jitters it on beat.
    const targetW = q < 0.5 ? 64 : q < 0.75 ? 78 : 90;
    const baseW = Math.max(40, targetW - Math.floor((reactor.bass||0)*22));
    const cw = baseW;
    const ch = Math.max(1, Math.round(baseW * H/W));
    if(_px8Cv.width !== cw || _px8Cv.height !== ch){
      _px8Cv.width = cw; _px8Cv.height = ch;
    }
    _px8Ctx.imageSmoothingEnabled = false;
    _px8Ctx.drawImage(g.canvas, 0, 0, cw, ch);
    const img = _px8Ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    for(let i=0;i<d.length;i+=4){
      d[i]   = (d[i]   & 0xE0);
      d[i+1] = (d[i+1] & 0xE0);
      d[i+2] = (d[i+2] & 0xC0);
    }
    _px8Ctx.putImageData(img, 0, 0);
    _px8Ready = true;
  }
  g.save();
  g.imageSmoothingEnabled = false;
  g.drawImage(_px8Cv, 0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.restore();
}

// ============================================================
// Pop Art · 普普藝術 — ben-day dots (cached/tiled), panel grid, primary slabs
// Dot tile is pre-rendered to a small offscreen and `createPattern`-tiled,
// instead of drawing 10000+ individual arcs every frame.
// ============================================================
let _popTileCv = null, _popTileCtx = null;
let _popTileFrame = 0, _popTilePattern = null;
function drawPopArt(g, dt, T){
  const t = state.t * 0.001;
  const bass = reactor.bass || 0;
  const beat = state.beatFlash || 0;
  const q = (window._perf && _perf.quality) || 1;
  const palettes = [
    ['#e94e1b','#f4cf2e','#1d70a2','#f6e7d8'],
    ['#0f0f0f','#f4cf2e','#e94e1b','#1d70a2'],
    ['#ff2a6d','#05d9e8','#f5f5f5','#0a0a14'],
  ];
  const palette = palettes[Math.floor(t*0.25 + bass*2) % palettes.length];
  const cx = W/2, cy = H/2;
  g.save();
  // Color slabs
  const quads = [[0,0,cx,cy],[cx,0,cx,cy],[0,cy,cx,cy],[cx,cy,cx,cy]];
  const cycle = Math.floor(t * (0.4 + bass*1.2));
  g.globalAlpha = 0.16 + (reactor.vol||0)*0.18 + beat*0.15;
  quads.forEach((q,i)=>{
    g.fillStyle = palette[(i + cycle) % palette.length];
    g.fillRect(q[0], q[1], q[2], q[3]);
  });
  g.globalAlpha = 1;

  // Ben-Day dot pattern — render to small offscreen, tile via createPattern.
  // Regenerate every 6 frames (or less under perf pressure) so the animation
  // still pulses but we don't pay 10k arcs per frame.
  if(!_popTileCv){
    _popTileCv = document.createElement('canvas');
    _popTileCtx = _popTileCv.getContext('2d');
  }
  const interval = q < 0.6 ? 12 : 6;
  _popTileFrame++;
  const tileSpacing = Math.max(10, (12 + Math.sin(t*0.5)*2) * SCALE);
  const tileSize = Math.round(tileSpacing * 8);  // 8×8 dot grid per tile (offset rows = honeycomb)
  if(_popTileCv.width !== tileSize) {
    _popTileCv.width = _popTileCv.height = tileSize;
    _popTilePattern = null;
  }
  if(_popTileFrame % interval === 0 || !_popTilePattern){
    _popTileCtx.clearRect(0, 0, tileSize, tileSize);
    _popTileCtx.fillStyle = '#1a1a1a';
    const maxDot = (3.2 + bass*2.5) * SCALE;
    for(let y=0; y<tileSize; y+=tileSpacing){
      const xOff = (Math.floor(y/tileSpacing) % 2) ? tileSpacing*0.5 : 0;
      for(let x=xOff; x<tileSize; x+=tileSpacing){
        const wob = Math.sin(x*0.012 + y*0.012 + t*1.3) * 0.4 + 0.6;
        _popTileCtx.beginPath();
        _popTileCtx.arc(x, y, Math.max(0, maxDot*wob), 0, TAU);
        _popTileCtx.fill();
      }
    }
    _popTilePattern = g.createPattern(_popTileCv, 'repeat');
  }
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = _popTilePattern;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';

  // Heavy panel borders
  g.strokeStyle = '#0a0a0a';
  g.lineWidth = 5 * SCALE;
  g.beginPath();
  g.moveTo(cx, 0); g.lineTo(cx, H);
  g.moveTo(0, cy); g.lineTo(W, cy);
  g.stroke();
  g.lineWidth = 8 * SCALE;
  g.strokeRect(0, 0, W, H);
  // Comic burst on strong beat
  if(beat > 0.5){
    const bx = cx + (Math.random()-0.5)*W*0.5;
    const by = cy + (Math.random()-0.5)*H*0.5;
    const spikes = 14;
    const r1 = 60 * SCALE * (1 + beat*0.6);
    const r2 = 100 * SCALE * (1 + beat*0.8);
    g.fillStyle = palette[0];
    g.strokeStyle = '#0a0a0a';
    g.lineWidth = 4 * SCALE;
    g.beginPath();
    for(let k=0;k<spikes*2;k++){
      const a = (k/(spikes*2)) * TAU;
      const r = (k%2) ? r1 : r2;
      const px = bx + Math.cos(a)*r;
      const py = by + Math.sin(a)*r;
      if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
    }
    g.closePath();
    g.fill(); g.stroke();
  }
  g.restore();
}

// ============================================================
// Glitch · datamosh slice shifts + scan lines + tear bars
// ============================================================
function drawGlitch(g, dt, T){
  const beat = state.beatFlash || 0;
  const bass = reactor.bass || 0;
  const treble = reactor.treble || 0;
  g.save();
  const intensity = 0.25 + bass*1.4 + beat*0.7;
  const sliceN = Math.floor(2 + intensity * 9);
  for(let i=0;i<sliceN;i++){
    const y = Math.floor(Math.random() * H);
    const sliceH = 6 + Math.floor(Math.random() * 50);
    const shift = (Math.random()-0.5) * 80 * intensity * SCALE;
    if(Math.abs(shift) < 3) continue;
    try {
      g.drawImage(g.canvas, 0, y*state.pixelRatio, W*state.pixelRatio, sliceH*state.pixelRatio,
                            shift, y, W, sliceH);
    } catch(e){}
  }
  // Beat-triggered tear (full-width difference bar)
  if(beat > 0.35 && Math.random() < 0.7){
    const tearY = Math.random() * H;
    const tearH = (6 + Math.random() * 28) * SCALE;
    g.globalCompositeOperation = 'difference';
    g.fillStyle = '#ffffff';
    g.fillRect(0, tearY, W, tearH);
    g.globalCompositeOperation = 'source-over';
  }
  // RGB-ish channel offset hint (treble drives chromatic shift)
  if(treble > 0.25){
    const off = treble * 4 * SCALE;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.18;
    g.fillStyle = '#ff003c';
    g.fillRect(off, 0, W, H);
    g.fillStyle = '#00d8ff';
    g.fillRect(-off, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  // Scan lines
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.35;
  g.fillStyle = '#181820';
  for(let y=0;y<H;y+=3){
    g.fillRect(0, y, W, 1);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

// ============================================================
// Polygon · wireframe mesh, point-line-face geometry
// ============================================================
let _polyVerts = null;
function drawPolygon(g, dt, T){
  if(!_polyVerts){
    _polyVerts = [];
    for(let i=0;i<14;i++){
      _polyVerts.push({
        x: (Math.random()-0.5)*2,
        y: (Math.random()-0.5)*2,
        z: (Math.random()-0.5)*2,
      });
    }
  }
  const dom = dominantEmo();
  const t = state.t * 0.0006 * (0.5 + state.motionSpeed + (reactor.mid||0)*0.8);
  const cx = W/2, cy = H/2;
  const scale = Math.min(W,H) * 0.32 * (1 + (reactor.bass||0)*0.35);
  const ca = Math.cos(t), sa = Math.sin(t);
  const cb = Math.cos(t*0.73), sb = Math.sin(t*0.73);
  const projected = _polyVerts.map(v=>{
    const x1 = v.x * ca - v.z * sa;
    const z1 = v.x * sa + v.z * ca;
    const y1 = v.y * cb - z1 * sb;
    const z2 = v.y * sb + z1 * cb;
    const persp = 2 / Math.max(0.5, 2.6 - z2);
    return { x: cx + x1*scale*persp, y: cy + y1*scale*persp, z: z2, depth: persp };
  });
  g.save();
  const h = dom.hue[0];
  const sat = dom.sat;
  const lt = dom.light;
  g.lineWidth = 1.2 * SCALE;
  const maxD = Math.min(W,H)*0.45;
  for(let i=0;i<projected.length;i++){
    for(let j=i+1;j<projected.length;j++){
      const a = projected[i], b = projected[j];
      const dx = a.x-b.x, dy = a.y-b.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if(dist < maxD){
        const al = (1 - dist/maxD) * 0.55 * state.glow;
        g.strokeStyle = `hsla(${h},${sat}%,${lt+25}%,${al})`;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
  }
  // Filled triangles between near triples on bass
  if((reactor.bass||0) > 0.3){
    g.globalCompositeOperation = 'lighter';
    for(let i=0;i<projected.length;i+=2){
      const a = projected[i], b = projected[(i+1)%projected.length], c = projected[(i+2)%projected.length];
      g.fillStyle = `hsla(${h+i*8},${sat}%,${lt+20}%,${0.08 + (reactor.bass||0)*0.18})`;
      g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(c.x,c.y); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  // Vertex dots
  for(const p of projected){
    g.fillStyle = `hsla(${h},${sat}%,${lt+35}%,${0.8 * Math.min(1, p.depth)})`;
    g.beginPath(); g.arc(p.x, p.y, 2.5 * SCALE * Math.min(1.6, p.depth), 0, TAU); g.fill();
  }
  g.restore();
}

// ============================================================
// Matrix rain · vertical green character streams
// ============================================================
let _matrixCols = null;
let _matrixColW = 0;
const _matrixChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ0123456789ABCDEFΣΩΨΦΛΞ';
function drawMatrix(g, dt, T){
  const colW = Math.max(10, Math.floor(13 * SCALE));
  if(!_matrixCols || _matrixColW !== colW || _matrixCols.length * colW < W - colW){
    _matrixCols = [];
    _matrixColW = colW;
    for(let x=0; x<W; x+=colW){
      _matrixCols.push({ x, y: Math.random()*H, speed: 90 + Math.random()*220, trail: 14 + Math.floor(Math.random()*16) });
    }
  }
  const dts = dt / 1000;
  const fontSize = colW * 1.05;
  g.save();
  g.font = `${fontSize}px monospace`;
  g.textBaseline = 'top';
  const bassBoost = 1 + (reactor.bass||0)*1.4;
  for(const col of _matrixCols){
    col.y += col.speed * dts * bassBoost;
    if(col.y > H + 200) col.y = -Math.random()*400;
    for(let k=0; k<col.trail; k++){
      const cy = col.y - k * fontSize;
      if(cy < -fontSize || cy > H) continue;
      const alpha = (1 - k/col.trail) * (0.85 + (reactor.vol||0)*0.2);
      const seed = Math.floor((cy*0.12 + state.t*0.005 + col.x*0.04 + k*1.7));
      const ch = _matrixChars[((seed % _matrixChars.length) + _matrixChars.length) % _matrixChars.length];
      // No shadowBlur — it kills perf. Head char is just brighter/whiter instead.
      g.fillStyle = (k === 0)
        ? `rgba(230,255,230,${alpha})`
        : (k < 3) ? `rgba(130,255,170,${alpha*0.85})` : `rgba(50,210,100,${alpha*0.55})`;
      g.fillText(ch, col.x, cy);
    }
  }
  g.restore();
}

// ============================================================
// EVA HUD · 新世紀 — red bars, AT-field hexagons, warnings
// ============================================================
function drawEva(g, dt, T){
  const t = state.t * 0.001;
  const beat = state.beatFlash || 0;
  const bass = reactor.bass || 0;
  g.save();
  const barH = Math.max(22, 30 * SCALE);
  // top + bottom red bars
  g.fillStyle = 'rgba(178,28,28,0.9)';
  g.fillRect(0, 0, W, barH);
  g.fillRect(0, H - barH, W, barH);
  // bars edge stripe
  g.fillStyle = 'rgba(255,200,40,0.95)';
  g.fillRect(0, barH-2, W, 2);
  g.fillRect(0, H-barH, W, 2);
  // text
  g.fillStyle = '#fffaf0';
  const fz = Math.max(12, 15 * SCALE);
  g.font = `900 ${fz}px sans-serif`;
  g.textBaseline = 'middle';
  const flick = (Math.floor(t*5) % 2) === 0;
  const msgs = ['警告','危険','使徒接近','TARGET LOCK','PATTERN BLUE','A.T.FIELD','SYNCHRO'];
  const m = msgs[Math.floor(t*0.7) % msgs.length];
  g.fillText(m, 14*SCALE, barH/2);
  g.textAlign = 'right';
  g.fillText(`VOL ${Math.floor((reactor.vol||0)*100).toString().padStart(2,'0')}`, W - 14*SCALE, barH/2);
  g.textAlign = 'left';
  g.fillText(`SYNC ${Math.floor(bass*100).toString().padStart(2,'0')}%`, 14*SCALE, H - barH/2);
  g.textAlign = 'right';
  g.fillText(flick ? '◆ ARMED' : '◇ STBY', W - 14*SCALE, H - barH/2);
  g.textAlign = 'left';
  // AT-field hex grid
  g.globalCompositeOperation = 'lighter';
  const hexSize = 70 * SCALE;
  const hexAlpha = 0.05 + bass*0.22 + beat*0.18;
  g.strokeStyle = `rgba(255,140,40,${hexAlpha})`;
  g.lineWidth = 1.4 * SCALE;
  const hStep = hexSize * 1.5;
  const vStep = hexSize * Math.sqrt(3);
  for(let row=-1; row*vStep < H+vStep; row++){
    for(let col=-1; col*hStep < W+hStep; col++){
      const hx = col * hStep;
      const hy = row * vStep + ((col % 2 + 2) % 2 ? vStep/2 : 0);
      g.beginPath();
      for(let k=0;k<6;k++){
        const a = k * Math.PI/3;
        const px = hx + hexSize * Math.cos(a);
        const py = hy + hexSize * Math.sin(a);
        if(k===0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // center reticle
  g.strokeStyle = 'rgba(255,180,40,0.85)';
  g.lineWidth = 1.6 * SCALE;
  const cx = W/2, cy = H/2;
  const ret = (28 + Math.sin(t*2)*4) * SCALE;
  g.beginPath();
  g.moveTo(cx-ret*1.8, cy); g.lineTo(cx-ret*0.4, cy);
  g.moveTo(cx+ret*0.4, cy); g.lineTo(cx+ret*1.8, cy);
  g.moveTo(cx, cy-ret*1.8); g.lineTo(cx, cy-ret*0.4);
  g.moveTo(cx, cy+ret*0.4); g.lineTo(cx, cy+ret*1.8);
  g.stroke();
  g.beginPath(); g.arc(cx, cy, ret*0.7, 0, TAU); g.stroke();
  g.restore();
}
