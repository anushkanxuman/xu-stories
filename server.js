const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const VIDEOS = path.join(PUBLIC, 'videos');
const REVIEWS_FILE = path.join(ROOT, 'reviews.json');
const POSTERS = path.join(PUBLIC, 'posters');
const META_FILE = path.join(ROOT, 'videos-meta.json'); // optional titles: [{ "file": "a.mp4", "title": "...", "description": "..." }]

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.ogv': 'video/ogg',
};
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);

const readJSON = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

function listVideos() {
  const meta = readJSON(META_FILE, []);
  const metaByFile = Object.fromEntries(meta.map((m) => [m.file, m]));
  const files = fs.existsSync(VIDEOS) ? fs.readdirSync(VIDEOS) : [];
  return files
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => {
      const m = metaByFile[f] || {};
      return {
        id: f,
        title: m.title || path.basename(f, path.extname(f)).replace(/[-_]+/g, ' '),
        description: m.description || '',
        src: '/videos/' + encodeURIComponent(f),
        poster: fs.existsSync(path.join(POSTERS, f + '.jpg')) ? '/posters/' + encodeURIComponent(f + '.jpg') : '',
      };
    });
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) { // needed so videos can seek / forward
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (m && !m[1] && m[2]) { start = Math.max(0, st.size - parseInt(m[2], 10)); end = st.size - 1; }
      if (start >= st.size || end >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1,
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/videos' && req.method === 'GET') return send(res, 200, listVideos());

  if (pathname === '/api/reviews' && req.method === 'GET') {
    const all = readJSON(REVIEWS_FILE, []);
    const vid = url.searchParams.get('video');
    return send(res, 200, vid ? all.filter((r) => r.videoId === vid) : all);
  }

  if (pathname === '/api/reviews' && req.method === 'POST') {
    try {
      const b = JSON.parse(await readBody(req));
      const review = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        videoId: clean(b.videoId, 300),
        name: clean(b.name, 40) || 'Anonymous',
        rating: Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5)),
        text: String(b.text ?? '').trim().slice(0, 1000),
        createdAt: new Date().toISOString(),
      };
      if (!review.text) return send(res, 400, { error: 'Review text is required' });
      if (!listVideos().some((v) => v.id === review.videoId)) return send(res, 400, { error: 'Unknown video' });
      const all = readJSON(REVIEWS_FILE, []);
      all.push(review);
      fs.writeFileSync(REVIEWS_FILE, JSON.stringify(all, null, 2));
      return send(res, 201, review);
    } catch {
      return send(res, 400, { error: 'Bad request' });
    }
  }

  const p = safeJoin(PUBLIC, pathname === '/' ? 'index.html' : pathname.slice(1));
  return p ? serveFile(req, res, p) : send(res, 403, 'Forbidden', 'text/plain');
});

// Light first-frame images for the carousel cards (needs ffmpeg; cards fall back to the video itself without it).
async function makePosters() {
  fs.mkdirSync(POSTERS, { recursive: true });
  for (const v of listVideos()) {
    const out = path.join(POSTERS, v.id + '.jpg');
    if (fs.existsSync(out)) continue;
    await new Promise((done) => execFile('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '0.5', '-i', path.join(VIDEOS, v.id),
      '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', out], () => done()));
  }
}
function writeManifest() { // static hosts (Vercel) read this instead of /api/videos
  fs.writeFileSync(path.join(PUBLIC, 'videos.json'), JSON.stringify(listVideos(), null, 2));
}

module.exports = { makePosters, writeManifest };

if (require.main === module) makePosters().then(writeManifest);
if (require.main === module) server.listen(PORT, () => console.log(`Stories running at http://localhost:${PORT}`));
