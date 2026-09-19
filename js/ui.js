/* views, lists, sheets */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = n => `<svg viewBox="0 0 24 24" class="ico"><use href="#i-${n}"/></svg>`;
const fmt = t => { if (!isFinite(t) || t < 0) return '--:--'; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };

let toastT;
function Toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2300);
}

const Sheet = {
  open(html) {
    const s = $('#sheet'); $('.sheet-card', s).innerHTML = html;
    s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
    return $('.sheet-card', s);
  },
  close() { const s = $('#sheet'); s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }
};
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') Sheet.close(); });

const UI = (() => {
  const views = { home: $('[data-view=home]'), radio: $('[data-view=radio]'), library: $('[data-view=library]'), search: $('[data-view=search]') };
  let libRoute = { page: 'root' };
  let cache = { songs: [], playlists: [] };

  function show(name) {
    Object.entries(views).forEach(([k, v]) => v.classList.toggle('active', k === name));
    if (name === 'library') renderLibrary();
    if (name === 'home') renderHome();
    if (name === 'search') renderSearch();
    if (name === 'radio') renderRadio();
    window.scrollTo({ top: 0 });
  }

  async function refresh() {
    cache.songs = await Store.songs();
    cache.playlists = await Store.playlists();
  }

  const artOf = s => s.art
    ? `<img src="${s.art}" alt="">`
    : ic('note');

  const songRow = (s, i, ctx) => `
    <div class="row song" data-song="${s.id}" data-i="${i}" data-ctx="${ctx || ''}">
      <div class="thumb">${artOf(s)}</div>
      <div class="meta"><b>${esc(s.title)}</b><small>${esc(s.artist)}${s.duration ? ' · ' + fmt(s.duration) : ''}</small></div>
      <button class="act" data-more="${s.id}" aria-label="More">•••</button>
    </div>`;

  /* ---------------- Home ---------------- */
  function renderHome() {
    const recent = [...cache.songs].sort((a, b) => b.added - a.added).slice(0, 8);
    views.home.innerHTML = `
      <div class="promo">${ic('note')}<div><b>Noam Nex V Music</b><small>موزیک پلیر آفلاین شما</small></div><div class="go">${ic('chev')}</div></div>
      <div class="h1">Home<div class="avatar">KS</div></div>
      ${recent.length ? `
      <div class="h2">Recently Added</div>
      <div class="rail">${recent.map((s, i) => `
        <div class="item sm song" data-song="${s.id}" data-i="${i}" data-ctx="recent">
          <div class="art">${artOf(s)}</div>
          <div class="cap"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></div>
        </div>`).join('')}</div>` : `
      <div class="empty">${ic('note')}هنوز آهنگی اضافه نشده<br><br>
        <button class="btn primary" data-act="import">${ic('plus')} افزودن آهنگ</button></div>`}
      <div class="h2">Made For You</div>
      <div class="rail">
        ${['Favorites Mix|g1', 'Chill Mix|g2', 'New Music|g3', 'Get Up!|g4'].map(v => { const [n, g] = v.split('|');
          return `<div class="item sm" data-act="mix" data-mix="${n}"><div class="art ${g}">${ic('note')}</div><div class="cap"><b>${n}</b><small>ساخته‌شده از کتابخانه شما</small></div></div>`; }).join('')}
      </div>
      ${cache.playlists.length ? `<div class="h2">Your Playlists</div>
      <div class="rail">${cache.playlists.map((p, i) => `
        <div class="item sm" data-open-pl="${p.id}"><div class="art g${(i % 6) + 1}">${ic('note')}</div>
        <div class="cap"><b>${esc(p.name)}</b><small>${p.songs.length} آهنگ</small></div></div>`).join('')}</div>` : ''}
      <div class="h2">کتابخانه محلی</div>
      <div class="btnbar">
        <button class="btn primary" data-act="import">${ic('plus')} افزودن آهنگ</button>
        <button class="btn" data-act="import-folder">${ic('folder')} افزودن پوشه</button>
        <button class="btn" data-act="newpl">${ic('list')} پلی‌لیست جدید</button>
      </div>
      <div class="empty" style="padding:18px 22px;text-align:start" id="storageInfo"></div>`;
    storageInfo();
  }

  async function storageInfo() {
    const box = $('#storageInfo'); if (!box) return;
    const u = await Store.usage();
    const mb = n => (n / 1048576).toFixed(1) + ' MB';
    box.innerHTML = `پوشه برنامه: <b>${Store.paths.ROOT}/${Store.paths.SONGS}</b> · پلی‌لیست‌ها: <b>${Store.paths.ROOT}/${Store.paths.PLISTS}</b><br>
      ${cache.songs.length} آهنگ · ${cache.playlists.length} پلی‌لیست${u.usage ? ' · ' + mb(u.usage) + ' استفاده‌شده' : ''}
      ${Store.opfs ? '' : '<br>(ذخیره‌سازی پشتیبان روی IndexedDB)'}`;
  }

  /* ---------------- Radio ---------------- */
  function renderRadio() {
    const tiles = [['1', '#e02020', 'Music Radio'], ['HITS<br>HITS<br>HITS', '#2b6cff', 'Music Radio'], ['COUNTRY', '#1b2ea0', 'Music Radio'],
      ['MÚSICA<br>UNO', '#e6247a', 'Music Radio'], ['club', '#111', 'Music Radio'], ['Chill', '#2f8fff', 'Music Radio']];
    views.radio.innerHTML = `
      <div class="promo">${ic('note')}<div><b>Music</b><small>Get 3 months free.</small></div><div class="go">${ic('chev')}</div></div>
      <div class="h1">Radio<div class="avatar">KS</div></div>
      <div class="grid3">${tiles.map(([t, c]) => `<div class="card-sq"><span style="color:${c}">${t}</span><em>Music Radio</em></div>`).join('')}</div>
      <div class="h2">Listen to Live Radio for Free</div>
      <div class="rail">
        ${['The Estelle Show|g5', 'Apple Music Hits|g2', 'Late Night Mix|g1'].map(v => { const [n, g] = v.split('|');
        return `<div class="item"><div class="art ${g}">${ic('radio')}</div><div class="cap"><b>${n}</b><small>Music 1 · 22:30 – 00:30</small></div></div>`; }).join('')}
      </div>
      <div class="empty">رادیو به اینترنت نیاز دارد؛ کتابخانه محلی شما همیشه آفلاین در دسترس است.</div>`;
  }

  /* ---------------- Library ---------------- */
  function go(route) { libRoute = route; renderLibrary(); }

  function renderLibrary() {
    const v = views.library;
    const head = (title, back) => `<div class="h1">${back ? `<button class="btn" data-back style="margin-inline-end:10px">‹</button>` : ''}${esc(title)}<div class="avatar">KS</div></div>`;

    if (libRoute.page === 'root') {
      v.innerHTML = head('Library') + `
        <div class="rows">
          <div class="row big" data-go="playlists">${ic('list')}<div class="meta"><b>Playlists</b></div><div class="chev">${ic('chev')}</div></div>
          <div class="row big" data-go="artists">${ic('mic')}<div class="meta"><b>Artists</b></div><div class="chev">${ic('chev')}</div></div>
          <div class="row big" data-go="albums">${ic('library')}<div class="meta"><b>Albums</b></div><div class="chev">${ic('chev')}</div></div>
          <div class="row big" data-go="songs">${ic('note')}<div class="meta"><b>Songs</b></div><div class="chev">${ic('chev')}</div></div>
          <div class="row big" data-go="files">${ic('folder')}<div class="meta"><b>Files &amp; Import</b></div><div class="chev">${ic('chev')}</div></div>
        </div>
        <div class="btnbar">
          <button class="btn primary" data-act="import">${ic('plus')} افزودن آهنگ</button>
          <button class="btn" data-act="newpl">${ic('list')} پلی‌لیست جدید</button>
        </div>`;
      return;
    }
    if (libRoute.page === 'songs') {
      v.innerHTML = head('Songs', 1) + (cache.songs.length
        ? `<div class="btnbar"><button class="btn" data-act="playall">${ic('play')} پخش همه</button>
             <button class="btn" data-act="shuffleall">${ic('shuffle')} تصادفی</button></div>
           <div class="rows">${cache.songs.map((s, i) => songRow(s, i, 'songs')).join('')}</div>`
        : emptyImport());
      return;
    }
    if (libRoute.page === 'playlists') {
      v.innerHTML = head('Playlists', 1) + `
        <div class="btnbar"><button class="btn primary" data-act="newpl">${ic('plus')} پلی‌لیست جدید</button></div>` +
        (cache.playlists.length ? `<div class="rows">${cache.playlists.map(p => `
          <div class="row" data-open-pl="${p.id}">
            <div class="thumb">${ic('list')}</div>
            <div class="meta"><b>${esc(p.name)}</b><small>${p.songs.length} آهنگ · پوشه: ${esc(p.folder)}</small></div>
            <button class="act" data-pl-more="${p.id}">•••</button>
          </div>`).join('')}</div>`
          : `<div class="empty">${ic('list')}هنوز پلی‌لیستی ندارید</div>`);
      return;
    }
    if (libRoute.page === 'playlist') {
      const p = cache.playlists.find(x => x.id === libRoute.id);
      if (!p) return go({ page: 'playlists' });
      const list = p.songs.map(id => cache.songs.find(s => s.id === id)).filter(Boolean);
      v.innerHTML = head(p.name, 1) + `
        <div class="btnbar">
          <button class="btn" data-act="play-pl" data-id="${p.id}">${ic('play')} پخش</button>
          <button class="btn" data-act="add-to-pl" data-id="${p.id}">${ic('plus')} افزودن آهنگ</button>
          <button class="btn" data-pl-more="${p.id}">•••</button>
        </div>
        <div class="empty" style="padding:6px 18px;text-align:start">پوشه: ${Store.paths.ROOT}/${Store.paths.PLISTS}/${esc(p.folder)} — از هر آهنگ یک کپی در این پوشه ساخته می‌شود.</div>
        ${list.length ? `<div class="rows">${list.map((s, i) => songRow(s, i, 'pl:' + p.id)).join('')}</div>`
          : `<div class="empty">این پلی‌لیست خالی است</div>`}`;
      return;
    }
    if (libRoute.page === 'artists' || libRoute.page === 'albums') {
      const key = libRoute.page === 'artists' ? 'artist' : 'album';
      const map = new Map();
      cache.songs.forEach(s => { const k = s[key] || 'Unknown'; map.set(k, (map.get(k) || []).concat(s)); });
      v.innerHTML = head(libRoute.page === 'artists' ? 'Artists' : 'Albums', 1) +
        (map.size ? `<div class="rows">${[...map].map(([k, l]) => `
          <div class="row" data-group="${esc(k)}" data-gkey="${key}">
            <div class="thumb">${l[0].art ? `<img src="${l[0].art}" alt="">` : ic(key === 'artist' ? 'mic' : 'library')}</div>
            <div class="meta"><b>${esc(k)}</b><small>${l.length} آهنگ</small></div>
            <div class="chev">${ic('chev')}</div></div>`).join('')}</div>` : emptyImport());
      return;
    }
    if (libRoute.page === 'group') {
      const list = cache.songs.filter(s => (s[libRoute.key] || 'Unknown') === libRoute.value);
      v.innerHTML = head(libRoute.value, 1) + `<div class="rows">${list.map((s, i) => songRow(s, i, 'group')).join('')}</div>`;
      return;
    }
    if (libRoute.page === 'files') {
      v.innerHTML = head('Files & Import', 1) + `
        <div class="btnbar">
          <button class="btn primary" data-act="import">${ic('plus')} انتخاب فایل از Files</button>
          <button class="btn" data-act="import-folder">${ic('folder')} انتخاب پوشه</button>
        </div>
        <div class="empty" style="text-align:start;padding:14px 20px">
          فایل‌های شما داخل پوشه اختصاصی برنامه ذخیره می‌شوند:<br><br>
          <b>${Store.paths.ROOT}/${Store.paths.SONGS}/</b> — همه آهنگ‌ها<br>
          <b>${Store.paths.ROOT}/${Store.paths.PLISTS}/&lt;نام پلی‌لیست&gt;/</b> — کپی آهنگ‌های همان پلی‌لیست<br><br>
          هر فایلی که اینجا ایمپورت کنید در بخش Songs ظاهر می‌شود و بدون اینترنت پخش می‌شود.
          با دکمه ••• روی هر آهنگ می‌توانید یک نسخه را به Files گوشی خروجی بگیرید.
        </div>
        <div class="rows">${cache.songs.map((s, i) => songRow(s, i, 'songs')).join('')}</div>`;
    }
  }
  const emptyImport = () => `<div class="empty">${ic('note')}کتابخانه خالی است<br><br><button class="btn primary" data-act="import">${ic('plus')} افزودن آهنگ</button></div>`;

  /* ---------------- Search ---------------- */
  let q = '';
  function renderSearch() {
    const res = q ? cache.songs.filter(s => (s.title + s.artist + s.album).toLowerCase().includes(q.toLowerCase())) : [];
    views.search.innerHTML = `
      <div class="h1">Search<div class="avatar">KS</div></div>
      <div class="searchbar">${ic('search')}<input id="q" placeholder="Artists, Songs, Lyrics, and More" value="${esc(q)}">${ic('mic')}</div>
      ${q ? (res.length ? `<div class="rows">${res.map((s, i) => songRow(s, i, 'search')).join('')}</div>`
                        : `<div class="empty">نتیجه‌ای پیدا نشد</div>`)
          : `<div class="chips">
              ${[['Hits', 'g3'], ['Pop', 'g5'], ['Hip-Hop', 'g2'], ['Country', 'g1'], ['Dance', 'g6'], ['R&B', 'g4']]
                .map(([n, g]) => `<div class="chip art ${g}">${n}</div>`).join('')}
             </div>`}`;
    const input = $('#q');
    if (input) {
      input.addEventListener('input', e => { q = e.target.value; const sel = e.target.selectionStart; renderSearch(); const n = $('#q'); n.focus(); n.setSelectionRange(sel, sel); });
    }
  }

  /* context list for a clicked row */
  function listFor(ctx) {
    if (!ctx) return cache.songs;
    if (ctx.startsWith('pl:')) {
      const p = cache.playlists.find(x => x.id === ctx.slice(3));
      return p ? p.songs.map(id => cache.songs.find(s => s.id === id)).filter(Boolean) : cache.songs;
    }
    if (ctx === 'recent') return [...cache.songs].sort((a, b) => b.added - a.added).slice(0, 8);
    if (ctx === 'search') return $$('.row.song', views.search).map(r => cache.songs.find(s => s.id === r.dataset.song)).filter(Boolean);
    if (ctx === 'group') return $$('.row.song', views.library).map(r => cache.songs.find(s => s.id === r.dataset.song)).filter(Boolean);
    return cache.songs;
  }

  return { show, refresh, renderHome, renderLibrary, renderSearch, renderRadio, go, listFor,
    get cache() { return cache; }, get route() { return libRoute; } };
})();
