/* —————————————————————————————————————————————————————————————————————
   Camera + MediaPipe (lazy-loaded)
   ————————————————————————————————————————————————————————————————————— */
console.log('[IW] camera-fx.js loading · $=' + typeof $ + ' state=' + typeof state + ' imgState=' + typeof imgState);
const cam = {
  stream: null,
  video: $('camVideo'),
  ready: false,
  track: 'face',           // 'face' | 'hand'
  fx: 'tendrils',          // alias of current track's fx
  faceFx: 'tendrils',
  handFx: 'rays',
  kaleido: 0,              // independent per-layer kaleido segments (0 = off)
  // FX behavior knobs (apply to all particle-based fx)
  fxColor: 'auto',         // 'auto' | 'warm' | 'cool' | 'mono' | 'rainbow'
  fxHue: 280,              // base hue for 'mono' (0..360)
  fxSpawn: 1.0,            // spawn rate multiplier
  fxLife: 1.0,             // lifetime multiplier
  fxSpeed: 1.0,            // particle speed multiplier
  fxJitter: 0.0,           // random per-frame position jitter
  fxFadeVar: 0.0,          // randomization of fade-in/out timing per particle
  videoOpacity: 0.35,
  fxSize: 1.0,
  mirror: true,
  // Video filter (independent from face/hand FX particles)
  filter: 'none',          // 'none'|'8bit'|'mosaic'|'chroma'|'glitch'|'threshold'|'invert'|'vapor'|'sepia'|'mono'|'edge'|'scanlines'|'halftone'|'sketch'
  filterIntensity: 1.0,    // 0..2 — multiplier for filter strength
  // AR overlays (face-landmark driven; independent of Effect particles + Filter)
  ar: 'none',              // 'none'|'mesh'|'glasses'|'sunglasses'|'cat'|'crown'|'halo'|'tears'|'laserEyes'|'thirdEye'|'mask'|'aura'
  arIntensity: 1.0,        // 0..2
  // Motion — transforms applied to the entire webcam plane (like text animations: shake/zoom/sway/etc)
  motion: 'none',          // 'none'|'shake'|'zoomPulse'|'sway'|'breathe'|'orbit'|'tilt'|'bounce'|'jitter'|'spiral'
  motionIntensity: 1.0,    // 0..2 — multiplier
  motionSpeed: 1.0,        // 0.2..3 — speed multiplier
  // Hand AR — separate from face AR (uses 2D hand landmarks)
  handAr: 'none',          // 'none'|'rings'|'energyBall'|'spiderweb'|'wand'|'lightning'|'fireball'|'butterflies'
  handArIntensity: 1.0,
  // latest detection
  faceLandmarks: null,
  handLandmarks: null,
  // mediapipe instances
  faceLM: null,
  handLM: null,
  segLM: null,
  faceLoading: false,
  handLoading: false,
  segLoading: false,
  lastDetectT: 0,
  // background removal (face track) — keeps only the person
  removeBg: false,
  bgFeather: 0.5,       // 0 = sharp edges, 1 = very soft
  bgSmooth: 0.55,       // 0 = no temporal blend, 1 = freeze (typical 0.5-0.7)
  bgModel: 'fast',      // 'fast' (selfie_segmenter) | 'multiclass' (selfie_multiclass_256x256)
  segMaskData: null,    // Uint8Array category mask (1 byte per pixel, 0=person, 255=bg by model convention; we treat <128 as person)
  segMaskW: 0, segMaskH: 0,
  // off-screen for sampling video frames
  fxState: { tendrils:[], petals:[], rays:[], orbits:[], emit:[], trail:null, pulse:[], confetti:[], stars:[] },
};

async function loadMediaPipe(which){
  // dynamic import; cached on window for re-use
  if(!window._mpVision){
    try{
      window._mpVision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.10/vision_bundle.mjs');
    }catch(e){
      console.warn('MediaPipe load failed', e);
      return null;
    }
  }
  const { FaceLandmarker, HandLandmarker, ImageSegmenter, FilesetResolver } = window._mpVision;
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.10/wasm');
  if(which === 'face' && !cam.faceLM){
    cam.faceLoading = true;
    cam.faceLM = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate:'GPU' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true,
    });
    cam.faceLoading = false;
  }
  if(which === 'hand' && !cam.handLM){
    cam.handLoading = true;
    cam.handLM = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate:'GPU' },
      runningMode: 'VIDEO', numHands: 2,
    });
    cam.handLoading = false;
  }
  if(which === 'seg' && !cam.segLM && ImageSegmenter){
    cam.segLoading = true;
    const modelUrl = (cam.bgModel === 'multiclass')
      ? 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'
      : 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
    console.log('[IW][seg] loading selfie segmenter model (' + (cam.bgModel || 'fast') + ') …');
    // Try GPU first, fall back to CPU if GPU delegate fails (some browsers / drivers).
    try {
      cam.segLM = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate:'GPU' },
        runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false,
      });
      console.log('[IW][seg] segmenter ready (GPU)');
    } catch(eGpu){
      console.warn('[IW][seg] GPU delegate failed, trying CPU:', eGpu && eGpu.message);
      try {
        cam.segLM = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelUrl, delegate:'CPU' },
          runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false,
        });
        console.log('[IW][seg] segmenter ready (CPU fallback)');
      } catch(eCpu){
        console.error('[IW][seg] segmenter failed on both GPU and CPU:', eCpu && eCpu.message);
      }
    }
    cam.segLoading = false;
  }
  return which === 'seg' ? cam.segLM : cam[which==='face'?'faceLM':'handLM'];
}

async function camStart(){
  setCamStatus('requesting…');
  try{
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width:1280, height:720, facingMode:'user' }, audio:false });
    cam.video.srcObject = cam.stream;
    await cam.video.play();
    cam.ready = true;
    $('camPreview').classList.add('live');
    setCamStatus('live · loading model…');
    // enable webcamFX mode automatically
    if(!state.modes.webcamFX){
      state.modes.webcamFX = true;
      const cb = document.querySelector('#modes input[data-mode="webcamFX"]');
      if(cb) cb.checked = true;
    }
    await loadMediaPipe(cam.track);
    setCamStatus('live · ' + cam.track);
  }catch(e){
    console.warn('camera start failed', e);
    setCamStatus('camera blocked');
  }
}
function camStop(){
  if(cam.stream){ cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; }
  cam.video.srcObject = null;
  cam.ready = false;
  cam.faceLandmarks = cam.handLandmarks = null;
  $('camPreview').classList.remove('live');
  setCamStatus('camera off');
}
function setCamStatus(text){
  $('camStatus').classList.toggle('live', cam.ready);
  $('camStatusText').textContent = text;
}

$('camStart').addEventListener('click', camStart);
$('camStop').addEventListener('click', camStop);

// helper: reflect current track's fx in the grid
function syncFxGrid(){
  cam.fx = (cam.track === 'face') ? cam.faceFx : cam.handFx;
  $$('#camFxGrid button').forEach(b => b.classList.toggle('on', b.dataset.fx === cam.fx));
  // reset fx particle pools when switching fx
  cam.fxState = { tendrils:[], petals:[], rays:[], orbits:[], emit:[], trail:null, pulse:[], confetti:[], stars:[] };
}

// track toggle
$$('#camTrackSeg button').forEach(b => b.addEventListener('click', async () => {
  $$('#camTrackSeg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  cam.track = b.dataset.track;
  cam.faceLandmarks = cam.handLandmarks = null;
  syncFxGrid();
  if(cam.ready){
    setCamStatus('switching to ' + cam.track + '…');
    await loadMediaPipe(cam.track);
    setCamStatus('live · ' + cam.track);
  }
}));
// fx grid — saves to face/handFx based on current track
$$('#camFxGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#camFxGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const f = b.dataset.fx;
  if(cam.track === 'face') cam.faceFx = f; else cam.handFx = f;
  cam.fx = f;
  // reset fx particle pools when switching
  cam.fxState = { tendrils:[], petals:[], rays:[], orbits:[], emit:[], trail:null, pulse:[], confetti:[], stars:[] };
  // auto-enable webcamFX visual mode
  ensureMode('webcamFX', true);
  if(!cam.ready){
    setCamStatus('▶ start camera to see ' + f);
  } else if(cam.track === 'face' && !cam.faceLM){
    setCamStatus('loading face model…');
  } else if(cam.track === 'hand' && !cam.handLM){
    setCamStatus('loading hand model…');
  }
}));

// helper: enable / disable a visual mode and sync the UI chip
function ensureMode(name, on){
  state.modes[name] = on;
  const cb = document.querySelector(`#modes input[data-mode="${name}"]`);
  if(cb) cb.checked = on;
}

// sliders for camera
function wireCamSlider(id, fillId, thumbId, valId, key, fmt, scale){
  const input = $(id), fill = $(fillId), thumb = $(thumbId), val = $(valId);
  const upd = () => {
    const raw = +input.value;
    const mapped = scale ? scale(raw) : raw;
    cam[key] = (key === 'mirror') ? !!raw : mapped;
    const p = (raw - +input.min)/(+input.max - +input.min) * 100;
    if(fill) fill.style.width = p + '%';
    if(thumb) thumb.style.left = p + '%';
    if(val) val.textContent = fmt(raw);
  };
  input.addEventListener('input', upd);
  upd();
}
wireCamSlider('camVid','camVidFill','camVidThumb','camVidVal','videoOpacity', v => v+'%', v => v/100);
wireCamSlider('camFxSize','camFxSizeFill','camFxSizeThumb','camFxSizeVal','fxSize', v => (v/100).toFixed(1)+'×', v => v/100);
wireCamSlider('camMirror','camMirrorFill','camMirrorThumb','camMirrorVal','mirror', v => v ? 'on' : 'off');

// Video filter grid — independent of FX particles
$$('#camFilterGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#camFilterGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  cam.filter = b.dataset.filter;
  // ensure webcamFX visual mode is on so the user can see the filter applied
  if(cam.filter !== 'none') ensureMode('webcamFX', true);
}));
wireCamSlider('camFilterAmt','camFilterAmtFill','camFilterAmtThumb','camFilterAmtVal','filterIntensity', v => (v/100).toFixed(1)+'×', v => v/100);

// AR overlays grid — face-landmark driven, independent of Filter + Effect
$$('#camArGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#camArGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  cam.ar = b.dataset.ar;
  if(cam.ar !== 'none'){
    ensureMode('webcamFX', true);
    // auto-switch to face track if hand is active (AR needs face)
    if(cam.track !== 'face'){
      cam.track = 'face';
      $$('#camTrackSeg button').forEach(x => x.classList.toggle('on', x.dataset.track === 'face'));
      syncFxGrid();
      if(cam.ready) loadMediaPipe('face').catch(()=>{});
    }
  }
}));
wireCamSlider('camArAmt','camArAmtFill','camArAmtThumb','camArAmtVal','arIntensity', v => (v/100).toFixed(1)+'×', v => v/100);

// Hand AR — independent of Face AR (uses hand track)
$$('#camHandArGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#camHandArGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  cam.handAr = b.dataset.handar;
  if(cam.handAr !== 'none'){
    ensureMode('webcamFX', true);
    // auto-switch to hand track (so MediaPipe gives us hand landmarks)
    if(cam.track !== 'hand'){
      cam.track = 'hand';
      $$('#camTrackSeg button').forEach(x => x.classList.toggle('on', x.dataset.track === 'hand'));
      syncFxGrid();
      if(cam.ready) loadMediaPipe('hand').catch(()=>{});
    }
  }
}));
wireCamSlider('camHandArAmt','camHandArAmtFill','camHandArAmtThumb','camHandArAmtVal','handArIntensity', v => (v/100).toFixed(1)+'×', v => v/100);

// Motion — transforms applied to whole webcam plane
$$('#camMotionGrid button').forEach(b => b.addEventListener('click', () => {
  $$('#camMotionGrid button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  cam.motion = b.dataset.motion;
  if(cam.motion !== 'none') ensureMode('webcamFX', true);
}));
wireCamSlider('camMotionAmt','camMotionAmtFill','camMotionAmtThumb','camMotionAmtVal','motionIntensity', v => (v/100).toFixed(1)+'×', v => v/100);
wireCamSlider('camMotionSpd','camMotionSpdFill','camMotionSpdThumb','camMotionSpdVal','motionSpeed', v => (v/100).toFixed(1)+'×', v => v/100);

// Background removal toggle — lazy-loads the selfie segmenter on first enable
const camRemoveBg = document.getElementById('camRemoveBg');
if(camRemoveBg){
  camRemoveBg.addEventListener('change', async () => {
    cam.removeBg = camRemoveBg.checked;
    if(cam.removeBg && !cam.segLM){
      setCamStatus('loading segmenter…');
      await loadMediaPipe('seg');
      setCamStatus(cam.ready ? 'live · ' + cam.track + ' · seg' : 'segmenter ready');
    }
    if(!cam.removeBg){
      cam.segMaskData = null;
    }
  });
}
// Feather + smoothing sliders
wireCamSlider('camBgFeather','camBgFeatherFill','camBgFeatherThumb','camBgFeatherVal','bgFeather', v => (v/100).toFixed(2), v => v/100);
wireCamSlider('camBgSmooth','camBgSmoothFill','camBgSmoothThumb','camBgSmoothVal','bgSmooth', v => (v/100).toFixed(2), v => v/100);
// Model picker — switching forces re-init
const _camBgModelSeg = document.getElementById('camBgModelSeg');
if(_camBgModelSeg){
  _camBgModelSeg.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', async () => {
      const newModel = b.dataset.segmodel;
      if(cam.bgModel === newModel) return;
      _camBgModelSeg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cam.bgModel = newModel;
      // Force reload model on next use
      if(cam.segLM){
        try { cam.segLM.close && cam.segLM.close(); } catch(_){}
        cam.segLM = null;
      }
      if(cam.removeBg){
        setCamStatus('loading ' + newModel + ' segmenter…');
        await loadMediaPipe('seg');
        setCamStatus(cam.ready ? 'live · ' + cam.track + ' · ' + newModel : newModel + ' ready');
      }
    });
  });
}

/* —————————————————————————————————————————————————————————————————————
   MediaPipe detection loop — runs every RAF.
   Earlier I added throttling but it broke bg removal in some configs,
   so back to the original full-rate detection.
   ————————————————————————————————————————————————————————————————————— */
async function detectLoop(){
  if(!cam.ready){ requestAnimationFrame(detectLoop); return; }
  const v = cam.video;
  const now = performance.now();
  if(v.readyState >= 2){
    try{
      if(cam.track === 'face' && cam.faceLM){
        const r = cam.faceLM.detectForVideo(v, now);
        cam.faceLandmarks = (r.faceLandmarks && r.faceLandmarks[0]) || null;
        cam.faceTransformMatrix = (r.facialTransformationMatrixes && r.facialTransformationMatrixes[0] && r.facialTransformationMatrixes[0].data) || null;
      } else if(cam.track === 'hand' && cam.handLM){
        const r = cam.handLM.detectForVideo(v, now);
        cam.handLandmarks = (r.landmarks && r.landmarks.length) ? r.landmarks : null;
      }
      if(cam.removeBg && cam.segLM){
        cam.segLM.segmentForVideo(v, now, (result) => {
          const cm = result.categoryMask;
          if(!cm) return;
          cam.segMaskData = cm.getAsUint8Array();
          cam.segMaskW = cm.width; cam.segMaskH = cm.height;
          if(!cam._segLoggedFirst){
            console.log('[IW][seg] first mask received', cm.width + '×' + cm.height);
            cam._segLoggedFirst = true;
          }
          cm.close();
        });
      }
    }catch(_){}
  }
  requestAnimationFrame(detectLoop);
}
detectLoop();

// Build/refresh the alpha mask canvas from segMaskData (0=person, 255=bg in selfie_segmenter)
// — Soft-edge mask (gradient at threshold)
// — Temporal EMA smoothing (reduce jitter / flicker)
// — Feather radius controlled by cam.bgFeather (0-1)
const _segMaskCv = document.createElement('canvas');
const _segMaskCtx = _segMaskCv.getContext('2d', { willReadFrequently: false });
let _segMaskPrev = null;  // Uint8ClampedArray of last frame's alpha (for EMA)
function rebuildSegMaskCanvas(){
  if(!cam.segMaskData || !cam.segMaskW || !cam.segMaskH) return null;
  if(_segMaskCv.width !== cam.segMaskW || _segMaskCv.height !== cam.segMaskH){
    _segMaskCv.width = cam.segMaskW; _segMaskCv.height = cam.segMaskH;
    _segMaskPrev = null;  // size changed — reset history
  }
  const img = _segMaskCtx.createImageData(cam.segMaskW, cam.segMaskH);
  const d = img.data;
  const src = cam.segMaskData;
  const isMulti = cam.bgModel === 'multiclass';
  // Edge soft range (only meaningful for 'fast' which gives gradient values).
  const feather = (cam.bgFeather != null) ? cam.bgFeather : 0.5;
  const halfRange = 30 + feather * 70;
  const lo = 128 - halfRange/2;
  const hi = 128 + halfRange/2;
  const rangeRecip = 1 / (hi - lo);
  const ema = (cam.bgSmooth != null) ? cam.bgSmooth : 0.55;
  const newWeight = 1 - ema;
  const haveHist = _segMaskPrev && _segMaskPrev.length === src.length;
  if(!haveHist) _segMaskPrev = new Uint8ClampedArray(src.length);
  for(let i=0;i<src.length;i++){
    const v = src[i];
    let alphaRaw;
    if(isMulti){
      // Multiclass categories: 0=bg, 1-5=person parts (hair/skin/face/clothes/accessories)
      alphaRaw = v === 0 ? 0 : 255;
    } else {
      // Fast model: gradient values, 0=person, 255=bg with soft threshold
      if(v <= lo) alphaRaw = 255;
      else if(v >= hi) alphaRaw = 0;
      else alphaRaw = Math.round((hi - v) * rangeRecip * 255);
    }
    const alpha = haveHist
      ? Math.round(_segMaskPrev[i] * ema + alphaRaw * newWeight)
      : alphaRaw;
    _segMaskPrev[i] = alpha;
    const j = i*4;
    d[j] = d[j+1] = d[j+2] = 255;
    d[j+3] = alpha;
  }
  _segMaskCtx.putImageData(img, 0, 0);
  return _segMaskCv;
}

/* —————————————————————————————————————————————————————————————————————
   drawWebcamFX — renders video + face/hand-driven effects on the canvas
   ————————————————————————————————————————————————————————————————————— */
// Cached offscreen for masked video output (background removal)
const _segVidCv = document.createElement('canvas');
const _segVidCtx = _segVidCv.getContext('2d');
function getMaskedVideo(rawVideo, vw, vh){
  if(!cam.removeBg || !cam.segMaskData) return rawVideo;
  if(_segVidCv.width !== vw || _segVidCv.height !== vh){
    _segVidCv.width = vw; _segVidCv.height = vh;
  }
  _segVidCtx.globalCompositeOperation = 'source-over';
  _segVidCtx.drawImage(rawVideo, 0, 0, vw, vh);
  const maskCv = rebuildSegMaskCanvas();
  if(maskCv){
    _segVidCtx.imageSmoothingEnabled = true;
    _segVidCtx.imageSmoothingQuality = 'high';
    _segVidCtx.globalCompositeOperation = 'destination-in';
    // Extra blur on the mask when feather is high — smooths jagged hair edges
    const blur = (cam.bgFeather || 0) * 2.5;  // 0-2.5 px
    if(blur > 0.4 && _segVidCtx.filter !== undefined){
      _segVidCtx.filter = `blur(${blur.toFixed(2)}px)`;
    }
    _segVidCtx.drawImage(maskCv, 0, 0, vw, vh);
    _segVidCtx.filter = 'none';
    _segVidCtx.globalCompositeOperation = 'source-over';
  }
  return _segVidCv;
}

// ————————————————————————————————————————————————————————————————————
// Video filters — applied to the (optionally-masked) video frame before
// the face/hand FX particles draw on top. Independent of cam.fx Effects.
// GPU-friendly: prefer canvas `filter` CSS + composite ops over getImageData.
// ————————————————————————————————————————————————————————————————————
const _filterCv  = document.createElement('canvas');
const _filterCtx = _filterCv.getContext('2d');
const _filterAuxCv  = document.createElement('canvas');
const _filterAuxCtx = _filterAuxCv.getContext('2d');
// Separate scratch buffers for image filter so it can co-exist with camera filter in the same frame
const _imgFilterCv  = document.createElement('canvas');
const _imgFilterCtx = _imgFilterCv.getContext('2d');
const _imgFilterAuxCv  = document.createElement('canvas');
const _imgFilterAuxCtx = _imgFilterAuxCv.getContext('2d');
let _filterFrameCounter = 0;
// Generic filter — handles both webcam (mode='cam') and image (mode='img') sources.
// Uses separate scratch buffers per mode so they don't collide within a frame.
function applyVideoFilter(src, vw, vh, mode){
  mode = mode || 'cam';
  const isImg = (mode === 'img');
  const f = isImg ? (imgState.filter || 'none') : (cam.filter || 'none');
  if(f === 'none') return src;
  // Adaptive throttle — both cam and image filters now skip frames under stacked load.
  _filterFrameCounter++;
  const heavyFilters = new Set(['glitch','halftone','sketch','edge','8bit','mosaic','chroma']);
  const videoItemActive = (typeof imgState !== 'undefined') && imgState.images && imgState.images.some(e => e && e.isVideo);
  const imgFxActive = (typeof imgState !== 'undefined') && imgState.modes && Object.values(imgState.modes).filter(Boolean).length > 1;
  const arActive = cam.ar && cam.ar !== 'none';
  const camBgOn = !!cam.removeBg;
  const imgBgOn = (typeof imgState !== 'undefined') && !!imgState.removeBg;
  const stackedLoad = (videoItemActive ? 1 : 0) + (imgFxActive ? 1 : 0) + (arActive ? 1 : 0) + (camBgOn ? 1 : 0) + (imgBgOn ? 1 : 0);
  // CAM filter: skip every-other frame on heavy filter when 2+ stacked sources
  if(!isImg && stackedLoad >= 2 && heavyFilters.has(f) && (_filterFrameCounter & 1) && _filterCv.width === vw && _filterCv.height === vh){
    return _filterCv;
  }
  // IMG filter: very aggressive throttle. Image is typically a video being filtered
  // each frame; even at 480p the bigger filters are too slow at 60fps. Cap to ~20fps
  // baseline (every 3rd frame), 10fps under stacked load.
  const heavyImgFilters = new Set(['bloom','frost','crt','vhs','nightvision','thermal','duotone','emboss','cyberpunk','glitch','halftone','sketch','edge']);
  if(isImg && _imgFilterCv.width === vw && _imgFilterCv.height === vh){
    if(heavyImgFilters.has(f) && (_filterFrameCounter % 3) !== 0) return _imgFilterCv;
    else if(stackedLoad >= 2 && (_filterFrameCounter & 1)) return _imgFilterCv;
  }
  // Pick scratch buffers based on mode
  const _cv    = isImg ? _imgFilterCv    : _filterCv;
  const _ctx   = isImg ? _imgFilterCtx   : _filterCtx;
  const _auxCv = isImg ? _imgFilterAuxCv : _filterAuxCv;
  const _auxCtx = isImg ? _imgFilterAuxCtx : _filterAuxCtx;
  if(_cv.width !== vw || _cv.height !== vh){
    _cv.width = vw; _cv.height = vh;
  }
  const c = _ctx;
  const _intensity = isImg ? imgState.filterIntensity : cam.filterIntensity;
  const k = Math.max(0, Math.min(2, _intensity != null ? _intensity : 1));
  c.setTransform(1,0,0,1,0,0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.clearRect(0,0,vw,vh);

  switch(f){
    case '8bit': {
      const blocks = Math.max(2, Math.round(6 + k*18));     // smaller = chunkier
      const lw = Math.max(8, Math.round(vw/blocks));
      const lh = Math.max(8, Math.round(vh/blocks));
      if(_auxCv.width !== lw || _auxCv.height !== lh){
        _auxCv.width = lw; _auxCv.height = lh;
      }
      _auxCtx.imageSmoothingEnabled = false;
      _auxCtx.clearRect(0,0,lw,lh);
      // posterize-ish via saturation + contrast bump pre-resize
      _auxCtx.filter = `saturate(${1.3 + k*0.6}) contrast(${1.1 + k*0.5})`;
      _auxCtx.drawImage(src, 0, 0, lw, lh);
      _auxCtx.filter = 'none';
      c.imageSmoothingEnabled = false;
      c.drawImage(_auxCv, 0, 0, vw, vh);
      c.imageSmoothingEnabled = true;
      break;
    }
    case 'mosaic': {
      // Same scale-down trick, larger blocks, no color punch (just chunky)
      const blocks = Math.max(2, Math.round(4 + k*10));
      const lw = Math.max(6, Math.round(vw/blocks));
      const lh = Math.max(6, Math.round(vh/blocks));
      if(_auxCv.width !== lw || _auxCv.height !== lh){
        _auxCv.width = lw; _auxCv.height = lh;
      }
      _auxCtx.imageSmoothingEnabled = false;
      _auxCtx.clearRect(0,0,lw,lh);
      _auxCtx.drawImage(src, 0, 0, lw, lh);
      c.imageSmoothingEnabled = false;
      c.drawImage(_auxCv, 0, 0, vw, vh);
      c.imageSmoothingEnabled = true;
      break;
    }
    case 'chroma': {
      // RGB split via hue-rotated copies on 'lighter' (additive)
      const dx = Math.round(vw * 0.012 * k);
      c.drawImage(src, 0, 0, vw, vh);                       // base
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.55;
      c.filter = 'hue-rotate(120deg) saturate(2.2)';
      c.drawImage(src, dx, 0, vw, vh);
      c.filter = 'hue-rotate(240deg) saturate(2.2)';
      c.drawImage(src, -dx, 0, vw, vh);
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'glitch': {
      // base + random horizontal slice offsets + chroma tinge
      c.drawImage(src, 0, 0, vw, vh);
      const slices = Math.floor(3 + k*8);
      const burst = (Math.random() < 0.08 + k*0.12) ? 1 : 0;
      for(let i=0;i<slices;i++){
        const sy = Math.random()*vh;
        const sh = 4 + Math.random()*(vh*0.08);
        const ox = (Math.random()-0.5) * vw * 0.18 * k * (burst?2.2:1);
        c.drawImage(src, 0, sy, vw, sh, ox, sy, vw, sh);
      }
      const dx = Math.round(vw * 0.008 * k * (burst?2:1));
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.45;
      c.filter = 'hue-rotate(120deg) saturate(2.5)';
      c.drawImage(src, dx, 0, vw, vh);
      c.filter = 'hue-rotate(240deg) saturate(2.5)';
      c.drawImage(src, -dx, 0, vw, vh);
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'threshold': {
      c.filter = `grayscale(1) contrast(${4 + k*8}) brightness(${1 + k*0.15})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'invert': {
      c.filter = `invert(${Math.min(1, 0.6 + k*0.4)}) hue-rotate(${k*60}deg)`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'vapor': {
      // vaporwave purple/cyan duotone
      c.filter = `hue-rotate(${260 + k*30}deg) saturate(${1.6 + k*0.7}) contrast(${1.05 + k*0.2})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      // pink/cyan gradient wash
      const grd = c.createLinearGradient(0,0,vw,vh);
      grd.addColorStop(0, `rgba(255,90,200,${0.15*k})`);
      grd.addColorStop(1, `rgba(120,230,255,${0.15*k})`);
      c.globalCompositeOperation = 'overlay';
      c.fillStyle = grd; c.fillRect(0,0,vw,vh);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'sepia': {
      c.filter = `sepia(${Math.min(1, 0.6 + k*0.4)}) contrast(${1.05 + k*0.2}) brightness(${1 + k*0.05})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'mono': {
      c.filter = `grayscale(1) contrast(${1 + k*0.4}) brightness(${1 + k*0.05})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'edge': {
      // edge detect = difference between sharp and blurred copies, then boost
      c.filter = `blur(${1.5 + k*2}px)`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      c.globalCompositeOperation = 'difference';
      c.drawImage(src, 0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      // boost edges to white
      c.filter = `grayscale(1) brightness(${1.5 + k*1.5}) contrast(${2 + k*2}) invert(1)`;
      c.drawImage(_cv, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'scanlines': {
      c.drawImage(src, 0, 0, vw, vh);
      const line = Math.max(2, Math.round(2 + k*3));
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(0,0,0,${0.35 + k*0.25})`;
      for(let y=0;y<vh;y+=line*2){
        c.fillRect(0, y, vw, line);
      }
      // slight scanline color cast
      c.globalCompositeOperation = 'screen';
      c.fillStyle = `rgba(80,255,180,${0.04*k})`;
      c.fillRect(0,0,vw,vh);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'halftone': {
      // simplified: chunky pixelate + circular punch via radial mask grid is heavy.
      // Use dotted overlay: pixelate down, then redraw with high contrast + dot-grid blend.
      const blocks = Math.max(40, Math.round(40 + k*60));
      const lw = Math.max(20, Math.round(vw/(vw/blocks)));
      const lh = Math.max(20, Math.round(vh/(vw/blocks)));
      const cell = Math.round(vw/blocks);
      if(_auxCv.width !== lw || _auxCv.height !== lh){
        _auxCv.width = lw; _auxCv.height = lh;
      }
      _auxCtx.imageSmoothingEnabled = true;
      _auxCtx.filter = 'grayscale(1) contrast(1.4)';
      _auxCtx.drawImage(src, 0, 0, lw, lh);
      _auxCtx.filter = 'none';
      // sample once
      let data;
      try { data = _auxCtx.getImageData(0,0,lw,lh).data; } catch(_) { data = null; }
      c.fillStyle = '#000';
      c.fillRect(0,0,vw,vh);
      c.fillStyle = '#fff';
      if(data){
        for(let y=0;y<lh;y++){
          for(let x=0;x<lw;x++){
            const i = (y*lw+x)*4;
            const lum = (data[i]+data[i+1]+data[i+2])/3 / 255;
            const r = (lum * cell * 0.6);
            if(r < 0.3) continue;
            c.beginPath();
            c.arc(x*cell + cell/2, y*cell + cell/2, r, 0, Math.PI*2);
            c.fill();
          }
        }
      } else {
        // fallback: just draw mono if getImageData blocked
        c.fillStyle = '#000'; c.fillRect(0,0,vw,vh);
        c.filter = 'grayscale(1) contrast(1.6)';
        c.drawImage(src, 0, 0, vw, vh);
        c.filter = 'none';
      }
      break;
    }
    case 'sketch': {
      // edge + threshold over a desaturated base — gives a charcoal-line look
      c.filter = `blur(${1.5 + k*1.5}px)`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      c.globalCompositeOperation = 'difference';
      c.drawImage(src, 0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      c.filter = `grayscale(1) brightness(${2 + k}) contrast(${3 + k*2}) invert(1)`;
      c.drawImage(_cv, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'noir': {
      // film-noir — heavy B&W with crushed shadows and bright highlights
      c.filter = `grayscale(1) contrast(${1.6 + k*0.6}) brightness(${0.92 - k*0.05})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      // soft dark vignette
      const ng = c.createRadialGradient(vw/2, vh/2, Math.min(vw,vh)*0.3, vw/2, vh/2, Math.max(vw,vh)*0.7);
      ng.addColorStop(0, 'rgba(0,0,0,0)');
      ng.addColorStop(1, `rgba(0,0,0,${0.55*k})`);
      c.fillStyle = ng;
      c.fillRect(0, 0, vw, vh);
      break;
    }
    case 'cyberpunk': {
      // neon: chroma split + magenta/cyan shift + saturation pump
      c.filter = `saturate(${1.7 + k*0.6}) contrast(${1.15 + k*0.2}) hue-rotate(${290 + k*40}deg)`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      const dx = Math.round(vw * 0.014 * k);
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = 0.55;
      c.filter = 'hue-rotate(50deg) saturate(3)';
      c.drawImage(src, dx, 0, vw, vh);
      c.filter = 'hue-rotate(180deg) saturate(3)';
      c.drawImage(src, -dx, 0, vw, vh);
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'nightvision': {
      // green-channel only, brightened — military night-vision feel
      c.filter = `grayscale(1) brightness(${1.2 + k*0.3}) contrast(${1.2 + k*0.3})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(80, 255, 110, ${0.55 + k*0.2})`;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      // subtle scanlines
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(0,0,0,${0.18 + k*0.08})`;
      for(let y=0;y<vh;y+=3) c.fillRect(0, y, vw, 1);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'thermal': {
      // heat-map: brightness → warm/cold gradient (hue cycle on luminance)
      c.filter = `grayscale(1) contrast(${1.3 + k*0.4})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      // overlay: dark blue at the bottom (cold), red-yellow at top (hot)
      const tg = c.createLinearGradient(0, 0, 0, vh);
      tg.addColorStop(0, `rgba(255, 60, 30, ${0.55*k})`);
      tg.addColorStop(0.5, `rgba(255, 220, 40, ${0.40*k})`);
      tg.addColorStop(1, `rgba(20, 30, 130, ${0.55*k})`);
      c.globalCompositeOperation = 'screen';
      c.fillStyle = tg;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      // saturate
      c.filter = `saturate(${2 + k}) hue-rotate(${k*-15}deg)`;
      c.drawImage(_cv, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'gameboy': {
      // 4-tone green palette like an original Game Boy
      const blocks = Math.max(4, Math.round(6 + k*12));
      const lw = Math.max(8, Math.round(vw/blocks));
      const lh = Math.max(8, Math.round(vh/blocks));
      if(_auxCv.width !== lw || _auxCv.height !== lh){ _auxCv.width = lw; _auxCv.height = lh; }
      _auxCtx.imageSmoothingEnabled = false;
      _auxCtx.filter = 'grayscale(1) contrast(1.4) brightness(1.1)';
      _auxCtx.drawImage(src, 0, 0, lw, lh);
      _auxCtx.filter = 'none';
      c.imageSmoothingEnabled = false;
      c.drawImage(_auxCv, 0, 0, vw, vh);
      c.imageSmoothingEnabled = true;
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(155, 188, 15, 1)`;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'vhs': {
      // chroma noise + scanline + slight horizontal jitter
      c.drawImage(src, 0, 0, vw, vh);
      // chroma fringe
      const dxv = Math.round(vw * 0.006 * k);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.35;
      c.filter = 'hue-rotate(120deg) saturate(2)';
      c.drawImage(src, dxv, 0, vw, vh);
      c.filter = 'hue-rotate(240deg) saturate(2)';
      c.drawImage(src, -dxv, 0, vw, vh);
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      // noise lines
      c.fillStyle = 'rgba(255,255,255,0.06)';
      for(let i = 0; i < 8 + Math.random()*8; i++){
        const y = Math.random() * vh;
        const h2 = 1 + Math.random()*2;
        c.fillRect(0, y, vw, h2);
      }
      // scanlines
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(0,0,0,${0.20 + k*0.10})`;
      for(let y = 0; y < vh; y += 4) c.fillRect(0, y, vw, 1.5);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'crt': {
      // CRT phosphor: scanlines + slight RGB subpixel + edge fade
      c.filter = `brightness(${1.08 + k*0.1}) contrast(${1.15 + k*0.15})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      // RGB subpixel — bigger cells so 1080p doesn't generate thousands of fillRect calls
      c.globalCompositeOperation = 'multiply';
      const cellW = Math.max(4, Math.round(6 + k*3));   // was 3+k*1.5 → now 6+k*3 (~half the iterations)
      for(let x = 0; x < vw; x += cellW * 3){
        c.fillStyle = `rgba(255, 90, 90, 0.85)`;  c.fillRect(x,             0, cellW, vh);
        c.fillStyle = `rgba(90, 255, 90, 0.85)`;  c.fillRect(x + cellW,     0, cellW, vh);
        c.fillStyle = `rgba(90, 90, 255, 0.85)`;  c.fillRect(x + cellW*2,   0, cellW, vh);
      }
      c.globalCompositeOperation = 'source-over';
      // horizontal scanlines (sparser — every 5px not 3px)
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = 'rgba(0,0,0,0.4)';
      for(let y = 0; y < vh; y += 5) c.fillRect(0, y, vw, 1);
      c.globalCompositeOperation = 'source-over';
      // edge vignette to round off
      const cg = c.createRadialGradient(vw/2, vh/2, Math.min(vw,vh)*0.45, vw/2, vh/2, Math.max(vw,vh)*0.55);
      cg.addColorStop(0, 'rgba(0,0,0,0)');
      cg.addColorStop(1, 'rgba(0,0,0,0.65)');
      c.fillStyle = cg;
      c.fillRect(0, 0, vw, vh);
      break;
    }
    case 'xray': {
      // negative + boost — looks like a medical x-ray
      c.filter = `invert(1) grayscale(1) brightness(${1.1 + k*0.2}) contrast(${1.6 + k*0.4})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      // cyan tint
      c.globalCompositeOperation = 'screen';
      c.fillStyle = `rgba(120, 200, 255, ${0.18*k})`;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'duotone': {
      // map luminance to a two-color ramp (purple → yellow)
      c.filter = `grayscale(1) contrast(${1.2 + k*0.3})`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      // shadows: deep purple
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(70, 30, 140, ${0.85 + k*0.1})`;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      // highlights: warm yellow
      c.globalCompositeOperation = 'screen';
      c.fillStyle = `rgba(255, 200, 80, ${0.55 + k*0.15})`;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'emboss': {
      // 3D-relief: offset difference of bright vs dark
      c.fillStyle = '#808080';
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'difference';
      c.drawImage(src, 0, 0, vw, vh);
      c.globalCompositeOperation = 'difference';
      const ox = Math.round(2 + k*4);
      c.drawImage(src, ox, ox, vw, vh);
      c.globalCompositeOperation = 'source-over';
      c.filter = `grayscale(1) brightness(${1.4 + k*0.4}) contrast(${1.4 + k*0.4})`;
      c.drawImage(_cv, 0, 0, vw, vh);
      c.filter = 'none';
      break;
    }
    case 'bloom': {
      // soft bloom — capped blur so large videos don't freeze the browser
      c.drawImage(src, 0, 0, vw, vh);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.45 + k*0.2;
      // blur capped: was 6+k*8 (up to 22px), now 2+k*3 (up to 8px). still dreamy, way cheaper.
      c.filter = `blur(${2 + k*3}px) brightness(1.4)`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'frost': {
      // frozen-glass — blur capped so it doesn't lock the main thread on big sources
      c.filter = `blur(${1.5 + k*2.5}px) brightness(${1.1 + k*0.1}) saturate(0.6)`;
      c.drawImage(src, 0, 0, vw, vh);
      c.filter = 'none';
      c.globalCompositeOperation = 'screen';
      c.fillStyle = `rgba(160, 220, 255, ${0.18 + k*0.10})`;
      c.fillRect(0, 0, vw, vh);
      c.globalCompositeOperation = 'source-over';
      // refraction lines (just a few — cheap)
      c.strokeStyle = `rgba(255,255,255,${0.06 + k*0.03})`;
      c.lineWidth = 1;
      for(let i = 0; i < 6; i++){
        const y = Math.random()*vh;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(vw, y + (Math.random()-0.5)*40);
        c.stroke();
      }
      break;
    }
    default:
      c.drawImage(src, 0, 0, vw, vh);
  }
  return _cv;
}

// Thin wrapper — call with 'img' mode to filter uploaded images/videos using imgState.filter
function applyImageFilter(src, vw, vh){ return applyVideoFilter(src, vw, vh, 'img'); }

// Webcam Motion — transforms applied to the whole webcam plane (video + FX + AR move together)
function applyWebcamMotion(g, T){
  if(!cam.motion || cam.motion === 'none') return false;
  const k  = Math.max(0, Math.min(2, cam.motionIntensity || 1));
  const sp = Math.max(0.1, Math.min(3, cam.motionSpeed || 1));
  const t  = T * sp;
  const audioK = (typeof reactor !== 'undefined' && reactor && reactor.vol) ? (1 + reactor.vol*1.5) : 1;
  const cx = W/2, cy = H/2;
  let dx=0, dy=0, rot=0, sc=1;
  switch(cam.motion){
    case 'shake':
      dx = (Math.random()-0.5) * 22 * k * audioK;
      dy = (Math.random()-0.5) * 22 * k * audioK;
      break;
    case 'zoomPulse':
      sc = 1 + Math.sin(t*2.2) * 0.10 * k * audioK;
      break;
    case 'sway':
      dx = Math.sin(t*1.5) * 35 * k;
      rot = Math.sin(t*1.5) * 0.05 * k;
      break;
    case 'breathe':
      sc = 1 + Math.sin(t*0.8) * 0.06 * k;
      break;
    case 'orbit':
      dx = Math.cos(t*1.0) * 25 * k;
      dy = Math.sin(t*1.0) * 25 * k;
      break;
    case 'tilt':
      rot = Math.sin(t*0.6) * 0.14 * k;
      break;
    case 'bounce':
      dy = -Math.abs(Math.sin(t*3)) * 30 * k * audioK;
      break;
    case 'jitter':
      dx = (Math.sin(t*30) + Math.sin(t*47)) * 5 * k * audioK;
      dy = (Math.cos(t*33) + Math.sin(t*51)) * 5 * k * audioK;
      rot = Math.sin(t*23) * 0.018 * k;
      break;
    case 'spiral': {
      const r = (1 + Math.sin(t*0.5)) * 18 * k;
      dx = Math.cos(t*2) * r;
      dy = Math.sin(t*2) * r;
      sc = 1 + Math.sin(t*0.5)*0.06*k;
      break;
    }
  }
  g.save();
  g.translate(cx + dx, cy + dy);
  if(rot) g.rotate(rot);
  if(sc !== 1) g.scale(sc, sc);
  g.translate(-cx, -cy);
  return true;
}

function drawWebcamFX(g, dt, T){
  if(!cam.ready) return;
  const rawV = cam.video;
  if(!rawV.videoWidth) return;
  const _motionWrapped = applyWebcamMotion(g, T);
  const vw = rawV.videoWidth, vh = rawV.videoHeight;
  const _maskedV = getMaskedVideo(rawV, vw, vh);
  const v = applyVideoFilter(_maskedV, vw, vh);
  // cover-fit: scale video to fill canvas, mirrored if requested
  const sCanvas = Math.max(W/vw, H/vh);
  const dW = vw*sCanvas, dH = vh*sCanvas;
  const dx = (W - dW)/2, dy = (H - dH)/2;

  // video plane
  const vidOp = cam.videoOpacity;
  if(vidOp > 0.01){
    g.save();
    g.globalAlpha = vidOp;
    if(cam.mirror){ g.translate(W, 0); g.scale(-1, 1); }
    if(cam.fx === 'duplicate'){
      // draw multiple translucent copies at varying scale offsets
      const copies = 5;
      for(let i=0;i<copies;i++){
        const k = 1 + Math.sin(state.t*0.0008 + i*1.3)*0.05;
        const ox = Math.sin(state.t*0.0006 + i*2.1)*40;
        const oy = Math.cos(state.t*0.0005 + i*1.7)*40;
        g.globalAlpha = vidOp * (0.85 - i*0.13);
        g.globalCompositeOperation = i===0 ? 'source-over' : 'lighter';
        g.drawImage(v, dx + ox, dy + oy, dW*k, dH*k);
      }
    } else if(cam.fx === 'splitTile'){
      // tile the feed in a 3x3 grid with alternating mirrors
      const cols = 3, rows = 3;
      const tw = W/cols, th = H/rows;
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          g.save();
          const flipX = (c+r) % 2 ? -1 : 1;
          g.translate(c*tw + (flipX < 0 ? tw : 0), r*th);
          g.scale(flipX, 1);
          // sample center crop of video to maintain aspect
          const sw = Math.min(vw, vh * (tw/th));
          const sh = sw * (th/tw);
          const sx = (vw - sw)/2, sy = (vh - sh)/2;
          g.drawImage(v, sx, sy, sw, sh, 0, 0, tw, th);
          g.restore();
        }
      }
    } else if(cam.fx === 'trail'){
      // soft trail: keep previous frame, fade
      g.drawImage(v, dx, dy, dW, dH);
    } else {
      g.drawImage(v, dx, dy, dW, dH);
    }
    g.restore();
  }

  // ——— Face / hand-driven effects ———
  // Convert normalized landmarks → screen coords (account for mirror).
  const N2S = (nx, ny) => {
    const x = cam.mirror ? (1-nx) : nx;
    return [ dx + x*dW, dy + ny*dH ];
  };

  let points = []; // {x,y,kind,strength}
  if(cam.track === 'face' && cam.faceLandmarks){
    const lm = cam.faceLandmarks;
    // Use eye-corner landmarks (always present in FaceLandmarker output) — averaged for eye center.
    // Right eye: 33 (outer) + 133 (inner). Left eye: 362 (inner) + 263 (outer).
    const eyes = [];
    const ra = lm[33], rb = lm[133];
    const la = lm[362], lb = lm[263];
    if(ra && rb) eyes.push({x:(ra.x+rb.x)/2, y:(ra.y+rb.y)/2});
    if(la && lb) eyes.push({x:(la.x+lb.x)/2, y:(la.y+lb.y)/2});
    // If iris is available (refined model), prefer it for accuracy
    if(lm[468] && lm[473]){ eyes.length = 0; eyes.push(lm[468], lm[473]); }
    eyes.forEach(p => {
      const [x,y] = N2S(p.x, p.y);
      points.push({x, y, kind:'eye', strength:1});
    });
  } else if(cam.track === 'hand' && cam.handLandmarks){
    cam.handLandmarks.forEach(hand => {
      // fingertips at 4, 8, 12, 16, 20
      [4,8,12,16,20].forEach(idx => {
        const p = hand[idx];
        if(!p) return;
        const [x,y] = N2S(p.x, p.y);
        // index/middle fingertips a bit more important
        const strength = (idx===8 || idx===12) ? 1.2 : 0.85;
        points.push({x, y, kind:'finger', strength, fingerIdx: idx});
      });
    });
  }

  // Effect rendering based on cam.fx
  const fx = cam.fx;
  const dts = dt / 1000;  // dt is in milliseconds
  const size = (state.audioGain || 1) * cam.fxSize * Math.min(W,H) * 0.012;
  const energy = (reactor && reactor.vol) ? reactor.vol : 0;

  if(fx === 'none' || !points.length && (fx === 'tendrils' || fx === 'emit' || fx === 'trail' || fx === 'rays' || fx === 'petals' || fx === 'orbits' || fx === 'ribbon' || fx === 'pulse' || fx === 'confetti' || fx === 'prism' || fx === 'stars')){
    // nothing to render (or no detection yet)
    // (duplicate / splitTile still rendered video plane above)
  }

  // —— Particle effects: tendrils, trail, emit ——
  if(fx === 'tendrils' || fx === 'emit' || fx === 'trail'){
    const list = cam.fxState.tendrils;
    points.forEach(pt => {
      const spawnRate = (fx === 'emit' ? 6 : fx === 'tendrils' ? 3 : 1) * (1 + energy*1.5);
      for(let i=0;i<spawnRate;i++){
        if(list.length < 600){
          const a = Math.random()*TAU;
          const sp = (fx === 'trail' ? 30 : 80);
          list.push({
            x:pt.x, y:pt.y,
            vx:Math.cos(a)*(0.5+Math.random())*sp,
            vy:(Math.sin(a)*(0.5+Math.random())-0.5)*sp,
            life:0, max: rand(1.2, 2.4)+energy*1.5,
            hue: rand(0,360), kind:pt.kind
          });
        }
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i=list.length-1;i>=0;i--){
      const p = list[i];
      p.life += dts;
      const t01 = p.life / p.max;
      if(t01 >= 1){ list.splice(i,1); continue; }
      p.vy += 30 * dts; // soft gravity (px/s²)
      p.x += p.vx * dts;
      p.y += p.vy * dts;
      const alpha = (1-t01) * (fx === 'trail' ? 0.55 : 0.9);
      const r = size * (0.4 + t01*1.6);
      g.fillStyle = `hsla(${p.hue}, 80%, 65%, ${alpha})`;
      g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    }
    g.restore();
  }

  if(fx === 'rays'){
    g.save(); g.globalCompositeOperation = 'lighter';
    points.forEach(pt => {
      const nRays = 14;
      const phase = state.t*0.0015;
      for(let i=0;i<nRays;i++){
        const a = (i/nRays)*TAU + phase + (pt.kind==='eye' ? 0 : (pt.fingerIdx||0)*0.3);
        const len = (60 + Math.sin(phase*3 + i)*40 + energy*200) * cam.fxSize;
        const grad = g.createLinearGradient(pt.x, pt.y, pt.x + Math.cos(a)*len, pt.y + Math.sin(a)*len);
        grad.addColorStop(0, `rgba(255,255,255,${0.7})`);
        grad.addColorStop(1, `rgba(255,180,220,0)`);
        g.strokeStyle = grad;
        g.lineWidth = 2.5 * cam.fxSize;
        g.beginPath();
        g.moveTo(pt.x, pt.y);
        g.lineTo(pt.x + Math.cos(a)*len, pt.y + Math.sin(a)*len);
        g.stroke();
      }
    });
    g.restore();
  }

  if(fx === 'petals'){
    const list = cam.fxState.petals;
    points.forEach(pt => {
      if(list.length < 400){
        for(let i=0;i<2;i++){
          const a = Math.random()*TAU;
          const sp = 40 + Math.random()*120;
          list.push({
            x:pt.x, y:pt.y,
            vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 30,
            life:0, max: rand(2.2,3.6),
            rot:Math.random()*TAU, vrot:rand(-3,3),
            hue:rand(330,380),
            w: rand(8,22)*cam.fxSize, h: rand(14,30)*cam.fxSize
          });
        }
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i=list.length-1;i>=0;i--){
      const p = list[i]; p.life += dts;
      const t01 = p.life/p.max;
      if(t01>=1){ list.splice(i,1); continue; }
      p.vy += 60 * dts;
      p.x += p.vx * dts; p.y += p.vy * dts; p.rot += p.vrot*dts;
      const a = (1-t01)*0.9;
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = `hsla(${p.hue%360}, 75%, 70%, ${a})`;
      g.beginPath();
      g.ellipse(0, 0, p.w, p.h, 0, 0, TAU); g.fill();
      g.restore();
    }
    g.restore();
  }

  if(fx === 'orbits'){
    const list = cam.fxState.orbits;
    points.forEach((pt, idx) => {
      if(!list[idx]) list[idx] = [];
      while(list[idx].length < 12){
        list[idx].push({ r: rand(20, 90)*cam.fxSize, a: Math.random()*TAU, w: rand(0.6,1.8), hue: rand(180,320), size: rand(2,5) });
      }
    });
    if(list.length > points.length) list.length = points.length;
    g.save(); g.globalCompositeOperation = 'lighter';
    points.forEach((pt, idx) => {
      const orbs = list[idx];
      if(!orbs) return;
      for(const o of orbs){
        o.a += o.w * dts * (0.6 + energy*2);
        const px = pt.x + Math.cos(o.a)*o.r;
        const py = pt.y + Math.sin(o.a)*o.r;
        g.fillStyle = `hsla(${o.hue},80%,70%,.85)`;
        g.beginPath(); g.arc(px, py, o.size, 0, TAU); g.fill();
        g.fillStyle = `hsla(${o.hue},80%,70%,.18)`;
        g.beginPath(); g.arc(px, py, o.size*3, 0, TAU); g.fill();
      }
    });
    g.restore();
  }

  // —— New: ribbon — thin sinuous curves emanating from each point ——
  if(fx === 'ribbon'){
    g.save(); g.globalCompositeOperation = 'lighter';
    const t = state.t * 0.001;
    points.forEach((pt, pi) => {
      for(let k=0;k<3;k++){
        const baseA = pi*1.7 + k*2.1 + t*0.5;
        g.beginPath();
        for(let s=0;s<50;s++){
          const u = s/49;
          const r = u * (90 + 60*Math.sin(t + k))*cam.fxSize;
          const wob = Math.sin(t*2 + u*8 + k)*22*cam.fxSize;
          const a = baseA + u*2.4 + Math.sin(t + u*5)*0.6;
          const x = pt.x + Math.cos(a)*r + Math.cos(a+Math.PI/2)*wob*u;
          const y = pt.y + Math.sin(a)*r + Math.sin(a+Math.PI/2)*wob*u;
          if(s===0) g.moveTo(x,y); else g.lineTo(x,y);
        }
        g.strokeStyle = `hsla(${(t*40 + pi*70 + k*40)%360}, 80%, 70%, .55)`;
        g.lineWidth = 1.8 * cam.fxSize;
        g.stroke();
      }
    });
    g.restore();
  }

  // —— New: pulse — expanding rings ——
  if(fx === 'pulse'){
    const list = cam.fxState.pulse = cam.fxState.pulse || [];
    points.forEach(pt => {
      if(Math.random() < (0.05 + energy*0.4) && list.length < 60){
        list.push({ x:pt.x, y:pt.y, life:0, max: rand(1.5, 2.6), hue: rand(180,340) });
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i=list.length-1;i>=0;i--){
      const p = list[i]; p.life += dts;
      const t01 = p.life/p.max;
      if(t01>=1){ list.splice(i,1); continue; }
      const r = t01 * Math.min(W,H) * 0.35 * cam.fxSize;
      const a = (1-t01) * 0.7;
      g.strokeStyle = `hsla(${p.hue},80%,68%,${a})`;
      g.lineWidth = 2.5 * cam.fxSize;
      g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke();
    }
    g.restore();
  }

  // —— New: confetti — small bright sparkles ——
  if(fx === 'confetti'){
    const list = cam.fxState.confetti = cam.fxState.confetti || [];
    points.forEach(pt => {
      const n = Math.floor(2 + energy*8);
      for(let i=0;i<n;i++){
        if(list.length < 800){
          const a = Math.random()*TAU;
          const sp = 80 + Math.random()*220;
          list.push({ x:pt.x, y:pt.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-50, life:0, max:rand(0.6,1.6), hue:rand(0,360), s:rand(1.5,3.5)*cam.fxSize });
        }
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i=list.length-1;i>=0;i--){
      const p = list[i]; p.life += dts;
      const t01 = p.life/p.max;
      if(t01>=1){ list.splice(i,1); continue; }
      p.vy += 200*dts;
      p.x += p.vx*dts; p.y += p.vy*dts;
      const a = (1-t01)*0.95;
      g.fillStyle = `hsla(${p.hue},85%,70%,${a})`;
      g.fillRect(p.x-p.s/2, p.y-p.s/2, p.s, p.s);
    }
    g.restore();
  }

  // —— New: prism — rainbow streaks ——
  if(fx === 'prism'){
    g.save(); g.globalCompositeOperation = 'lighter';
    const t = state.t * 0.001;
    points.forEach((pt, pi) => {
      const nStreaks = 7;
      for(let i=0;i<nStreaks;i++){
        const hue = (i / nStreaks) * 360;
        const a = (i / nStreaks) * Math.PI + t*0.3 + pi*0.6;
        const len = (80 + 40*Math.sin(t*1.5 + i))*cam.fxSize;
        const x2 = pt.x + Math.cos(a)*len, y2 = pt.y + Math.sin(a)*len;
        const grad = g.createLinearGradient(pt.x, pt.y, x2, y2);
        grad.addColorStop(0, `hsla(${hue},90%,70%,.85)`);
        grad.addColorStop(1, `hsla(${hue},90%,70%,0)`);
        g.strokeStyle = grad;
        g.lineWidth = 3 * cam.fxSize;
        g.beginPath(); g.moveTo(pt.x, pt.y); g.lineTo(x2, y2); g.stroke();
      }
    });
    g.restore();
  }

  // —— New: stars — small bright stars that scatter from each point ——
  if(fx === 'stars'){
    const list = cam.fxState.stars = cam.fxState.stars || [];
    points.forEach(pt => {
      if(Math.random() < 0.35 + energy*0.6){
        if(list.length < 300){
          const a = Math.random()*TAU;
          const sp = 30 + Math.random()*120;
          list.push({ x:pt.x, y:pt.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:0, max:rand(1.6,3.0), hue:rand(40,80), size:rand(4,10)*cam.fxSize, twinkle:Math.random()*TAU });
        }
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i=list.length-1;i>=0;i--){
      const p = list[i]; p.life += dts;
      const t01 = p.life/p.max;
      if(t01>=1){ list.splice(i,1); continue; }
      p.x += p.vx*dts; p.y += p.vy*dts;
      p.vx *= 0.99; p.vy *= 0.99;
      const tw = 0.65 + 0.35*Math.sin(state.t*0.01 + p.twinkle);
      const a = (1-t01) * tw;
      const sz = p.size * (0.7 + 0.3*Math.sin(state.t*0.008 + p.twinkle));
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = `hsla(${p.hue},90%,72%,${a})`;
      // 4-point star via two triangles
      g.beginPath();
      for(let k=0;k<8;k++){
        const ang = (k/8)*TAU;
        const r = (k%2===0) ? sz : sz*0.35;
        const px = Math.cos(ang)*r, py = Math.sin(ang)*r;
        if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
      }
      g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
  }

  // —— New: hearts — bouncy floating hearts (heart-eyes!) ——
  if(fx === 'hearts'){
    const list = cam.fxState.hearts = cam.fxState.hearts || [];
    points.forEach(pt => {
      const baseRate = pt.kind === 'eye' ? 0.55 : 0.35;
      if(Math.random() < baseRate + energy*0.6 && list.length < 200){
        const a = rand(-Math.PI*0.5 - 0.6, -Math.PI*0.5 + 0.6);
        const sp = 35 + Math.random()*80;
        list.push({
          x:pt.x, y:pt.y,
          vx:Math.cos(a)*sp + rand(-15,15),
          vy:Math.sin(a)*sp,
          life:0, max:rand(1.6, 3.2),
          hue: rand(335, 365) % 360,
          size: rand(22, 44) * cam.fxSize,
          phase: Math.random()*TAU,
          wob: Math.random()*TAU,
          bornAt: state.t,
        });
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i=list.length-1;i>=0;i--){
      const p = list[i]; p.life += dts;
      const t01 = p.life/p.max;
      if(t01>=1){ list.splice(i,1); continue; }
      // bouncy float: sway sideways, vy slows so it lingers
      p.x += (p.vx + Math.sin(state.t*0.005 + p.phase)*30) * dts;
      p.y += p.vy * dts;
      p.vy *= 0.985;
      // BOUNCY scale: born small → overshoot → settle, plus continuous heartbeat pulse
      const ageS = (state.t - p.bornAt) / 1000;
      const birth = Math.min(1, ageS * 4);
      const overshoot = 1 + 0.45 * Math.sin(birth * Math.PI) * (1 - birth*0.4);
      const beat = 1 + 0.18 * Math.sin(state.t*0.018 + p.wob)
                     + 0.08 * Math.sin(state.t*0.034 + p.wob*1.3);
      const fadeIn = Math.min(1, t01*5);
      const fadeOut = 1 - Math.max(0, (t01-0.7)/0.3);
      const a = Math.min(fadeIn, fadeOut) * 0.95;
      const sz = p.size * birth * overshoot * beat;
      const tilt = Math.sin(state.t*0.003 + p.wob)*0.15;
      // draw heart
      g.save();
      g.translate(p.x, p.y);
      g.rotate(tilt);
      g.scale(sz/40, sz/40);
      // glow under
      g.fillStyle = `hsla(${p.hue},90%,75%,${a*0.30})`;
      g.beginPath();
      g.moveTo(0, 18);
      g.bezierCurveTo(-30, 0, -30, -32, 0, -14);
      g.bezierCurveTo(30, -32, 30, 0, 0, 18);
      g.closePath(); g.fill();
      // body
      g.fillStyle = `hsla(${p.hue},88%,66%,${a})`;
      g.beginPath();
      g.moveTo(0, 14);
      g.bezierCurveTo(-22, -2, -22, -26, 0, -12);
      g.bezierCurveTo(22, -26, 22, -2, 0, 14);
      g.closePath(); g.fill();
      // shiny highlight
      g.fillStyle = `hsla(${p.hue},90%,90%,${a*0.6})`;
      g.beginPath();
      g.ellipse(-7, -9, 4, 6, -0.5, 0, TAU); g.fill();
      g.restore();
    }
    g.restore();
  }

  // ——————————————————————————————————————————————————————————————
  // AR overlay (face-landmark driven — independent of Effect + Filter)
  // ——————————————————————————————————————————————————————————————
  if(cam.ar && cam.ar !== 'none' && cam.faceLandmarks){
    const lm = cam.faceLandmarks;
    const k = Math.max(0, Math.min(2, cam.arIntensity != null ? cam.arIntensity : 1));
    // key landmarks (MediaPipe FaceLandmarker indices)
    const _rEyeOut = lm[33],   _rEyeIn = lm[133];
    const _lEyeOut = lm[263],  _lEyeIn = lm[362];
    const _rEyeTop = lm[159],  _rEyeBot = lm[145];
    const _lEyeTop = lm[386],  _lEyeBot = lm[374];
    const _foreheadMid = lm[10];     // upper forehead center
    const _chin = lm[152];           // chin bottom
    const _noseTip = lm[1];          // nose tip
    const _mouthL = lm[61], _mouthR = lm[291];
    const _browL  = lm[105], _browR = lm[334];   // mid-brows
    if(_rEyeOut && _lEyeOut && _foreheadMid && _chin){
      // compute face metrics in screen space
      const reC = { x:(_rEyeOut.x+_rEyeIn.x)/2, y:(_rEyeOut.y+_rEyeIn.y)/2 };
      const leC = { x:(_lEyeOut.x+_lEyeIn.x)/2, y:(_lEyeOut.y+_lEyeIn.y)/2 };
      const [reSx, reSy] = N2S(reC.x, reC.y);
      const [leSx, leSy] = N2S(leC.x, leC.y);
      const [fhSx, fhSy] = N2S(_foreheadMid.x, _foreheadMid.y);
      const [chinSx, chinSy] = N2S(_chin.x, _chin.y);
      const eyeDist = Math.hypot(leSx-reSx, leSy-reSy);    // px
      const faceH   = Math.hypot(chinSx-fhSx, chinSy-fhSy);
      const angle   = Math.atan2(leSy-reSy, leSx-reSx);
      const eyeMidX = (reSx+leSx)/2, eyeMidY = (reSy+leSy)/2;
      const baseHue = (dominantEmo && typeof dominantEmo === 'function') ? (dominantEmo().hue || 200) : 200;

      g.save();
      switch(cam.ar){
        case 'mesh': {
          // wireframe: draw small dots at every Nth landmark
          g.fillStyle = `hsla(${baseHue},80%,75%,${0.5+k*0.3})`;
          const step = Math.max(1, Math.round(4 - k*2));
          for(let i=0;i<lm.length;i+=step){
            const p = lm[i];
            if(!p) continue;
            const [px, py] = N2S(p.x, p.y);
            g.beginPath();
            g.arc(px, py, 1.2 + k*0.6, 0, TAU);
            g.fill();
          }
          break;
        }
        case 'glasses': {
          // round retro glasses
          g.translate(eyeMidX, eyeMidY); g.rotate(angle);
          const r = eyeDist * 0.4;
          g.strokeStyle = `hsla(${baseHue},80%,60%,${0.85})`;
          g.lineWidth = Math.max(2, eyeDist*0.06);
          g.beginPath(); g.arc(-eyeDist/2, 0, r, 0, TAU); g.stroke();
          g.beginPath(); g.arc(+eyeDist/2, 0, r, 0, TAU); g.stroke();
          // bridge
          g.beginPath(); g.moveTo(-eyeDist/2+r*0.85, 0); g.lineTo(+eyeDist/2-r*0.85, 0); g.stroke();
          // glow
          g.shadowColor = `hsla(${baseHue},90%,70%,0.7)`; g.shadowBlur = 10*k;
          g.beginPath(); g.arc(-eyeDist/2, 0, r, 0, TAU); g.stroke();
          g.beginPath(); g.arc(+eyeDist/2, 0, r, 0, TAU); g.stroke();
          break;
        }
        case 'sunglasses': {
          // chunky black wayfarer-style bars
          g.translate(eyeMidX, eyeMidY); g.rotate(angle);
          const w = eyeDist*0.85, h = eyeDist*0.45;
          g.fillStyle = 'rgba(10,10,18,0.92)';
          g.fillRect(-eyeDist/2-w/2, -h/2, w, h);
          g.fillRect(+eyeDist/2-w/2, -h/2, w, h);
          // bridge
          g.fillRect(-eyeDist*0.08, -h*0.15, eyeDist*0.16, h*0.18);
          // shine
          g.fillStyle = `hsla(${baseHue},90%,75%,0.45)`;
          g.fillRect(-eyeDist/2-w/2 + w*0.15, -h/2 + h*0.18, w*0.4, h*0.12);
          g.fillRect(+eyeDist/2-w/2 + w*0.15, -h/2 + h*0.18, w*0.4, h*0.12);
          break;
        }
        case 'cat': {
          // triangle ears above head + whiskers
          const headTopX = fhSx, headTopY = fhSy - faceH*0.25;
          g.fillStyle = `hsla(${baseHue},70%,60%,0.85)`;
          // outer
          const earW = eyeDist*0.75, earH = faceH*0.45;
          const leftBaseX = headTopX - eyeDist*0.7;
          const rightBaseX = headTopX + eyeDist*0.7;
          [[leftBaseX, -1], [rightBaseX, 1]].forEach(([bx, side]) => {
            g.beginPath();
            g.moveTo(bx - earW*0.5, headTopY);
            g.lineTo(bx + earW*0.5, headTopY);
            g.lineTo(bx + side*earW*0.15, headTopY - earH);
            g.closePath(); g.fill();
            // inner pink
            g.fillStyle = 'rgba(255,160,200,0.85)';
            g.beginPath();
            g.moveTo(bx - earW*0.25, headTopY - earH*0.05);
            g.lineTo(bx + earW*0.25, headTopY - earH*0.05);
            g.lineTo(bx + side*earW*0.10, headTopY - earH*0.6);
            g.closePath(); g.fill();
            g.fillStyle = `hsla(${baseHue},70%,60%,0.85)`;
          });
          // whiskers
          if(_noseTip && _mouthL && _mouthR){
            const [nx, ny] = N2S(_noseTip.x, _noseTip.y);
            g.strokeStyle = 'rgba(255,255,255,0.7)';
            g.lineWidth = 1.5;
            for(let i=-1;i<=1;i++){
              g.beginPath();
              g.moveTo(nx - eyeDist*0.15, ny + i*eyeDist*0.07);
              g.lineTo(nx - eyeDist*0.7, ny + i*eyeDist*0.22);
              g.stroke();
              g.beginPath();
              g.moveTo(nx + eyeDist*0.15, ny + i*eyeDist*0.07);
              g.lineTo(nx + eyeDist*0.7, ny + i*eyeDist*0.22);
              g.stroke();
            }
          }
          break;
        }
        case 'crown': {
          // 5-pointed crown above forehead
          const cx = fhSx, cy = fhSy - faceH*0.20;
          const cw = eyeDist*1.6, ch = faceH*0.30;
          g.translate(cx, cy); g.rotate(angle);
          const grd = g.createLinearGradient(0, -ch, 0, ch*0.5);
          grd.addColorStop(0, `hsl(${(baseHue+30)%360}, 95%, 70%)`);
          grd.addColorStop(1, `hsl(${baseHue}, 85%, 50%)`);
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(-cw/2, 0);
          for(let i=0;i<5;i++){
            const x1 = -cw/2 + (i+0.5)*cw/5;
            const x2 = -cw/2 + (i+1)*cw/5;
            g.lineTo(x1, -ch);
            g.lineTo(x2, 0);
          }
          g.closePath(); g.fill();
          g.strokeStyle = `hsla(${baseHue},100%,90%,0.85)`;
          g.lineWidth = 2; g.stroke();
          // gems
          for(let i=0;i<5;i++){
            const x = -cw/2 + (i+0.5)*cw/5;
            g.fillStyle = ['#ff3366','#33ccff','#ffcc33','#9c33ff','#33ff99'][i];
            g.beginPath(); g.arc(x, -ch*0.2, ch*0.10, 0, TAU); g.fill();
          }
          break;
        }
        case 'halo': {
          const cx = fhSx, cy = fhSy - faceH*0.30;
          const rx = eyeDist*1.4, ry = eyeDist*0.35;
          g.strokeStyle = `hsla(60, 100%, 70%, ${0.85})`;
          g.lineWidth = Math.max(3, eyeDist*0.08);
          g.shadowColor = 'rgba(255,230,120,0.95)';
          g.shadowBlur = 25*k;
          g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke();
          break;
        }
        case 'tears': {
          // streams of teardrops from each eye downward
          const sources = [
            { x: reSx, y: reSy + eyeDist*0.18 },
            { x: leSx, y: leSy + eyeDist*0.18 },
          ];
          const tArr = (cam.fxState._arTears = cam.fxState._arTears || []);
          // spawn
          if(Math.random() < 0.3+k*0.4){
            sources.forEach(s => tArr.push({ x:s.x + (Math.random()-0.5)*4, y:s.y, v: 40+Math.random()*40, life: 1.2, age: 0 }));
          }
          if(tArr.length > 200) tArr.splice(0, tArr.length-200);
          const dts = dt/1000;
          for(let i=tArr.length-1;i>=0;i--){
            const tr = tArr[i];
            tr.age += dts;
            tr.y += tr.v * dts * (1 + tr.age*1.5);
            if(tr.age > tr.life){ tArr.splice(i, 1); continue; }
            const a = 1 - tr.age/tr.life;
            g.fillStyle = `hsla(200, 90%, 75%, ${a*0.9})`;
            g.beginPath();
            // teardrop shape
            g.ellipse(tr.x, tr.y, 3+k, 5+k*1.5, 0, 0, TAU);
            g.fill();
          }
          break;
        }
        case 'laserEyes': {
          // beams from eyes outward
          const beamLen = Math.max(W, H);
          const aim = angle + Math.PI/2;  // perpendicular = facing forward; we want forward (downward-ish from eyes outward toward viewer/horizontal)
          // simpler: laser shoots horizontally (away from face) in mirror-aware direction
          const dirX = cam.mirror ? -1 : 1;   // unused — laser blasts horizontally outward to both sides
          [[reSx, reSy], [leSx, leSy]].forEach(([ex, ey]) => {
            const grd = g.createLinearGradient(ex, ey, ex + beamLen*1, ey);
            grd.addColorStop(0, `hsla(0, 100%, 65%, ${0.9})`);
            grd.addColorStop(1, 'hsla(0, 100%, 65%, 0)');
            g.fillStyle = grd;
            g.fillRect(ex, ey - eyeDist*0.06*k, beamLen, eyeDist*0.12*k);
            // opposite direction
            const grd2 = g.createLinearGradient(ex, ey, ex - beamLen, ey);
            grd2.addColorStop(0, `hsla(0, 100%, 65%, ${0.9})`);
            grd2.addColorStop(1, 'hsla(0, 100%, 65%, 0)');
            g.fillStyle = grd2;
            g.fillRect(ex - beamLen, ey - eyeDist*0.06*k, beamLen, eyeDist*0.12*k);
            // core hot spot
            g.fillStyle = `hsla(0, 100%, 90%, 0.95)`;
            g.beginPath(); g.arc(ex, ey, eyeDist*0.08, 0, TAU); g.fill();
          });
          break;
        }
        case 'thirdEye': {
          // glowing eye between brows
          const bx = (reSx+leSx)/2;
          const by = (reSy+leSy)/2 - eyeDist*0.65;
          const r = eyeDist*0.22;
          g.translate(bx, by); g.rotate(angle);
          // eye white
          g.fillStyle = 'rgba(245,235,220,0.95)';
          g.beginPath(); g.ellipse(0, 0, r*1.4, r*0.85, 0, 0, TAU); g.fill();
          // iris
          const phase = T*0.7;
          g.fillStyle = `hsl(${(baseHue+(Math.sin(phase)*60))%360}, 85%, 50%)`;
          g.beginPath(); g.arc(0, 0, r*0.6, 0, TAU); g.fill();
          // pupil
          g.fillStyle = '#000';
          g.beginPath(); g.arc(0, 0, r*0.28, 0, TAU); g.fill();
          // shine
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.beginPath(); g.arc(-r*0.18, -r*0.18, r*0.12, 0, TAU); g.fill();
          // glow
          g.shadowColor = `hsla(${baseHue}, 100%, 70%, 1)`;
          g.shadowBlur = 30*k;
          g.beginPath(); g.arc(0, 0, r*0.6, 0, TAU); g.fill();
          break;
        }
        case 'mask': {
          // geometric carnival/venetian mask outline
          const cx = eyeMidX, cy = eyeMidY;
          g.translate(cx, cy); g.rotate(angle);
          const w = eyeDist*2.3, h = faceH*0.65;
          g.fillStyle = `hsla(${baseHue}, 60%, 25%, 0.85)`;
          g.beginPath();
          g.moveTo(-w/2, -h*0.2);
          g.bezierCurveTo(-w/2, -h*0.55, -w*0.3, -h*0.6,  0, -h*0.5);
          g.bezierCurveTo( w*0.3, -h*0.6,  w/2, -h*0.55,  w/2, -h*0.2);
          g.bezierCurveTo( w/2,   h*0.4,   w*0.25, h*0.55,  0,  h*0.45);
          g.bezierCurveTo(-w*0.25, h*0.55, -w/2,   h*0.4,  -w/2, -h*0.2);
          g.closePath(); g.fill();
          // eye holes
          g.globalCompositeOperation = 'destination-out';
          g.beginPath(); g.ellipse(-eyeDist*0.5, 0, eyeDist*0.32, eyeDist*0.20, 0, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(+eyeDist*0.5, 0, eyeDist*0.32, eyeDist*0.20, 0, 0, TAU); g.fill();
          g.globalCompositeOperation = 'source-over';
          // ornament
          g.strokeStyle = `hsla(50, 90%, 70%, 0.9)`;
          g.lineWidth = 2;
          for(let i=0;i<6;i++){
            const a = (i/6) * TAU;
            const rx = Math.cos(a)*eyeDist*0.5;
            const ry = -h*0.4 + Math.sin(a)*eyeDist*0.12;
            g.beginPath(); g.arc(rx, ry, 4, 0, TAU); g.stroke();
          }
          break;
        }
        case 'aura': {
          // glowing aura around the face — pulsing rings around chin-to-forehead center
          const cx = (fhSx+chinSx)/2;
          const cy = (fhSy+chinSy)/2;
          const baseR = faceH*0.6;
          for(let i=0;i<3;i++){
            const phase = (T*0.5 + i*0.33) % 1;
            const r = baseR * (1 + phase*0.8);
            const a = (1-phase) * 0.5 * k;
            g.strokeStyle = `hsla(${(baseHue + i*40)%360}, 90%, 70%, ${a})`;
            g.lineWidth = Math.max(3, eyeDist*0.12)*(1-phase*0.5);
            g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
          }
          break;
        }
      }
      g.restore();
    }
  }

  // 3D AR overlay (Three.js + face transform matrix) — drawn LAST so it sits on top.
  // Lazy-loaded the first time any 3D AR effect is selected.
  if(cam.ar && cam.faceTransformMatrix && AR3D_KEYS.has(cam.ar)){
    try { renderAR3D(g); } catch(e){ /* swallow render errors */ }
  }
  // Hand AR (2D, uses existing hand landmarks — independent of face)
  if(cam.handAr && cam.handAr !== 'none'){
    try { drawHandAR(g, T); } catch(e){ /* swallow */ }
  }

  // Close the Motion transform (opened at the top of drawWebcamFX)
  if(_motionWrapped) g.restore();
}

// ===== Hand AR (uses existing 2D hand landmarks, no Three.js needed) =====
function drawHandAR(g, T){
  if(!cam.handAr || cam.handAr === 'none' || !cam.handLandmarks || !cam.handLandmarks.length) return;
  if(!cam.ready) return;
  const rawV = cam.video; if(!rawV.videoWidth) return;
  const vw = rawV.videoWidth, vh = rawV.videoHeight;
  const sCanvas = Math.max(W/vw, H/vh);
  const dW = vw*sCanvas, dH = vh*sCanvas;
  const dx = (W - dW)/2, dy = (H - dH)/2;
  const N2S = (nx, ny) => {
    const x = cam.mirror ? (1-nx) : nx;
    return [ dx + x*dW, dy + ny*dH ];
  };
  const k = Math.max(0, Math.min(2, cam.handArIntensity != null ? cam.handArIntensity : 1));
  const baseHue = (typeof dominantEmo === 'function') ? (dominantEmo().hue || 280) : 280;

  cam.handLandmarks.forEach(hand => {
    if(!hand || hand.length < 21) return;
    // Useful indices: 0=wrist, 4=thumbTip, 8=indexTip, 12=middleTip, 16=ringTip, 20=pinkyTip
    const wrist = hand[0]; const tips = [4,8,12,16,20].map(i => hand[i]).filter(Boolean);
    if(!wrist || tips.length < 5) return;
    const tipsScreen = tips.map(p => N2S(p.x, p.y));
    const [wx, wy] = N2S(wrist.x, wrist.y);
    const palmX = (tipsScreen[1][0] + tipsScreen[3][0] + wx)/3;
    const palmY = (tipsScreen[1][1] + tipsScreen[3][1] + wy)/3;
    const handSize = Math.hypot(tipsScreen[1][0]-wx, tipsScreen[1][1]-wy);

    g.save();
    switch(cam.handAr){
      case 'rings': {
        // metallic ring on each finger (between MCP and PIP knuckles: indices 6,10,14,18; thumb at 3)
        const fingerKnuckles = [[2,3],[6,7],[10,11],[14,15],[18,19]];
        fingerKnuckles.forEach(([a,b], i) => {
          const pa = hand[a], pb = hand[b]; if(!pa || !pb) return;
          const [ax, ay] = N2S(pa.x, pa.y);
          const [bx, by] = N2S(pb.x, pb.y);
          const cx = (ax+bx)/2, cy = (ay+by)/2;
          const r = Math.hypot(bx-ax, by-ay) * 0.55;
          const ang = Math.atan2(by-ay, bx-ax);
          g.save();
          g.translate(cx, cy); g.rotate(ang + Math.PI/2);
          // metallic gradient
          const grd = g.createLinearGradient(-r, 0, r, 0);
          grd.addColorStop(0, '#cfa84a');
          grd.addColorStop(0.5, '#fff1a5');
          grd.addColorStop(1, '#9c7a2c');
          g.strokeStyle = grd; g.lineWidth = Math.max(2, r*0.25);
          g.beginPath(); g.ellipse(0, 0, r, r*0.35, 0, 0, TAU); g.stroke();
          // gem on top
          if(i === 2 || i === 1){
            g.fillStyle = `hsl(${(baseHue+i*60)%360}, 90%, 65%)`;
            g.beginPath(); g.arc(0, -r*0.4, r*0.18, 0, TAU); g.fill();
            g.shadowColor = `hsl(${(baseHue+i*60)%360}, 100%, 75%)`; g.shadowBlur = 8*k;
            g.beginPath(); g.arc(0, -r*0.4, r*0.18, 0, TAU); g.fill();
          }
          g.restore();
        });
        break;
      }
      case 'energyBall': {
        // pulsing orb in palm
        const r = handSize * 0.45;
        const pulse = 0.85 + Math.sin(T*5)*0.15;
        const rad = r * pulse;
        const grd = g.createRadialGradient(palmX, palmY, rad*0.1, palmX, palmY, rad);
        grd.addColorStop(0, `hsla(${baseHue}, 100%, 85%, 1)`);
        grd.addColorStop(0.4, `hsla(${baseHue}, 90%, 60%, 0.85)`);
        grd.addColorStop(1, `hsla(${baseHue}, 80%, 40%, 0)`);
        g.fillStyle = grd;
        g.beginPath(); g.arc(palmX, palmY, rad*2, 0, TAU); g.fill();
        // electric arcs
        g.strokeStyle = `hsla(${baseHue}, 100%, 90%, ${0.7*k})`;
        g.lineWidth = 1.5;
        for(let a=0; a<6; a++){
          const angle = (a/6)*TAU + T*2;
          g.beginPath();
          let x = palmX, y = palmY;
          g.moveTo(x, y);
          for(let s=0; s<4; s++){
            const aJit = angle + (Math.random()-0.5)*0.5;
            x += Math.cos(aJit) * rad*0.4;
            y += Math.sin(aJit) * rad*0.4;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        break;
      }
      case 'spiderweb': {
        // mesh between fingertips
        g.strokeStyle = `hsla(0, 0%, 95%, ${0.7*k})`;
        g.lineWidth = 1.2;
        // outer perimeter
        g.beginPath();
        tipsScreen.forEach(([x,y], i) => { i ? g.lineTo(x,y) : g.moveTo(x,y); });
        g.closePath(); g.stroke();
        // hub-spokes to wrist
        tipsScreen.forEach(([x,y]) => {
          g.beginPath(); g.moveTo(wx, wy); g.lineTo(x, y); g.stroke();
        });
        // concentric webs
        for(let s=1; s<=3; s++){
          const f = s/4;
          g.beginPath();
          tipsScreen.forEach(([x,y], i) => {
            const ix = wx + (x-wx)*f;
            const iy = wy + (y-wy)*f;
            i ? g.lineTo(ix, iy) : g.moveTo(ix, iy);
          });
          g.closePath(); g.stroke();
        }
        break;
      }
      case 'wand': {
        // magic wand glow from index fingertip
        const [tipX, tipY] = tipsScreen[1];   // index tip
        // base point: index MCP (knuckle)
        const mcp = hand[5]; if(!mcp) break;
        const [bx2, by2] = N2S(mcp.x, mcp.y);
        // wand body
        g.strokeStyle = '#1a1a1a';
        g.lineWidth = Math.max(4, handSize*0.06);
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx2, by2); g.lineTo(tipX, tipY); g.stroke();
        // tip glow
        const grd = g.createRadialGradient(tipX, tipY, 1, tipX, tipY, handSize*0.6);
        grd.addColorStop(0, `hsla(${baseHue}, 100%, 95%, 1)`);
        grd.addColorStop(0.4, `hsla(${baseHue}, 90%, 65%, 0.7)`);
        grd.addColorStop(1, `hsla(${baseHue}, 80%, 40%, 0)`);
        g.fillStyle = grd;
        g.beginPath(); g.arc(tipX, tipY, handSize*0.8, 0, TAU); g.fill();
        // sparkles
        for(let i=0; i<8; i++){
          const a = Math.random()*TAU;
          const r = handSize*0.2 + Math.random()*handSize*0.3;
          const sx = tipX + Math.cos(a)*r;
          const sy = tipY + Math.sin(a)*r;
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(sx, sy, 1+Math.random()*2, 0, TAU); g.fill();
        }
        break;
      }
      case 'lightning': {
        // jagged bolt from each fingertip downward
        g.strokeStyle = `hsla(200, 100%, 90%, ${0.9*k})`;
        g.lineWidth = 2;
        g.shadowColor = 'rgba(120,200,255,0.95)'; g.shadowBlur = 12*k;
        tipsScreen.forEach(([tx, ty]) => {
          g.beginPath(); g.moveTo(tx, ty);
          let cx = tx, cy = ty;
          const segs = 8;
          for(let s=0; s<segs; s++){
            cx += (Math.random()-0.5) * handSize*0.4;
            cy += handSize*0.5;
            g.lineTo(cx, cy);
            if(cy > H+50) break;
          }
          g.stroke();
        });
        break;
      }
      case 'fireball': {
        // flames around palm
        const baseR = handSize*0.5;
        for(let i=0; i<14; i++){
          const a = (i/14)*TAU + T*3;
          const r = baseR * (0.8 + Math.sin(T*8 + i)*0.3);
          const x = palmX + Math.cos(a)*r;
          const y = palmY + Math.sin(a)*r*0.8 - Math.abs(Math.sin(T*4+i))*handSize*0.3;
          const flameH = handSize*0.5;
          const grd = g.createLinearGradient(x, y, x, y - flameH);
          grd.addColorStop(0, `rgba(255, 50, 0, ${0.9*k})`);
          grd.addColorStop(0.5, `rgba(255, 180, 30, ${0.75*k})`);
          grd.addColorStop(1, 'rgba(255, 255, 200, 0)');
          g.fillStyle = grd;
          g.beginPath();
          g.ellipse(x, y - flameH/2, handSize*0.10, flameH, 0, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'butterflies': {
        // butterflies fluttering around fingertips
        tipsScreen.forEach(([tx, ty], i) => {
          const ph = T*2 + i*1.3;
          const w = handSize*0.18 + Math.sin(ph*4)*handSize*0.05;
          const h = handSize*0.12;
          const hue = (baseHue + i*60) % 360;
          g.save();
          g.translate(tx, ty);
          g.rotate(Math.sin(ph)*0.3);
          g.fillStyle = `hsla(${hue}, 80%, 60%, ${0.85*k})`;
          // wing flap via scaleY
          const flap = Math.cos(ph*8);
          g.save(); g.scale(1, flap > 0 ? 1 : -1);
          g.beginPath(); g.ellipse(-w*0.3, 0, w*0.5, h, 0, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(+w*0.3, 0, w*0.5, h, 0, 0, TAU); g.fill();
          g.restore();
          // body
          g.fillStyle = '#222';
          g.fillRect(-1, -h*0.4, 2, h*0.8);
          g.restore();
        });
        break;
      }
    }
    g.restore();
  });
}
