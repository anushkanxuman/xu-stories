// The "Add video" tab: video + caption + tech in, everything else is automatic. Local server only (see admin-add.js).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  let known = { tools: {}, labels: [], categories: [], next: 0 }, file = null, catTouched = false;

  /* guess which review questions fit, from the caption (you can change it) */
  const GUESS = [
    ['fun', /\b(pov|lol|lmao|funny|hilarious|meme|relatable|salary|rent)\b|😂|💀|🤣/i],
    ['emo', /\b(feel|feelings|heart|cry|lonely|miss|overthought|fear|anxious|sad|emotional)\b|🥹|😭|🫂|❤️‍🩹/i],
    ['skl', /\b(skill|learn|side hustle|hustle|good at|talent|portfolio|upskill)\b/i],
    ['car', /\b(career|job|interview|offer letter|internship|resume|freelanc|client|boss|work)\b/i],
    ['fri', /\b(friend|friends|squad|people|group chat|lonely|connect|besties|community)\b/i],
  ];
  const guess = (t) => { let best = 'gen', n = 0; GUESS.forEach(([k, re]) => { const m = (t.match(new RegExp(re.source, 'gi')) || []).length; if (m > n) { n = m; best = k; } }); return best; };

  /* ---- tech rows ---- */
  const stepsEl = $('steps');
  function addRow(label = '', tool = '') {
    const r = document.createElement('div'); r.className = 'step';
    const l = document.createElement('input'); l.type = 'text'; l.placeholder = 'Step'; l.value = label; l.setAttribute('list', 'labels'); l.setAttribute('aria-label', 'Step name'); l.maxLength = 40;
    const t = document.createElement('input'); t.type = 'text'; t.placeholder = 'Tool, e.g. ChatGPT'; t.value = tool; t.setAttribute('aria-label', 'Tool'); t.maxLength = 60;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove this step');
    const suggest = () => { // suggest the tools already used for this step name
      const dl = $('tools'); dl.replaceChildren(...(known.tools[l.value.trim()] || []).map((v) => Object.assign(document.createElement('option'), { value: v }))); t.setAttribute('list', 'tools');
    };
    l.addEventListener('input', () => { suggest(); chips(); }); l.addEventListener('change', suggest); t.addEventListener('focus', suggest); t.addEventListener('input', chips);
    x.addEventListener('click', () => { r.remove(); chips(); });
    r.append(l, t, x); stepsEl.append(r); return r;
  }
  const readSteps = () => [...stepsEl.children].map((r) => { const i = r.querySelectorAll('input'); return { label: i[0].value.trim(), tool: i[1].value.trim() }; }).filter((s) => s.label && s.tool);
  function chips() {
    const box = $('chips'); box.replaceChildren(...readSteps().map((s) => { const c = document.createElement('span'); c.className = 'made-chip'; const a = document.createElement('i'); a.textContent = s.label; const b = document.createElement('b'); b.textContent = s.tool; c.append(a, b); return c; }));
  }
  $('addStep').addEventListener('click', () => addRow().querySelector('input').focus());

  /* ---- file ---- */
  const drop = $('drop'), input = $('file');
  const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
  function setFile(f) {
    if (!f) return;
    if (!/\.(mp4|mov|m4v|webm)$/i.test(f.name)) { say('Use an .mp4, .mov, .m4v or .webm file.', 'err'); return; }
    file = f; say('');
    const pv = $('pv'); pv.src = URL.createObjectURL(f);
    $('pm').textContent = `${f.name} · ${size(f.size)}`; $('pick').hidden = false; ready();
  }
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => setFile(input.files[0]));
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); });

  /* ---- caption + options ---- */
  const cap = $('cap');
  cap.addEventListener('input', () => {
    $('cc').textContent = cap.value.length + ' / 3000';
    if (!catTouched) { $('cat').value = guess(cap.value); $('auto').hidden = !cap.value.trim(); }
    ready();
  });
  $('cat').addEventListener('change', () => { catTouched = true; $('auto').hidden = true; });
  const ready = () => { $('go').disabled = !(file && cap.value.trim()); };
  const say = (t, cls) => { const m = $('msg'); m.textContent = t; m.className = 'msg' + (cls ? ' ' + cls : ''); };

  /* ---- send ---- */
  $('go').addEventListener('click', () => {
    const steps = readSteps();
    store.set('xs-add-steps', JSON.stringify(steps)); // next time starts from these
    const meta = { filename: file.name, caption: cap.value, steps, primary: $('cat').value, spread: $('spread').checked };
    const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/admin/add');
    xhr.setRequestHeader('X-Meta', encodeURIComponent(JSON.stringify(meta)));
    $('go').disabled = true; $('bar').hidden = false; say('Uploading…');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) $('bar').firstElementChild.style.width = (e.loaded / e.total * 100) + '%'; };
    xhr.onerror = () => { say('Could not reach the server.', 'err'); $('go').disabled = false; };
    xhr.onload = () => {
      let j = {}; try { j = JSON.parse(xhr.responseText); } catch (e) { /* not json */ }
      if (xhr.status !== 200 || !j.ok) { say(j.error || 'Something went wrong.', 'err'); $('go').disabled = false; return; }
      say(`✓ Added as video #${j.n}. Open the feed to see it.`, 'ok');
      const m = $('msg'); m.append(' ', Object.assign(document.createElement('a'), { href: '/', textContent: 'Open feed' }), ' · ',
        Object.assign(document.createElement('a'), { href: '/add.html', textContent: 'Add another' }));
    };
    xhr.send(file);
  });

  /* ---- start ---- */
  fetch('/api/admin/ping').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.admin) throw new Error('no');
    known = j;
    $('labels').replaceChildren(...j.labels.map((v) => Object.assign(document.createElement('option'), { value: v })));
    $('cat').replaceChildren(...j.categories.map((c) => Object.assign(document.createElement('option'), { value: c.key, textContent: c.label })));
    $('cat').value = 'gen';
    $('next').textContent = `It will be video #${j.next}.`;
    let last = null; try { last = JSON.parse(store.get('xs-add-steps') || 'null'); } catch (e) { /* none */ }
    (last && last.length ? last : [{ label: 'Script', tool: 'ChatGPT' }, { label: 'Character', tool: 'ChatGPT' }, { label: 'Video', tool: '' }]).forEach((s) => addRow(s.label, s.tool));
    chips(); $('app').hidden = false; $('only').hidden = true;
  }).catch(() => { $('only').textContent = 'This page only works on the local server (run `node server.js` and open it from this computer).'; });
})();
