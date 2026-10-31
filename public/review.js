(() => {
  'use strict';

  /* ---------- storage adapter ----------
     Reviews live behind this small interface so a Google Sheet or a real backend can replace it later
     without touching the panel. Every method is async on purpose (a remote store would be).
       label            text shown to the reviewer, e.g. "Saved on this device"
       getAll()         -> Review[]
       put(review)      -> void   (one review per videoId; throws if it could not be saved)
       remove(videoId)  -> void
       clear()          -> void
  */
  function createLocalAdapter(key = 'xs-reviews-v1') {
    let mem = {}; // used when the browser blocks storage, so the page still works until it is closed
    const read = () => { try { mem = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { /* keep mem */ } return mem; };
    const write = (all) => { mem = all; try { localStorage.setItem(key, JSON.stringify(all)); } catch (e) { throw new Error('storage-blocked'); } };
    return {
      label: 'Saved on this device',
      async getAll() { return Object.values(read()); },
      async put(r) { const all = read(); all[r.videoId] = r; write(all); },
      async remove(id) { const all = read(); delete all[id]; write(all); },
      async clear() { write({}); },
    };
  }

  /* ---------- sync adapter: the device first, then the team's server when one exists ----------
     Wraps the local adapter. Every change is saved on the device straight away, then sent to POST /api/reviews.
     No server (a static host answers 404) -> it quietly stays device-only. Server down -> it keeps a small outbox and retries. */
  function createSyncAdapter(local, store) {
    const meta = document.querySelector('meta[name="review-api"]');
    const base = ((meta && meta.content) || '/api/reviews').replace(/\/$/, '');
    let clientId = store.get('xs-client');
    if (!clientId) {
      clientId = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      store.set('xs-client', clientId);
    }
    let available = null; // null = not known yet, true = server found, false = no backend here
    let needInvite = false; // the server wants an invite link and this browser has no session yet
    let pending = new Set();
    try { pending = new Set(JSON.parse(store.get('xs-outbox') || '[]')); } catch (e) { /* start empty */ }
    const timers = new Map();
    const saveOutbox = () => store.set('xs-outbox', JSON.stringify([...pending]));

    async function send(id) {
      if (available === false) return;
      try {
        const rec = (await local.getAll()).find((r) => r.videoId === id);
        const viewMs = window.dropTime ? window.dropTime.videoMs(id) : undefined; // how long they spent on this video
        const res = rec
          ? await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, review: { ...rec, viewMs } }) })
          : await fetch(`${base}?client=${encodeURIComponent(clientId)}&video=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.status === 404 || res.status === 405) { available = false; pending.clear(); }
        else if (res.ok) { available = true; pending.delete(id); }
        else if (res.status === 401) { needInvite = true; pending.add(id); }  // no invite session: keep it, send once there is one
        else if (res.status >= 500 || res.status === 429) pending.add(id);   // try again later
        else pending.delete(id);                                             // refused (4xx): retrying won't help
      } catch (e) { pending.add(id); }                                       // offline: try again later
      saveOutbox(); adapter.onStatus();
    }
    const queue = (id) => { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => send(id), 700)); };
    const flush = () => pending.forEach(queue);

    const adapter = {
      onStatus() {},
      get shares() { return available === true && !needInvite; },
      get label() {
        if (available !== true) return local.label;
        if (needInvite) return local.label + ' · open your invite link to share';
        return local.label + (pending.size ? ' · will send when connected' : ' · shared with the Xuman team');
      },
      async init() {
        try { await window.dropSession; } catch (e) { /* no invite in the link: fine */ }
        try { const r = await fetch(base + '/ping'); const j = r.ok ? await r.json() : null; available = j && j.ok ? true : false; needInvite = !!(j && j.inviteRequired && !j.session); } catch (e) { available = null; }
        if (available) flush();
        window.addEventListener('online', flush);
        adapter.onStatus();
      },
      syncTime(snap, name, beacon) { // total time here + time per video; beacon = page is closing
        if (available !== true || needInvite) return;
        const body = JSON.stringify({ clientId, name: name || undefined, ...snap });
        if (beacon && navigator.sendBeacon) { navigator.sendBeacon(base + '/time', new Blob([body], { type: 'application/json' })); return; }
        fetch(base + '/time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      },
      getAll: () => local.getAll(),
      async put(r) { try { await local.put(r); } finally { queue(r.videoId); } },
      async remove(id) { try { await local.remove(id); } finally { queue(id); } },
      async clear() {
        try { await local.clear(); } finally {
          pending.clear(); saveOutbox();
          if (available !== false) fetch(`${base}?client=${encodeURIComponent(clientId)}`, { method: 'DELETE' }).catch(() => {});
        }
      },
    };
    return adapter;
  }

  /* ---------- tiny helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c); });
    return n;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  /* ---------- state ---------- */
  const panel = $('#review'), body = $('#rv-body'), bar = $('#rv-bar');
  const adapter = createSyncAdapter(createLocalAdapter(), store);
  adapter.onStatus = () => { if (cur && view === 'review') renderBar(); };
  let cfg = null, optByKey = {};
  const reviews = new Map();   // videoId -> review
  window.dropReviews = () => reviews; // read-only use by the stats column and the gallery
  let cur = null;              // { video, entry, index, total } for the video on screen
  let view = 'review';         // 'review' | 'results'
  let saveErr = false, justDropped = false;
  let nick = store.get('xs-nick') || '';   // the reviewer's name, asked first
  const needName = () => !nick && store.get('xs-name-asked') !== '1';

  const hasAny = (r) => !!(r && (r.reaction || r.creative || r.secondary || r.style || r.clarity || r.fix || r.fixDetail || r.tea || r.teaMood || r.vote || (r.votes && Object.keys(r.votes).length)));
  const statusOf = (r) => (!r ? 'none' : r.submittedAt ? 'submitted' : r.reaction ? 'reacted' : hasAny(r) ? 'draft' : 'none');
  const counts = () => { // reacted = picked a first impression, submitted = dropped a verdict, touched = either
    let reacted = 0, submitted = 0, touched = 0;
    reviews.forEach((r) => { if (r.reaction) reacted++; if (r.submittedAt) submitted++; if (r.reaction || r.submittedAt) touched++; });
    return { reacted, submitted, touched };
  };

  /* ---------- saving ---------- */
  function edit(mut) {
    const id = cur.video.id;
    const r = reviews.get(id) || { videoId: id, n: cur.entry.n };
    mut(r);
    for (const k of Object.keys(r)) if (r[k] === undefined || r[k] === '') delete r[k];
    r.updatedAt = Date.now();
    if (hasAny(r)) r.submittedAt = r.submittedAt || r.updatedAt; else delete r.submittedAt; // any tap counts as reviewed straight away, like a like on Insta
    if (nick) r.name = nick; else delete r.name;
    let job;
    if (!hasAny(r) && !r.submittedAt) { reviews.delete(id); job = adapter.remove(id); }
    else { reviews.set(id, r); job = adapter.put(r); }
    job.then(() => { if (saveErr) { saveErr = false; renderBar(); } })
      .catch(() => { saveErr = true; renderBar(); });
    syncMark(id);
    renderStats();
    renderBar();
  }

  function syncMark(id) {
    const r = reviews.get(id), o = r && r.reaction ? optByKey[r.reaction] : null;
    if (window.drop) window.drop.mark(id, o ? o.emoji : '', statusOf(r));
    let n = 0; reviews.forEach((x) => { if (x.reaction || x.submittedAt) n += 1; });
    document.dispatchEvent(new CustomEvent('drop:review', { detail: { reviewed: n } })); // the stats column listens
  }

  /* ---------- building blocks ---------- */
  // Saving helpers: a field holds an option key; "Other" keeps the typed text in otherText[field].
  const setField = (field, key) => edit((x) => {
    x[field] = key || undefined;
    if (key !== 'other.' + field && x.otherText) { delete x.otherText[field]; if (!Object.keys(x.otherText).length) delete x.otherText; }
  });
  const setOtherText = (field, v) => edit((x) => {
    const t = { ...(x.otherText || {}) }; if (v) t[field] = v; else delete t[field];
    x.otherText = Object.keys(t).length ? t : undefined;
  });
  const oth = (field, r) => ({ field, text: (r.otherText || {})[field], onText: (v) => setOtherText(field, v) });

  function options(list, selected, group, onPick, other) {
    let sel = selected || null;
    const otherKey = other ? 'other.' + other.field : null;
    const grid = el('div', { class: 'opts', role: 'radiogroup', 'aria-label': group, dataset: { n: list.length } });
    const wrap = el('div', { class: 'opt-wrap' }, grid);
    let otherBtn = null, otherIn = null;
    const paint = () => {
      grid.querySelectorAll('.opt').forEach((x) => {
        const on = x.dataset.key === sel;
        x.classList.toggle('on', on); x.setAttribute('aria-checked', on);
      });
      if (other) {
        const on = sel === otherKey;
        otherBtn.classList.toggle('on', on); otherBtn.setAttribute('aria-checked', on); otherIn.hidden = !on;
      }
    };
    list.forEach((o) => {
      const b = el('button', { class: 'opt', type: 'button', role: 'radio', title: o.meaning, dataset: { key: o.key } },
        el('span', { class: 'emo', 'aria-hidden': 'true', text: o.emoji }),
        el('span', { class: 'lab', text: o.label }),
        el('span', { class: 'mean', text: o.meaning }));
      b.addEventListener('click', () => {
        sel = sel === o.key ? null : o.key;
        paint();
        if (sel) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
        onPick(sel, o);
      });
      grid.append(b);
    });
    if (other) {
      const oc = cfg.other;
      otherBtn = el('button', { class: 'opt-other', type: 'button', role: 'radio', title: oc.meaning },
        el('span', { 'aria-hidden': 'true', text: oc.emoji + ' ' }), el('b', { text: oc.label }), el('span', { class: 'mean', text: ' · ' + oc.meaning }));
      otherIn = el('input', { class: 'detail', type: 'text', maxlength: '200', placeholder: oc.placeholder, 'aria-label': 'Your own answer', value: other.text || '' });
      otherBtn.addEventListener('click', () => {
        sel = sel === otherKey ? null : otherKey;
        paint(); onPick(sel, { key: otherKey, emoji: oc.emoji });
        if (sel) otherIn.focus({ preventScroll: true });
      });
      let t = 0;
      otherIn.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => other.onText(otherIn.value.trim()), 300); });
      wrap.append(el('div', { class: 'opt-other-row' }, otherBtn), otherIn);
    }
    paint();
    return wrap;
  }

  /* optional thumbs up / down: get() = current value, set(v) = save it (undefined clears) */
  function voteButtons(what, get, set) {
    const wrap = el('span', { class: 'rv-vote-b' });
    const paint = () => wrap.querySelectorAll('.vote-btn').forEach((b) => b.setAttribute('aria-pressed', String(get() === b.dataset.dir)));
    for (const dir of ['up', 'down']) {
      const b = el('button', { class: 'vote-btn', type: 'button', dataset: { dir }, title: (dir === 'up' ? 'Like: ' : 'Dislike: ') + what, 'aria-label': (dir === 'up' ? 'Like ' : 'Dislike ') + what });
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm2 9V10.5l3.5-6.2a1.6 1.6 0 0 1 3 .8L15 9h4.6a2 2 0 0 1 2 2.4l-1.3 6.8a2.5 2.5 0 0 1-2.5 1.8H9z"/></svg>';
      if (dir === 'down') b.firstChild.style.transform = 'rotate(180deg)';
      b.addEventListener('click', () => { set(get() === dir ? undefined : dir); paint(); });
      wrap.append(b);
    }
    paint();
    return wrap;
  }

  function card({ title, prompt, accent = 'purple', open = false, optional = false, done = false, vote = '' }, content) {
    const c = el('section', { class: 'card' + (open ? ' open' : '') + (done ? ' done' : ''), dataset: { accent } });
    const head = el('button', { class: 'cd-head', type: 'button', 'aria-expanded': open });
    head.append(...[el('span', { class: 'cd-title', text: title }), optional ? el('span', { class: 'cd-opt', text: 'OPTIONAL' }) : null,
      el('span', { class: 'cd-check', 'aria-hidden': 'true', text: '✓' }), el('span', { class: 'cd-chev', 'aria-hidden': 'true', text: '▾' })].filter(Boolean));
    head.addEventListener('click', () => { const o = c.classList.toggle('open'); head.setAttribute('aria-expanded', o); });
    const top = el('div', { class: 'cd-top' }, head);
    if (vote) top.append(voteButtons(title.replace(/[^\w\s'?]/g, '').trim().toLowerCase(), () => ((reviews.get(cur.video.id) || {}).votes || {})[vote], (v) => edit((x) => {
      const m = { ...(x.votes || {}) }; if (v) m[vote] = v; else delete m[vote];
      x.votes = Object.keys(m).length ? m : undefined;
    })));
    c.append(top, el('div', { class: 'cd-body' }, prompt ? el('p', { class: 'cd-prompt', text: prompt }) : null, content));
    c.setDone = (v) => c.classList.toggle('done', !!v);
    return c;
  }

  /* ---------- the review view ---------- */
  function renderReview() {
    view = 'review';
    const { video, entry, index, total } = cur;
    const r = reviews.get(video.id) || {};
    const cat = cfg.categories[entry.primary] || cfg.categories.gen;

    const resBtn = el('button', { class: 'ghost', type: 'button', text: 'MY RESULTS', onclick: renderResults });
    const nameBtn = el('button', { class: 'ghost name-chip', type: 'button', title: 'Change your name', text: nick ? '👤 ' + nick : '+ ADD NAME', onclick: () => renderWelcome(true) });

    const head = el('div', { class: 'rv-head' },
      el('div', { class: 'rv-title' }, el('h2', { text: window.dropNums ? `VIDEO #${pad(entry.n)}` : 'THIS DROP' }), el('span', { class: 'rv-pos', text: `${index + 1} / ${total}` }), nameBtn, resBtn),
      el('div', { class: 'rv-sub' }, el('p', { class: 'rv-micro', text: cfg.microcopy[index % cfg.microcopy.length] }), el('div', { class: 'rv-stats' })),
      el('div', { class: 'rv-prog' }, el('i')));

    // 1. first impression (replaces the old like button)
    const c1 = card({ title: cat.heading, prompt: cat.prompt, open: true, vote: 'reaction', done: !!r.reaction },
      options(cat.options, r.reaction, cat.heading, (key, o) => {
        setField('reaction', key);
        c1.setDone(key);
        if (key && window.drop) window.drop.burst(o.emoji);
      }, oth('reaction', r)));
    const cards = [c1];

    // 2. secondary category: only where the config says it adds real feedback
    if (entry.secondary && cfg.categories[entry.secondary]) {
      const sc = cfg.categories[entry.secondary];
      const c2 = card({ title: sc.heading, vote: 'secondary', prompt: cfg.secondaryPrompts[entry.secondary] || sc.prompt, optional: true, done: !!r.secondary },
        options(sc.options, r.secondary, sc.heading, (key) => { setField('secondary', key); c2.setDone(key); }, oth('secondary', r)));
      cards.push(c2);
    }

    // 3. creativity rating (good and bad answers on purpose)
    const cr = cfg.creative;
    const cc = card({ title: cr.heading, vote: 'creative', prompt: cr.prompt, accent: 'pink', open: true, done: !!r.creative },
      options(cr.options, r.creative, cr.heading, (key) => { setField('creative', key); cc.setDone(key); }, oth('creative', r)));
    cards.push(cc);

    // 4. did it land (post-watch clarity)
    const cl = cfg.clarity;
    const c3 = card({ title: cl.heading, vote: 'clarity', prompt: cl.prompt, accent: 'lime', optional: true, done: !!r.clarity },
      options(cl.options, r.clarity, cl.heading, (key) => { setField('clarity', key); c3.setDone(key); }, oth('clarity', r)));
    cards.push(c3);

    // 5. the video's own visual style, only when the style label is reliable
    if (entry.style) {
      const st = cfg.style;
      const c4 = card({ title: st.heading, vote: 'style', prompt: st.prompt.replace('{style}', entry.style), accent: 'pink', optional: true, done: !!r.style },
        options(st.options, r.style, st.heading, (key) => { setField('style', key); c4.setDone(key); }, oth('style', r)));
      cards.push(c4);
    }

    // 5. director's cut: one fix, optional detail
    const fx = cfg.fix;
    const detail = el('input', { class: 'detail', type: 'text', maxlength: '300', placeholder: fx.detailPlaceholder, 'aria-label': 'More detail about your fix', value: r.fixDetail || '' });
    const syncDetail = () => { detail.hidden = !r.fix || r.fix === 'fix.nothing' || r.fix === 'other.fix'; };
    let dTimer = 0;
    detail.addEventListener('input', () => { clearTimeout(dTimer); dTimer = setTimeout(() => edit((x) => { x.fixDetail = detail.value.trim() || undefined; }), 300); });
    const c5 = card({ title: fx.heading, vote: 'fix', optional: true, done: !!r.fix },
      el('div', {}, options(fx.options, r.fix, fx.heading, (key) => {
        setField('fix', key);
        if (!key || key === 'fix.nothing' || key === 'other.fix') { edit((x) => { x.fixDetail = undefined; }); detail.value = ''; }
        r.fix = key; syncDetail(); c5.setDone(key);
      }, oth('fix', r)), detail));
    syncDetail();
    cards.push(c5);

    // 6. the tea
    const tea = cfg.tea;
    const ta = el('textarea', { class: 'tea', maxlength: '1000', placeholder: tea.placeholder, 'aria-label': 'Your comment' });
    ta.value = r.tea || '';
    let tTimer = 0;
    const teaDone = () => { const x = reviews.get(cur.video.id) || {}; c6.setDone(x.teaMood || x.tea); };
    const saveTea = () => { clearTimeout(tTimer); tTimer = setTimeout(() => { edit((x) => { x.tea = ta.value.trim() || undefined; }); teaDone(); }, 300); };
    ta.addEventListener('input', saveTea);
    const starters = el('div', { class: 'starters' }, tea.starters.map((s) => el('button', {
      type: 'button', text: s,
      onclick() { ta.value = ta.value ? ta.value.replace(/\s*$/, ' ') + s + ' ' : s + ' '; ta.focus(); saveTea(); },
    })));
    const moods = options(tea.moods.options, r.teaMood, 'Mood of your comment', (key) => { edit((x) => { x.teaMood = key || undefined; }); teaDone(); });
    const c6 = card({ title: tea.heading, optional: true, done: !!(r.tea || r.teaMood) },
      el('div', {}, el('p', { class: 'cd-prompt', text: tea.moods.prompt }), moods, starters, ta));
    cards.push(c6);

    // optional quick like / dislike on the whole video (each card has its own too)
    const voteRow = el('div', { class: 'rv-vote' }, el('span', { class: 'rv-vote-t', text: 'LIKE IT?' }), el('span', { class: 'cd-opt', text: 'OPTIONAL' }),
      voteButtons('this video', () => (reviews.get(cur.video.id) || {}).vote, (v) => edit((x) => { x.vote = v; })));

    body.replaceChildren(head, voteRow, ...cards);
    body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    renderStats(); renderBar();
  }

  function renderStats() {
    const box = $('.rv-stats'); if (!box || !cur) return;
    const { reacted, submitted, touched } = counts();
    box.replaceChildren(
      el('span', {}, el('b', { text: submitted }), submitted === 1 ? ' verdict' : ' verdicts'),
      el('span', {}, el('b', { text: reacted }), ' reacted'),
      el('span', { text: `${touched}/${cur.total}` }),
      el('span', { class: 'rv-time', title: 'Time you have actively spent here', text: '⏱ ' + (window.dropTime ? window.dropTime.format(window.dropTime.totalMs()) : '0:00') }));
    const fill = $('.rv-prog i'); if (fill) fill.style.width = (cur.total ? (touched / cur.total) * 100 : 0) + '%';
  }

  function renderBar() { // one button: everything above saves by itself, NEXT just moves on
    if (!cur) return;
    if (view === 'results') return;
    const st = statusOf(reviews.get(cur.video.id));
    const last = cur.index === cur.total - 1;
    const go = () => { last ? renderResults() : window.drop.goTo(cur.index + 1); };
    const note = el('div', { class: 'bar-note' + (saveErr ? ' err' : st !== 'none' ? ' ok' : ''), 'aria-live': 'polite' });
    note.textContent = saveErr ? "Couldn't save on this device. Your answers stay until you close this page."
      : st === 'none' ? 'Tap anything above. It all saves by itself, all optional.' : `✓ Saved · ${adapter.label}`;
    bar.replaceChildren(note, el('div', { class: 'bar-btns' }, el('button', { class: 'cta', type: 'button', text: last ? 'SEE MY RESULTS →' : 'NEXT →', onclick: go })));
  }

  /* ---------- name first: a full-screen gate before anything else ---------- */
  function showGate() {
    const input = el('input', { class: 'nick', type: 'text', maxlength: '30', placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'given-name' });
    const gate = el('div', { class: 'gate', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Before you start' });
    const resume = () => { try { const c = window.drop && window.drop.current(); if (c && c.el) c.el.play().catch(() => {}); } catch (e) { /* autoplay blocked: fine */ } };
    const done = (anon) => {
      nick = anon ? '' : input.value.trim();
      if (!anon && !nick) { input.focus(); return; }
      store.set('xs-nick', nick); store.set('xs-name-asked', '1');
      gate.remove(); resume();
      if (cur) renderReview();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(false); });
    gate.append(el('div', { class: 'gate-card' },
      el('p', { class: 'rv-kicker', text: 'BEFORE YOU START' }),
      el('h2', { text: "Who's judging?" }),
      el('p', { class: 'cd-prompt', text: 'Your name goes on every review you give, so the Xuman team knows who said what.' }),
      input,
      el('div', { class: 'bar-btns' },
        el('button', { class: 'skip', type: 'button', text: 'STAY ANONYMOUS', onclick: () => done(true) }),
        el('button', { class: 'cta', type: 'button', text: "LET'S GO →", onclick: () => done(false) }))));
    document.body.append(gate);
    try { const c = window.drop && window.drop.current(); if (c && c.el) c.el.pause(); } catch (e) { /* not ready yet */ }
    input.focus({ preventScroll: true });
  }

  /* ---------- name edit (from the review panel) ---------- */
  function renderWelcome(editing) {
    view = 'welcome';
    const input = el('input', { class: 'nick', type: 'text', maxlength: '30', placeholder: 'Your name', 'aria-label': 'Your name', value: nick, autocomplete: 'given-name' });
    const go = () => {
      nick = input.value.trim(); store.set('xs-nick', nick); store.set('xs-name-asked', '1');
      if (nick && cur) { const r = reviews.get(cur.video.id); if (r) edit(() => {}); }
      view = 'review'; renderReview();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const w = el('section', { class: 'card open', dataset: { accent: 'pink' } },
      el('div', { class: 'cd-head', style: 'cursor:default' }, el('span', { class: 'cd-title', text: 'FIRST THINGS FIRST 👋' })),
      el('div', { class: 'cd-body' }, el('p', { class: 'cd-prompt', text: editing ? 'Change the name on your reviews.' : 'What should we call you? Your name goes on every verdict you drop.' }), input));
    body.replaceChildren(el('div', { class: 'rv-head' }, el('div', { class: 'rv-title' }, el('h2', { text: "WHO'S JUDGING?" }))), w);
    body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    bar.replaceChildren(el('div', { class: 'bar-note', text: adapter.shares ? 'Your name and the time you spend here go to the Xuman team with your verdicts.' : 'Saved on this device. Only used to label your verdicts.' }),
      el('div', { class: 'bar-btns' },
        el('button', { class: 'skip', type: 'button', text: editing ? 'BACK' : 'SKIP', onclick: () => { if (!editing) store.set('xs-name-asked', '1'); view = 'review'; renderReview(); } }),
        el('button', { class: 'cta', type: 'button', text: editing ? 'SAVE NAME' : "LET'S GO →", onclick: go })));
    if (window.matchMedia('(min-width: 981px)').matches) input.focus({ preventScroll: true });
  }

  /* ---------- results (personal, from this device only) ---------- */
  function renderResults() {
    view = 'results';
    const all = [...reviews.values()];
    const vids = window.drop.videos;
    const idxOf = (id) => vids.findIndex((v) => v.id === id);
    const capOf = (id) => { const v = vids.find((x) => x.id === id); return v ? (v.caption || v.title || '') : ''; };
    const row = (r, extra, noCaption) => {
      const i = idxOf(r.videoId);
      return el('li', {}, el('button', { type: 'button', title: 'Go to this video', onclick: () => { if (i >= 0) window.drop.goTo(i); showReview(); } },
        window.dropNums ? el('span', { class: 'n', text: '#' + r.n }) : null, noCaption && window.dropNums ? null : el('span', { class: 't', text: capOf(r.videoId) }), extra));
    };
    const { reacted, submitted } = counts();
    const secs = [el('div', { class: 'rv-head res' },
      el('div', { class: 'rv-kicker', text: 'YOUR FEED, YOUR VERDICT' }),
      el('h2', { text: 'YOUR RESULTS' }),
      el('p', { class: 'sub', text: `${submitted} verdict${submitted === 1 ? '' : 's'} dropped · ${reacted} reacted · ${adapter.label}` }))];

    if (window.dropTime) {
      const t = window.dropTime.snapshot(), f = window.dropTime.format;
      const seen = Object.entries(t.perVideo).filter(([id, ms]) => ms >= 3000 && cfg.videos[id]);
      const top = seen.sort((a, b) => b[1] - a[1]).slice(0, 3);
      secs.push(el('div', { class: 'res-sec' }, el('h3', { text: 'TIME HERE' }),
        el('p', { text: `${f(t.totalMs)} active · ${t.sessions} visit${t.sessions === 1 ? '' : 's'} · ${seen.length} video${seen.length === 1 ? '' : 's'} watched` + (seen.length ? ` · about ${f(seen.reduce((s, [, ms]) => s + ms, 0) / seen.length)} each` : '') }),
        top.length ? el('ul', { class: 'res-list', style: 'margin-top:8px' }, top.map(([id, ms]) => row({ videoId: id, n: cfg.videos[id].n }, el('span', { text: f(ms) })))) : null));
    }
    if (!all.length) {
      secs.push(el('div', { class: 'state' }, el('h3', { text: 'Nothing here yet.' }), el('p', { text: 'Your taste is still under investigation. 👁️ React to a video and it shows up here.' })));
    } else {
      const loved = all.filter((r) => r.reaction && optByKey[r.reaction] && optByKey[r.reaction].tone === 'pos').sort((a, b) => b.updatedAt - a.updatedAt);
      const relatable = all.filter((r) => r.reaction === 'fun.relatable');
      const sec = (title, list, extraFn) => list.length ? el('div', { class: 'res-sec' }, el('h3', { text: title }), el('ul', { class: 'res-list' }, list.slice(0, 6).map((r) => row(r, extraFn ? extraFn(r) : null)))) : null;
      secs.push(
        sec('VIDEOS YOU LOVED', loved, (r) => el('span', { text: optByKey[r.reaction].emoji })),
        sec('MOST RELATABLE', relatable, () => el('span', { text: '🫠' })));

      const creative = all.filter((r) => r.creative && optByKey[r.creative] && optByKey[r.creative].score);
      if (creative.length) {
        const avg = creative.reduce((s, r) => s + optByKey[r.creative].score, 0) / creative.length;
        const top = creative.filter((r) => optByKey[r.creative].tone === 'pos').sort((a, b) => optByKey[b.creative].score - optByKey[a.creative].score || b.updatedAt - a.updatedAt);
        secs.push(el('div', { class: 'res-sec' }, el('h3', { text: 'CREATIVITY CHECK' }),
          el('p', { text: `You rated ${creative.length} video${creative.length === 1 ? '' : 's'} · average ${avg.toFixed(1)} / 4` }),
          top.length ? el('ul', { class: 'res-list', style: 'margin-top:8px' }, top.slice(0, 4).map((r) => row(r, el('span', { text: optByKey[r.creative].emoji })))) : null));
      }

      const styleCount = {};
      all.forEach((r) => { const e = cfg.videos[r.videoId]; if (r.style && optByKey[r.style] && optByKey[r.style].tone === 'pos' && e && e.style) styleCount[e.style] = (styleCount[e.style] || 0) + 1; });
      const styles = Object.entries(styleCount).sort((a, b) => b[1] - a[1]);
      if (styles.length) secs.push(el('div', { class: 'res-sec' }, el('h3', { text: 'STYLES YOU RATED HIGHLY' }), el('p', { text: styles.map(([s, n]) => `${s} ×${n}`).join(' · ') })));

      const fixCount = {};
      all.forEach((r) => { if (r.fix && r.fix !== 'fix.nothing') fixCount[r.fix] = (fixCount[r.fix] || 0) + 1; });
      const fixes = Object.entries(fixCount).sort((a, b) => b[1] - a[1]);
      if (fixes.length) secs.push(el('div', { class: 'res-sec' }, el('h3', { text: 'WHAT YOU WOULD FIX MOST' }), el('p', { text: fixes.map(([k, n]) => `${optByKey[k].label} ×${n}`).join(' · ') })));

      const teas = all.filter((r) => r.tea).sort((a, b) => b.updatedAt - a.updatedAt);
      if (teas.length) secs.push(el('div', { class: 'res-sec' }, el('h3', { text: 'YOUR TEA' }), el('ul', { class: 'res-list' }, teas.slice(0, 3).map((r) => row(r, [r.teaMood ? el('span', { text: optByKey[r.teaMood].emoji }) : null, el('q', { class: 't', text: r.tea })], true)))));

      const copy = el('button', { class: 'ghost', type: 'button', text: 'COPY MY FEEDBACK' });
      copy.addEventListener('click', async () => {
        const out = all.sort((a, b) => a.n - b.n).map((r) => ({
          video: r.n, status: statusOf(r), name: r.name, creativity: r.creative && optByKey[r.creative].label,
          reaction: r.reaction && optByKey[r.reaction].label, followUp: r.secondary && optByKey[r.secondary].label,
          landed: r.clarity && optByKey[r.clarity].label, style: r.style && optByKey[r.style].label,
          fix: r.fix && optByKey[r.fix].label, fixDetail: r.fixDetail, other: r.otherText, commentMood: r.teaMood && optByKey[r.teaMood].label, tea: r.tea }));
        try { await navigator.clipboard.writeText(JSON.stringify(out, null, 2)); copy.textContent = 'COPIED ✓'; } catch (e) { copy.textContent = "COULDN'T COPY"; }
        setTimeout(() => { copy.textContent = 'COPY MY FEEDBACK'; }, 1800);
      });
      let armed = false;
      const clear = el('button', { class: 'ghost', type: 'button', text: 'CLEAR MY REVIEWS' });
      clear.addEventListener('click', async () => {
        if (!armed) { armed = true; clear.textContent = 'SURE? TAP AGAIN'; setTimeout(() => { armed = false; clear.textContent = 'CLEAR MY REVIEWS'; }, 3000); return; }
        try { await adapter.clear(); } catch (e) { /* in-memory state still cleared below */ }
        [...reviews.keys()].forEach((id) => { reviews.delete(id); syncMark(id); });
        if (window.dropTime) window.dropTime.reset(); lastSent = 0;
        renderResults();
      });
      secs.push(el('div', { class: 'rv-tools' }, copy, clear));
    }
    body.replaceChildren(...secs.filter(Boolean));
    body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    bar.replaceChildren(el('div', { class: 'bar-note', text: adapter.label }), el('div', { class: 'bar-btns' }, el('button', { class: 'cta', type: 'button', text: '← BACK TO THE FEED', onclick: showReview })));
  }
  const showReview = () => { if (cur) { justDropped = false; renderReview(); } };

  /* ---------- wiring ---------- */
  function setCurrent(detail) {
    const entry = cfg && cfg.videos[detail.video.id];
    cur = { video: detail.video, entry: entry || { n: detail.video.n, primary: 'gen' }, index: detail.index, total: detail.total };
    justDropped = false;
    if (view === 'results') view = 'review';
    if (view === 'welcome') { renderWelcome(false); return; }
    renderReview();
    if (window.matchMedia('(min-width: 981px)').matches && window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' }); // new video: back to the top of its review
  }

  function showError(msg) {
    body.replaceChildren(el('div', { class: 'state' }, el('h3', { text: "Couldn't load the review panel" }), el('p', { text: msg }),
      el('button', { class: 'ghost', type: 'button', text: 'TRY AGAIN', onclick: () => { body.replaceChildren(el('div', { class: 'skel' }, el('i'), el('i'), el('i'))); init(); } })));
    bar.replaceChildren();
  }

  async function init() {
    try {
      const [c, saved] = await Promise.all([
        fetch((window.DROP_BASE || '/') + 'review-config.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        adapter.getAll().catch(() => []),
        adapter.init().catch(() => {}), // finds out whether a backend exists
      ]);
      cfg = c; optByKey = {};
      const add = (list) => list.forEach((o) => { optByKey[o.key] = o; });
      Object.values(cfg.categories).forEach((x) => add(x.options)); add(cfg.style.options); add(cfg.creative.options); add(cfg.clarity.options); add(cfg.fix.options); add(cfg.tea.moods.options);
      ['reaction', 'secondary', 'creative', 'clarity', 'style', 'fix'].forEach((f) => { optByKey['other.' + f] = { key: 'other.' + f, label: cfg.other.label, emoji: cfg.other.emoji, meaning: cfg.other.meaning, tone: 'neutral' }; });
      saved.forEach((r) => reviews.set(r.videoId, r));
    } catch (e) { showError('Check your connection and try again.'); return; }
    startTimeSync();
    if (needName()) showGate();
    const go = () => { reviews.forEach((_, id) => syncMark(id)); if (window.drop.index >= 0) setCurrent({ video: window.drop.videos[window.drop.index], index: window.drop.index, total: window.drop.videos.length }); };
    if (window.drop && window.drop.ready) go(); else document.addEventListener('drop:ready', go, { once: true });
  }

  document.addEventListener('drop:active', (e) => { if (cfg) setCurrent(e.detail); });
  document.addEventListener('drop:time', () => { const t = $('.rv-time'); if (t && window.dropTime) t.textContent = '⏱ ' + window.dropTime.format(window.dropTime.totalMs()); });

  // send the running time to the backend now and then, and once more when the page closes
  let lastSent = 0, timeSyncOn = false;
  function startTimeSync() {
    if (timeSyncOn || !window.dropTime) return;
    timeSyncOn = true;
    const push = (beacon) => { const s = window.dropTime.snapshot(); if (s.totalMs === lastSent) return; lastSent = s.totalMs; adapter.syncTime(s, nick, beacon); };
    setInterval(() => push(false), 20000);
    addEventListener('pagehide', () => push(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(true); });
  }
  init();
})();
