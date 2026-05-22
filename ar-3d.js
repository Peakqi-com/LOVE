// ===== Three.js + MediaPipe transformationMatrix for 3D Face AR =====
// AR effects that need the 3D renderer (vs the simple 2D ones)
const AR3D_KEYS = new Set(['crown3d','sunglasses3d','cat3d','halo3d','mask3d','horns3d','headband3d']);
const ar3d = {
  loaded: false, loading: false, THREE: null,
  scene: null, camera: null, renderer: null, headGroup: null,
  cv: null,
  effects: {},
  currentEffect: null,
};
async function _loadAR3D(){
  if(ar3d.loaded || ar3d.loading) return ar3d.loaded;
  ar3d.loading = true;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    ar3d.THREE = mod;
    const THREE = mod;
    // offscreen canvas matching main canvas size (rebuilt on demand if size changes)
    ar3d.cv = document.createElement('canvas');
    // Render at half-res — composite scales up to full canvas. Negligible quality
    // loss for 3D AR elements (which are usually small overlays), big perf win
    // when stacked with video + image + filter pipelines.
    const AR3D_SCALE = 0.5;
    ar3d._scale = AR3D_SCALE;
    ar3d.cv.width = Math.max(64, Math.round(W * AR3D_SCALE));
    ar3d.cv.height = Math.max(64, Math.round(H * AR3D_SCALE));
    ar3d.renderer = new THREE.WebGLRenderer({ canvas: ar3d.cv, alpha: true, antialias: true });
    ar3d.renderer.setClearColor(0x000000, 0);
    ar3d.renderer.setSize(ar3d.cv.width, ar3d.cv.height, false);
    ar3d.scene = new THREE.Scene();
    // Lights
    ar3d.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 3, 4); ar3d.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.4);
    rim.position.set(-3, 2, -2); ar3d.scene.add(rim);
    // Camera — match a typical webcam FOV. Units are cm (matches MediaPipe face matrix).
    // Near 1cm, far 10m (1000cm) — comfortably covers face at ~50cm.
    ar3d.camera = new THREE.PerspectiveCamera(63, W/H, 1, 1000);
    ar3d.camera.position.set(0, 0, 0);
    // Head group — face transform matrix is applied here each frame
    ar3d.headGroup = new THREE.Group();
    ar3d.scene.add(ar3d.headGroup);
    ar3d.loaded = true;
  } catch(e){ console.warn('[AR3D] three.js load failed', e); }
  ar3d.loading = false;
  return ar3d.loaded;
}
function _buildAR3DEffect(key){
  // NOTE: MediaPipe face transformation matrix uses CENTIMETERS (face mesh is ~14cm tall),
  // so ALL geometry sizes + offsets here must be in cm too (face is ~50cm from camera).
  const THREE = ar3d.THREE; if(!THREE) return null;
  const g = new THREE.Group();
  const baseHue = (typeof dominantEmo === 'function') ? (dominantEmo().hue || 200) : 200;
  const hueCol = (h, s, l) => new THREE.Color().setHSL(h/360, s, l);
  switch(key){
    case 'crown3d': {
      // 5-pointed crown with gems — band ~7.5cm radius (head-sized)
      const goldMat = new THREE.MeshPhysicalMaterial({ color: 0xffcc44, metalness: 1.0, roughness: 0.2, clearcoat:1 });
      const bandGeo = new THREE.CylinderGeometry(7.5, 7.5, 2.5, 32, 1, true);
      const band = new THREE.Mesh(bandGeo, goldMat); band.position.y = 10; g.add(band);
      for(let i=0; i<5; i++){
        const a = (i/5) * Math.PI*2;
        const x = Math.cos(a)*7.5, z = Math.sin(a)*7.5;
        const spikeGeo = new THREE.ConeGeometry(1.8, 7, 8);
        const spike = new THREE.Mesh(spikeGeo, goldMat);
        spike.position.set(x, 14, z);
        g.add(spike);
        const gemCols = [0xff3366, 0x33ccff, 0xffcc33, 0x9c33ff, 0x33ff99];
        const gemMat = new THREE.MeshPhysicalMaterial({ color: gemCols[i], metalness:0.2, roughness:0.1, clearcoat:1, transmission:0.3 });
        const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), gemMat);
        gem.position.set(x*0.95, 11.5, z*0.95);
        g.add(gem);
      }
      g.position.y = 4;
      return g;
    }
    case 'sunglasses3d': {
      const lensMat = new THREE.MeshPhysicalMaterial({ color:0x0a0a14, metalness:0.6, roughness:0.05, clearcoat:1, transmission:0.15 });
      const frameMat = new THREE.MeshStandardMaterial({ color:0x1a1a22, metalness:0.7, roughness:0.3 });
      // Two rectangle lenses ~5cm wide each, positioned over eyes (~3.5cm from face center horizontally)
      const lensGeo = new THREE.BoxGeometry(5, 3.5, 0.5);
      const l = new THREE.Mesh(lensGeo, lensMat); l.position.set(-3.5, -0.5, 8); g.add(l);
      const r = new THREE.Mesh(lensGeo, lensMat); r.position.set(+3.5, -0.5, 8); g.add(r);
      // Bridge
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.5), frameMat);
      bridge.position.set(0, -0.5, 8); g.add(bridge);
      // Frames (slightly larger boxes behind lenses for outline effect)
      const outlineGeo = new THREE.BoxGeometry(5.5, 4, 0.8);
      const lOut = new THREE.Mesh(outlineGeo, frameMat); lOut.position.set(-3.5, -0.5, 7.9); g.add(lOut);
      const rOut = new THREE.Mesh(outlineGeo, frameMat); rOut.position.set(+3.5, -0.5, 7.9); g.add(rOut);
      return g;
    }
    case 'cat3d': {
      const furMat = new THREE.MeshStandardMaterial({ color: hueCol(baseHue, 0.6, 0.5), roughness:0.85 });
      const pinkMat = new THREE.MeshStandardMaterial({ color: 0xffaacc, roughness:0.7 });
      for(let side of [-1, 1]){
        const earGeo = new THREE.ConeGeometry(2.5, 6, 4);
        const ear = new THREE.Mesh(earGeo, furMat);
        ear.position.set(5 * side, 8.5, 2);
        ear.rotation.z = -side * 0.15;
        g.add(ear);
        const innerGeo = new THREE.ConeGeometry(1.4, 4, 4);
        const inner = new THREE.Mesh(innerGeo, pinkMat);
        inner.position.set(5 * side, 8.2, 2.5);
        inner.rotation.z = -side * 0.15;
        g.add(inner);
      }
      return g;
    }
    case 'halo3d': {
      const haloMat = new THREE.MeshStandardMaterial({ color: 0xfff080, emissive: 0xffe066, emissiveIntensity: 1.6, metalness:0.3, roughness:0.2 });
      // ~8.5cm ring radius, 0.8cm tube
      const ringGeo = new THREE.TorusGeometry(8.5, 0.8, 12, 48);
      const halo = new THREE.Mesh(ringGeo, haloMat);
      halo.rotation.x = Math.PI/2;
      halo.position.y = 12;
      g.add(halo);
      return g;
    }
    case 'mask3d': {
      // Phantom-style half mask — ~8.5cm sphere half-shell over face
      const maskMat = new THREE.MeshPhysicalMaterial({ color: 0xf8f0e0, metalness:0.1, roughness:0.4, clearcoat:0.4 });
      const maskGeo = new THREE.SphereGeometry(8.5, 28, 16, 0, Math.PI*2, 0, Math.PI*0.55);
      const mask = new THREE.Mesh(maskGeo, maskMat);
      mask.rotation.x = Math.PI;
      mask.position.set(0, 0.5, 4);
      mask.scale.set(1, 1, 0.7);
      g.add(mask);
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      [-3.4, 3.4].forEach(x => {
        const hole = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8), holeMat);
        hole.position.set(x, -0.5, 8.5);
        g.add(hole);
      });
      return g;
    }
    case 'horns3d': {
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x550022, metalness:0.4, roughness:0.4 });
      for(let side of [-1, 1]){
        const horn = new THREE.Mesh(new THREE.ConeGeometry(1.8, 8.5, 12), hornMat);
        horn.position.set(4.5 * side, 10, -0.5);
        horn.rotation.z = -side * 0.35;
        horn.rotation.x = -0.2;
        g.add(horn);
      }
      return g;
    }
    case 'headband3d': {
      const bandMat = new THREE.MeshStandardMaterial({ color: hueCol(baseHue, 0.85, 0.5), metalness:0.5, roughness:0.3 });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(8.5, 1.2, 12, 36), bandMat);
      torus.rotation.x = Math.PI/2.3;
      torus.position.y = 8.5;
      g.add(torus);
      const bowMat = new THREE.MeshStandardMaterial({ color: 0xff5577, roughness:0.5 });
      const bowL = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.5), bowMat);
      bowL.position.set(-2.5, 10.5, 2); bowL.rotation.z = 0.4;
      g.add(bowL);
      const bowR = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.5), bowMat);
      bowR.position.set(+2.5, 10.5, 2); bowR.rotation.z = -0.4;
      g.add(bowR);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), bowMat);
      knot.position.set(0, 10.5, 2.5);
      g.add(knot);
      return g;
    }
  }
  return null;
}
function renderAR3D(g){
  if(!ar3d.loaded){
    if(!ar3d.loading) _loadAR3D();
    return;
  }
  const THREE = ar3d.THREE;
  const m = cam.faceTransformMatrix;
  if(!m || m.length !== 16) return;
  // Resize renderer if canvas changed (keep half-res)
  const targetW = Math.max(64, Math.round(W * (ar3d._scale || 0.5)));
  const targetH = Math.max(64, Math.round(H * (ar3d._scale || 0.5)));
  if(ar3d.cv.width !== targetW || ar3d.cv.height !== targetH){
    ar3d.cv.width = targetW; ar3d.cv.height = targetH;
    ar3d.renderer.setSize(targetW, targetH, false);
    ar3d.camera.aspect = W/H;
    ar3d.camera.updateProjectionMatrix();
  }
  // Build / swap current effect mesh
  if(ar3d.currentEffect !== cam.ar){
    if(ar3d.headGroup.children.length){
      ar3d.headGroup.clear();
    }
    const eff = _buildAR3DEffect(cam.ar);
    if(eff) ar3d.headGroup.add(eff);
    ar3d.currentEffect = cam.ar;
  }
  // Apply head transform — MediaPipe returns a 4x4 column-major transform in meters.
  // Coordinate frames match Three.js's: +X right, +Y up, -Z forward.
  const mat = new THREE.Matrix4();
  mat.fromArray(m);
  ar3d.headGroup.matrixAutoUpdate = false;
  ar3d.headGroup.matrix.copy(mat);
  // Intensity → scale
  const k = Math.max(0.2, Math.min(2, cam.arIntensity != null ? cam.arIntensity : 1));
  ar3d.headGroup.scale.setScalar(k);
  // Render to offscreen
  ar3d.renderer.render(ar3d.scene, ar3d.camera);
  // Composite — respect mirror
  g.save();
  if(cam.mirror){ g.translate(W, 0); g.scale(-1, 1); }
  g.drawImage(ar3d.cv, 0, 0, W, H);
  g.restore();
}
