// Live stats column: pace against a visible goal, time here, time on this reel, progress.
// Everything comes from this device's own data (dropTime + review counts). The "typical reviewer" line only
// appears when the server has real data from enough reviewers; nothing is estimated or made up.
(() => {
  'use strict';
  const root = document.getElementById('stats');
  if (!root) return;
  const F = (ms) => (window.dropTime ? window.dropTime.format(ms) : '0:00');
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  let pace = { secondsPerVideo: 60, label: '1 review per minute' };
  let total = 0, cur = null, reviewed = 0, community = null;

  const card = (title, extra) => {
    const c = el('section', 'st-card'), h = el('h3'); h.append(el('span', null, title)); if (extra) h.append(extra);
    c.append(h); return c;
  };
  const row = (k, v) => { const r = el('div', 'st-row'); r.append(el('span', null, k), el('b', null, v)); return r; };

  const ASPECTS = [['reaction', 'Idea'], ['secondary', 'Follow-up'], ['creative', 'Creativity'], ['clarity', 'Did it land'], ['style', 'Visual'], ['fix', 'The fix']];
  const vrow = (label, up, down, bold) => { // label ... 👍 n  👎 n, with a green / pink split bar underneath
    const r = el('div', 'st-vrow' + (bold ? ' bold' : '')), tot = up + down;
    const a = el('span', 'gv up'), b = el('span', 'gv down');
    a.append(window.dropThumb('up'), document.createTextNode(String(up))); b.append(window.dropThumb('down'), document.createTextNode(String(down)));
    r.append(el('span', 'st-vl', label), a, b);
    if (tot) { const bar = el('div', 'st-split'), f = el('i'); f.style.width = (up / tot * 100) + '%'; bar.append(f); r.append(bar); }
    return r;
  };

  /* WHICH TECH WINS: every like / dislike and positive / negative first impression counts for the tools used on that video.
     Uses team numbers once the server has them, otherwise only this device's own ratings. */
  const toolName = (s) => (/^kling/i.test(s) ? 'Kling' : /^seedance/i.test(s) ? 'Seedance' : s.replace(/\s*\(hook\)$/i, ''));
  function techRows(match) {
    const team = community && community.ready && community.votes ? community : null, by = {};
    (window.drop ? window.drop.videos : []).forEach((vd) => {
      const steps = (window.dropSteps && window.dropSteps(vd)) || [];
      let up = 0, down = 0, pos = 0, neg = 0;
      if (team) {
        const vv = team.votes[vd.id] || {}, tt = (team.tone && team.tone[vd.id]) || {};
        up = vv.up || 0; down = vv.down || 0; pos = tt.pos || 0; neg = tt.neg || 0;
      } else {
        const m = window.dropMine ? window.dropMine(vd.id) : {}, tn = m.reaction && window.dropTone ? window.dropTone(m.reaction) : '';
        up = m.vote === 'up' ? 1 : 0; down = m.vote === 'down' ? 1 : 0; pos = tn === 'pos' ? 1 : 0; neg = tn === 'neg' ? 1 : 0;
      }
      const seen = new Set();
      steps.filter((s) => match.test(s.label)).forEach((s) => {
        const k = toolName(s.tool); if (seen.has(k)) return; seen.add(k);
        const o = by[k] = by[k] || { tool: k, videos: 0, good: 0, total: 0 };
        o.videos++; o.good += up + pos; o.total += up + down + pos + neg;
      });
    });
    return Object.values(by).sort((a, b) => (b.total ? b.good / b.total : -1) - (a.total ? a.good / a.total : -1) || b.total - a.total);
  }
  function techCard() {
    const c = card('TOOL PERFORMANCE'), team = community && community.ready && community.votes;
    [['SCRIPT', /^script/i], ['VIDEO GEN', /^video$/i]].forEach(([title, re]) => {
      const rows = techRows(re);
      if (!rows.length) return;
      c.append(el('div', 'tc-title', title));
      rows.forEach((o, i) => {
        const pct = o.total ? Math.round(o.good / o.total * 100) : null;
        const r = el('div', 'tc-row' + (i === 0 && pct != null ? ' top' : ''));
        r.append(el('span', 'tc-name', o.tool), el('b', null, pct == null ? '–' : pct + '%'));
        const bar = el('div', 'st-bar'), f = el('i'); f.style.width = (pct || 0) + '%'; bar.append(f);
        r.append(bar, el('small', null, `${o.videos} video${o.videos === 1 ? '' : 's'} · ${o.total} rating${o.total === 1 ? '' : 's'}`));
        c.append(r);
      });
    });
    c.append(el('p', 'st-note', (team ? `Team ratings: ${community.reviewers} reviewers.` : 'Only your own ratings so far.') + ' % = likes and good first impressions out of all ratings.'));
    return c;
  }

  function render() {
    if (!total) return;
    const ms = window.dropTime ? window.dropTime.totalMs() : 0;
    const expected = Math.floor(ms / 1000 / pace.secondsPerVideo);
    const diff = reviewed - expected;

    // PROGRESS: reviews done, time spent and pace in one card
    const left = Math.max(0, total - reviewed);
    const g = card('PROGRESS', el('span', 'live', F(ms)));
    g.classList.add(diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'even');
    g.append(el('div', 'st-big', reviewed + ' / ' + total));
    const bar = el('div', 'st-bar'), fill = el('i'); fill.style.width = (reviewed / total * 100) + '%'; bar.append(fill); g.append(bar);
    g.append(row('Remaining', String(left)),
      row('Pace', diff === 0 ? 'On target' : Math.abs(diff) + (diff > 0 ? ' ahead' : ' behind')),
      row('Time left', left ? '~' + Math.max(1, Math.round(left * pace.secondsPerVideo / 60)) + ' min' : 'Done'));

    // YOUR VOTES (optional likes / dislikes, overall and per question)
    const mineAll = [...(window.dropReviews ? window.dropReviews().values() : [])];
    let up = 0, down = 0; const asp = {};
    mineAll.forEach((x) => { if (x.vote === 'up') up++; else if (x.vote === 'down') down++; Object.entries(x.votes || {}).forEach(([k, d]) => { (asp[k] = asp[k] || { up: 0, down: 0 })[d]++; }); });
    const v = card('YOUR VOTES');
    v.append(vrow('Videos', up, down, true), ...ASPECTS.filter(([k]) => asp[k]).map(([k, label]) => vrow(label, asp[k].up, asp[k].down)));
    if (!up && !down && !Object.keys(asp).length) v.append(el('p', 'st-sub', 'Like or dislike a video to see your totals here.'));

    // VIEWING HISTORY: one dot per video, in feed order; tap to jump there
    const trace = card('VIEWING HISTORY'), grid = el('div', 'tr-grid');
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

    const nodes = [g, v, techCard(), trace];
    const n = el('section', 'st-card st-note-card');
    if (community && community.ready) {
      n.append(el('h3', null, 'REVIEWER BENCHMARK'),
        row('Videos reviewed', String(community.medianVideos)), row('Time here', F(community.medianSeconds * 1000)),
        el('p', 'st-note', `Median across ${community.reviewers} reviewers.`));
    } else {
      n.append(el('p', 'st-note', community && community.needed
        ? `Compare with other reviewers unlocks after ${community.needed} people have reviewed (${community.reviewers} so far).`
        : 'Your numbers stay on this device unless the team server is on.'));
    }
    if (community && community.ready && community.totals) {
      const tm = card('TEAM VOTES');
      tm.append(vrow('Videos', community.totals.up, community.totals.down, true), ...ASPECTS.filter(([k]) => community.aspects && community.aspects[k]).map(([k, label]) => vrow(label, community.aspects[k].up, community.aspects[k].down)));
      nodes.splice(2, 0, tm);
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
