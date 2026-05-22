// ============================================================
// MEDIA LIBRARY — IndexedDB-backed image + video storage with folders
// Each browser keeps its own library (effectively per-user-per-device).
// ============================================================
const MEDIA_DB_NAME = 'inner-weather-media';
const MEDIA_DB_VERSION = 1;
let _mediaDB = null;
const media = {
  currentType: 'image',   // 'image' | 'video'
  currentFolder: 'Images',
  items: [],              // metadata of items in current folder (no blob until loaded)
  folders: [],            // all folder records
};

function _mediaOpenDB(){
  if(_mediaDB) return Promise.resolve(_mediaDB);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('items')){
        const s = db.createObjectStore('items', { keyPath:'id', autoIncrement:true });
        s.createIndex('folder', 'folder', { unique:false });
        s.createIndex('type', 'type', { unique:false });
      }
      if(!db.objectStoreNames.contains('folders')){
        db.createObjectStore('folders', { keyPath:'path' });
      }
    };
    req.onsuccess = () => { _mediaDB = req.result; resolve(_mediaDB); };
  });
}
async function _mediaTx(store, mode){
  const db = await _mediaOpenDB();
  return db.transaction(store, mode || 'readonly').objectStore(store);
}
function _idbReq(req){ return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

async function mediaAddItem(item){
  const s = await _mediaTx('items', 'readwrite');
  return _idbReq(s.add(item));
}
async function mediaGetItem(id){
  const s = await _mediaTx('items');
  return _idbReq(s.get(id));
}
async function mediaListByFolder(folder){
  const s = await _mediaTx('items');
  return new Promise((res, rej) => {
    const out = [];
    const r = s.index('folder').openCursor(IDBKeyRange.only(folder));
    r.onsuccess = e => {
      const c = e.target.result;
      if(c){
        const v = c.value;
        // strip the blob from list-view metadata to keep memory small
        out.push({ id:v.id, name:v.name, type:v.type, folder:v.folder, mime:v.mime, thumb:v.thumb, createdAt:v.createdAt, width:v.width, height:v.height });
        c.continue();
      } else res(out);
    };
    r.onerror = () => rej(r.error);
  });
}
async function mediaCountByType(type){
  const s = await _mediaTx('items');
  return _idbReq(s.index('type').count(IDBKeyRange.only(type)));
}
async function mediaDeleteItem(id){
  const s = await _mediaTx('items', 'readwrite');
  return _idbReq(s.delete(id));
}
async function mediaMoveItem(id, newFolder){
  const s = await _mediaTx('items', 'readwrite');
  const item = await _idbReq(s.get(id));
  if(!item) return;
  item.folder = newFolder;
  return _idbReq(s.put(item));
}
async function mediaAddFolder(path, type){
  const s = await _mediaTx('folders', 'readwrite');
  return _idbReq(s.put({ path, type, createdAt: Date.now() }));
}
async function mediaListFolders(){
  const s = await _mediaTx('folders');
  return new Promise((res, rej) => {
    const out = [];
    const r = s.openCursor();
    r.onsuccess = e => { const c = e.target.result; if(c){ out.push(c.value); c.continue(); } else res(out); };
    r.onerror = () => rej(r.error);
  });
}
async function mediaDeleteFolder(path){
  const s = await _mediaTx('folders', 'readwrite');
  return _idbReq(s.delete(path));
}

// Thumbnail: 256-wide JPEG blob from image or video element
function _mediaMakeThumb(srcEl, srcW, srcH){
  const TW = 256;
  const TH = Math.max(1, Math.round(srcH * (TW / Math.max(1,srcW))));
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  try { c.getContext('2d').drawImage(srcEl, 0, 0, TW, TH); } catch(_){}
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.78));
}

// Upload a file → save to IDB with auto-categorization
async function mediaUploadFile(file, folder){
  const isImg = file.type.startsWith('image/');
  const isVid = file.type.startsWith('video/');
  if(!isImg && !isVid){ console.warn('[media] unsupported file', file.type); return null; }
  const type = isImg ? 'image' : 'video';
  if(!folder) folder = (type === 'image') ? media.currentFolder : 'Videos';
  // Make sure folder type matches file type — if user is in Images folder uploading a video, route to Videos.
  const folderRec = media.folders.find(f => f.path === folder);
  if(folderRec && folderRec.type !== type){
    folder = (type === 'image') ? 'Images' : 'Videos';
  }
  const url = URL.createObjectURL(file);
  let thumb = null, width = 0, height = 0;
  try {
    if(isImg){
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      width = img.naturalWidth; height = img.naturalHeight;
      thumb = await _mediaMakeThumb(img, width, height);
    } else {
      const v = document.createElement('video');
      v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
      await new Promise(res => {
        let done = false;
        const f = () => { if(done) return; done = true; res(); };
        v.onloadeddata = f; v.onerror = f;
        setTimeout(f, 3000);  // hard timeout
      });
      width = v.videoWidth || 1; height = v.videoHeight || 1;
      // seek to a moment in to avoid black first frame
      try { v.currentTime = Math.min(0.5, (v.duration || 1) * 0.1); await new Promise(r => setTimeout(r, 100)); } catch(_){}
      thumb = await _mediaMakeThumb(v, width, height);
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch(_){}
    }
  } catch(e){ console.warn('[media] thumb failed', e); }
  URL.revokeObjectURL(url);
  const id = await mediaAddItem({
    name: file.name, type, folder, mime: file.type,
    blob: file, thumb, createdAt: Date.now(), width, height,
  });
  return id;
}

// Take an item from IDB and load it into imgState.images for rendering.
// If the item is already loaded, just promote it to active instead of duplicating.
async function mediaLoadIntoCanvas(id){
  const existingIdx = imgState.images.findIndex(e => e && e.mediaId === id);
  if(existingIdx >= 0){
    imgState.active = existingIdx;
    if(!imgState.selected.includes(existingIdx)) imgState.selected.push(existingIdx);
    renderImgList();
    return;
  }
  const item = await mediaGetItem(id);
  if(!item || !item.blob) return;
  const url = URL.createObjectURL(item.blob);
  if(item.type === 'image'){
    // Reuse existing image path — but bypass the file-input route
    const img = new Image();
    const isGif = item.mime === 'image/gif' || /\.gif$/i.test(item.name || '');
    if(isGif){
      img.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:0';
      document.body.appendChild(img);
    }
    img.onload = () => {
      const entry = { img, url, isGif, mediaId: id, name: item.name };
      imgState.images.push(entry);
      const idx = imgState.images.length - 1;
      if(isGif){ _decodeGifFrames(item.blob, entry); }
      imgState.selected.push(idx);
      if(imgState.images.length === 1) imgState.active = 0;
      if(imgState.images.length === 2){
        imgState.useAllImages = true;
        const useEl = document.getElementById('imgUseAll'); if(useEl) useEl.checked = true;
      }
      renderImgList();
    };
    img.src = url;
  } else {
    // Video: <video> element that we drawImage() per frame. Aliased as entry.img
    // so the existing render pipeline (drawImage(entry.img, ...)) works as-is.
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true; v.loop = true; v.autoplay = true;
    v.crossOrigin = 'anonymous';
    v.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:0';
    document.body.appendChild(v);
    v.onloadeddata = () => {
      try { v.play().catch(()=>{}); } catch(_){}
      // For pipeline compat, expose width/height like an image
      Object.defineProperty(v, 'width',  { configurable: true, get: () => v.videoWidth || 1 });
      Object.defineProperty(v, 'height', { configurable: true, get: () => v.videoHeight || 1 });
      const entry = { img: v, url, isVideo: true, video: v, mediaId: id, name: item.name };
      imgState.images.push(entry);
      const idx = imgState.images.length - 1;
      imgState.selected.push(idx);
      if(imgState.images.length === 1) imgState.active = 0;
      if(imgState.images.length === 2){
        imgState.useAllImages = true;
        const useEl = document.getElementById('imgUseAll'); if(useEl) useEl.checked = true;
      }
      renderImgList();
    };
  }
}

// Init: ensure default folders exist, then render UI
async function mediaInit(){
  try {
    await _mediaOpenDB();
    const folders = await mediaListFolders();
    const have = new Set(folders.map(f => f.path));
    if(!have.has('Images')) await mediaAddFolder('Images', 'image');
    if(!have.has('Videos')) await mediaAddFolder('Videos', 'video');
    media.folders = await mediaListFolders();
    await mediaRefresh();
  } catch(e){ console.warn('[media] init failed', e); }
}
async function mediaRefresh(){
  // Refresh folder dropdown
  media.folders = await mediaListFolders();
  const sel = document.getElementById('mediaFolderSel');
  if(sel){
    const prev = sel.value;
    sel.innerHTML = '';
    media.folders
      .filter(f => f.type === media.currentType)
      .sort((a,b) => a.path.localeCompare(b.path))
      .forEach(f => {
        const o = document.createElement('option');
        o.value = f.path; o.textContent = f.path;
        sel.appendChild(o);
      });
    // Restore selection if possible, else pick first folder of current type
    if([...sel.options].find(o => o.value === prev)) sel.value = prev;
    else if(sel.options.length) sel.value = sel.options[0].value;
    media.currentFolder = sel.value;
  }
  // Refresh grid
  media.items = await mediaListByFolder(media.currentFolder);
  mediaRenderGrid();
  // Count
  const total = await mediaCountByType(media.currentType);
  const el = document.getElementById('mediaCount');
  if(el) el.textContent = `${total} ${media.currentType}${total===1?'':'s'}`;
}
function mediaRenderGrid(){
  const grid = document.getElementById('mediaGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!media.items.length){
    grid.innerHTML = '<div class="type-tip" style="text-align:center;padding:18px 8px;opacity:.6">這個資料夾是空的 · 拖檔案進來</div>';
    return;
  }
  media.items.sort((a,b) => b.createdAt - a.createdAt);
  const loadedIds = new Set(imgState.images.map(e => e && e.mediaId).filter(Boolean));
  media.items.forEach(item => {
    const thumbUrl = item.thumb ? URL.createObjectURL(item.thumb) : '';
    const isLoaded = loadedIds.has(item.id);
    const div = document.createElement('div');
    div.className = 'img-thumb' + (isLoaded ? ' selected' : '');
    div.title = item.name + (isLoaded ? ' · 已載入' : '');
    div.innerHTML = `
      <img src="${thumbUrl}" alt="" />
      ${item.type === 'video' ? '<div class="sel-badge" style="left:4px;right:auto;background:rgba(0,0,0,.7);color:#fff;font-size:10px">▶</div>' : ''}
      ${isLoaded ? '<div class="sel-badge" style="background:rgba(80,200,120,.85);color:#fff">✓</div>' : ''}
      <button class="x" title="刪除">×</button>
      <button class="x" style="right:22px;background:rgba(0,0,0,.65);color:#fff" title="移到其他資料夾">⋮</button>
    `;
    const [delBtn, moveBtn] = div.querySelectorAll('button.x');
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if(!confirm(`刪除 "${item.name}"？`)) return;
      await mediaDeleteItem(item.id);
      await mediaRefresh();
    });
    moveBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const targetFolders = media.folders.filter(f => f.type === item.type && f.path !== item.folder);
      if(!targetFolders.length){ alert('沒有其他相同類型的資料夾 — 先新增一個'); return; }
      const choice = prompt(`移到哪個資料夾？\n可選：${targetFolders.map(f => f.path).join(', ')}`, targetFolders[0].path);
      if(!choice) return;
      if(!targetFolders.find(f => f.path === choice)){ alert('資料夾不存在或類型不符'); return; }
      await mediaMoveItem(item.id, choice);
      await mediaRefresh();
    });
    div.addEventListener('click', () => {
      mediaLoadIntoCanvas(item.id);
    });
    grid.appendChild(div);
  });
}

// ===== Wire upload / drop to media library =====
imgDrop.addEventListener('click', ()=> imgInput.click());
imgInput.addEventListener('change', async e => {
  const newIds = [];
  for(const f of e.target.files){
    if(f.type.startsWith('image/') || f.type.startsWith('video/')){
      const id = await mediaUploadFile(f);
      if(id) newIds.push(id);
    } else {
      addImage(f);  // fallback for legacy
    }
  }
  imgInput.value = '';
  await mediaRefresh();
  // Auto-load freshly uploaded items into canvas
  for(const id of newIds){ await mediaLoadIntoCanvas(id); }
});
['dragover','dragenter'].forEach(ev=>{
  imgDrop.addEventListener(ev, e=>{ e.preventDefault(); imgDrop.classList.add('dragover'); });
});
['dragleave','drop'].forEach(ev=>{
  imgDrop.addEventListener(ev, e=>{ e.preventDefault(); imgDrop.classList.remove('dragover'); });
});
imgDrop.addEventListener('drop', async e=>{
  for(const f of e.dataTransfer.files){
    if(f.type.startsWith('image/') || f.type.startsWith('video/')){
      await mediaUploadFile(f);
    }
  }
  await mediaRefresh();
});

// Type tabs (Images / Videos)
document.querySelectorAll('#mediaTypeSeg button').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('#mediaTypeSeg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    media.currentType = b.dataset.mtype;
    // Default to root folder of that type
    media.currentFolder = (media.currentType === 'image') ? 'Images' : 'Videos';
    await mediaRefresh();
  });
});
// Folder select change
document.getElementById('mediaFolderSel')?.addEventListener('change', async e => {
  media.currentFolder = e.target.value;
  media.items = await mediaListByFolder(media.currentFolder);
  mediaRenderGrid();
});
// New folder
document.getElementById('mediaNewFolder')?.addEventListener('click', async () => {
  const name = (prompt(`新增 ${media.currentType === 'image' ? '圖片' : '影片'} 資料夾名稱：`) || '').trim();
  if(!name) return;
  const path = (media.currentType === 'image' ? 'Images' : 'Videos') + '/' + name.replace(/\//g, '_');
  await mediaAddFolder(path, media.currentType);
  await mediaRefresh();
  const sel = document.getElementById('mediaFolderSel');
  if(sel){ sel.value = path; sel.dispatchEvent(new Event('change')); }
});
// Delete folder (only if empty, and never the root)
document.getElementById('mediaDelFolder')?.addEventListener('click', async () => {
  const folder = media.currentFolder;
  if(folder === 'Images' || folder === 'Videos'){ alert('根資料夾不能刪除'); return; }
  const items = await mediaListByFolder(folder);
  if(items.length){ alert('資料夾不是空的 — 先清空或移動裡面的素材'); return; }
  if(!confirm(`刪除資料夾 "${folder}"？`)) return;
  await mediaDeleteFolder(folder);
  media.currentFolder = (media.currentType === 'image') ? 'Images' : 'Videos';
  await mediaRefresh();
});

// Init on load
mediaInit();
