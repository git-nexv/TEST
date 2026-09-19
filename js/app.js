/* glue: import, tags, now playing, gestures, service worker */

/* ---- minimal ID3v2 / MP4 tag reader (title, artist, album, cover) ---- */
async function readTags(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...head.slice(0, 3)) === 'ID3') return await id3(file);
  } catch (e) {}
  return {};
}
async function id3(file) {
  const buf = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const syncsafe = o => (buf[o] << 21) | (buf[o + 1] << 14) | (buf[o + 2] << 7) | buf[o + 3];
  const size = syncsafe(6) + 10, ver = buf[3];
  let p = 10; const out = {};
  const txt = (b, enc) => {
    try {
      if (enc === 1 || enc === 2) return new TextDecoder(enc === 1 ? 'utf-16' : 'utf-16be').decode(b).replace(/\0+$/, '');
      return new TextDecoder(enc === 3 ? 'utf-8' : 'iso-8859-1').decode(b).replace(/\0+$/, '');
    } catch (e) { return ''; }
  };
  while (p + 10 < size && p + 10 < buf.length) {
    const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4 ? syncsafe(p + 4) : (buf[p + 4] << 24 | buf[p + 5] << 16 | buf[p + 6] << 8 | buf[p + 7]) >>> 0;
    const body = buf.subarray(p + 10, p + 10 + fs);
    if (id === 'TIT2') out.title = txt(body.subarray(1), body[0]);
    else if (id === 'TPE1') out.artist = txt(body.subarray(1), body[0]);
    else if (id === 'TALB') out.album = txt(body.subarray(1), body[0]);
    else if (id === 'APIC') {
      let i = 1; while (i < body.length && body[i] !== 0) i++;             // mime
      const mime = txt(body.subarray(1, i), 0) || 'image/jpeg';
      i += 2;                                                             // 0 + picture type
      while (i < body.length && body[i] !== 0) i++; i++;                  // description
      const blob = new Blob([body.subarray(i)], { type: mime });
      out.art = await blobToDataURL(blob);
    }
    p += 10 + fs;
    if (fs <= 0) break;
  }
  for (const k of ['title', 'artist', 'album']) if (out[k]) out[k] = out[k].trim();
  return out;
}
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = () => r(null); f.readAsDataURL(b); });

async function probeDuration(file) {
  return new Promise(res => {
    const a = new Audio(), u = URL.createObjectURL(file);
    const done = d => { URL.revokeObjectURL(u); res(d); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    a.src = u;
    setTimeout(() => done(0), 6000);
  });
}

async function importFiles(files) {
  const list = [...files].filter(f => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|flac|ogg|opus|weba?)$/i.test(f.name));
  if (!list.length) { Toast('فایل صوتی انتخاب نشد'); return; }
  Toast(`در حال افزودن ${list.length} آهنگ…`);
  let n = 0;
  for (const f of list) {
    const tags = await readTags(f);
    tags.duration = await probeDuration(f);
    await Store.addSong(f, tags);
    n++;
  }
  await UI.refresh();
  UI.renderLibrary(); UI.renderHome();
  Toast(`${n} آهنگ اضافه شد`);
}

/* ---- now playing ---- */
const NP = {
  open() { $('#np').classList.add('open'); $('#np').setAttribute('aria-hidden', 'false'); },
  close() { $('#np').classList.remove('open'); $('#np').setAttribute('aria-hidden', 'true'); }
};

function paint(st) {
  const s = st.song;
  const icon = p => `<svg viewBox="0 0 24 24" class="ico"><use href="#i-${p}"/></svg>`;
  $('#miniTitle').textContent = s ? s.title : 'Not Playing';
  $('#miniSub').textContent = s ? s.artist : '';
  $('#miniArt').innerHTML = s && s.art ? `<img src="${s.art}" alt="">` : icon('note');
  $('#miniPlay').innerHTML = icon(st.playing ? 'pause' : 'play');
  $('#miniNext').classList.toggle('dim', !s);
  $('#miniProgress').style.width = (st.dur ? (st.cur / st.dur) * 100 : 0) + '%';

  $('#npTitle').textContent = s ? s.title : 'Not Playing';
  $('#npSub').textContent = s ? `${s.artist} — ${s.album}` : '';
  $('#npArt').innerHTML = s && s.art ? `<img src="${s.art}" alt="">` : icon('note');
  $('#npPlay').innerHTML = icon(st.playing ? 'pause' : 'play');
  $('#npCur').textContent = fmt(st.cur); $('#npDur').textContent = fmt(st.dur);
  const seek = $('#npSeek');
  if (!seek.dataset.drag) seek.value = st.dur ? (st.cur / st.dur) * 1000 : 0;
  $('#np').classList.toggle('paused', !st.playing);
  $('#npShuffle').classList.toggle('on', st.shuffle);
  $('#npRepeat').classList.toggle('on', st.repeat !== 'off');
  $('#npLike').classList.toggle('on', !!(s && s.fav));
  $$('.row.song').forEach(r => r.classList.toggle('playing', !!s && r.dataset.song === s.id));
  if (s && s.art) $('#npBg').style.background = `center/cover url("${s.art}")`;
  else $('#npBg').style.background = '#1c1c20';
}
Player.on(paint);

/* ---- sheets ---- */
async function songSheet(id) {
  const s = UI.cache.songs.find(x => x.id === id); if (!s) return;
  const pls = UI.cache.playlists;
  const card = Sheet.open(`
    <h3>${esc(s.title)}</h3>
    <div class="muted" style="margin:-6px 0 8px">${esc(s.artist)} · ${esc(s.album)}</div>
    <div class="opt" data-s="play">${ic('play')} پخش</div>
    <div class="opt" data-s="fav">${ic('heart')} ${s.fav ? 'حذف از علاقه‌مندی' : 'افزودن به علاقه‌مندی'}</div>
    <div class="opt" data-s="export">${ic('folder')} ذخیره یک نسخه در Files</div>
    <div class="opt" data-s="del" style="color:#ff5a6a">${ic('trash')} حذف از کتابخانه</div>
    <h3 style="margin:16px 0 6px">افزودن به پلی‌لیست</h3>
    ${pls.length ? pls.map(p => `<div class="opt" data-add="${p.id}">${ic('list')} ${esc(p.name)}</div>`).join('')
      : '<div class="muted">پلی‌لیستی وجود ندارد</div>'}
    <div class="opt" data-s="newpl">${ic('plus')} پلی‌لیست جدید…</div>`);
  card.onclick = async e => {
    const opt = e.target.closest('[data-s],[data-add]'); if (!opt) return;
    const add = opt.dataset.add;
    if (add) { await Store.addToPlaylist(add, s.id); await UI.refresh(); Sheet.close(); Toast('به پلی‌لیست اضافه شد (کپی فایل ساخته شد)'); UI.renderLibrary(); return; }
    switch (opt.dataset.s) {
      case 'play': Player.play(UI.cache.songs, UI.cache.songs.findIndex(x => x.id === s.id)); Sheet.close(); break;
      case 'fav': s.fav = !s.fav; await Store.saveSong(s); await UI.refresh(); Sheet.close(); Toast(s.fav ? 'به علاقه‌مندی‌ها اضافه شد' : 'حذف شد'); break;
      case 'export': await Store.exportSong(s); Sheet.close(); break;
      case 'del': if (confirm('این آهنگ حذف شود؟')) { await Store.removeSong(s.id); await UI.refresh(); UI.renderLibrary(); UI.renderHome(); Sheet.close(); Toast('حذف شد'); } break;
      case 'newpl': Sheet.close(); newPlaylist(s.id); break;
    }
  };
}

function newPlaylist(addSongId) {
  const card = Sheet.open(`<h3>پلی‌لیست جدید</h3>
    <input type="text" id="plName" placeholder="نام پلی‌لیست" autocomplete="off">
    <div class="muted" style="font-size:13px;margin-bottom:12px">یک پوشه هم‌نام در ${Store.paths.ROOT}/${Store.paths.PLISTS} ساخته می‌شود.</div>
    <div class="btnbar" style="padding:0"><button class="btn primary" id="plOk">${ic('plus')} ساختن</button>
    <button class="btn" id="plCancel">انصراف</button></div>`);
  const input = $('#plName', card); setTimeout(() => input.focus(), 120);
  $('#plCancel', card).onclick = () => Sheet.close();
  $('#plOk', card).onclick = async () => {
    const name = input.value.trim(); if (!name) return input.focus();
    const pl = await Store.createPlaylist(name);
    if (addSongId) await Store.addToPlaylist(pl.id, addSongId);
    await UI.refresh(); Sheet.close(); Toast('پلی‌لیست ساخته شد');
    UI.go({ page: 'playlist', id: pl.id }); TabBar.select('library');
  };
}

async function playlistSheet(id) {
  const p = UI.cache.playlists.find(x => x.id === id); if (!p) return;
  const card = Sheet.open(`<h3>${esc(p.name)}</h3>
    <div class="muted" style="margin:-6px 0 8px">${p.songs.length} آهنگ · پوشه ${esc(p.folder)}</div>
    <div class="opt" data-p="play">${ic('play')} پخش</div>
    <div class="opt" data-p="add">${ic('plus')} افزودن آهنگ</div>
    <div class="opt" data-p="rename">${ic('list')} تغییر نام</div>
    <div class="opt" data-p="del" style="color:#ff5a6a">${ic('trash')} حذف پلی‌لیست</div>`);
  card.onclick = async e => {
    const o = e.target.closest('[data-p]'); if (!o) return;
    if (o.dataset.p === 'play') { const l = p.songs.map(i => UI.cache.songs.find(s => s.id === i)).filter(Boolean); if (l.length) Player.play(l, 0, p.id); Sheet.close(); }
    if (o.dataset.p === 'add') { Sheet.close(); addSongsSheet(p.id); }
    if (o.dataset.p === 'rename') { const n = prompt('نام جدید', p.name); if (n) { await Store.renamePlaylist(p.id, n.trim()); await UI.refresh(); UI.renderLibrary(); } Sheet.close(); }
    if (o.dataset.p === 'del') { if (confirm('پلی‌لیست حذف شود؟')) { await Store.removePlaylist(p.id); await UI.refresh(); UI.go({ page: 'playlists' }); Toast('حذف شد'); } Sheet.close(); }
  };
}

function addSongsSheet(plId) {
  const p = UI.cache.playlists.find(x => x.id === plId);
  const card = Sheet.open(`<h3>افزودن آهنگ</h3>
    ${UI.cache.songs.length ? UI.cache.songs.map(s => `<div class="opt" data-pick="${s.id}">
      ${p.songs.includes(s.id) ? ic('heart') : ic('plus')}<div><b>${esc(s.title)}</b><br><small class="muted">${esc(s.artist)}</small></div></div>`).join('')
      : '<div class="muted">اول آهنگ ایمپورت کنید</div>'}
    <div class="btnbar" style="padding:12px 0 0"><button class="btn" id="done">تمام</button>
      <button class="btn primary" data-act="import">${ic('plus')} ایمپورت فایل</button></div>`);
  $('#done', card).onclick = () => { Sheet.close(); UI.renderLibrary(); };
  card.addEventListener('click', async e => {
    const pick = e.target.closest('[data-pick]'); if (!pick) return;
    await Store.addToPlaylist(plId, pick.dataset.pick);
    await UI.refresh(); Toast('اضافه شد'); addSongsSheet(plId);
  });
}

/* ---- global actions ---- */
document.addEventListener('click', async e => {
  const t = e.target;
  const act = t.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'import') { $('#filePick').click(); return; }
    if (a === 'import-folder') {
      try { const added = await Store.importDirectory(); await UI.refresh(); UI.renderLibrary(); UI.renderHome(); Toast(`${added.length} آهنگ از پوشه اضافه شد`); }
      catch (err) { if (err && err.name === 'AbortError') return; Toast('انتخاب پوشه در این مرورگر پشتیبانی نمی‌شود — از «افزودن آهنگ» استفاده کنید'); $('#filePick').click(); }
      return;
    }
    if (a === 'newpl') { newPlaylist(); return; }
    if (a === 'playall') { if (UI.cache.songs.length) Player.play(UI.cache.songs, 0); return; }
    if (a === 'shuffleall') { if (UI.cache.songs.length) { Player.play(UI.cache.songs, Math.floor(Math.random() * UI.cache.songs.length)); } return; }
    if (a === 'play-pl') { const p = UI.cache.playlists.find(x => x.id === act.dataset.id); const l = p.songs.map(i => UI.cache.songs.find(s => s.id === i)).filter(Boolean); if (l.length) Player.play(l, 0, p.id); else Toast('پلی‌لیست خالی است'); return; }
    if (a === 'add-to-pl') { addSongsSheet(act.dataset.id); return; }
    if (a === 'mix') { const l = [...UI.cache.songs].sort(() => Math.random() - .5); if (l.length) Player.play(l, 0); else Toast('اول آهنگ اضافه کنید'); return; }
  }
  const more = t.closest('[data-more]'); if (more) { e.stopPropagation(); songSheet(more.dataset.more); return; }
  const plMore = t.closest('[data-pl-more]'); if (plMore) { e.stopPropagation(); playlistSheet(plMore.dataset.plMore); return; }
  const openPl = t.closest('[data-open-pl]'); if (openPl) { UI.go({ page: 'playlist', id: openPl.dataset.openPl }); TabBar.select('library'); return; }
  const go = t.closest('[data-go]'); if (go) { UI.go({ page: go.dataset.go }); return; }
  if (t.closest('[data-back]')) { const r = UI.route; UI.go(r.page === 'playlist' ? { page: 'playlists' } : r.page === 'group' ? { page: r.key === 'artist' ? 'artists' : 'albums' } : { page: 'root' }); return; }
  const grp = t.closest('[data-group]'); if (grp) { UI.go({ page: 'group', key: grp.dataset.gkey, value: grp.dataset.group }); return; }
  const song = t.closest('.song'); if (song) {
    const ctx = song.dataset.ctx, list = UI.listFor(ctx);
    const i = list.findIndex(s => s.id === song.dataset.song);
    Player.play(list, i < 0 ? 0 : i, ctx && ctx.startsWith('pl:') ? ctx.slice(3) : null);
  }
});

$('#filePick').addEventListener('change', async e => { await importFiles(e.target.files); e.target.value = ''; });

/* mini player + now playing controls */
$('#miniPlay').onclick = e => { e.stopPropagation(); Player.toggle(); };
$('#miniNext').onclick = e => { e.stopPropagation(); Player.next(); };
$('#miniplayer').onclick = () => NP.open();
$('#npPlay').onclick = () => Player.toggle();
$('#npNext').onclick = () => Player.next();
$('#npPrev').onclick = () => Player.prev();
$('#npShuffle').onclick = () => Player.shuffle();
$('#npRepeat').onclick = () => Player.repeat();
$('#npQueue').onclick = () => {
  const st = Player.state();
  Sheet.open(`<h3>صف پخش</h3>${st.queue.length ? st.queue.map((s, i) => `<div class="opt" style="${i === st.index ? 'color:var(--accent)' : ''}">${ic('note')}<div><b>${esc(s.title)}</b><br><small class="muted">${esc(s.artist)}</small></div></div>`).join('') : '<div class="muted">صف خالی است</div>'}`);
};
$('#npLike').onclick = async () => {
  const s = Player.state().song; if (!s) return;
  s.fav = !s.fav; await Store.saveSong(s); await UI.refresh(); paint(Player.state());
};
const seek = $('#npSeek');
seek.addEventListener('pointerdown', () => seek.dataset.drag = '1');
const seekEnd = () => { const st = Player.state(); if (st.dur) Player.seek((seek.value / 1000) * st.dur); delete seek.dataset.drag; };
seek.addEventListener('change', seekEnd);
seek.addEventListener('pointerup', seekEnd);
$('#npVol').addEventListener('input', e => Player.volume(e.target.value / 100));

/* swipe down to dismiss Now Playing */
(() => {
  const np = $('#np'), sheet = $('.np-sheet');
  let y0 = null, dy = 0;
  sheet.addEventListener('pointerdown', e => { if (e.target.closest('input,button')) return; y0 = e.clientY; dy = 0; });
  sheet.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    if (dy > 0) { np.style.transition = 'none'; np.style.transform = `translateY(${dy}px)`; }
  });
  const up = () => {
    if (y0 === null) return;
    np.style.transition = ''; np.style.transform = '';
    if (dy > 110) NP.close();
    y0 = null;
  };
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
})();

/* ---- boot ---- */
(async function boot() {
  await Store.init();
  await UI.refresh();
  TabBar.init();
  TabBar.onChange(name => UI.show(name));
  UI.show('home');
  const v = await Store.setting('vol');
  if (typeof v === 'number' && isFinite(v)) { Player.el.volume = v; $('#npVol').value = v * 100; }
  const last = await Store.setting('last');
  if (last && last.id) {
    const s = await Store.song(last.id);
    if (s) { const l = UI.cache.songs; const i = l.findIndex(x => x.id === s.id); if (i >= 0) { Player.play(l, i, last.playlistId); Player.el.pause(); } }
  }
  paint(Player.state());
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('SW', e); }
  }
})();

/* install prompt */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e;
  setTimeout(() => { if (!deferredPrompt) return; Toast('برای نصب، «Add to Home Screen» را بزنید'); }, 2500); });
window.addEventListener('appinstalled', () => Toast('نصب شد ✓'));
