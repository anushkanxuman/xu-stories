// How long someone spends here: in total, and on each video. Active time only.
// It counts while the tab is visible AND (a video is playing OR they touched the page lately), so a forgotten
// tab doesn't keep counting. Saved on the device; review.js sends it to the backend when there is one.
(() => {
  'use strict';
  const KEY = 'xs-time-v1';
  const IDLE_MS = 60 * 1000;          // nothing playing + no input for this long -> pause the clock
  const IDLE_PLAYING_MS = 5 * 60 * 1000; // a video loops on its own, so give it longer before assuming nobody is there
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked: keep counting in memory */ } };

  let data = read();
  if (!data || typeof data.totalMs !== 'number') data = { totalMs: 0, sessions: 0, perVideo: {}, firstSeen: Date.now() };
  data.watch = data.watch || {};
  data.sessions += 1; data.lastSeen = Date.now(); write();

  let current = null, lastInput = Date.now(), last = performance.now(), sinceSave = 0;
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((e) => addEventListener(e, () => { lastInput = Date.now(); }, { passive: true }));
  document.addEventListener('drop:active', (e) => { current = e.detail.video.id; });

  // how much of each video was seen (furthest point reached) and how many times it played to the end
  const onVideo = (e, fn) => {
    const c = window.drop && window.drop.current && window.drop.current();
    if (c && e.target === c.el) fn(c, data.watch[c.id] || (data.watch[c.id] = { pct: 0, done: 0 }));
  };
  document.addEventListener('timeupdate', (e) => onVideo(e, (c, w) => { if (c.dur) w.pct = Math.max(w.pct, Math.min(100, Math.round(c.t / c.dur * 100))); }), true);
  document.addEventListener('ended', (e) => onVideo(e, (c, w) => { w.pct = 100; w.done += 1; write(); }), true);

  function tick() {
    const now = performance.now(), dt = Math.min(now - last, 2500); // a throttled background tab must not add a huge jump
    last = now;
    if (document.visibilityState !== 'visible') return;
    const playing = !!(window.drop && window.drop.playing);
    if (Date.now() - lastInput > (playing ? IDLE_PLAYING_MS : IDLE_MS)) return;
    data.totalMs += dt; data.lastSeen = Date.now();
    if (current) data.perVideo[current] = (data.perVideo[current] || 0) + dt;
    sinceSave += dt;
    if (sinceSave >= 5000) { sinceSave = 0; write(); }
    document.dispatchEvent(new CustomEvent('drop:time', { detail: { totalMs: data.totalMs } }));
  }
  setInterval(tick, 1000);
  const flush = () => { write(); };
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);

  window.dropTime = {
    totalMs: () => data.totalMs,
    videoMs: (id) => Math.round(data.perVideo[id] || 0),
    watch: (id) => data.watch[id] || { pct: 0, done: 0 },
    snapshot: () => ({ totalMs: Math.round(data.totalMs), sessions: data.sessions, firstSeen: data.firstSeen, lastSeen: data.lastSeen,
      perVideo: Object.fromEntries(Object.entries(data.perVideo).map(([k, v]) => [k, Math.round(v)])), watch: data.watch }),
    format(ms) { // 75000 -> "1:15", 3725000 -> "1:02:05"
      const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      const p = (n) => String(n).padStart(2, '0');
      return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
    },
    reset() { data = { totalMs: 0, sessions: 1, perVideo: {}, watch: {}, firstSeen: Date.now(), lastSeen: Date.now() }; write(); },
  };
})();
