(() => {
  const $ = (id) => document.getElementById(id);
  const ring = $('ring'), carousel = $('carousel'), video = $('video');
  const els = {
    empty: $('empty'),
    player: $('player'), nowTitle: $('now-title'), nowSub: $('now-sub'),
    prev: $('prev'), play: $('play'), next: $('next'), seek: $('seek'), cur: $('cur'), dur: $('dur'),
    mute: $('mute'), volume: $('volume'),
  };

  let videos = [], cards = [];
  let pos = 0;            // unwrapped ring position (float while dragging)
  let focused = -1;       // video at the front of the ring
  let playing = -1;       // video loaded in the player
  let seeking = false;
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

  /* ---------- autoplay ---------- */
  let autoTimer;
  function onFocus() { // autoplay once the card has settled in front
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { if (focused >= 0 && playing !== focused) load(focused, true); }, 450);
  }

  /* ---------- boot ---------- */
  fetch('/videos.json').then((r) => r.json()).then((list) => {
    videos = list;
    if (!videos.length) { els.empty.hidden = false; return; }
    build();
  }).catch(() => { els.empty.hidden = false; els.empty.textContent = 'Could not load videos.'; });
})();
