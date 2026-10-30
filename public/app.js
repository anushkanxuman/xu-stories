(() => {
  const $ = (id) => document.getElementById(id);
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
      s.querySelector('.num').textContent = '#' + v.n;
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

  /* ---------- how it's made (eye icon) ---------- */
  const eye = $('eye'), made = $('made');
  let madeCfg = { types: {}, groups: [], videos: {} };
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

  /* ---------- boot ---------- */
  Promise.all([
    fetch('/videos.json').then((r) => r.json()),
    fetch('/captions.json').then((r) => r.json()).catch(() => ({})),
    fetch('/made-with.json').then((r) => r.json()).catch(() => null),
  ]).then(([list, caps, mw]) => {
    if (mw) madeCfg = { types: mw.types || {}, groups: mw.groups || [], videos: mw.videos || {} };
    videos = list.map((v, k) => ({ ...v, n: k + 1, caption: (caps[v.id] || {}).caption, hidden: (caps[v.id] || {}).hidden }))
      .filter((v) => !v.hidden);
    if (!videos.length) { empty.hidden = false; return; }
    build(); icon(); refreshEye(); feed.focus({ preventScroll: true });
    api.ready = true;
    document.dispatchEvent(new CustomEvent('drop:ready', { detail: { videos } }));
  }).catch(() => { empty.hidden = false; empty.textContent = 'Could not load videos.'; });
})();
