(() => {
  const $ = (id) => document.getElementById(id);
  window.dropNums = /[?&]nums\b/.test(location.search); // #N video numbers are hidden unless the URL has ?nums=1
  const feed = $('feed'), muteBtn = $('mute'), empty = $('empty');

  let videos = [], slides = [];
  let active = -1;
  let track;
  let muted = false;       // user's choice
  let autoMuted = false;   // muted only because the browser blocked sound

  const fit = (s, w, h) => { if (w && h) s.classList.toggle('land', w > h); }; // landscape videos stay uncropped
  const mod = (a, n) => ((a % n) + n) % n;
  const vid = (i) => slides[i].querySelector('video');
  const icon = () => { muteBtn.textContent = (muted || autoMuted) ? '🔇' : '🔊'; };

  /* ---------- build ---------- */
  function build() {
    feed.innerHTML = '';
    track = document.createElement('div'); track.className = 'track'; feed.appendChild(track);
    slides = videos.map((v, i) => {
      const s = document.createElement('div');
      s.className = 'slide'; s.style.top = i * 100 + '%';
      s.innerHTML = '<video playsinline preload="none"></video><div class="shade"></div><div class="num"></div><span class="mark" hidden></span>' +
        '<div class="info"><div class="user"><div class="avatar"><span>X</span></div><span class="uname">xu.stories</span></div>' +
        '<p class="cap"></p><div class="audio">♪ Original audio</div></div>' +
        '<div class="bar"><i></i></div><div class="flash"><svg viewBox="0 0 24 24"><path d="M7 4.500v15l13-7.500z"/></svg></div>';
      const video = s.querySelector('video');
      if (v.poster) {
        video.poster = v.poster;
        const im = new Image(); im.onload = () => fit(s, im.naturalWidth, im.naturalHeight); im.src = v.poster;
      }
      video.addEventListener('loadedmetadata', () => fit(s, video.videoWidth, video.videoHeight));
      const num = s.querySelector('.num'); num.textContent = '#' + v.n; num.hidden = !window.dropNums;
      const cap = s.querySelector('.cap');
      cap.textContent = v.caption || v.description || `Xu's Stories · Video ${v.n}`;
      cap.addEventListener('click', () => cap.classList.toggle('open')); // tap to read the full caption
      s.querySelector('video').draggable = false;
      video.addEventListener('timeupdate', () => {
        if (video.duration) s.querySelector('.bar i').style.width = video.currentTime / video.duration * 100 + '%';
      });
      video.addEventListener('ended', () => goTo(i + 1 < slides.length ? i + 1 : 0));
      track.appendChild(s);
      return s;
    });
    setActive(0); place(false);
  }

  /* ---------- paging (drag / wheel / keys) ---------- */
  function setActive(i) {
    if (i === active || i < 0) return;
    active = i;
    slides.forEach((s) => s.querySelector('.flash').classList.remove('show'));
    slides.forEach((s, k) => { // only keep the neighbours loaded
      const v = vid(k), near = Math.abs(k - i) <= 1;
      if (near && !v.getAttribute('src')) v.src = videos[k].src;
      if (!near && v.getAttribute('src') && Math.abs(k - i) > 2) { v.pause(); v.removeAttribute('src'); v.load(); }
      if (k !== i) { v.pause(); }
    });
    const v = vid(i); v.currentTime = 0; v.muted = muted;
    play(v);
    document.dispatchEvent(new CustomEvent('drop:active', { detail: { index: i, total: slides.length, video: videos[i] } }));
  }

  // Browsers block sound before the first click, so fall back to muted autoplay.
  function play(v) {
    v.play().catch(() => {
      v.muted = true; autoMuted = true; icon();
      v.play().catch(() => {});
    });
  }

  function toggle(i) {
    const v = vid(i), f = slides[i].querySelector('.flash');
    if (v.paused) play(v); else v.pause();
    f.classList.toggle('show', v.paused);
  }

  const tap = () => toggle(active); // single tap = pause / play

  function place(anim, dy = 0) {
    track.classList.toggle('no-anim', !anim);
    track.style.transform = `translateY(${-active * feed.clientHeight + dy}px)`;
  }
  function goTo(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    setActive(i); place(true);
  }

  let drag = null;
  feed.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .cap')) return;
    drag = { y: e.clientY, t: performance.now(), dy: 0, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    let dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) > 6) { drag.moved = true; feed.classList.add('dragging'); feed.setPointerCapture(e.pointerId); }
    if (!drag.moved) return;
    if ((active === 0 && dy > 0) || (active === slides.length - 1 && dy < 0)) dy *= 0.35; // rubber band at the ends
    drag.dy = dy; place(false, dy);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; feed.classList.remove('dragging');
    if (!d.moved) { tap(e); return; }
    const v = d.dy / Math.max(1, performance.now() - d.t); // px per ms
    const far = Math.abs(d.dy) > feed.clientHeight * 0.12 || Math.abs(v) > 0.35;
    goTo(far ? active + (d.dy < 0 ? 1 : -1) : active);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  let wheelLock = false, wheelTimer = 0;
  feed.addEventListener('wheel', (e) => {
    e.preventDefault();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelLock = false; }, 140); // unlocks once the trackpad inertia stops
    if (wheelLock || Math.abs(e.deltaY) < 4) return;
    wheelLock = true;
    goTo(active + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  /* ---------- controls ---------- */
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (autoMuted) { autoMuted = false; muted = false; } else muted = !muted;
    if (active >= 0) vid(active).muted = muted;
    icon();
  });
  window.addEventListener('pointerdown', () => { // first click allows sound again
    if (autoMuted) { autoMuted = false; if (active >= 0) vid(active).muted = muted; icon(); }
  }, { capture: true });
  window.addEventListener('keydown', (e) => {
    if (!slides.length) return;
    if (e.target.closest && e.target.closest('.review, input, textarea, select, [contenteditable]')) return; // typing and panel controls keep their keys
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goTo(active + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goTo(active - 1); }
    else if (e.key === ' ' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); toggle(active); }
  });
  window.addEventListener('resize', () => { if (active >= 0) place(false); });

  /* ---------- small API for the review panel ---------- */
  const api = window.drop = {
    ready: false,
    get videos() { return videos; },
    get index() { return active; },
    current() { // the video on screen, for the analytics
      if (active < 0) return null;
      const v = vid(active);
      return { id: videos[active].id, el: v, t: v.currentTime, dur: v.duration };
    },
    get playing() { return active >= 0 && !vid(active).paused && !vid(active).ended; },
    goTo,
    burst(emoji) { // quick emoji pop on the video that is playing
      if (active < 0) return;
      const p = document.createElement('div');
      p.className = 'pop'; p.textContent = emoji;
      slides[active].appendChild(p); setTimeout(() => p.remove(), 900);
    },
    mark(id, emoji, status) { // small reaction chip next to the #N badge
      const k = videos.findIndex((v) => v.id === id);
      if (k < 0) return;
      const m = slides[k].querySelector('.mark');
      m.hidden = !emoji; m.textContent = emoji || ''; m.dataset.status = status || '';
    },
  };

  /* ---------- shared bits for the stats column and the gallery ---------- */
  window.dropThumb = (dir) => { // small thumbs up / down icon
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'th');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm2 9V10.5l3.5-6.2a1.6 1.6 0 0 1 3 .8L15 9h4.6a2 2 0 0 1 2 2.4l-1.3 6.8a2.5 2.5 0 0 1-2.5 1.8H9z');
    if (dir === 'down') p.setAttribute('transform', 'rotate(180 12 12)');
    s.appendChild(p); return s;
  };
  window.dropMine = (id) => { const r = window.dropReviews && window.dropReviews().get(id); return r || {}; };

  /* ---------- gallery: every video as a tile with its likes / dislikes, filters on top ---------- */
  const galBtn = document.createElement('button');
  galBtn.className = 'gal-btn'; galBtn.type = 'button'; galBtn.textContent = '▦ Gallery'; galBtn.setAttribute('aria-haspopup', 'dialog');
  document.body.appendChild(galBtn);
  let gal = null, galFilter = 'all', galSort = 'order';
  const closeGal = () => { if (gal) { gal.remove(); gal = null; galBtn.focus(); } };
  const teamVotes = () => { const c = window.dropCommunity; return c && c.ready && c.votes ? c : null; };
  const chip = (txt, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'gal-chip' + (on ? ' on' : ''); b.textContent = txt; b.addEventListener('click', fn); return b; };
  const pill = (dir, n) => { const s = document.createElement('span'); s.className = 'gv ' + dir; s.append(window.dropThumb(dir), document.createTextNode(String(n))); return s; };

  function drawGal() {
    if (!gal) return;
    const team = teamVotes(), mine = (v) => window.dropMine(v.id);
    const all = videos.map((v, i) => ({ v, i, m: mine(v), t: team ? team.votes[v.id] || { up: 0, down: 0 } : null }));
    let up = 0, down = 0, rated = 0;
    all.forEach((x) => { if (x.m.vote === 'up') up++; else if (x.m.vote === 'down') down++; if (x.m.reaction || x.m.submittedAt) rated++; });

    gal.querySelector('.gal-sum').replaceChildren(
      ...[['YOU', pill('up', up), pill('down', down)], team ? ['TEAM', pill('up', team.totals.up), pill('down', team.totals.down)] : null]
        .filter(Boolean).map(([k, a, b]) => { const d = document.createElement('div'); d.className = 'gal-sum-box'; const l = document.createElement('span'); l.textContent = k; d.append(l, a, b); return d; }),
      Object.assign(document.createElement('div'), { className: 'gal-sum-box', textContent: `${rated} / ${videos.length} reviewed` }));
    if (!team) { const n = document.createElement('p'); n.className = 'gal-note'; n.textContent = (window.dropCommunity && window.dropCommunity.needed) ? `Team likes and dislikes unlock after ${window.dropCommunity.needed} reviewers (${window.dropCommunity.reviewers} so far).` : 'Team likes and dislikes show here once the team server has enough reviewers.'; gal.querySelector('.gal-sum').appendChild(n); }

    const filters = [['all', 'ALL'], ['up', 'LIKED'], ['down', 'DISLIKED'], ['todo', 'NOT REVIEWED']];
    const bar = gal.querySelector('.gal-filters');
    bar.replaceChildren(...filters.map(([k, t]) => chip(t, galFilter === k, () => { galFilter = k; drawGal(); })));
    if (team) bar.append(chip('MOST LIKED FIRST', galSort === 'liked', () => { galSort = galSort === 'liked' ? 'order' : 'liked'; drawGal(); }));

    let list = all.filter((x) => galFilter === 'all' || (galFilter === 'up' ? x.m.vote === 'up' : galFilter === 'down' ? x.m.vote === 'down' : !(x.m.reaction || x.m.submittedAt)));
    if (galSort === 'liked' && team) list = list.slice().sort((a, b) => (b.t.up - b.t.down) - (a.t.up - a.t.down) || a.i - b.i);
    const grid = gal.querySelector('.gal-grid');
    grid.replaceChildren();
    if (!list.length) { const e = document.createElement('p'); e.className = 'gal-note'; e.textContent = 'Nothing here yet.'; grid.appendChild(e); return; }
    list.forEach(({ v, i, m, t }) => {
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'gal-tile' + (i === active ? ' on' : '') + (m.vote ? ' v-' + m.vote : '');
      if (v.poster) { const im = document.createElement('img'); im.src = v.poster; im.alt = ''; im.loading = 'lazy'; tile.appendChild(im); }
      const votes = document.createElement('span'); votes.className = 'gal-votes';
      // like Instagram: a count after each icon, always shown. Team totals once the server has enough reviewers, else this device's own vote.
      const n = t || { up: m.vote === 'up' ? 1 : 0, down: m.vote === 'down' ? 1 : 0 };
      const pu = pill('up', n.up), pd = pill('down', n.down);
      if (m.vote === 'up') pu.classList.add('mine'); if (m.vote === 'down') pd.classList.add('mine'); // your own vote is lit
      votes.append(pu, pd);
      const mk = slides[i] && slides[i].querySelector('.mark');
      if (mk && !mk.hidden) { const e = document.createElement('span'); e.className = 'gal-mark'; e.textContent = mk.textContent; tile.appendChild(e); }
      const c = document.createElement('span'); c.className = 'gal-cap'; c.textContent = (window.dropNums ? '#' + v.n + ' ' : '') + (v.caption || `Video ${i + 1}`);
      const foot = document.createElement('span'); foot.className = 'gal-foot'; foot.append(c, votes);
      tile.appendChild(foot);
      tile.addEventListener('click', () => { const k = i; closeGal(); goTo(k); });
      grid.appendChild(tile);
    });
  }
  document.addEventListener('drop:community', drawGal);
  document.addEventListener('drop:review', drawGal);

  galBtn.addEventListener('click', () => {
    if (gal || !videos.length) return;
    gal = document.createElement('div'); gal.className = 'gal'; gal.setAttribute('role', 'dialog'); gal.setAttribute('aria-modal', 'true'); gal.setAttribute('aria-label', 'All videos');
    const head = document.createElement('div'); head.className = 'gal-head';
    const h = document.createElement('h2'); h.textContent = `All videos (${videos.length})`;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost'; x.textContent = 'CLOSE'; x.addEventListener('click', closeGal);
    head.append(h, x);
    const sum = document.createElement('div'); sum.className = 'gal-sum';
    const filters = document.createElement('div'); filters.className = 'gal-filters';
    const grid = document.createElement('div'); grid.className = 'gal-grid';
    gal.append(head, sum, filters, grid); document.body.appendChild(gal);
    drawGal();
    if (window.dropRefreshCommunity) setTimeout(window.dropRefreshCommunity, 900); // let this device's last votes reach the server first
    const on = grid.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' });
    x.focus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGal(); });

  // local server only: a link to the "Add video" tab (the staging / static copies have no admin route, so it stays hidden there)
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) fetch('/api/admin/ping').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.admin) return;
    const l = document.createElement('a'); l.className = 'gal-btn add-btn'; l.href = '/add.html'; l.textContent = '+ Add video'; document.body.appendChild(l);
  }).catch(() => {});

  /* ---------- how it's made (eye icon) ---------- */
  const eye = $('eye'), made = $('made');
  let madeCfg = { types: {}, groups: [], videos: {} };
  window.dropSteps = (v) => stepsFor(v); // the tools behind a video, for the tech analytics
  const stepsFor = (v) => {
    if (!v) return null;
    const own = madeCfg.videos[v.n] || madeCfg.videos[v.id];
    const g = madeCfg.groups.find((x) => v.n >= x.from && v.n <= x.to);
    const pick = own || (g && g.type);
    return typeof pick === 'string' ? madeCfg.types[pick] || null : (pick && pick.steps) || null;
  };
  function closeMade() { made.hidden = true; eye.classList.remove('on'); }
  function refreshEye() {
    closeMade();
    eye.hidden = !stepsFor(videos[active]);
  }
  eye.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!made.hidden) { closeMade(); return; }
    const v = videos[active], steps = stepsFor(v);
    if (!steps) return;
    made.replaceChildren();
    steps.forEach((st) => { // one small chip per step: "Script · ChatGPT"
      const r = document.createElement('span'); r.className = 'made-chip';
      const a = document.createElement('i'); a.textContent = st.label;
      const b = document.createElement('b'); b.textContent = st.tool;
      r.append(a, b); made.appendChild(r);
    });
    made.hidden = false; eye.classList.add('on');
  });
  made.addEventListener('pointerdown', (e) => e.stopPropagation());
  made.addEventListener('click', closeMade);
  document.addEventListener('drop:active', refreshEye);

  /* ---------- new drops are spread through the feed ---------- */
  // Videos flagged "mix" in captions.json are placed at even gaps among the rest (same order for everyone),
  // instead of piling up at the end. The others keep their original order and every video keeps its own #N.
  function spreadMixed(list) {
    const base = list.filter((v) => !v.mix), extra = list.filter((v) => v.mix);
    if (!extra.length) return list;
    const total = base.length + extra.length, out = [];
    let b = 0, e = 0;
    for (let pos = 0; pos < total; pos++) {
      if (e < extra.length && pos === Math.floor((e + 1) * total / (extra.length + 1))) out.push(extra[e++]);
      else out.push(base[b++]);
    }
    return out;
  }

  /* ---------- boot ---------- */
  Promise.all([
    fetch((window.DROP_BASE || '/') + 'videos.json').then((r) => r.json()),
    fetch((window.DROP_BASE || '/') + 'captions.json').then((r) => r.json()).catch(() => ({})),
    fetch((window.DROP_BASE || '/') + 'made-with.json').then((r) => r.json()).catch(() => null),
  ]).then(([list, caps, mw]) => {
    if (mw) madeCfg = { types: mw.types || {}, groups: mw.groups || [], videos: mw.videos || {} };
    const at = (u) => (u ? (window.DROP_BASE || '/') + u.replace(/^\//, '') : u); // lets the site live under a sub-path (staging)
    videos = list.map((v, k) => ({ ...v, src: at(v.src), poster: at(v.poster), n: k + 1, caption: (caps[v.id] || {}).caption, hidden: (caps[v.id] || {}).hidden, mix: (caps[v.id] || {}).mix }))
      .filter((v) => !v.hidden);
    videos = spreadMixed(videos);
    if (!videos.length) { empty.hidden = false; return; }
    build(); icon(); refreshEye(); feed.focus({ preventScroll: true });
    api.ready = true;
    document.dispatchEvent(new CustomEvent('drop:ready', { detail: { videos } }));
  }).catch(() => { empty.hidden = false; empty.textContent = 'Could not load videos.'; });
})();
