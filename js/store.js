/* Noam Nex V Music — storage layer
   Files live in OPFS (Origin Private File System) under:
     /NoamNexVMusic/Songs/<file>
     /NoamNexVMusic/Playlists/<playlist>/<file>   (real copies of the song files)
   Metadata lives in IndexedDB. If OPFS is unavailable the audio blob is kept
   in IndexedDB instead, so the app still works fully offline. */
const Store = (() => {
  const DB = 'nnv-music', VER = 1;
  const ROOT = 'NoamNexVMusic', SONGS = 'Songs', PLISTS = 'Playlists';
  let db, opfsOK = false;

  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('songs')) d.createObjectStore('songs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const tx = (names, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(names, mode);
    const out = fn(names.length === 1 ? t.objectStore(names[0]) : names.map(n => t.objectStore(n)), t);
    const isReq = out && typeof IDBRequest !== 'undefined' && out instanceof IDBRequest;
    t.oncomplete = () => res(isReq ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
  const get = (s, k) => tx([s], 'readonly', o => o.get(k));
  const all = s => tx([s], 'readonly', o => o.getAll());
  const put = (s, v, k) => tx([s], 'readwrite', o => (k === undefined ? o.put(v) : o.put(v, k)));
  const del = (s, k) => tx([s], 'readwrite', o => o.delete(k));

  async function dir(...parts) {
    let h = await navigator.storage.getDirectory();
    for (const p of [ROOT, ...parts]) h = await h.getDirectoryHandle(p, { create: true });
    return h;
  }

  async function init() {
    db = await idb();
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        await dir(SONGS); await dir(PLISTS);
        opfsOK = true;
      }
    } catch (e) { opfsOK = false; }
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    return { opfs: opfsOK };
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const safe = n => n.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 120);

  async function writeFile(handleDir, name, blob) {
    const fh = await handleDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob); await w.close();
    return name;
  }

  async function uniqueName(d, name) {
    let n = safe(name), i = 1;
    const dot = n.lastIndexOf('.');
    const base = dot > 0 ? n.slice(0, dot) : n, ext = dot > 0 ? n.slice(dot) : '';
    for (;;) {
      try { await d.getFileHandle(n); n = `${base} (${i++})${ext}`; }
      catch { return n; }
    }
  }

  /* ---- songs ---- */
  async function addSong(file, meta = {}) {
    const id = uid();
    let fileName = safe(file.name || `${id}.mp3`);
    if (opfsOK) {
      const d = await dir(SONGS);
      fileName = await uniqueName(d, fileName);
      await writeFile(d, fileName, file);
    } else {
      await put('blobs', file, id);
    }
    const song = {
      id, file: fileName, title: meta.title || stripExt(file.name || 'Unknown'),
      artist: meta.artist || 'Unknown Artist', album: meta.album || 'Unknown Album',
      duration: meta.duration || 0, size: file.size || 0, type: file.type || '',
      added: Date.now(), fav: false, art: meta.art || null, stored: opfsOK ? 'opfs' : 'idb'
    };
    await put('songs', song);
    return song;
  }

  const stripExt = n => (n || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim() || 'Unknown';

  async function songBlob(song, playlistId) {
    if (song.stored === 'opfs') {
      try {
        // prefer the playlist copy when playing from a playlist
        if (playlistId) {
          const pl = await get('playlists', playlistId);
          if (pl && pl.folder) {
            const d = await dir(PLISTS, pl.folder);
            const c = (pl.copies || {})[song.id];
            if (c) return await (await d.getFileHandle(c)).getFile();
          }
        }
        const d = await dir(SONGS);
        return await (await d.getFileHandle(song.file)).getFile();
      } catch (e) { /* fall through */ }
    }
    return await get('blobs', song.id);
  }

  const songs = () => all('songs').then(a => a.sort((x, y) => x.title.localeCompare(y.title)));
  const song = id => get('songs', id);
  const saveSong = s => put('songs', s);

  async function removeSong(id) {
    const s = await get('songs', id);
    if (!s) return;
    if (s.stored === 'opfs') { try { (await dir(SONGS)).removeEntry(s.file); } catch (e) {} }
    else { try { await del('blobs', id); } catch (e) {} }
    for (const pl of await all('playlists')) {
      if (pl.songs.includes(id)) { await removeFromPlaylist(pl.id, id); }
    }
    await del('songs', id);
  }

  /* ---- playlists (each one is a real folder with copies of its songs) ---- */
  async function createPlaylist(name) {
    const id = uid(), folder = safe(name) || `Playlist ${id}`;
    if (opfsOK) await dir(PLISTS, folder);
    const pl = { id, name, folder, songs: [], copies: {}, created: Date.now() };
    await put('playlists', pl);
    return pl;
  }
  const playlists = () => all('playlists').then(a => a.sort((x, y) => y.created - x.created));
  const playlist = id => get('playlists', id);

  async function addToPlaylist(plId, songId) {
    const pl = await get('playlists', plId), s = await get('songs', songId);
    if (!pl || !s || pl.songs.includes(songId)) return pl;
    if (opfsOK && s.stored === 'opfs') {
      try {
        const src = await (await (await dir(SONGS)).getFileHandle(s.file)).getFile();
        const d = await dir(PLISTS, pl.folder);
        const name = await uniqueName(d, s.file);
        await writeFile(d, name, src);         // real copy inside the playlist folder
        pl.copies[songId] = name;
      } catch (e) { console.warn('copy failed', e); }
    }
    pl.songs.push(songId);
    await put('playlists', pl);
    return pl;
  }

  async function removeFromPlaylist(plId, songId) {
    const pl = await get('playlists', plId); if (!pl) return;
    pl.songs = pl.songs.filter(x => x !== songId);
    const c = pl.copies[songId];
    if (c && opfsOK) { try { (await dir(PLISTS, pl.folder)).removeEntry(c); } catch (e) {} }
    delete pl.copies[songId];
    await put('playlists', pl);
  }

  async function removePlaylist(plId) {
    const pl = await get('playlists', plId); if (!pl) return;
    if (opfsOK) { try { (await dir(PLISTS)).removeEntry(pl.folder, { recursive: true }); } catch (e) {} }
    await del('playlists', plId);
  }

  async function renamePlaylist(plId, name) {
    const pl = await get('playlists', plId); if (!pl) return;
    pl.name = name; await put('playlists', pl);
  }

  /* ---- import a whole device folder (desktop / Android Chrome) ---- */
  async function importDirectory() {
    if (!window.showDirectoryPicker) throw new Error('unsupported');
    const dh = await window.showDirectoryPicker({ id: 'nnv-music', mode: 'read' });
    const added = [];
    for await (const [, h] of dh.entries()) {
      if (h.kind !== 'file') continue;
      const f = await h.getFile();
      if (/\.(mp3|m4a|aac|wav|flac|ogg|opus|weba?)$/i.test(f.name) || /^audio\//.test(f.type)) {
        added.push(await addSong(f));
      }
    }
    return added;
  }

  /* ---- export a song / playlist back to the device Files app ---- */
  async function exportSong(s) {
    const blob = await songBlob(s);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = s.file || `${s.title}.mp3`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const setting = (k, v) => v === undefined ? get('meta', k) : put('meta', v, k);

  async function usage() {
    try { const e = await navigator.storage.estimate(); return e; } catch (x) { return {}; }
  }

  return { init, addSong, songs, song, saveSong, removeSong, songBlob, stripExt,
    createPlaylist, playlists, playlist, addToPlaylist, removeFromPlaylist, removePlaylist,
    renamePlaylist, importDirectory, exportSong, setting, usage,
    get opfs() { return opfsOK; }, paths: { ROOT, SONGS, PLISTS } };
})();
