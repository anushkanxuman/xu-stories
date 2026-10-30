(() => {
  const $ = (id) => document.getElementById(id);
  const feed = $('feed'), muteBtn = $('mute'), empty = $('empty');

  let videos = [], slides = [];
  let active = -1;
  let track;
  let muted = false;       // user's choice
  let autoMuted = false;   // muted only because the browser blocked sound

  let likes = new Set();
  try { likes = new Set(JSON.parse(localStorage.getItem('xs-likes') || '[]')); } catch (e) {}
  const saveLikes = () => { try { localStorage.setItem('xs-likes', JSON.stringify([...likes])); } catch (e) {} };

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
      s.innerHTML = '<video playsinline preload="none"></video><div class="shade"></div><div class="num"></div>' +
        '<div class="info"><div class="user"><div class="avatar"><span>X</span></div><span class="uname">xu.stories</span>' +
        '<button class="follow" type="button">Follow</button></div><p class="cap"></p><div class="audio">♪ Original audio</div></div>' +
        '<div class="actions"><button class="act like" type="button" aria-label="Like"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2 0 3.7 1.1 5.4 3.1 1.7-2 3.4-3.1 5.4-3.1 3.600 0 5.800 3.700 4.200 7.300C19.500 16.400 12 21 12 21z"/></svg><span class="n"></span></button>' +
        '<div class="art"></div></div>' +
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
      s.querySelector('.like').addEventListener('click', () => setLike(i, !likes.has(v.id)));
      const fb = s.querySelector('.follow');
      fb.addEventListener('click', () => { fb.classList.toggle('on'); fb.textContent = fb.classList.contains('on') ? 'Following' : 'Follow'; });
      if (likes.has(v.id)) { s.querySelector('.like').classList.add('liked'); s.querySelector('.n').textContent = '1'; }
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

  function setLike(i, on) {
    const id = videos[i].id, btn = slides[i].querySelector('.like');
    on ? likes.add(id) : likes.delete(id);
    btn.classList.toggle('liked', on);
    btn.querySelector('.n').textContent = on ? '1' : '';
    saveLikes();
  }
  function heartPop(i, e) {
    const r = slides[i].getBoundingClientRect(), p = document.createElement('div');
    p.className = 'pop'; p.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2 0 3.7 1.1 5.4 3.1 1.7-2 3.4-3.1 5.4-3.1 3.600 0 5.800 3.700 4.200 7.300C19.500 16.400 12 21 12 21z"/></svg>';
    p.style.left = (e.clientX - r.left) + 'px'; p.style.top = (e.clientY - r.top) + 'px';
    slides[i].appendChild(p); setTimeout(() => p.remove(), 850);
  }
  // single tap = pause / play, double tap = like
  let lastTap = 0, tapTimer = 0;
  function tap(e) {
    const now = performance.now();
    if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; setLike(active, true); heartPop(active, e); return; }
    lastTap = now;
    tapTimer = setTimeout(() => toggle(active), 260);
  }

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
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goTo(active + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goTo(active - 1); }
    else if (e.key === ' ' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); toggle(active); }
    else if (e.key === 'l') { setLike(active, !likes.has(videos[active].id)); }
  });
  window.addEventListener('resize', () => { if (active >= 0) place(false); });

  /* ---------- boot ---------- */
  Promise.all([
    fetch('/videos.json').then((r) => r.json()),
    fetch('/captions.json').then((r) => r.json()).catch(() => ({})),
  ]).then(([list, caps]) => {
    videos = list.map((v, k) => ({ ...v, n: k + 1, caption: (caps[v.id] || {}).caption, hidden: (caps[v.id] || {}).hidden }))
      .filter((v) => !v.hidden);
    if (!videos.length) { empty.hidden = false; return; }
    build(); icon(); feed.focus({ preventScroll: true });
  }).catch(() => { empty.hidden = false; empty.textContent = 'Could not load videos.'; });
})();
