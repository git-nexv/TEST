/* Liquid-glass tab bar: drag left/right for the bubble + zoom + glass stretch */
const TabBar = (() => {
  const bar = document.getElementById('tabbar');
  const lens = document.getElementById('lens');
  const tabs = [...bar.querySelectorAll('.tab')];
  let rects = [], barRect = null, active = 0;
  let x = 0, vx = 0, target = 0, w = 70, targetW = 70, scale = 1, targetScale = 1;
  let dragging = false, moved = false, grabDX = 0, raf = 0, lastT = 0;
  const listeners = [];

  const measure = () => {
    barRect = bar.getBoundingClientRect();
    rects = tabs.map(t => { const r = t.getBoundingClientRect(); return { c: r.left - barRect.left + r.width / 2, w: r.width }; });
    w = targetW = Math.min(rects[0].w - 6, 92);
    if (!dragging) { target = rects[active].c; x = target; }
    apply();
  };

  function nearest(px) {
    let best = 0, bd = 1e9;
    rects.forEach((r, i) => { const d = Math.abs(r.c - px); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function apply() {
    lens.style.width = w + 'px';
    lens.style.transform = `translateX(${x - w / 2}px) scale(${scale}, ${dragging ? 1.06 : 1})`;
    // dock-style magnification of the icons
    tabs.forEach((t, i) => {
      const d = Math.abs(rects[i] ? rects[i].c - x : 999);
      const k = dragging ? Math.exp(-((d / 54) ** 2)) : 0;
      t.style.transform = `translateY(${-8 * k}px) scale(${1 + 0.34 * k})`;
      t.classList.toggle('hot', dragging && k > 0.55);
    });
  }

  function tick(t) {
    const dt = Math.min(34, t - (lastT || t)); lastT = t;
    const k = 0.26, damp = 0.72;                    // spring
    const a = (target - x) * k;
    vx = (vx + a) * damp;
    x += vx;
    const stretch = Math.min(46, Math.abs(vx) * 2.6);          // squash & stretch
    const tw = targetW + (dragging ? stretch : 0);
    w += (tw - w) * 0.3;
    scale += ((dragging ? 1.16 : 1) - scale) * 0.22;
    apply();
    if (Math.abs(vx) > 0.05 || Math.abs(target - x) > 0.4 || Math.abs(w - tw) > 0.4 || Math.abs(scale - (dragging ? 1.16 : 1)) > .003) {
      raf = requestAnimationFrame(tick);
    } else { x = target; vx = 0; raf = 0; apply(); }
  }
  const kick = () => { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); } };

  function setActive(i, fire = true) {
    active = i;
    tabs.forEach((t, j) => t.classList.toggle('active', j === i));
    target = rects[i] ? rects[i].c : target;
    kick();
    if (fire) listeners.forEach(f => f(tabs[i].dataset.tab));
    if (navigator.vibrate) try { navigator.vibrate(7); } catch (e) {}
  }

  bar.addEventListener('pointerdown', e => {
    measure();
    const px = e.clientX - barRect.left;
    dragging = true; moved = false;
    grabDX = Math.abs(px - x) < w ? px - x : 0;
    if (!grabDX) target = px;
    bar.classList.add('dragging'); lens.classList.add('wobble');
    bar.setPointerCapture(e.pointerId);
    kick();
  });

  bar.addEventListener('pointermove', e => {
    if (!dragging) return;
    const px = e.clientX - barRect.left;
    if (Math.abs(px - (x + grabDX)) > 2) moved = true;
    let t = px - grabDX;
    const min = rects[0].c, max = rects[rects.length - 1].c;
    if (t < min) t = min - (min - t) * 0.42;                    // rubber band
    if (t > max) t = max + (t - max) * 0.42;
    target = t;
    const n = nearest(t);
    if (n !== active) setActive(n);
    kick();
  });

  const end = e => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('dragging');
    setTimeout(() => lens.classList.remove('wobble'), 260);
    const px = (e.clientX || 0) - (barRect ? barRect.left : 0);
    const i = nearest(moved ? x : px);
    setActive(i, true);
    kick();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) setActive(tabs.indexOf(t)); });
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', () => setTimeout(measure, 250));

  return {
    init() { measure(); setActive(0, false); },
    onChange: f => listeners.push(f),
    select: name => { const i = tabs.findIndex(t => t.dataset.tab === name); if (i >= 0) setActive(i); }
  };
})();
