// Live stats column: pace against a visible goal, time here, time on this reel, progress.
// Everything comes from this device's own data (dropTime + review counts). The "typical reviewer" line only
// appears when the server has real data from enough reviewers; nothing is estimated or made up.
(() => {
  'use strict';
  const root = document.getElementById('stats');
  if (!root) return;
  const F = (ms) => (window.dropTime ? window.dropTime.format(ms) : '0:00');
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  let pace = { secondsPerVideo: 60, label: '1 verdict per minute' };
  let total = 0, cur = null, reviewed = 0, community = null;

  const card = (title, extra) => {
    const c = el('section', 'st-card'), h = el('h3'); h.append(el('span', null, title)); if (extra) h.append(extra);
    c.append(h); return c;
  };
  const row = (k, v) => { const r = el('div', 'st-row'); r.append(el('span', null, k), el('b', null, v)); return r; };

  function render() {
    if (!total) return;
    const ms = window.dropTime ? window.dropTime.totalMs() : 0;
    const expected = Math.floor(ms / 1000 / pace.secondsPerVideo);
    const diff = reviewed - expected;

    // PACE
    const p = card('YOUR PACE', el('span', 'live', 'LIVE'));
    p.classList.add(diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'even');
    p.append(el('div', 'st-big', diff === 0 ? 'ON PACE' : Math.abs(diff) + (diff > 0 ? ' AHEAD' : ' BEHIND')),
      el('p', 'st-sub', diff === 0 ? `Right on the goal of ${pace.label}.`
        : `${Math.abs(diff)} video${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} the goal: ${pace.label}.`));

    // TIME HERE
    const t = card('TIME HERE');
    t.append(el('div', 'st-big', F(ms)), el('p', 'st-sub', 'Only counts while you are really here.'));

    // THIS DROP
    const r = card('THIS DROP', cur && window.dropNums ? el('span', 'live', '#' + cur.video.n) : null);
    if (cur) {
      const id = cur.video.id, w = window.dropTime ? window.dropTime.watch(id) : { pct: 0, done: 0 };
      r.append(el('div', 'st-big', F(window.dropTime ? window.dropTime.videoMs(id) : 0)),
        row('Watched', w.pct + '%'), row('Played to the end', w.done ? w.done + '×' : 'not yet'));
    }

    // PROGRESS
    const g = card('PROGRESS');
    const left = Math.max(0, total - reviewed);
    g.append(row('Reviewed', `${reviewed} / ${total}`), row('Left', String(left)));
    const bar = el('div', 'st-bar'), fill = el('i'); fill.style.width = (reviewed / total * 100) + '%'; bar.append(fill); g.append(bar);
    if (left) g.append(el('p', 'st-sub', `About ${Math.max(1, Math.round(left * pace.secondsPerVideo / 60))} min left at the goal pace.`));
    else g.append(el('p', 'st-sub', 'All done. Check your results.'));

    const nodes = [p, t, r, g];
    const n = el('section', 'st-card st-note-card');
    if (community && community.ready) {
      n.append(el('h3', null, 'TYPICAL REVIEWER'),
        row('Videos reviewed', String(community.medianVideos)), row('Time here', F(community.medianSeconds * 1000)),
        el('p', 'st-note', `Median of ${community.reviewers} real reviewers.`));
    } else {
      n.append(el('p', 'st-note', community && community.needed
        ? `Compare with other reviewers unlocks after ${community.needed} people have reviewed (${community.reviewers} so far).`
        : 'Your numbers stay on this device unless the team server is on.'));
    }
    nodes.push(n);
    root.replaceChildren(...nodes);
  }

  // only the numbers that move every second get repainted every second
  let raf = 0;
  const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

  document.addEventListener('drop:ready', (e) => { total = e.detail.videos.length; soon(); });
  document.addEventListener('drop:active', (e) => { cur = e.detail; total = e.detail.total; soon(); });
  document.addEventListener('drop:review', (e) => { reviewed = e.detail.reviewed; soon(); });
  document.addEventListener('drop:time', soon);
  document.addEventListener('timeupdate', (e) => { if (e.target.tagName === 'VIDEO' && cur) { const t = Date.now(); if (t - (render.lastWatch || 0) > 1000) { render.lastWatch = t; soon(); } } }, true);

  fetch((window.DROP_BASE || '/') + 'review-config.json').then((r) => r.json()).then((c) => { if (c.pace) pace = c.pace; soon(); }).catch(() => {});
  const loadCommunity = () => fetch('/api/reviews/stats').then((r) => (r.ok ? r.json() : null)).then((j) => { community = j; soon(); }).catch(() => {});
  loadCommunity(); setInterval(loadCommunity, 60000);
})();
