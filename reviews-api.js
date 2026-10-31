// Reviews backend for Xu's Stories. Plain Node, no dependencies; plugged into server.js.
//
//   POST   /api/reviews                 body { clientId, review }   save or update one review (open to reviewers)
//   DELETE /api/reviews?client=ID[&video=ID]                        delete your own review(s)
//   POST   /api/reviews/time            body { clientId, name, totalMs, sessions, perVideo }   time spent here
//   GET    /api/reviews/stats                                       community medians, only once enough real reviewers exist
//   GET    /api/reviews/ping                                        { ok: true } so the page knows a backend exists
//   GET    /api/reviews                 admin only                  every review as JSON
//   GET    /api/reviews/export.csv      admin only                  every review as a spreadsheet-friendly CSV
//   GET    /api/reviews/time[.csv]      admin only                  time spent per reviewer (JSON / CSV)
//   GET    /api/reviews/time-per-video.csv  admin only                seconds per reviewer per video
//
// Admin access: set ADMIN_KEY and send it as the x-admin-key header (or ?key=). With no ADMIN_KEY, only requests
// from this machine (localhost, not via a proxy) can read reviews. Other env: REVIEWS_DIR (where reviews.json lives,
// default ./data), ALLOW_ORIGIN (CORS, for when the static page is hosted somewhere else).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createReviewsApi({ root, publicDir }) {
  const DATA_DIR = process.env.REVIEWS_DIR || path.join(root, 'data');
  const DATA_FILE = path.join(DATA_DIR, 'reviews.json');
  const ADMIN_KEY = process.env.ADMIN_KEY || '';
  const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '';
  const MAX_BODY = 20 * 1024;
  const DAY = 24 * 3600 * 1000;
  const STATS_MIN = Number(process.env.STATS_MIN) || 5; // community numbers only appear once this many reviewers took part
  const FIELDS = ['reaction', 'secondary', 'creative', 'clarity', 'style', 'fix', 'teaMood'];

  /* ---------- storage: one JSON file, kept in memory, written atomically ---------- */
  let db = { records: {}, sessions: {} };
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* first run */ }
  db.records = db.records || {}; db.sessions = db.sessions || {};
  let writing = Promise.resolve();
  const persist = () => {
    writing = writing.then(() => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DATA_FILE);
    }).catch((e) => console.error('Could not write reviews:', e.message));
    return writing;
  };

  /* ---------- what counts as a valid review: read from the same config the page uses ---------- */
  let cfgCache = { mtime: 0, keys: new Set(), labels: new Map(), videos: new Set() };
  function config() {
    const file = path.join(publicDir, 'review-config.json');
    const mtime = fs.statSync(file).mtimeMs;
    if (mtime === cfgCache.mtime) return cfgCache;
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const keys = new Set(), labels = new Map();
    const add = (list) => list.forEach((o) => { keys.add(o.key); labels.set(o.key, o.label); });
    Object.values(cfg.categories).forEach((c) => add(c.options));
    add(cfg.style.options); add(cfg.creative.options); add(cfg.clarity.options); add(cfg.fix.options); add(cfg.tea.moods.options);
    FIELDS.forEach((f) => { keys.add('other.' + f); labels.set('other.' + f, cfg.other.label); });
    cfgCache = { mtime, keys, labels, videos: new Set(Object.keys(cfg.videos)) };
    return cfgCache;
  }

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined) || undefined;

  // Keep only known fields with known values. Everything else is dropped, never stored.
  function clean(input, cfg) {
    if (!input || typeof input !== 'object') return null;
    if (typeof input.videoId !== 'string' || !cfg.videos.has(input.videoId)) return null;
    const r = { videoId: input.videoId };
    r.n = Number.isInteger(input.n) && input.n > 0 && input.n < 1000 ? input.n : undefined;
    for (const f of FIELDS) {
      if (input[f] == null) continue;
      if (typeof input[f] !== 'string' || !cfg.keys.has(input[f])) return null;
      r[f] = input[f];
    }
    if (input.votes && typeof input.votes === 'object') {
      const v = {}; for (const k of ['reaction', 'secondary', 'creative', 'clarity', 'style', 'fix']) if (input.votes[k] === 'up' || input.votes[k] === 'down') v[k] = input.votes[k];
      if (Object.keys(v).length) r.votes = v;
    }
    if (input.vote === 'up' || input.vote === 'down') r.vote = input.vote;
    r.fixDetail = str(input.fixDetail, 300);
    r.tea = str(input.tea, 1000);
    r.name = str(input.name, 30);
    if (Number.isFinite(input.viewMs)) r.viewMs = Math.max(0, Math.min(Math.round(input.viewMs), DAY));
    if (input.otherText && typeof input.otherText === 'object') {
      const t = {};
      for (const f of FIELDS) { const s = str(input.otherText[f], 200); if (s) t[f] = s; }
      if (Object.keys(t).length) r.otherText = t;
    }
    if (Number.isFinite(input.submittedAt)) r.submittedAt = Math.min(input.submittedAt, Date.now());
    return r;
  }

  /* ---------- small helpers ---------- */
  const hits = new Map(); // ip -> { n, reset }: 90 writes a minute per address
  const limited = (ip) => {
    const now = Date.now(); let h = hits.get(ip);
    if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(ip, h); }
    return ++h.n > 90;
  };
  setInterval(() => { const now = Date.now(); hits.forEach((h, ip) => { if (now > h.reset) hits.delete(ip); }); }, 120000).unref();

  const isLoopback = (req) => !req.headers['x-forwarded-for'] && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  function isAdmin(req, url) {
    if (!ADMIN_KEY) return isLoopback(req);
    const given = String(req.headers['x-admin-key'] || url.searchParams.get('key') || '');
    const a = Buffer.from(given), b = Buffer.from(ADMIN_KEY);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function reply(req, res, status, body, type = 'application/json', extra = {}) {
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra };
    if (ALLOW_ORIGIN) {
      headers['Access-Control-Allow-Origin'] = ALLOW_ORIGIN;
      headers['Access-Control-Allow-Headers'] = 'Content-Type, x-admin-key';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    }
    res.writeHead(status, headers);
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0, tooBig = false; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { tooBig = true; chunks.length = 0; } else if (!tooBig) chunks.push(c); }); // keep draining so we can still answer
      req.on('end', () => {
        if (tooBig) return reject(Object.assign(new Error('Review is too big.'), { status: 413 }));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(Object.assign(new Error('Bad JSON.'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  const validClient = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(id);
  const statusOf = (r) => (r.submittedAt ? 'submitted' : r.reaction ? 'reacted' : 'draft');

  /* ---------- CSV ---------- */
  function toCsv(records, cfg) {
    const lab = (k) => (k ? cfg.labels.get(k) || k : '');
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formulas in reviewer text
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const iso = (t) => (t ? new Date(t).toISOString() : '');
    const head = ['video', 'name', 'status', 'like', 'like_first_impression', 'like_follow_up', 'like_creativity', 'like_did_it_land', 'like_style', 'like_fix', 'first_impression', 'follow_up', 'creativity', 'did_it_land', 'style', 'fix', 'fix_detail', 'comment_mood', 'comment', 'other_text', 'seconds_on_video', 'submitted_at', 'updated_at', 'reviewer_id', 'video_id'];
    const rows = records.map((r) => [r.n, r.name, statusOf(r), r.vote || '', ...['reaction', 'secondary', 'creative', 'clarity', 'style', 'fix'].map((k) => (r.votes && r.votes[k]) || ''), lab(r.reaction), lab(r.secondary), lab(r.creative), lab(r.clarity), lab(r.style), lab(r.fix),
      r.fixDetail, lab(r.teaMood), r.tea, r.otherText ? JSON.stringify(r.otherText) : '', r.viewMs ? Math.round(r.viewMs / 1000) : '', iso(r.submittedAt), iso(r.updatedAt), r.clientId.slice(0, 8), r.videoId]);
    return [head, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
  }

  const cellOf = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (rows) => rows.map((r) => r.map(cellOf).join(',')).join('\n') + '\n';
  const isoT = (t) => (t ? new Date(t).toISOString() : '');
  const SEEN_MS = 3000; // a video counts as watched after 3 seconds
  function timeCsv(list) {
    return csv([['reviewer_id', 'name', 'total_seconds', 'visits', 'videos_watched', 'first_seen', 'last_seen'],
      ...list.map((x) => [x.clientId.slice(0, 8), x.name, Math.round(x.totalMs / 1000), x.sessions, Object.values(x.perVideo).filter((m) => m >= SEEN_MS).length, isoT(x.firstSeen), isoT(x.lastSeen)])]);
  }
  function timePerVideoCsv(list, numberOf) {
    const rows = [['reviewer_id', 'name', 'video', 'seconds', 'percent_watched', 'finished_times', 'video_id']];
    list.forEach((x) => Object.entries(x.perVideo).sort((a, b) => b[1] - a[1]).forEach(([id, ms]) => rows.push([x.clientId.slice(0, 8), x.name, numberOf[id] || '', Math.round(ms / 1000), (x.watch && x.watch[id] ? x.watch[id].pct : ''), (x.watch && x.watch[id] ? x.watch[id].done : ''), id])));
    return csv(rows);
  }

  /* ---------- the request handler: returns true when the path belongs to the reviews API ---------- */
  return function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/reviews')) return false;
    (async () => {
      try {
        if (req.method === 'OPTIONS') return reply(req, res, 204, '');
        const p = url.pathname.replace(/\/+$/, '');

        if (p === '/api/reviews/ping' && req.method === 'GET') return reply(req, res, 200, { ok: true });

        if (p === '/api/reviews' && req.method === 'POST') {
          if (limited(req.socket.remoteAddress)) return reply(req, res, 429, { error: 'Slow down a little.' });
          const body = await readBody(req);
          if (!validClient(body.clientId)) return reply(req, res, 400, { error: 'Missing or invalid clientId.' });
          const r = clean(body.review, config());
          if (!r) return reply(req, res, 400, { error: 'Invalid review.' });
          const key = body.clientId + '|' + r.videoId, old = db.records[key], now = Date.now();
          db.records[key] = { ...r, clientId: body.clientId, createdAt: old ? old.createdAt : now, updatedAt: now };
          await persist();
          return reply(req, res, 200, { ok: true });
        }

        if (p === '/api/reviews/stats' && req.method === 'GET') {
          const per = {}; // reviewer -> videos they reacted to or gave a verdict on
          for (const r of Object.values(db.records)) if (r.reaction || r.submittedAt) (per[r.clientId] = per[r.clientId] || new Set()).add(r.videoId);
          const ids = Object.keys(per);
          if (ids.length < STATS_MIN) return reply(req, res, 200, { ready: false, reviewers: ids.length, needed: STATS_MIN });
          const median = (a) => { a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
          return reply(req, res, 200, { ready: true, reviewers: ids.length, medianVideos: median(ids.map((c) => per[c].size)),
            medianSeconds: Math.round(median(ids.map((c) => ((db.sessions[c] && db.sessions[c].totalMs) || 0) / 1000))) });
        }

        if (p === '/api/reviews/time' && req.method === 'POST') {
          if (limited(req.socket.remoteAddress)) return reply(req, res, 429, { error: 'Slow down a little.' });
          const body = await readBody(req), cfg = config();
          if (!validClient(body.clientId)) return reply(req, res, 400, { error: 'Missing or invalid clientId.' });
          const num = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(Math.round(v), max)) : 0);
          const perVideo = {};
          if (body.perVideo && typeof body.perVideo === 'object') for (const id of Object.keys(body.perVideo)) if (cfg.videos.has(id)) perVideo[id] = num(body.perVideo[id], DAY);
          const watch = {};
          if (body.watch && typeof body.watch === 'object') for (const id of Object.keys(body.watch)) if (cfg.videos.has(id) && body.watch[id]) watch[id] = { pct: num(body.watch[id].pct, 100), done: num(body.watch[id].done, 1000) };
          const old = db.sessions[body.clientId];
          db.sessions[body.clientId] = {
            clientId: body.clientId, name: str(body.name, 30), totalMs: num(body.totalMs, 7 * DAY), sessions: Math.max(1, num(body.sessions, 10000)), perVideo, watch,
            firstSeen: Number.isFinite(body.firstSeen) ? Math.min(body.firstSeen, Date.now()) : (old ? old.firstSeen : Date.now()), lastSeen: Date.now(), updatedAt: Date.now(),
          };
          await persist();
          return reply(req, res, 200, { ok: true });
        }

        if (p === '/api/reviews' && req.method === 'DELETE') {
          if (limited(req.socket.remoteAddress)) return reply(req, res, 429, { error: 'Slow down a little.' });
          const client = url.searchParams.get('client'), video = url.searchParams.get('video');
          if (!validClient(client)) return reply(req, res, 400, { error: 'Missing or invalid client.' });
          let removed = 0;
          for (const k of Object.keys(db.records)) {
            const r = db.records[k];
            if (r.clientId === client && (!video || r.videoId === video)) { delete db.records[k]; removed++; }
          }
          if (!video && db.sessions[client]) { delete db.sessions[client]; removed++; }
          if (removed) await persist();
          return reply(req, res, 200, { ok: true, removed });
        }

        if (req.method === 'GET' && (p === '/api/reviews' || p === '/api/reviews/export.csv')) {
          if (!isAdmin(req, url)) return reply(req, res, 403, { error: 'Admin only.' });
          const list = Object.values(db.records).sort((a, b) => (a.n || 0) - (b.n || 0) || a.updatedAt - b.updatedAt);
          if (p === '/api/reviews') return reply(req, res, 200, { count: list.length, reviews: list.map((r) => ({ ...r, status: statusOf(r) })) });
          return reply(req, res, 200, toCsv(list, config()), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="xu-stories-reviews.csv"' });
        }

        if (req.method === 'GET' && ['/api/reviews/time', '/api/reviews/time.csv', '/api/reviews/time-per-video.csv'].includes(p)) {
          if (!isAdmin(req, url)) return reply(req, res, 403, { error: 'Admin only.' });
          const list = Object.values(db.sessions).sort((a, b) => b.totalMs - a.totalMs);
          if (p === '/api/reviews/time') return reply(req, res, 200, { count: list.length, totalSeconds: Math.round(list.reduce((s, x) => s + x.totalMs, 0) / 1000), sessions: list });
          const numberOf = {}; // video id -> its #N, for the per-video CSV
          const vids = JSON.parse(fs.readFileSync(path.join(publicDir, 'review-config.json'), 'utf8')).videos;
          for (const id of Object.keys(vids)) numberOf[id] = vids[id].n;
          const out = p === '/api/reviews/time.csv' ? timeCsv(list) : timePerVideoCsv(list, numberOf);
          return reply(req, res, 200, out, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="xu-stories-${p.endsWith('per-video.csv') ? 'time-per-video' : 'time'}.csv"` });
        }

        return reply(req, res, 404, { error: 'Not found.' });
      } catch (e) {
        reply(req, res, e.status || 500, { error: e.status ? e.message : 'Server error.' });
      }
    })();
    return true;
  };
};
