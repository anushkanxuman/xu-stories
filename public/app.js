(() => {
  const $ = (id) => document.getElementById(id);
  const ring = $('ring'), carousel = $('carousel'), video = $('video');
  const els = {
    empty: $('empty'), stage: $('stage'), stageTitle: $('stage-title'), stageDesc: $('stage-desc'),
    reviews: $('reviews'), reviewsFor: $('reviews-for'), avg: $('avg'), list: $('review-list'),
    form: $('review-form'), name: $('r-name'), text: $('r-text'), stars: $('r-stars'), msg: $('form-msg'),
    player: $('player'), nowTitle: $('now-title'), nowSub: $('now-sub'),
    prev: $('prev'), play: $('play'), next: $('next'), seek: $('seek'), cur: $('cur'), dur: $('dur'),
    mute: $('mute'), volume: $('volume'),
  };

  let videos = [], cards = [];
  let pos = 0;            // unwrapped ring position (float while dragging)
  let focused = -1;       // video at the front of the ring (reviews follow this)
  let playing = -1;       // video loaded in the player
  let rating = 5, seeking = false;
  let autoMuted = false;  // muted only because the browser blocked sound
  let frontSlot = -1;
  let host = null;        // card currently showing the playing video

  const mod = (a, n) => ((a % n) + n) % n;
  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  const fill = (input) => { input.style.setProperty('--p', (input.value - input.min) / (input.max - input.min) * 100 + '%'); };

  /* ---------- carousel ---------- */
  function build() {
    ring.innerHTML = '';
    const n = videos.length, m = n * Math.ceil(10 / n); // repeat videos so the ring is always full
    cards = Array.from({ length: m }, (_, i) => {
      const v = videos[i % n];
      const c = document.createElement('button');
      c.className = 'card'; c.type = 'button';
      c.setAttribute('aria-label', `Play ${v.title}`);
      let vid;
      if (v.poster) {
        vid = document.createElement('img');
        vid.src = v.poster; vid.loading = 'lazy'; vid.decoding = 'async'; vid.draggable = false; vid.alt = '';
      } else {
        vid = document.createElement('video');
        vid.src = v.src + '#t=0.5'; vid.muted = true; vid.preload = 'metadata'; vid.playsInline = true;
      }
      const badge = document.createElement('div'); badge.className = 'badge'; badge.textContent = '▶';
      vid.className = 'thumb';
      c.append(vid, badge);
      c.addEventListener('click', () => {
        if (dragMoved) return;
        if (c === host) toggle(); else choose(i, true);
      });
      ring.appendChild(c);
      return c;
    });
    layout();
  }

  function layout() {
    const n = cards.length;
    if (!n) return;
    const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 220;
    const step = 360 / n;
    const radius = n > 1 ? w * 0.98 / 2 / Math.tan(Math.PI / n) : 0;
    cards.forEach((c, i) => { c.dataset.base = `rotateY(${i * step}deg) translateZ(${radius}px)`; });
    ring.dataset.radius = radius;
    focused = -1; frontSlot = -1; // force restyle
    rotate();
  }

  function rotate() {
    const n = videos.length, m = cards.length, step = 360 / m, radius = +ring.dataset.radius || 0;
    ring.style.transform = `translateZ(${-radius}px) rotateY(${-pos * step}deg)`;
    const fs = mod(Math.round(pos), m), f = fs % n;
    if (f !== focused) { focused = f; onFocus(); }
    if (fs === frontSlot) return; // only restyle cards when the front card changes
    frontSlot = fs;
    cards.forEach((c, i) => {
      const dist = Math.min(mod(i - fs, m), mod(fs - i, m));
      c.classList.toggle('front', i === fs);
      c.style.visibility = dist > m / 4 + 3 ? 'hidden' : ''; // skip painting cards on the far side
      c.style.transform = c.dataset.base + (i === fs ? ' translateZ(50px) scale(1.22)' : '');
    });
  }

  function snapTo(i, n = cards.length) { // shortest way round to slot i (or to video i when n = videos.length)
    let d = mod(i - Math.round(pos), n);
    if (d > n / 2) d -= n;
    pos = Math.round(pos) + d;
    rotate();
  }
  const snapToVideo = (vi) => snapTo(vi, videos.length);

  function choose(i, play) {
    snapTo(i);
    if (play) load(i % videos.length, true);
  }

  /* drag / wheel / keys */
  let raf = 0, dragging = false, dragMoved = false, startX = 0, startPos = 0;
  carousel.addEventListener('pointerdown', (e) => {
    if (videos.length < 2) return;
    dragging = true; dragMoved = false; startX = e.clientX; startPos = pos;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (!dragMoved && Math.abs(dx) > 6) { dragMoved = true; ring.classList.add('no-anim'); carousel.classList.add('dragging'); }
    if (dragMoved) { pos = startPos - dx / 120; if (!raf) raf = requestAnimationFrame(() => { raf = 0; rotate(); }); }
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    ring.classList.remove('no-anim'); carousel.classList.remove('dragging');
    if (dragMoved) { pos = Math.round(pos); rotate(); setTimeout(() => { dragMoved = false; }, 0); }
  });
  let wheelLock = false;
  carousel.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (!d || wheelLock || videos.length < 2) return;
    e.preventDefault();
    wheelLock = true; setTimeout(() => { wheelLock = false; }, 350);
    pos = Math.round(pos) + Math.sign(d); rotate();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
    if (e.key === 'ArrowRight') { pos = Math.round(pos) + 1; rotate(); }
    else if (e.key === 'ArrowLeft') { pos = Math.round(pos) - 1; rotate(); }
    else if (e.key === ' ' && playing >= 0 && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); toggle(); }
  });
  window.addEventListener('resize', layout);

  /* ---------- player ---------- */
  function mountVideo(card) {
    if (host === card) return;
    if (host) host.classList.remove('hosting');
    host = card;
    card.insertBefore(video, card.firstChild);
    card.classList.add('hosting');
  }
  function load(i, autoplay) {
    playing = i;
    const v = videos[i];
    mountVideo(cards[mod(Math.round(pos), cards.length)]);
    video.src = v.src;
    els.player.hidden = false;
    els.nowTitle.textContent = `Video ${i + 1}`;
    els.nowSub.textContent = `of ${videos.length}`;
    if (autoplay) tryPlay();
    syncPlay();
  }
  // Browsers block sound before the first click, so fall back to muted autoplay.
  function tryPlay() {
    video.play().catch(() => {
      video.muted = true; autoMuted = true; els.mute.textContent = '🔇';
      video.play().catch(() => {});
    });
  }
  function step(d) {
    if (!videos.length) return;
    const base = playing >= 0 ? playing : focused;
    const i = mod(base + d, videos.length);
    snapToVideo(i); load(i, true);
  }
  function toggle() {
    if (playing < 0) return load(focused, true);
    video.paused ? video.play().catch(() => {}) : video.pause();
  }
  function syncPlay() {
    const p = !video.paused && !video.ended;
    els.play.textContent = p ? '⏸' : '▶';
    els.play.setAttribute('aria-label', p ? 'Pause' : 'Play');
    cards.forEach((c, k) => { c.querySelector('.badge').textContent = (c === host && p) ? '⏸' : '▶'; });
  }
  els.play.addEventListener('click', toggle);
  els.prev.addEventListener('click', () => {
    if (video.currentTime > 3) video.currentTime = 0; else step(-1); // like Spotify
  });
  els.next.addEventListener('click', () => step(1));
  video.addEventListener('click', toggle);
  video.addEventListener('play', syncPlay);
  video.addEventListener('pause', syncPlay);
  video.addEventListener('ended', () => step(1));
  video.addEventListener('loadedmetadata', () => { els.dur.textContent = fmt(video.duration); });
  video.addEventListener('timeupdate', () => {
    els.cur.textContent = fmt(video.currentTime);
    if (!seeking && video.duration) { els.seek.value = video.currentTime / video.duration * 1000; fill(els.seek); }
  });
  els.seek.addEventListener('input', () => {
    seeking = true; fill(els.seek);
    if (video.duration) els.cur.textContent = fmt(els.seek.value / 1000 * video.duration);
  });
  els.seek.addEventListener('change', () => {
    if (video.duration) video.currentTime = els.seek.value / 1000 * video.duration;
    seeking = false;
  });
  els.volume.addEventListener('input', () => {
    video.volume = els.volume.value / 100; video.muted = false; fill(els.volume);
    els.mute.textContent = video.volume === 0 ? '🔇' : '🔊';
  });
  els.mute.addEventListener('click', () => {
    video.muted = !video.muted; els.mute.textContent = video.muted ? '🔇' : '🔊';
  });
  video.volume = 0.8; fill(els.volume); fill(els.seek);

  window.addEventListener('pointerdown', () => { // first click allows sound again
    if (autoMuted) { autoMuted = false; video.muted = false; els.mute.textContent = '🔊'; }
  }, { capture: true });

  /* ---------- reviews ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  els.name.value = store.get('stories-name') || '';

  function paintStars() {
    els.stars.innerHTML = '';
    for (let s = 1; s <= 5; s++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '★'; b.className = s <= rating ? 'on' : '';
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(s === rating));
      b.setAttribute('aria-label', `${s} star${s > 1 ? 's' : ''}`);
      b.addEventListener('click', () => { rating = s; paintStars(); });
      els.stars.appendChild(b);
    }
  }
  paintStars();

  let reviewReq = 0;
  async function loadReviews() {
    if (focused < 0) return;
    const id = videos[focused].id, req = ++reviewReq;
    try {
      const r = await fetch('/api/reviews?video=' + encodeURIComponent(id));
      const data = await r.json();
      if (req !== reviewReq) return; // user rotated on
      renderReviews(data);
    } catch { /* keep what we have */ }
  }
  function renderReviews(data) {
    els.list.innerHTML = '';
    if (!data.length) {
      const li = document.createElement('li'); li.className = 'none'; li.style.border = '0'; li.style.background = 'none';
      li.textContent = 'No reviews yet. Be the first!'; els.list.appendChild(li);
      els.avg.textContent = ''; return;
    }
    const avg = data.reduce((a, r) => a + r.rating, 0) / data.length;
    els.avg.textContent = `★ ${avg.toFixed(1)} · ${data.length} review${data.length > 1 ? 's' : ''}`;
    data.slice().reverse().forEach((r) => {
      const li = document.createElement('li');
      const meta = document.createElement('div'); meta.className = 'meta';
      const who = document.createElement('span'); who.className = 'who'; who.textContent = r.name;
      const st = document.createElement('span'); st.className = 'stars-ro';
      st.textContent = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      st.setAttribute('aria-label', `${r.rating} out of 5`);
      const when = document.createElement('span'); when.className = 'when';
      when.textContent = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const left = document.createElement('span'); left.append(who, ' ', st);
      meta.append(left, when);
      const p = document.createElement('p'); p.textContent = r.text;
      li.append(meta, p); els.list.appendChild(li);
    });
  }
  let autoTimer;
  function onFocus() {
    if (focused < 0) return;
    clearTimeout(autoTimer); // autoplay once the card has settled in front
    autoTimer = setTimeout(() => { if (focused >= 0 && playing !== focused) load(focused, true); }, 450);
    els.reviews.hidden = false;
    els.reviewsFor.textContent = '· Video ' + (focused + 1);
    els.list.innerHTML = ''; els.avg.textContent = '';
    loadReviews();
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = els.form.querySelector('button[type=submit]');
    const body = { videoId: videos[focused].id, name: els.name.value, rating, text: els.text.value };
    if (!body.text.trim()) return;
    btn.disabled = true; els.msg.className = 'form-msg'; els.msg.textContent = 'Posting…';
    try {
      const r = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      store.set('stories-name', els.name.value);
      els.text.value = ''; els.msg.textContent = 'Thanks! Your review is up.';
      loadReviews();
    } catch (err) {
      els.msg.className = 'form-msg err'; els.msg.textContent = 'Could not post: ' + err.message;
    } finally { btn.disabled = false; }
  });
  setInterval(() => { if (!document.hidden) loadReviews(); }, 20000); // see other people's reviews

  /* ---------- boot ---------- */
  fetch('/api/videos').then((r) => r.json()).then((list) => {
    videos = list;
    if (!videos.length) { els.empty.hidden = false; return; }
    build();
  }).catch(() => { els.empty.hidden = false; els.empty.textContent = 'Could not load videos.'; });
})();
