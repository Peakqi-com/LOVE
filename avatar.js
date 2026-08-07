/* —————————————————————————————————————————————————————————————————————
   Avatar — face/pose-driven vector character.

   Replaces the filmed person with a drawn character. Independent of Filter,
   which styles the background behind it.

   Drive signals (all already produced by camera-fx.js):
     cam.faceLandmarks   478 points, normalised video space  → placement, rotation
     cam.faceBlendshapes 52 ARKit coefficients               → expression
     cam.poseLandmarks   33 body points                      → shoulders, arms

   Head rotation is derived from the LANDMARKS, not from the 4×4
   facialTransformationMatrix. The matrix is available, but its handedness and
   Euler order are easy to get subtly wrong and the failure mode is a character
   whose head tilts the wrong way — landmark ratios are self-evident and verify
   by inspection.

   Everything is drawn through the same N2S mapping the video plane uses, so the
   character sits exactly where the real person is, at the real scale.
   ————————————————————————————————————————————————————————————————————— */
console.log('[IW] avatar.js loading · cam=' + typeof cam);

// MediaPipe pose landmark indices we care about
const POSE = {
  nose: 0,
  shoulderL: 11, shoulderR: 12,
  elbowL: 13,    elbowR: 14,
  wristL: 15,    wristR: 16,
  hipL: 23,      hipR: 24,
};

// Face landmark indices (FaceLandmarker canonical mesh)
const FACE = {
  top: 10, chin: 152,
  cheekL: 234, cheekR: 454,
  noseTip: 1, betweenEyes: 168,
  eyeROuter: 33,  eyeRInner: 133,
  eyeLInner: 362, eyeLOuter: 263,
};

function _bs(shapes, name){
  if(!shapes) return 0;
  for(let i = 0; i < shapes.length; i++){
    if(shapes[i].categoryName === name) return shapes[i].score || 0;
  }
  return 0;
}

// Exponential smoothing on the whole rig. Tracker output jitters a few pixels
// per frame; on a photographic overlay that reads as "alive", but on flat
// vector shapes it reads as a broken, vibrating drawing. Smoothing is not
// optional here.
const _rigPrev = {};
function _smooth(key, value, amount){
  const p = _rigPrev[key];
  const out = (p === undefined || !isFinite(p)) ? value : p + (value - p) * amount;
  _rigPrev[key] = out;
  return out;
}
function resetAvatarRig(){ for(const k in _rigPrev) delete _rigPrev[k]; }

/* Build a clean animation rig from whatever the trackers currently have.
   Returns null when there is no face — the caller then leaves the real video
   visible rather than drawing a character floating in nowhere. */
function buildAvatarRig(smoothing){
  const lm = cam.faceLandmarks;
  if(!lm || lm.length < 468) return null;
  const sm = Math.max(0.08, Math.min(1, smoothing == null ? 0.45 : smoothing));

  const P = i => lm[i];
  const top = P(FACE.top), chin = P(FACE.chin);
  const cl  = P(FACE.cheekL), cr = P(FACE.cheekR);
  const nose = P(FACE.noseTip);

  // Head box in normalised video space
  const cx = (top.x + chin.x) * 0.5;
  const cy = (top.y + chin.y) * 0.5;
  const halfH = Math.hypot(chin.x - top.x, chin.y - top.y) * 0.5;
  const halfW = Math.hypot(cr.x - cl.x, cr.y - cl.y) * 0.5;

  // Roll from the eye line; yaw/pitch from where the nose sits inside the head
  // box. Both are ratios, so they are resolution- and distance-independent.
  const eR = { x: (P(FACE.eyeROuter).x + P(FACE.eyeRInner).x) * 0.5,
               y: (P(FACE.eyeROuter).y + P(FACE.eyeRInner).y) * 0.5 };
  const eL = { x: (P(FACE.eyeLOuter).x + P(FACE.eyeLInner).x) * 0.5,
               y: (P(FACE.eyeLOuter).y + P(FACE.eyeLInner).y) * 0.5 };
  const roll = Math.atan2(eL.y - eR.y, eL.x - eR.x);

  const faceMidX = (cl.x + cr.x) * 0.5;
  const faceMidY = (top.y + chin.y) * 0.5;
  const yaw   = Math.max(-1, Math.min(1, (nose.x - faceMidX) / Math.max(1e-4, halfW)));
  const pitch = Math.max(-1, Math.min(1, (nose.y - faceMidY) / Math.max(1e-4, halfH)));

  const bs = cam.faceBlendshapes;
  // MediaPipe's Left/Right are from the subject's point of view.
  const blinkL = _bs(bs, 'eyeBlinkLeft');
  const blinkR = _bs(bs, 'eyeBlinkRight');
  const jaw    = _bs(bs, 'jawOpen');
  const smile  = (_bs(bs, 'mouthSmileLeft') + _bs(bs, 'mouthSmileRight')) * 0.5;
  const frown  = (_bs(bs, 'mouthFrownLeft') + _bs(bs, 'mouthFrownRight')) * 0.5;
  const browUp = (_bs(bs, 'browOuterUpLeft') + _bs(bs, 'browOuterUpRight')) * 0.5
               +  _bs(bs, 'browInnerUp') * 0.5;
  const browDn = (_bs(bs, 'browDownLeft') + _bs(bs, 'browDownRight')) * 0.5;
  const lookX  = _bs(bs, 'eyeLookOutRight') + _bs(bs, 'eyeLookInLeft')
               - _bs(bs, 'eyeLookOutLeft')  - _bs(bs, 'eyeLookInRight');
  const lookY  = _bs(bs, 'eyeLookUpLeft')   + _bs(bs, 'eyeLookUpRight')
               - _bs(bs, 'eyeLookDownLeft') - _bs(bs, 'eyeLookDownRight');

  // Without blendshapes (older model / load failure) fall back to a geometric
  // blink and jaw estimate so the character still animates.
  let bL = blinkL, bR = blinkR, jawOpen = jaw;
  if(!bs){
    const eyeOpenR = Math.abs(lm[159].y - lm[145].y) / Math.max(1e-4, halfH);
    const eyeOpenL = Math.abs(lm[386].y - lm[374].y) / Math.max(1e-4, halfH);
    bR = 1 - Math.min(1, eyeOpenR / 0.11);
    bL = 1 - Math.min(1, eyeOpenL / 0.11);
    jawOpen = Math.min(1, Math.abs(lm[13].y - lm[14].y) / Math.max(1e-4, halfH) / 0.22);
  }

  const pose = cam.poseLandmarks;
  let body = null;
  if(pose && pose.length > 24){
    const vis = i => (pose[i] && pose[i].visibility != null) ? pose[i].visibility : 1;
    const pt  = i => ({ x: pose[i].x, y: pose[i].y, v: vis(i) });
    body = {
      shoulderL: pt(POSE.shoulderL), shoulderR: pt(POSE.shoulderR),
      elbowL:    pt(POSE.elbowL),    elbowR:    pt(POSE.elbowR),
      wristL:    pt(POSE.wristL),    wristR:    pt(POSE.wristR),
      hipL:      pt(POSE.hipL),      hipR:      pt(POSE.hipR),
    };
    for(const key in body){
      body[key].x = _smooth('b' + key + 'x', body[key].x, sm);
      body[key].y = _smooth('b' + key + 'y', body[key].y, sm);
    }
  }

  return {
    head: {
      x:     _smooth('hx', cx, sm),
      y:     _smooth('hy', cy, sm),
      rx:    _smooth('hrx', halfW, sm),
      ry:    _smooth('hry', halfH, sm),
      roll:  _smooth('roll', roll, sm),
      yaw:   _smooth('yaw', yaw, sm),
      pitch: _smooth('pitch', pitch, sm),
    },
    eyes: {
      // Blink is deliberately snappier than the rest — smoothing a blink turns
      // it into a slow droop, which reads as sleepy rather than as a blink.
      blinkL: _smooth('blinkL', bL, Math.min(1, sm * 2.2)),
      blinkR: _smooth('blinkR', bR, Math.min(1, sm * 2.2)),
      lookX:  _smooth('lookX', Math.max(-1, Math.min(1, lookX)), sm),
      lookY:  _smooth('lookY', Math.max(-1, Math.min(1, lookY)), sm),
    },
    brow:  { up: _smooth('browUp', browUp - browDn, sm) },
    mouth: {
      open:  _smooth('jaw', jawOpen, Math.min(1, sm * 1.6)),
      smile: _smooth('smile', smile - frown * 0.8, sm),
    },
    body,
  };
}

/* ── Character styles ──
   Data only: proportions and colours. The renderer below reads these, so a new
   look is a new entry here rather than new drawing code. */
const AVATAR_STYLES = {
  simpson: {
    label: 'Simpson',
    skin: '#ffd90f', skinShade: '#e8b400',
    ink: '#1a1206', lineW: 0.055,
    headSquash: 1.06,               // slightly wider than tall
    eye: { r: 0.40, sep: 0.52, y: -0.12, white: '#ffffff', pupil: '#141414', pupilR: 0.30 },
    brow: { w: 0.34, h: 0.055, y: -0.52, color: '#1a1206' },
    mouth: { w: 0.52, y: 0.42, lip: '#c2410c', inner: '#7f1d1d' },
    hair: 'spikes', hairColor: '#1a1206',
    shirt: '#4f9ee8', shirtShade: '#3a7fc4',
    arm: 0.26,
  },
  anime: {
    label: 'Anime',
    skin: '#ffe0c8', skinShade: '#f0c3a3',
    ink: '#2a1f2e', lineW: 0.040,
    headSquash: 0.94,
    eye: { r: 0.46, sep: 0.56, y: -0.05, white: '#ffffff', pupil: '#2f5fa8', pupilR: 0.42 },
    brow: { w: 0.30, h: 0.035, y: -0.56, color: '#5b3a2e' },
    mouth: { w: 0.28, y: 0.46, lip: '#d4756b', inner: '#8a3b3b' },
    hair: 'bob', hairColor: '#3b2a3f',
    shirt: '#e8607d', shirtShade: '#c74a63',
    arm: 0.22,
  },
  noir: {
    label: 'Noir',
    skin: '#d8d4cc', skinShade: '#a8a49c',
    ink: '#0a0a0a', lineW: 0.070,
    headSquash: 1.00,
    eye: { r: 0.34, sep: 0.50, y: -0.10, white: '#f4f2ee', pupil: '#0a0a0a', pupilR: 0.34 },
    brow: { w: 0.36, h: 0.070, y: -0.50, color: '#0a0a0a' },
    mouth: { w: 0.44, y: 0.44, lip: '#4a4a4a', inner: '#1a1a1a' },
    hair: 'slick', hairColor: '#0a0a0a',
    shirt: '#3a3a3a', shirtShade: '#242424',
    arm: 0.25,
  },
};

// Stroke-then-fill limb: draw the ink pass wider, then the fill on top. Gives a
// clean outlined limb in two strokes instead of building an outline polygon.
function _limb(g, pts, w, fill, ink, lw){
  if(pts.length < 2) return;
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for(let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  path(); g.strokeStyle = ink;  g.lineWidth = w + lw * 2; g.stroke();
  path(); g.strokeStyle = fill; g.lineWidth = w;          g.stroke();
}

function _inkEllipse(g, x, y, rx, ry, rot, fill, ink, lw){
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
}

/* Draw the character.
   map(nx, ny) -> [screenX, screenY] must be the SAME mapping used for the video
   plane, otherwise the character drifts away from the person it replaces. */
function drawAvatar(g, rig, styleId, intensity, map, scaleRef){
  const S = AVATAR_STYLES[styleId] || AVATAR_STYLES.simpson;
  if(!rig) return;
  const k = Math.max(0, Math.min(2, intensity == null ? 1 : intensity));

  const h = rig.head;
  const [hx, hy] = map(h.x, h.y);
  // Head radius in screen pixels: measure the mapped head box rather than
  // guessing from canvas size, so the character tracks the person's real scale
  // as they walk toward or away from the camera.
  const [ex] = map(h.x + h.rx, h.y);
  const [, ey] = map(h.x, h.y + h.ry);
  const R  = Math.max(6, Math.abs(ex - hx));
  const RY = Math.max(6, Math.abs(ey - hy));
  const lw = Math.max(1.2, R * S.lineW);
  const ink = S.ink;

  // Mirrored video flips the apparent roll direction; the mapping already
  // handles position, but an angle has to be negated explicitly.
  const roll = (cam.mirror ? -1 : 1) * rig.head.roll;
  const yaw  = (cam.mirror ? -1 : 1) * rig.head.yaw;

  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';

  // ── Body ──
  if(rig.body){
    const b = rig.body;
    const sL = map(b.shoulderL.x, b.shoulderL.y);
    const sR = map(b.shoulderR.x, b.shoulderR.y);
    const hL = map(b.hipL.x, b.hipL.y);
    const hR = map(b.hipR.x, b.hipR.y);
    const headBottom = hy + RY * 0.78;

    // Shoulder apex: where the chest rises to meet the neck. Clamped to a short
    // distance below the head no matter what the pose tracker reports — the raw
    // head-to-shoulder gap on a real body is about a head tall, and drawn as a
    // literal stick between two points that reads as a giraffe. Cartoon figures
    // have almost no neck, so the chest comes up to the jaw instead.
    const apexY = Math.min((sL[1] + sR[1]) * 0.5, headBottom + R * 0.55);
    const apexX = (sL[0] + sR[0]) * 0.5;

    // Neck first, so the torso overlaps and hides its bottom end
    _limb(g, [[hx, headBottom - R * 0.1], [apexX, apexY + R * 0.25]], R * 0.42, S.skinShade, ink, lw);

    // Rounded torso: shoulders bulge outward and upward, waist tucks in
    const shrug = R * 0.28;
    g.beginPath();
    g.moveTo(hL[0], hL[1]);
    g.lineTo(sL[0] - shrug * 0.3, sL[1]);
    g.quadraticCurveTo(sL[0] - shrug * 0.1, sL[1] - shrug, apexX - R * 0.42, apexY);
    g.quadraticCurveTo(apexX, apexY - R * 0.22, apexX + R * 0.42, apexY);
    g.quadraticCurveTo(sR[0] + shrug * 0.1, sR[1] - shrug, sR[0] + shrug * 0.3, sR[1]);
    g.lineTo(hR[0], hR[1]);
    g.quadraticCurveTo((hL[0] + hR[0]) * 0.5, (hL[1] + hR[1]) * 0.5 + R * 0.2, hL[0], hL[1]);
    g.closePath();
    g.fillStyle = S.shirt; g.fill();
    g.strokeStyle = ink; g.lineWidth = lw; g.stroke();

    // Arms — only when the tracker is confident. A low-visibility limb whips
    // across the frame and wrecks the shot, so it is better not to draw it.
    const armW = R * S.arm;
    const arm = (sh, el, wr) => {
      if(el.v <= 0.5 || wr.v <= 0.4) return;
      const e = map(el.x, el.y), w2 = map(wr.x, wr.y);
      _limb(g, [sh, e, w2], armW, S.shirt, ink, lw);
      // hand
      _inkEllipse(g, w2[0], w2[1], armW * 0.62, armW * 0.62, 0, S.skin, ink, lw);
    };
    arm(sL, b.elbowL, b.wristL);
    arm(sR, b.elbowR, b.wristR);
  } else {
    // No pose model: a simple shoulders wedge hung off the head so the
    // character is never a floating disembodied head.
    const sw = R * 2.3, sy = hy + RY * 1.5;
    g.beginPath();
    g.moveTo(hx - sw, sy + R * 2.2);
    g.quadraticCurveTo(hx - sw * 0.75, sy, hx, sy);
    g.quadraticCurveTo(hx + sw * 0.75, sy, hx + sw, sy + R * 2.2);
    g.closePath();
    g.fillStyle = S.shirt; g.fill();
    g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
    _limb(g, [[hx, hy + RY * 0.7], [hx, sy + R * 0.2]], R * 0.42, S.skinShade, ink, lw);
  }

  // ── Head ──
  g.save();
  g.translate(hx, hy);
  g.rotate(roll);
  const HR  = R * S.headSquash;
  const HRY = RY;

  // Hair behind the head silhouette
  if(S.hair === 'bob'){
    _inkEllipse(g, 0, -HRY * 0.16, HR * 1.16, HRY * 1.12, 0, S.hairColor, ink, lw);
  }

  _inkEllipse(g, 0, 0, HR, HRY, 0, S.skin, ink, lw);

  // Hair on top of the skull
  if(S.hair === 'spikes'){
    g.beginPath();
    const n = 8;
    for(let i = 0; i <= n; i++){
      const t  = i / n;
      const a  = Math.PI + t * Math.PI;
      const px = Math.cos(a) * HR * 0.98;
      const py = Math.sin(a) * HRY * 0.98;
      if(i === 0) g.moveTo(px, py);
      else {
        const ma = Math.PI + (t - 0.5 / n) * Math.PI;
        g.lineTo(Math.cos(ma) * HR * 1.30, Math.sin(ma) * HRY * 1.34);
        g.lineTo(px, py);
      }
    }
    g.closePath();
    g.fillStyle = S.hairColor; g.fill();
    g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
  } else if(S.hair === 'slick'){
    g.beginPath();
    g.ellipse(0, -HRY * 0.52, HR * 1.02, HRY * 0.48, 0, Math.PI, Math.PI * 2);
    g.closePath();
    g.fillStyle = S.hairColor; g.fill();
    g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
  }

  // ── Face features ──
  // Yaw shifts the features across the face — a cheap but convincing stand-in
  // for real 3D head turn on a flat drawing.
  const fx = yaw * HR * 0.30;
  const py = rig.head.pitch * HRY * 0.16;

  const E = S.eye;
  const eyeR = HR * E.r * (0.85 + k * 0.15);
  const eyeY = HRY * E.y + py;
  const eyeDX = HR * E.sep;
  const blinks = [rig.eyes.blinkR, rig.eyes.blinkL];   // screen left, screen right
  for(let s = 0; s < 2; s++){
    const sx = fx + (s === 0 ? -eyeDX : eyeDX);
    const blink = Math.max(0, Math.min(1, blinks[s]));
    const openY = eyeR * Math.max(0.06, 1 - blink);
    _inkEllipse(g, sx, eyeY, eyeR, openY, 0, E.white, ink, lw * 0.9);
    if(blink < 0.75){
      const pr = eyeR * E.pupilR;
      const px2 = sx + rig.eyes.lookX * (eyeR - pr) * 0.7;
      const py2 = eyeY - rig.eyes.lookY * (openY - Math.min(pr, openY)) * 0.7;
      g.beginPath();
      g.ellipse(px2, py2, pr, Math.min(pr, openY * 0.95), 0, 0, Math.PI * 2);
      g.fillStyle = E.pupil; g.fill();
    }
  }

  // Brows
  const B = S.brow;
  const browY = HRY * B.y + py - rig.brow.up * HRY * 0.10;
  g.strokeStyle = B.color;
  g.lineWidth = Math.max(1.2, HRY * B.h);
  for(let s = 0; s < 2; s++){
    const sx = fx + (s === 0 ? -eyeDX : eyeDX);
    const tilt = (rig.brow.up * 0.25 + rig.mouth.smile * 0.1) * (s === 0 ? 1 : -1);
    g.beginPath();
    g.moveTo(sx - HR * B.w * 0.5, browY + tilt * HRY * 0.10);
    g.lineTo(sx + HR * B.w * 0.5, browY - tilt * HRY * 0.10);
    g.stroke();
  }

  // Mouth — width follows smile, height follows jaw
  const M = S.mouth;
  const mY = HRY * M.y + py;
  const open = rig.mouth.open;
  const smile = rig.mouth.smile;
  const mW = HR * M.w * (0.86 + smile * 0.30);
  const mH = HRY * (0.045 + open * 0.34);
  if(open > 0.06){
    g.beginPath();
    g.ellipse(fx, mY + mH * 0.35, mW * 0.5, mH, 0, 0, Math.PI * 2);
    g.fillStyle = M.inner; g.fill();
    g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
  } else {
    g.beginPath();
    g.moveTo(fx - mW * 0.5, mY);
    g.quadraticCurveTo(fx, mY + smile * HRY * 0.16 + HRY * 0.03, fx + mW * 0.5, mY);
    g.strokeStyle = M.lip;
    g.lineWidth = Math.max(1.4, lw * 1.5);
    g.stroke();
  }

  g.restore();  // head transform
  g.restore();  // outer
}
