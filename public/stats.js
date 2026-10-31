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

  const ASPECTS = [['reaction', 'First look'], ['secondary', 'Follow-up'], ['creative', 'Creativity'], ['clarity', 'Did it land'], ['style', 'Visual'], ['fix', 'The fix']];
  const vrow = (label, up, down, bold) => { // label ... 👍 n  👎 n, with a green / pink split bar underneath
    const r = el('div', 'st-vrow' + (bold ? ' bold' : '')), tot = up + down;
    const a = el('span', 'gv up'), b = el('span', 'gv down');
    a.append(window.dropThumb('up'), document.createTextNode(String(up))); b.append(window.dropThumb('down'), document.createTextNode(String(down)));
    r.append(el('span', 'st-vl', label), a, b);
    if (tot) { const bar = el('div', 'st-split'), f = el('i'); f.style.width = (up / tot * 100) + '%'; bar.append(f); r.append(bar); }
    return r;
  };

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

    // YOUR VOTES (optional likes / dislikes, overall and per question)
    const mineAll = [...(window.dropReviews ? window.dropReviews().values() : [])];
    let up = 0, down = 0; const asp = {};
    mineAll.forEach((x) => { if (x.vote === 'up') up++; else if (x.vote === 'down') down++; Object.entries(x.votes || {}).forEach(([k, d]) => { (asp[k] = asp[k] || { up: 0, down: 0 })[d]++; }); });
    const v = card('YOUR VOTES');
    v.append(vrow('Videos', up, down, true), ...ASPECTS.filter(([k]) => asp[k]).map(([k, label]) => vrow(label, asp[k].up, asp[k].down)));
    if (!up && !down && !Object.keys(asp).length) v.append(el('p', 'st-sub', 'Tap 👍 or 👎 anywhere in the review. Optional.'));

    // YOUR TRACE: one dot per video, in feed order; tap to jump there
    const trace = card('YOUR TRACE'), grid = el('div', 'tr-grid');
    let seen = 0, finished = 0, pctSum = 0;
    (window.drop ? window.drop.videos : []).forEach((vd, i) => {
      const w = window.dropTime ? window.dropTime.watch(vd.id) : { pct: 0, done: 0 }, m = window.dropMine ? window.dropMine(vd.id) : {};
      const state = m.vote === 'up' ? 'up' : m.vote === 'down' ? 'down' : (m.reaction || m.submittedAt) ? 'rev' : w.pct > 0 ? 'seen' : 'new';
      if (w.pct > 0) { seen++; pctSum += w.pct; } if (w.done) finished++;
      const d = el('button', 'tr-dot ' + state); d.type = 'button'; d.title = `Video ${i + 1}: ${w.pct}% watched`; d.setAttribute('aria-label', d.title);
      if (cur && cur.index === i) d.classList.add('now');
      d.addEventListener('click', () => window.drop.goTo(i));
      grid.append(d);
    });
    trace.append(grid, row('Watched', `${seen} / ${total}`), row('Avg. watched', seen ? Math.round(pctSum / seen) + '%' : '0%'), row('Played to the end', String(finished)));
    const lg = el('div', 'tr-legend'); [['new', 'new'], ['seen', 'watched'], ['rev', 'reviewed'], ['up', 'liked'], ['down', 'disliked']].forEach(([c, tx]) => { const s = el('span'); s.append(el('i', 'tr-dot ' + c), tx); lg.append(s); });
    trace.append(lg);

    const nodes = [p, t, r, g, v, trace];
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
    if (community && community.ready && community.totals) {
      const tm = card('TEAM VOTES');
      tm.append(vrow('Videos', community.totals.up, community.totals.down, true), ...ASPECTS.filter(([k]) => community.aspects && community.aspects[k]).map(([k, label]) => vrow(label, community.aspects[k].up, community.aspects[k].down)));
      nodes.push(tm);
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
  const loadCommunity = () => fetch(((document.querySelector('meta[name="review-api"]') || {}).content || '/api/reviews').replace(/\/$/, '') + '/stats').then((r) => (r.ok ? r.json() : null)).then((j) => { community = j; window.dropCommunity = j; document.dispatchEvent(new CustomEvent('drop:community')); soon(); }).catch(() => {});
  window.dropRefreshCommunity = loadCommunity; // the gallery asks for fresh team numbers when it opens
  loadCommunity(); setInterval(loadCommunity, 60000);
})();
