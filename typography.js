console.log('[IW] typography.js loading · $=' + typeof $ + ' state=' + typeof state + ' W=' + typeof W);
const FONT = {
  sans:{
    latin:'"Noto Sans", system-ui, sans-serif',
    sc:'"Noto Sans SC", sans-serif',
    tc:'"Noto Sans TC", sans-serif',
    jp:'"Noto Sans JP", sans-serif',
    kr:'"Noto Sans KR", sans-serif',
  },
  serif:{
    latin:'"Noto Serif", Georgia, serif',
    sc:'"Noto Serif SC", serif',
    tc:'"Noto Serif TC", serif',
    jp:'"Noto Serif JP", serif',
    kr:'"Noto Serif KR", serif',
  },
  recursive:{
    latin:'"Recursive", sans-serif',
    sc:'"Recursive", "Noto Sans SC", sans-serif',
    tc:'"Recursive", "Noto Sans TC", sans-serif',
    jp:'"Recursive", "Noto Sans JP", sans-serif',
    kr:'"Recursive", "Noto Sans KR", sans-serif',
  },
};
const PALETTE = ['#f3eee6','#ffffff','#c87cff','#7fdcff','#9bd3a7','#ffb27a','#ff7a9c','#7a6bff'];

// Cross-scope bridge — closure scope sometimes fails to resolve `typo` from
// inside callbacks fired by setInterval / rAF; expose to window as authoritative.
const typo = window.typo = {
  text: '輕呼吸 / breathe / 静か / 한 호흡 / 一念',
  phrases: () => typo.text.split('/').map(s => s.trim()).filter(Boolean),
  family: 'sans',
  lang: 'latin',
  layout: 'center',     // center | left | right | scatter
  sizeMode: 'big',      // big | small | mixed | huge
  anim: 'breathe',
  color: 'auto',
  speed: 1.0,           // animation speed multiplier
  rate: 1.5,
  life: 3.0,
  density: 0.6,
  loop: true,
  sizeScale: 1.0,
  style: 'solid',        // 'solid' | 'outline' | 'mix' (per-spawn random) | 'split' (top outline / bottom fill)
  outlineWidth: 0.04,    // stroke width as a fraction of font size (renderStyledText)
  weight: 500,           // CSS font-weight (100..900)
  kaleido: 0,            // independent typography kaleido segments (0 = off)
  spawns: [],
  spawnAcc: 0,
  centerCurrent: null,
  centerNext: null,
  centerSwapT: 0,
};

function emoColor(){
  // pick the strongest emotion's glow as the auto color
  if(typeof dominantEmo === 'function'){
    const d = dominantEmo();
    if(d && d.glow) return d.glow;
  }
  return '#f3eee6';
}
function pickColor(){
  if(typo.color === 'random') return PALETTE[Math.floor(Math.random()*PALETTE.length)];
  if(typo.color === 'auto') return emoColor();
  return typo.color;
}
function pickSizePx(){
  const base = Math.min(W,H) * (typo.sizeScale || 1);
  if(typo.sizeMode === 'huge') return rand(base*0.35, base*0.65);
  if(typo.sizeMode === 'big')  return rand(base*0.18, base*0.32);
  if(typo.sizeMode === 'small')return rand(base*0.04, base*0.09);
  // mixed: three tiers so size changes are visibly dramatic
  const r = Math.random();
  if(r < 0.15) return rand(base*0.35, base*0.6);   // 15% huge
  if(r < 0.45) return rand(base*0.14, base*0.28);  // 30% medium
  return rand(base*0.03, base*0.10);               // 55% small
}
function pickPos(){
  if(typo.layout === 'center'){
    return { x: CX, y: CY, align:'center' };
  }
  if(typo.layout === 'left'){
    return { x: W*0.18, y: CY + rand(-H*0.3, H*0.3), align:'left' };
  }
  if(typo.layout === 'right'){
    return { x: W*0.82, y: CY + rand(-H*0.3, H*0.3), align:'right' };
  }
  // scatter
  return { x: rand(W*0.08, W*0.92), y: rand(H*0.12, H*0.88), align:'center' };
}

function fontStack(){
  return FONT[typo.family][typo.lang] || FONT.sans.latin;
}

function spawnWord(text){
  const t0 = state.t/1000;
  const pos = pickPos();
  let sizePx = pickSizePx();
  const word = {
    text, x:pos.x, y:pos.y, align: pos.align,
    size: sizePx, color: pickColor(),
    born: t0, life: typo.life,
    phase: Math.random()*TAU,
    vx: 0, vy: 0,
    rot: typo.layout === 'scatter' ? rand(-0.15, 0.15) : 0,
  };
  // anim-specific spawn overrides
  if(typo.anim === 'rain'){
    word.x = (typo.layout === 'scatter') ? rand(W*0.06, W*0.94)
           : (typo.layout === 'left')    ? rand(W*0.05, W*0.35)
           : (typo.layout === 'right')   ? rand(W*0.65, W*0.95)
           : rand(W*0.3, W*0.7);
    word.y = -sizePx*0.8;
    word.vy = rand(80, 200);
    // Compute life so the drop just makes it past the bottom with a small fade-out tail.
    const effSpeed = word.vy * Math.max(0.05, typo.speed);
    word.life = (H + sizePx*2) / effSpeed + 1.2;
  }
  if(typo.anim === 'drift'){
    const a = rand(0, TAU);
    word.vx = Math.cos(a) * rand(20, 70);
    word.vy = Math.sin(a) * rand(20, 70);
  }
  if(typo.anim === 'popIn'){
    // pop-in is intentionally chaotic — full-screen scatter, wide size range,
    // small random rotation. Layout is ignored for this animation.
    word.x = rand(W*0.06, W*0.94);
    word.y = rand(H*0.10, H*0.90);
    word.size = sizePx = (typo.sizeMode === 'huge') ? rand(W*0.20, W*0.55)
                       : (typo.sizeMode === 'small') ? rand(W*0.025, W*0.08)
                       : (typo.sizeMode === 'mixed') ? rand(W*0.03, W*0.40)
                       : rand(W*0.06, W*0.28);  // 'big' default
    word.align = 'center';
    word.rot = rand(-0.12, 0.12);
    word.life = typo.life * rand(0.6, 1.4);  // varied lifetime so they don't all die together
  }
  if(typo.anim === 'comic'){
    // POW! burst — random position, tilted, with star-burst frame data
    word.x = rand(W*0.15, W*0.85);
    word.y = rand(H*0.18, H*0.82);
    word.align = 'center';
    word.rot = rand(-0.25, 0.25);
    word.size = rand(Math.min(W,H)*0.10, Math.min(W,H)*0.22);
    word.life = typo.life * rand(0.45, 0.85);
    word.comicSpikes = 9 + Math.floor(Math.random()*7);
    word.comicRot = rand(0, TAU);
    const comicFills = ['#f4cf2e','#e94e1b','#ffffff','#f5c5d8','#7fdcff','#9bd3a7'];
    word.comicFill = comicFills[Math.floor(Math.random()*comicFills.length)];
  }
  // center layout: one word at a time (it morphs / breathes in place) — but NOT for popIn/comic
  if(typo.layout === 'center' && typo.anim !== 'rain' && typo.anim !== 'popIn' && typo.anim !== 'comic') typo.spawns.length = 0;
  typo.spawns.push(word);
  // for 'mix' style, decide once per spawn whether this one is outlined or filled
  if(typo.style === 'mix') word.outlineSpawn = Math.random() < 0.5;
  const maxPool = (typo.anim === 'popIn') ? Math.round(12 + typo.density*80)
                : typo.layout === 'center' && typo.anim !== 'rain' ? 1
                : typo.layout === 'scatter' ? Math.round(8 + typo.density*60)
                : Math.round(3 + typo.density*8);
  while(typo.spawns.length > maxPool) typo.spawns.shift();
}

function drawTypography(g, dt, T){
  const _lyricsActive = (typeof lyrics !== 'undefined' && lyrics.enabled);
  const phrases = typo.phrases();
  if(!phrases.length) return;
  const t0 = state.t/1000;
  // Slow-song mood: scale anim speed down to as low as 0.35×.
  // Doesn't touch typo.speed (so the user's slider value is preserved).
  const _mScale = (window._songMood && window._songMood.intensityScale) || 1;
  const sp = typo.speed * _mScale;
  const dts = dt/1000;

  // —— morphCenter / typewriter modes use a single centered slot ——
  if(typo.anim === 'morphCenter'){
    const swapInterval = (3/Math.max(0.5,typo.rate)) / sp;
    if(!typo.centerCurrent){
      typo.centerCurrent = phrases[Math.floor(Math.random()*phrases.length)];
      typo.centerSwapT = t0 + swapInterval;
    }
    // Pick centerSize ONCE per line — MIXED otherwise re-rolls every frame.
    if(typo.centerSize == null){
      typo.centerSize = pickSizeFromMode();
    }
    if(!_lyricsActive && t0 > typo.centerSwapT){
      typo.centerCurrent = phrases[Math.floor(Math.random()*phrases.length)];
      typo.centerSwapT = t0 + swapInterval;
      typo.centerSize = pickSizeFromMode();   // re-roll size on swap (non-lyrics)
    }
    const pulse = 0.5 + 0.5*Math.sin(t0*1.2*sp);
    drawCenteredText(g, typo.centerCurrent, 0.95 - (t0 - (typo.centerSwapT - swapInterval))*0.1, pulse, typo.centerSize);
    return;
  }
  if(typo.anim === 'typewriter'){
    if(!typo._tw){
      typo._tw = { phrase: phrases[Math.floor(Math.random()*phrases.length)], t0, dir:1, idx:0, size: pickSizeFromMode() };
    }
    const sec = (t0 - typo._tw.t0) * sp;
    const cps = 6 + typo.rate*4;
    const total = typo._tw.phrase.length;
    let len;
    if(typo._tw.dir > 0){
      len = Math.min(total, Math.floor(sec*cps));
      // In lyrics mode: type once then hold (no reverse). _tw resets on next line.
      if(_lyricsActive){
        // never flip direction; len caps at total
      } else if(len >= total && sec > total/cps + 1.0){
        typo._tw.dir = -1; typo._tw.t0 = t0;
      }
    } else {
      len = Math.max(0, total - Math.floor(sec*cps));
      if(len <= 0){
        if(_lyricsActive){ typo._tw = null; return; }
        typo._tw = { phrase: phrases[Math.floor(Math.random()*phrases.length)], t0, dir:1, idx:0, size: pickSizeFromMode() };
        len = 0;
      }
    }
    const showCursor = !_lyricsActive || len < total;
    const text = typo._tw.phrase.slice(0, len) + (showCursor && Math.floor(sec*4)%2 ? '_' : ' ');
    drawCenteredText(g, text, 0.92, 1, typo._tw.size);
    return;
  }

  // —— Spawn-based animations ——
  // When lyrics is driving, the word is seeded by _applyLyricToTypo with life=9999.
  // Auto-spawn is fully disabled to avoid any churn — re-seeding only happens at
  // line transitions / Random / Type-tab anim change (existing handlers clear spawns).
  // When lyrics is OFF: normal auto-spawn cycle.
  if(!_lyricsActive && (typo.loop || typo.spawns.length === 0)){
    typo.spawnAcc += dts * sp;
    const need = 1 / Math.max(0.05, typo.rate);
    let safety = 8;
    while(typo.spawnAcc >= need && safety-- > 0){
      typo.spawnAcc -= need;
      const phrase = phrases[Math.floor(Math.random()*phrases.length)];
      spawnWord(phrase);
    }
    if(typo.spawnAcc > need*2) typo.spawnAcc = need;
  } else if(_lyricsActive && typo.spawns.length === 0){
    // Edge case: spawns got cleared (anim change handler does this) but no new
    // line transitioned yet — re-seed from the current lyric immediately.
    const phrase = phrases[Math.floor(Math.random()*phrases.length)];
    spawnWord(phrase);
    const last = typo.spawns[typo.spawns.length-1];
    if(last) last.life = 9999;
  }

  g.save();
  for(let i=typo.spawns.length-1;i>=0;i--){
    const w = typo.spawns[i];
    const age = t0 - w.born;
    if(age > w.life){ typo.spawns.splice(i,1); continue; }
    // physics integration for anims that move
    if(w.vx || w.vy){
      w.x += w.vx * dts * sp;
      w.y += w.vy * dts * sp;
      if(typo.anim === 'rain' && w.y > H + w.size){ typo.spawns.splice(i,1); continue; }
    }
    const t01 = age / w.life;
    // For long-life words (lyrics: life≈9999), use absolute-time fade-in so the
    // word actually reaches full opacity in ~0.25s, and skip the proportional fade-out.
    const longLife = w.life > 100;
    const fadeIn = longLife ? Math.min(1, age*4) : Math.min(1, t01*4);
    const fadeOut = longLife ? 1 : (1 - Math.max(0, (t01-0.8)/0.2));
    let alpha = Math.min(fadeIn, fadeOut);
    let dx = 0, dy = 0, scale = 1, rot = w.rot || 0;

    switch(typo.anim){
      case 'breathe':
        alpha *= (0.55 + 0.45*Math.sin(t0*2.0*sp + w.phase));
        break;
      case 'flow': {
        const idxPhase = i/Math.max(1, typo.spawns.length);
        const head = (t0*0.4*sp) % 1.2 - 0.1;
        const g01 = Math.exp(-((idxPhase-head)*(idxPhase-head))/0.04);
        alpha *= 0.35 + 0.65*g01;
        break;
      }
      case 'wave':
        dy = Math.sin(t0*1.6*sp + w.phase) * w.size*0.12;
        break;
      case 'popIn': {
        const pop = Math.min(1, age*4*sp);
        scale = 0.6 + 0.4*easeOutBack(pop);
        break;
      }
      case 'glitch': {
        // jitter with periodic harsh shifts
        const j = (Math.sin(t0*47*sp + w.phase)*0.5 + Math.sin(t0*113*sp + w.phase*2)*0.5);
        dx = j * w.size * 0.06;
        dy = Math.cos(t0*89*sp + w.phase) * w.size * 0.05;
        if(Math.random() < 0.04*sp) dx += rand(-1,1) * w.size * 0.18;
        if(Math.random() < 0.02*sp) alpha *= 0.3;
        break;
      }
      case 'drift': {
        // velocity already integrated; gentle pulse
        alpha *= (0.7 + 0.3*Math.sin(t0*1.3*sp + w.phase));
        break;
      }
      case 'scalePulse': {
        scale = 0.7 + 0.5*Math.sin(t0*2.4*sp + w.phase);
        break;
      }
      case 'rotate': {
        rot = (rot||0) + t0*sp*0.8 + w.phase;
        break;
      }
      case 'rain': {
        // movement handled above; slight x sway
        dx = Math.sin(t0*2*sp + w.phase) * w.size*0.05;
        break;
      }
      case 'shimmer': {
        // random sparkle
        const sh = Math.sin(t0*8*sp + w.phase) * Math.sin(t0*13*sp + w.phase*1.7);
        alpha *= 0.35 + 0.65 * (sh*0.5+0.5);
        if(Math.random() < 0.03*sp) alpha = Math.min(1, alpha + 0.5);
        break;
      }
      case 'comic': {
        // POW! style — pop-in with overshoot + slight tilt + persistent burst frame
        const pop = Math.min(1, age*5*sp);
        scale = 0.5 + 0.5*easeOutBack(pop);
        rot = (w.rot || 0) + Math.sin(t0*1.4*sp + w.phase) * 0.06;
        break;
      }
      case 'strobe': {
        // Hard on/off every (1 / (typo.rate*2)) sec — classic strobe
        const period = 1 / Math.max(0.5, typo.rate * 2);
        const phase01 = ((t0 + w.phase) % period) / period;
        alpha *= phase01 < 0.5 ? 1 : 0.05;
        break;
      }
      case 'flipStyle': {
        // Alternates between solid and outline every ~1 sec; marked on the word
        // so renderStyledText knows. We piggyback on outlineSpawn flag.
        const period = 1 / Math.max(0.3, typo.rate);
        w.outlineSpawn = (Math.floor((t0 + w.phase) / period) % 2) === 1;
        break;
      }
      case 'charBurst': {
        // Each char drawn one-by-one at random offsets + sizes per character.
        // Marked here; actual draw handled below the switch (see render block).
        w.__charBurst = true;
        break;
      }
      case 'sizeShake': {
        // Rapid scale jitter + small position shake
        const f1 = Math.sin(t0*9*sp + w.phase);
        const f2 = Math.sin(t0*23*sp + w.phase*1.7);
        scale = 1 + f1 * 0.35;
        dx = f2 * w.size * 0.04;
        dy = Math.cos(t0*17*sp + w.phase) * w.size * 0.04;
        break;
      }
      case 'marquee': {
        // Slide horizontally across screen, wrap when off-screen
        const speed = (W * 0.25) * sp;
        const shift = ((t0 + w.phase) * speed) % (W + w.size * 4) - (W/2 + w.size*2);
        dx = shift;
        break;
      }
      default: {
        // Custom effect: typo.anim looks like 'custom:NAME' — delegate to user function.
        if(typeof window._applyCustomTypoEffect === 'function'){
          const ctx = { t:t0, sp, dts, amp:1, spread:state.spread || 0.18, W, H, CX, CY };
          const r = window._applyCustomTypoEffect(w, typo.anim, ctx);
          if(r){
            if(typeof r.alpha === 'number') alpha *= r.alpha;
            if(typeof r.dx === 'number') dx = r.dx;
            if(typeof r.dy === 'number') dy = r.dy;
            if(typeof r.scale === 'number') scale = r.scale;
            if(typeof r.rot === 'number') rot = r.rot;
          }
        }
        break;
      }
    }

    g.globalAlpha = Math.max(0, alpha);
    g.fillStyle = w.color;
    g.font = `${pickWeight(w)} ${w.size}px ${fontStack()}`;
    // Auto-fit: shrink size if text would exceed canvas width
    let _renderSize = w.size;
    const _maxW = W * 0.92;
    const _m = g.measureText(w.text);
    if(_m.width > _maxW){
      _renderSize *= _maxW / _m.width;
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
    }
    g.textAlign = w.align;
    g.textBaseline = 'middle';
    g.save();
    g.translate(w.x + dx, w.y + dy);
    if(rot) g.rotate(rot);
    if(scale !== 1) g.scale(scale, scale);
    // Comic anim — draw burst shape BEHIND the text
    if(typo.anim === 'comic'){
      const spikes = w.comicSpikes || 12;
      const r1 = w.size * 0.85;
      const r2 = w.size * 1.35;
      const burstAngle = (w.comicRot || 0) + t0*0.4*sp;
      g.save();
      g.rotate(burstAngle);
      g.beginPath();
      for(let k=0;k<spikes*2;k++){
        const a = (k/(spikes*2)) * TAU;
        const r = (k%2) ? r1 : r2;
        const px = Math.cos(a)*r, py = Math.sin(a)*r;
        if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
      }
      g.closePath();
      g.fillStyle = w.comicFill || '#f4cf2e';
      g.fill();
      g.lineWidth = Math.max(2, w.size * 0.035);
      g.strokeStyle = '#0a0a0a';
      g.stroke();
      g.restore();
    }
    if(typo.anim === 'extrude3d'){
      // Draw the text N times with diagonal offset to fake 3D depth
      const layers = 14;
      const offsetMag = _renderSize * 0.018;
      // Back-to-front so top layer (the user's color) wins
      for(let L = layers; L >= 0; L--){
        const ox = -L * offsetMag;
        const oy = L * offsetMag * 0.6;
        const layerT = L / layers;
        // Dark to bright gradient on the extruded sides
        const darken = 1 - layerT * 0.72;
        const layerAlpha = alpha * (L === 0 ? 1 : (0.55 + 0.35*(1-layerT)));
        g.globalAlpha = Math.max(0, layerAlpha);
        // Shift color via darkening — parse the hsl-ish or use opacity trick
        // (cheapest: lower alpha on back layers, top stays original)
        if(L === 0){
          g.fillStyle = w.color;
        } else {
          g.fillStyle = w.color;
          g.globalAlpha *= darken;
        }
        renderStyledText(g, w.text, ox, oy, _renderSize, w.color, w.outlineSpawn);
      }
    } else if(typo.anim === 'charBurst'){
      // Draw each character at a per-char offset + scale, derived from a stable
      // per-word/per-char hash so positions don't flicker each frame.
      const chars = Array.from(w.text);
      const charSizeBase = _renderSize;
      const measures = chars.map(ch => {
        const sFactor = 0.6 + ((Math.abs(Math.sin((w.phase + ch.charCodeAt(0)) * 12.9898)) % 1));
        const cs = charSizeBase * sFactor;
        g.font = `${pickWeight(w)} ${cs}px ${fontStack()}`;
        const m = g.measureText(ch);
        return { ch, cs, mw: m.width };
      });
      const totalW = measures.reduce((s, m) => s + m.mw + charSizeBase*0.08, 0);
      let cursor = -totalW / 2;
      for(const m of measures){
        const t01char = Math.min(1, age * 6 * sp);
        g.font = `${pickWeight(w)} ${m.cs}px ${fontStack()}`;
        const wob = Math.sin(t0*4*sp + m.ch.charCodeAt(0)) * m.cs * 0.05;
        g.globalAlpha = Math.max(0, alpha * t01char);
        renderStyledText(g, m.ch, cursor + m.mw/2, wob, m.cs, w.color, w.outlineSpawn);
        cursor += m.mw + charSizeBase*0.08;
      }
    } else if(typo.anim === 'neon'){
      // Neon tube: multi-layer outline glow + bright inner core
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = w.align; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineCap = 'round';
      // Outer glow passes (largest to smallest)
      for(let pass = 5; pass >= 1; pass--){
        g.globalAlpha = Math.max(0, alpha * (0.35 / pass));
        g.strokeStyle = w.color;
        g.lineWidth = _renderSize * 0.035 * pass;
        g.strokeText(w.text, 0, 0);
      }
      // Bright fill (color)
      g.globalAlpha = Math.max(0, alpha);
      g.fillStyle = w.color;
      g.fillText(w.text, 0, 0);
      // Inner white-hot core (slightly smaller via scaled draw)
      g.globalAlpha = Math.max(0, alpha * 0.85);
      g.fillStyle = state.lightMode ? '#202028' : '#ffffff';
      g.save();
      g.scale(0.93, 0.93);
      g.fillText(w.text, 0, 0);
      g.restore();
    } else if(typo.anim === 'vapor'){
      // Vaporwave: cyan + magenta chromatic offset + white core
      const shift = _renderSize * 0.05 * (1 + (reactor.bass||0)*1.5);
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = w.align; g.textBaseline = 'middle';
      g.globalAlpha = Math.max(0, alpha * 0.75);
      g.fillStyle = '#ff66cc';  // magenta layer
      g.fillText(w.text, -shift, shift * 0.2);
      g.fillStyle = '#66f0ff';  // cyan layer
      g.fillText(w.text, shift, -shift * 0.2);
      // Optional white core (or use user color)
      g.globalAlpha = Math.max(0, alpha);
      g.fillStyle = state.lightMode ? '#1a0028' : '#ffffff';
      g.fillText(w.text, 0, 0);
    } else if(typo.anim === 'liquid'){
      // Per-character sine-wave vertical displacement + small skew
      const chars = Array.from(w.text);
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = chars.map(c => g.measureText(c).width);
      const totalW = widths.reduce((s, x) => s + x, 0) + (chars.length-1) * _renderSize*0.02;
      let cursor = -totalW / 2;
      const waveAmp = _renderSize * (0.12 + (reactor.bass||0)*0.18);
      for(let i=0;i<chars.length;i++){
        const cw = widths[i];
        const phaseCh = i * 0.55;
        const wave = Math.sin(t0*3.2*sp + phaseCh) * waveAmp;
        const skew = Math.cos(t0*2.4*sp + phaseCh*0.7) * 0.18;
        g.save();
        g.transform(1, skew, 0, 1, cursor + cw/2, 0);
        g.globalAlpha = Math.max(0, alpha);
        renderStyledText(g, chars[i], 0, wave, _renderSize, w.color, w.outlineSpawn);
        g.restore();
        cursor += cw + _renderSize*0.02;
      }
    } else if(typo.anim === 'dotmatrix'){
      // Pixelated LED-display effect: render to offscreen, sample, draw as dots
      if(!typo._dotCanvas) typo._dotCanvas = document.createElement('canvas');
      const tc = typo._dotCanvas;
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      const tw_m = g.measureText(w.text);
      const tw = Math.max(8, Math.ceil(tw_m.width));
      const th = Math.max(8, Math.ceil(_renderSize * 1.3));
      tc.width = tw; tc.height = th;
      const tctx = tc.getContext('2d');
      tctx.clearRect(0, 0, tw, th);
      tctx.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      tctx.textAlign = 'left'; tctx.textBaseline = 'middle';
      tctx.fillStyle = '#fff';
      tctx.fillText(w.text, 0, th/2);
      let data;
      try { data = tctx.getImageData(0, 0, tw, th).data; } catch(_){ data = null; }
      if(data){
        const dotSize = Math.max(1.5, _renderSize * 0.045);
        const gap = dotSize * 1.6;
        g.globalAlpha = Math.max(0, alpha);
        g.fillStyle = w.color;
        for(let dy=gap/2; dy<th; dy += gap){
          for(let dx=gap/2; dx<tw; dx += gap){
            const ix = Math.floor(dx), iy = Math.floor(dy);
            const i = (iy * tw + ix) * 4 + 3;
            if(data[i] > 100){
              g.beginPath();
              g.arc(dx - tw/2, dy - th/2, dotSize, 0, TAU);
              g.fill();
            }
          }
        }
      } else {
        renderStyledText(g, w.text, 0, 0, _renderSize, w.color, w.outlineSpawn);
      }
    } else if(typo.anim === 'smoke'){
      // Each character renders with a vertical drift + alpha fade based on per-
      // char phase. Bottom = solid, top = dispersing.
      const chars = Array.from(w.text);
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = chars.map(c => g.measureText(c).width);
      const totalW = widths.reduce((s, x) => s + x, 0) + (chars.length-1) * _renderSize*0.04;
      let cursor = -totalW / 2;
      for(let i=0;i<chars.length;i++){
        const cw = widths[i];
        const ph = (t0 * 0.5 * sp + i * 0.25) % 1;
        const dy = -ph * _renderSize * 0.9;
        const aCh = (1 - ph) * 0.95;
        const jitterX = (Math.random() - 0.5) * ph * _renderSize * 0.12;
        g.globalAlpha = Math.max(0, alpha * aCh);
        renderStyledText(g, chars[i], cursor + cw/2 + jitterX, dy, _renderSize * (1 + ph*0.3), w.color, w.outlineSpawn);
        cursor += cw + _renderSize*0.04;
      }
    } else if(typo.anim === 'scramble'){
      // Matrix-style: chars start as random glyphs, resolve one-by-one over ~2s
      const chars = Array.from(w.text);
      const scrambleSet = '!<>-_\\/[]{}=+*^?#01abcdefXYZ';
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = chars.map(c => g.measureText(c).width);
      const totalW = widths.reduce((s,x)=>s+x, 0) + (chars.length-1)*_renderSize*0.025;
      let cursor = -totalW/2;
      const dom2 = dominantEmo();
      const progress = Math.min(1, age * 0.55);
      for(let i=0;i<chars.length;i++){
        const cw = widths[i];
        const charP = (progress - i / chars.length * 0.55) * 1.8;
        let displayCh, useColor;
        if(charP >= 1){
          displayCh = chars[i];
          useColor = w.color;
        } else {
          displayCh = scrambleSet[Math.floor(Math.random() * scrambleSet.length)];
          // Tint scrambled chars with a brighter tail
          useColor = `hsla(${dom2.hue[1]}, 75%, 65%, ${charP < 0 ? 0 : 1})`;
        }
        g.globalAlpha = Math.max(0, alpha * (charP < 0 ? 0 : 1));
        renderStyledText(g, displayCh, cursor + cw/2, 0, _renderSize, useColor, w.outlineSpawn);
        cursor += cw + _renderSize*0.025;
      }
    } else if(typo.anim === 'pathSine'){
      // Chars laid along a moving sine wave; tangent rotation per char
      const chars = Array.from(w.text);
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = chars.map(c => g.measureText(c).width);
      const charGap = _renderSize * 0.04;
      const totalW = widths.reduce((s,x)=>s+x, 0) + (chars.length-1)*charGap;
      let cursor = -totalW/2;
      const ampl = _renderSize * (0.35 + (reactor.bass||0)*0.2);
      const freq = 0.014;
      const phaseShift = t0 * 1.6 * sp;
      for(let i=0;i<chars.length;i++){
        const cw = widths[i];
        const xPos = cursor + cw/2;
        const wave = Math.sin(xPos * freq + phaseShift) * ampl;
        const slope = Math.cos(xPos * freq + phaseShift) * ampl * freq;
        const rotCh = Math.atan(slope);
        g.save();
        g.translate(xPos, wave);
        g.rotate(rotCh);
        g.globalAlpha = Math.max(0, alpha);
        renderStyledText(g, chars[i], 0, 0, _renderSize, w.color, w.outlineSpawn);
        g.restore();
        cursor += cw + charGap;
      }
    } else if(typo.anim === 'staggerBounce'){
      // Each char enters with stagger delay using easeOutBack overshoot
      const chars = Array.from(w.text);
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = chars.map(c => g.measureText(c).width);
      const charGap = _renderSize * 0.03;
      const totalW = widths.reduce((s,x)=>s+x, 0) + (chars.length-1)*charGap;
      let cursor = -totalW/2;
      const stagger = 0.06;
      for(let i=0;i<chars.length;i++){
        const cw = widths[i];
        const tCh = (age - i * stagger) * 4.5 * sp;
        if(tCh > 0){
          const springT = Math.min(1.2, tCh);
          const sFactor = springT < 1 ? easeOutBack(springT) : (1 + Math.sin((springT-1)*6) * Math.exp(-(springT-1)*3) * 0.08);
          const yOff = (1 - Math.min(1, tCh)) * _renderSize * 0.6;
          g.save();
          g.translate(cursor + cw/2, yOff);
          g.scale(sFactor, sFactor);
          g.globalAlpha = Math.max(0, alpha * Math.min(1, tCh * 1.5));
          renderStyledText(g, chars[i], 0, 0, _renderSize, w.color, w.outlineSpawn);
          g.restore();
        }
        cursor += cw + charGap;
      }
    } else if(typo.anim === 'holo'){
      // Holographic: per-char rainbow hue cycling + chromatic offset shadow
      const chars = Array.from(w.text);
      g.font = `${pickWeight(w)} ${_renderSize}px ${fontStack()}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = chars.map(c => g.measureText(c).width);
      const charGap = _renderSize * 0.02;
      const totalW = widths.reduce((s,x)=>s+x, 0) + (chars.length-1)*charGap;
      let cursor = -totalW/2;
      const hueBase = t0 * 80 * sp + (reactor.bass||0) * 60;
      for(let i=0;i<chars.length;i++){
        const cw = widths[i];
        const hue = (hueBase + i * 28) % 360;
        const mainCol = `hsl(${hue}, 92%, 62%)`;
        const ghostCol = `hsl(${(hue+180)%360}, 92%, 62%)`;
        const offset = 3 + state.bloom*4;
        // Chromatic offset shadow
        g.globalAlpha = Math.max(0, alpha * 0.55);
        renderStyledText(g, chars[i], cursor + cw/2 + offset, -1, _renderSize, ghostCol, w.outlineSpawn);
        // Main character
        g.globalAlpha = Math.max(0, alpha);
        renderStyledText(g, chars[i], cursor + cw/2, 0, _renderSize, mainCol, w.outlineSpawn);
        cursor += cw + charGap;
      }
    } else {
      renderStyledText(g, w.text, 0, 0, _renderSize, w.color, w.outlineSpawn);
    }
    g.restore();
  }
  g.restore();
}

function pickWeight(w){
  return String(typo.weight || 500);
}
function easeOutBack(t){ const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); }

function drawCenteredText(g, text, alpha, pulse, sizeOverride){
  let sz = sizeOverride || pickSizeFromMode();
  g.save();
  g.font = `${typo.weight || 500} ${sz}px ${fontStack()}`;
  // Auto-fit: shrink size so the text fits within 92% of canvas width
  const maxW = W * 0.92;
  const m = g.measureText(text);
  if(m.width > maxW){
    sz *= maxW / m.width;
    g.font = `${typo.weight || 500} ${sz}px ${fontStack()}`;
  }
  g.globalAlpha = alpha;
  g.fillStyle = pickColor();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  renderStyledText(g, text, CX, CY, sz, g.fillStyle, false);
  // soft glow
  g.shadowColor = g.fillStyle;
  g.shadowBlur = 30 + pulse*30;
  renderStyledText(g, text, CX, CY, sz, g.fillStyle, false);
  g.restore();
}

function renderStyledText(g, text, x, y, size, color, outlineSpawn){
  const style = typo.style || 'solid';
  const useOutline = style === 'outline' || (style === 'mix' && outlineSpawn);
  const lwFrac = typo.outlineWidth != null ? typo.outlineWidth : 0.04;
  const lw = Math.max(0.5, size * lwFrac);
  if(style === 'split'){
    // bottom half: filled. top half: outlined.
    g.save();
    g.beginPath(); g.rect(x - size*4, y, size*8, size*3); g.clip();
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.restore();
    g.save();
    g.beginPath(); g.rect(x - size*4, y - size*3, size*8, size*3); g.clip();
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.strokeText(text, x, y);
    g.restore();
    return;
  }
  if(useOutline){
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.strokeText(text, x, y);
    return;
  }
  g.fillStyle = color;
  g.fillText(text, x, y);
}
function pickSizeFromMode(){
  const base = Math.min(W,H) * (typo.sizeScale || 1);
  if(typo.sizeMode === 'huge') return base*0.45;
  if(typo.sizeMode === 'big')  return base*0.22;
  if(typo.sizeMode === 'small')return base*0.08;
  // mixed: pick a random size from 3 tiers each call
  const r = Math.random();
  if(r < 0.2) return base*0.42;
  if(r < 0.55)return base*0.20;
  return base*0.08;
}

/* —————————————————————————————————————————————————————————————————————
   Wire typography controls
   ————————————————————————————————————————————————————————————————————— */
const typeText = $('typeText');
typeText.addEventListener('input', () => {
  // Don't let manual edits overwrite lyric text while sync is active —
  // the lyrics system needs typo.text to stay as the current line.
  if(typeof lyrics !== 'undefined' && lyrics.enabled) return;
  typo.text = typeText.value;
});
typo.text = typeText.value;

$$('#typeFamilySeg button').forEach(b => b.addEventListener('click', () => {
  $$('#typeFamilySeg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.family = b.dataset.family;
}));
$$('#typeLangSeg button').forEach(b => b.addEventListener('click', () => {
  $$('#typeLangSeg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.lang = b.dataset.lang;
}));
$$('#typeLayoutGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#typeLayoutGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.layout = b.dataset.layout;
}));
$$('#typeSizeSeg button').forEach(b => b.addEventListener('click', () => {
  $$('#typeSizeSeg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.sizeMode = b.dataset.size;
}));
$$('#typeStyleSeg button').forEach(b => b.addEventListener('click', () => {
  $$('#typeStyleSeg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.style = b.dataset.style;
  // re-roll outline flag on existing 'mix' spawns so the change shows immediately
  if(typo.style === 'mix'){
    typo.spawns.forEach(w => { w.outlineSpawn = Math.random() < 0.5; });
  }
  ensureMode('typography', true);
}));
$$('#typeAnimGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#typeAnimGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.anim = b.dataset.anim;
  // reset
  typo.spawns.length = 0; typo._tw = null; typo.centerCurrent = null;
}));
$$('#typePalette button').forEach(b => b.addEventListener('click', () => {
  $$('#typePalette button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); typo.color = b.dataset.col;
}));
function wireTypeSlider(id, fillId, thumbId, valId, key, fmt, scale){
  const input = $(id), fill = $(fillId), thumb = $(thumbId), val = $(valId);
  const upd = () => {
    const raw = +input.value;
    typo[key] = scale ? scale(raw) : raw;
    const p = (raw - +input.min)/(+input.max - +input.min) * 100;
    if(fill) fill.style.width = p + '%';
    if(thumb) thumb.style.left = p + '%';
    val.textContent = fmt(typo[key]);
  };
  input.addEventListener('input', upd); upd();
}
wireTypeSlider('typeSpeed','typeSpeedFill','typeSpeedThumb','typeSpeedVal','speed', v => v.toFixed(2)+'×', v => v/100);
wireTypeSlider('typeSizeScale','typeSizeScaleFill','typeSizeScaleThumb','typeSizeScaleVal','sizeScale', v => v.toFixed(2)+'×', v => v/100);
wireTypeSlider('typeWeight','typeWeightFill','typeWeightThumb','typeWeightVal','weight', v => String(v), v => v);
// fmt receives the already-scaled value (typo.outlineWidth = raw/100), so just toFixed(2) directly.
wireTypeSlider('typeOutline','typeOutlineFill','typeOutlineThumb','typeOutlineVal','outlineWidth', v => v.toFixed(2), v => v/100);

// Custom RGB color picker for typography
const typeColorPicker = document.getElementById('typeColorPicker');
if(typeColorPicker){
  typeColorPicker.addEventListener('input', () => {
    typo.color = typeColorPicker.value;
    document.querySelectorAll('#typePalette button').forEach(b => b.classList.remove('on'));
    ensureMode('typography', true);
  });
}
wireTypeSlider('typeRate','typeRateFill','typeRateThumb','typeRateVal','rate', v => v.toFixed(1)+'/s', v => v/10);
wireTypeSlider('typeLife','typeLifeFill','typeLifeThumb','typeLifeVal','life', v => v.toFixed(1)+'s',  v => v/10);
wireTypeSlider('typeDens','typeDensFill','typeDensThumb','typeDensVal','density', v => v.toFixed(2),   v => v/100);
$('typeLoop').addEventListener('change', e => { typo.loop = e.target.checked; });

// Type tab → lyric live update strategy:
//  - color / style / weight / outline / kaleido: read by canvas at draw time,
//    so changes are INSTANT without re-spawning.
//  - sizeMode / family / lang / layout / sizeScale: take effect on the next
//    auto-spawn cycle (~0.67s by default).
//  - anim: handled by the existing #typeAnimGrid click handler that already
//    clears spawns. No extra hook needed.
// We deliberately do NOT call _refreshLyricLine() on every input event — that
// caused flicker from clearing+respawning the word at slider drag speed.
// The Random button still re-renders explicitly (handled where randomizeAll ends).
