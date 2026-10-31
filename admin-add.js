// "Add video" tab backend (local server only). Takes a video file + caption + the tools used, and does the rest:
// numbers it, saves it, makes the poster, writes captions / how-it's-made / review config, and refreshes videos.json.
//   GET  /api/admin/ping   -> { admin: true, next, tools, labels, categories }   (the feed uses this to show the "+ Add video" link)
//   POST /api/admin/add    -> body = the raw video file, metadata in the X-Meta header (URI-encoded JSON)
// Only answers on the machine running the server (loopback, no proxy headers), or with ADMIN_KEY when one is set.
// On a static host (Vercel / the company staging site) these routes don't exist, so the link never shows up there.
const fs = require('fs');
const path = require('path');
const { timingSafeEqual } = require('crypto');

module.exports = function adminAdd({ root, publicDir, listVideos, makePosters, writeManifest }) {
  const VIDEOS = path.join(publicDir, 'videos');
  const F = {
    captions: path.join(publicDir, 'captions.json'), made: path.join(publicDir, 'made-with.json'),
    review: path.join(publicDir, 'review-config.json'), numbers: path.join(root, 'video-numbers.txt'),
  };
  const MAX_BYTES = 800 * 1024 * 1024;
  const EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);
  const ADMIN_KEY = process.env.ADMIN_KEY || '';

  const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
  const writeJSON = (f, data) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n'); fs.renameSync(tmp, f); };
  const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

  function isAdmin(req, url) {
    if (ADMIN_KEY) {
      const got = Buffer.from(String(req.headers['x-admin-key'] || url.searchParams.get('key') || '')), want = Buffer.from(ADMIN_KEY);
      if (got.length === want.length && timingSafeEqual(got, want)) return true;
    }
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    return local && !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-host'];
  }

  // tools already used on other videos, so the form can suggest them
  function knownTools() {
    const made = readJSON(F.made, { types: {}, videos: {} });
    const by = {}, labels = new Set(['Script', 'Character', 'Video', 'Voice', 'Music', 'Edit', 'Style', 'Stills']);
    const add = (steps) => (steps || []).forEach((s) => { if (s && s.label && s.tool) { labels.add(s.label); (by[s.label] = by[s.label] || new Set()).add(s.tool); } });
    Object.values(made.types || {}).forEach(add);
    Object.values(made.videos || {}).forEach((v) => add(typeof v === 'string' ? made.types[v] : v && v.steps));
    const out = {}; for (const k of Object.keys(by)) out[k] = [...by[k]].sort();
    return { tools: out, labels: [...labels] };
  }

  const categories = () => Object.entries(readJSON(F.review, { categories: {} }).categories).map(([key, c]) => ({ key, label: (c.heading || key).replace(/\s*[^\w\s?'.!]+\s*$/u, '') }));

  let lock = Promise.resolve();

  async function add(req, res) {
    let meta;
    try { meta = JSON.parse(decodeURIComponent(String(req.headers['x-meta'] || '{}'))); } catch { return reply(res, 400, { error: 'Bad details.' }); }
    const caption = str(meta.caption, 3000);
    if (!caption) return reply(res, 400, { error: 'Write a caption first.' });
    const ext = path.extname(str(meta.filename, 200)).toLowerCase();
    if (!EXT.has(ext)) return reply(res, 400, { error: 'Use an .mp4, .mov, .m4v or .webm file.' });
    const steps = (Array.isArray(meta.steps) ? meta.steps : []).slice(0, 10)
      .map((s) => ({ label: str(s && s.label, 40), tool: str(s && s.tool, 60) })).filter((s) => s.label && s.tool);
    const cats = readJSON(F.review, { categories: {}, videos: {} });
    const primary = cats.categories[meta.primary] ? meta.primary : 'gen';
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BYTES) return reply(res, 413, { error: 'That file is too big (max 800 MB).' });

    const run = lock.then(async () => {
      fs.mkdirSync(VIDEOS, { recursive: true });
      const tmp = path.join(VIDEOS, '.upload-' + Date.now() + '.part');
      let size = 0, tooBig = false;
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp);
        req.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { tooBig = true; req.destroy(); out.destroy(); resolve(); } });
        req.pipe(out); out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
      });
      if (tooBig || !size) { fs.rmSync(tmp, { force: true }); throw Object.assign(new Error(tooBig ? 'That file is too big (max 800 MB).' : 'The file was empty.'), { status: tooBig ? 413 : 400 }); }

      // number = position in the alphabetical list, so naming it zz<N> keeps #N stable (new videos go last)
      const n = listVideos().length + 1;
      const slug = path.basename(str(meta.filename, 200), ext).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'video';
      const id = `zz${n}_${slug}${ext}`;
      fs.renameSync(tmp, path.join(VIDEOS, id));

      const caps = readJSON(F.captions, {});
      caps[id] = meta.spread === false ? { caption } : { caption, mix: true }; // mix = spread through the feed, not bunched at the end
      writeJSON(F.captions, caps);
      if (steps.length) { const made = readJSON(F.made, { types: {}, groups: [], videos: {} }); made.videos = made.videos || {}; made.videos[String(n)] = { steps }; writeJSON(F.made, made); }
      cats.videos = cats.videos || {}; cats.videos[id] = { primary, n }; writeJSON(F.review, cats);
      fs.appendFileSync(F.numbers, `${n}\t${id}\n`);
      await makePosters(); writeManifest();
      return { ok: true, n, id };
    });
    lock = run.catch(() => {});
    try { reply(res, 200, await run); }
    catch (e) { reply(res, e.status || 500, { error: e.status ? e.message : 'Could not add the video.' }); if (!e.status) console.error('add video:', e); }
  }

  return function handle(req, res, url) {
    if (url.pathname !== '/api/admin/ping' && url.pathname !== '/api/admin/add') return false;
    if (!isAdmin(req, url)) { reply(res, 403, { error: 'Admin only.' }); return true; }
    if (url.pathname === '/api/admin/ping' && req.method === 'GET') { reply(res, 200, { admin: true, next: listVideos().length + 1, ...knownTools(), categories: categories() }); return true; }
    if (url.pathname === '/api/admin/add' && req.method === 'POST') { add(req, res); return true; }
    reply(res, 405, { error: 'Method not allowed.' }); return true;
  };
};
