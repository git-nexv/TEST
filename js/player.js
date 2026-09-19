/* audio engine + queue */
const Player = (() => {
  const el = document.getElementById('audio');
  let queue = [], order = [], idx = -1, ctxPlaylist = null, url = null;
  const st = { shuffle: false, repeat: 'off' }; // off | all | one
  const subs = [];
  const on = fn => subs.push(fn);
  const emit = () => subs.forEach(f => f(state()));

  function state() {
    return {
      song: idx >= 0 ? queue[order[idx]] : null,
      playing: !el.paused && !!el.src,
      cur: el.currentTime || 0, dur: el.duration || 0,
      shuffle: st.shuffle, repeat: st.repeat, playlistId: ctxPlaylist,
      queue: order.map(i => queue[i]), index: idx
    };
  }

  function buildOrder(startIdx) {
    order = queue.map((_, i) => i);
    if (st.shuffle) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      if (startIdx != null) { const p = order.indexOf(startIdx); [order[0], order[p]] = [order[p], order[0]]; }
    }
    idx = startIdx == null ? 0 : (st.shuffle ? 0 : startIdx);
  }

  async function load(autoplay = true) {
    const s = queue[order[idx]];
    if (!s) return;
    const blob = await Store.songBlob(s, ctxPlaylist);
    if (!blob) { Toast('فایل این آهنگ پیدا نشد'); return; }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    el.src = url;
    try { if (autoplay) await el.play(); } catch (e) {}
    media(s);
    Store.setting('last', { id: s.id, playlistId: ctxPlaylist });
    emit();
  }

  function media(s) {
    if (!('mediaSession' in navigator)) return;
    const art = s.art ? [{ src: s.art, sizes: '512x512', type: 'image/jpeg' }] : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, album: s.album, artwork: art });
    const h = { play: () => toggle(), pause: () => toggle(), previoustrack: prev, nexttrack: next,
      seekbackward: () => seek(Math.max(0, el.currentTime - 10)), seekforward: () => seek(el.currentTime + 10) };
    for (const k in h) { try { navigator.mediaSession.setActionHandler(k, h[k]); } catch (e) {} }
  }

  function play(list, start = 0, playlistId = null) {
    queue = list.slice(); ctxPlaylist = playlistId;
    buildOrder(start); load(true);
  }
  async function toggle() {
    if (!el.src) { if (queue.length) return load(true); return; }
    if (el.paused) { try { await el.play(); } catch (e) {} } else el.pause();
    emit();
  }
  function next(auto = false) {
    if (!queue.length) return;
    if (auto && st.repeat === 'one') { el.currentTime = 0; el.play(); return; }
    if (idx + 1 >= order.length) {
      if (st.repeat === 'all' || !auto) idx = 0; else { el.pause(); emit(); return; }
    } else idx++;
    load(true);
  }
  function prev() {
    if (!queue.length) return;
    if (el.currentTime > 3) { el.currentTime = 0; return; }
    idx = idx - 1 < 0 ? order.length - 1 : idx - 1;
    load(true);
  }
  const seek = t => { if (isFinite(el.duration)) el.currentTime = Math.min(Math.max(0, t), el.duration); };
  const volume = v => { el.volume = Math.min(1, Math.max(0, v)); Store.setting('vol', el.volume); };
  function shuffle() { st.shuffle = !st.shuffle; const cur = order[idx]; buildOrder(st.shuffle ? cur : cur); if (!st.shuffle) idx = cur; else { order = order.filter(i => i !== cur); order.unshift(cur); idx = 0; } emit(); }
  function repeat() { st.repeat = st.repeat === 'off' ? 'all' : st.repeat === 'all' ? 'one' : 'off'; emit(); }

  el.addEventListener('timeupdate', emit);
  el.addEventListener('play', emit);
  el.addEventListener('pause', emit);
  el.addEventListener('loadedmetadata', async () => {
    const s = queue[order[idx]];
    if (s && (!s.duration || Math.abs(s.duration - el.duration) > 1) && isFinite(el.duration)) {
      s.duration = el.duration; await Store.saveSong(s);
    }
    emit();
  });
  el.addEventListener('ended', () => next(true));
  el.addEventListener('error', () => { Toast('پخش این فایل ممکن نیست'); });

  return { on, state, play, toggle, next, prev, seek, volume, shuffle, repeat, el,
    setQueue: (l, i, p) => play(l, i, p) };
})();
