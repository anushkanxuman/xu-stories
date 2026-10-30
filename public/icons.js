// Custom icon set that replaces the system emoji across the page.
// Everything in the markup and the review config keeps using the plain emoji as an identifier; this file swaps each
// known one for an inline SVG (line + soft fill, tinted per meaning). Unknown emoji are left alone.
(() => {
  'use strict';
  const C = { lime: '#b6ff3c', pink: '#ff6fa8', gold: '#ffd23f', orange: '#ff9b3d', lilac: '#c4b5fd', violet: '#a78bfa' };
  const S = ' fill="currentColor" fill-opacity=".18"';          // soft tint for the main shape
  const D = (x, y, r = 1.1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
  const face = (inner) => `<circle cx="12" cy="12" r="9.500"${S}/>${inner}`;
  const eyes = D(9, 10.500) + D(15, 10.500);
  const closed = '<path d="M7.500 10.500q1.500 1.600 3 0M13.500 10.500q1.500 1.600 3 0"/>';
  const smile = '<path d="M8.500 14.500q3.500 3 7 0"/>';
  const heart = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 5.500S-5 2.700-5-1.200a2.700 2.700 0 0 1 5-1.300 2.700 2.700 0 0 1 5 1.300C5 2.700 0 5.500 0 5.500z" fill="currentColor" stroke="none"/>`;

  // [colour, svg body]. Keys are emoji without the variation selector.
  const I = {
    '😭': [C.pink, face(closed + '<path d="M8.500 12.500v4M15.500 12.500v4"/><path d="M9 17.500q3-2 6 0"/>')],
    '🫠': [C.pink, face(eyes + '<path d="M8.500 14.500q1.750 1.500 3.500 0t3.500 0"/>') + '<path d="M16.500 20.500q-1.300 1.700 0 2.600 1.300-.9 0-2.600z" fill="currentColor"/>'],
    '🔥': [C.orange, '<path d="M12 2.500c1 3.600 5.500 5.600 5.500 11a5.500 5.500 0 0 1-11 0c0-2.300 1-3.800 2.200-5 .2 1.900 1 2.700 1.800 2.900C10 8 11 5.500 12 2.500z"' + S + '/><path d="M12 21a2.800 2.800 0 0 1-2.800-2.800c0-1.600 1.600-2.400 2.800-4 1.200 1.600 2.800 2.400 2.800 4A2.800 2.800 0 0 1 12 21z"/>'],
    '😐': [C.gold, face(eyes + '<path d="M9 15.500h6"/>')],
    '🥹': [C.lilac, face('<circle cx="9" cy="10.500" r="1.900"/><circle cx="15" cy="10.500" r="1.900"/>' + D(9, 10.500, .7) + D(15, 10.500, .7) + '<path d="M9 16q3-1.800 6 0"/>')],
    '🥰': [C.lime, face(closed + '<path d="M8.500 14.500q3.500 3 7 0"/>') + heart(19, 4.500, .55)],
    '😶': [C.gold, face(eyes + '<path d="M9.500 15.500h5" stroke-dasharray="1 2"/>')],
    '💸': [C.lime, '<rect x="2.500" y="7" width="15" height="10" rx="2"' + S + '/><circle cx="10" cy="12" r="2.200"/><path d="M19.500 8.500l2.200-1.500M20 12h2.500M19.500 15.500l2.200 1.500"/>'],
    '👀': [C.lilac, '<ellipse cx="7.500" cy="12" rx="4.500" ry="5.500"' + S + '/><ellipse cx="16.500" cy="12" rx="4.500" ry="5.500"' + S + '/>' + D(8.500, 12.500, 1.700) + D(15.500, 12.500, 1.700)],
    '💰': [C.lime, '<path d="M9 3.500h6l-1.600 3.200h-2.800z"/><path d="M7.500 21c-2.600-3.600-2.400-9 2.500-11.500h4c4.900 2.500 5.100 7.900 2.500 11.500z"' + S + '/><path d="M12 13v4M10.500 14.500h2.200a1 1 0 0 1 0 2H10.500"/>'],
    '🤔': [C.gold, face(eyes + '<path d="M13 7.600q2-1 3.600-.2"/><path d="M9 16h4.500"/>') + '<path d="M15.500 18.500l2.500-1.500" stroke-width="2"/>'],
    '🤨': [C.gold, face(eyes + '<path d="M13 7.600q2-1.200 3.600 0"/><path d="M9 15.500h6"/>')],
    '🙏': [C.lime, '<path d="M12 20.500l-5-5.500 1-9 3.500 1.500z"' + S + '/><path d="M12 20.500l5-5.500-1-9-3.500 1.500z"' + S + '/>'],
    '🤝': [C.lime, '<path d="M2 9h3v7H2zM19 9h3v7h-3z"/><path d="M5 10l4-1.600 3 1.600 3-1.600 4 1.600v5l-4 3.500-3-1-3 1L5 15z"' + S + '/><path d="M9 13l2 2M12 13.500l2 2"/>'],
    '🫤': [C.pink, face(eyes + '<path d="M8.500 16.500l7-2.200"/>')],
    '🙅': [C.pink, '<circle cx="12" cy="6" r="2.800"' + S + '/><path d="M12 9.500V20M7 11.500l10 5.500M17 11.500L7 17"/>'],
    '💀': [C.pink, '<path d="M12 3a8 8 0 0 0-5 14.200V20h10v-2.800A8 8 0 0 0 12 3z"' + S + '/><circle cx="9" cy="11" r="1.900" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.900" fill="currentColor" stroke="none"/><path d="M12 14l-1 2h2zM10 20v-2.500M14 20v-2.500"/>'],
    '✅': [C.lime, '<rect x="3.500" y="3.500" width="17" height="17" rx="5"' + S + '/><path d="M8 12.500l3 3 5.200-6"/>'],
    '👂': [C.lilac, '<path d="M7.500 9.500a4.500 4.500 0 0 1 9 0c0 2.600-2.500 3.300-3 5.500-.4 2-1.500 3.500-3.200 3.500S7.500 17 7.500 15z"' + S + '/><path d="M10.500 9.500a1.500 1.500 0 0 1 3 0c0 1.200-1.500 1.600-1.500 3"/>'],
    '🧐': [C.gold, face(D(9, 10.500, 1.100) + D(15, 10.500) + '<circle cx="9" cy="10.500" r="2.800" fill="none"/><path d="M9 13.300L7 20"/><path d="M9.500 16h5"/>')],
    '🥱': [C.pink, face(closed + '<ellipse cx="12" cy="16" rx="2.200" ry="2.800"/>')],
    '✨': [C.gold, '<path d="M11 3c.7 4.700 2 6 6.700 6.700-4.700.7-6 2-6.700 6.700-.7-4.700-2-6-6.700-6.700C9 9 10.300 7.700 11 3z"' + S + '/><path d="M19 15.500c.2 1.500.6 1.900 2 2.100-1.400.2-1.800.6-2 2.100-.2-1.500-.6-1.900-2-2.100 1.400-.2 1.800-.6 2-2.100z" fill="currentColor"/>'],
    '💡': [C.gold, '<path d="M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.400-1.600 1-2.100A6 6 0 0 0 12 3z"' + S + '/><path d="M9.500 18.500h5M10.500 21h3"/>'],
    '🎨': [C.gold, '<path d="M12 3a9 9 0 1 0 0 18c1.500 0 2-1 1.500-2-.5-1.200.2-2.500 1.800-2.500H18a3 3 0 0 0 3-3C21 6.500 17 3 12 3z"' + S + '/>' + D(7.500, 11.500, 1) + D(10, 7.500, 1) + D(14.500, 7.500, 1)],
    '😬': [C.pink, face(eyes + '<rect x="8" y="14" width="8" height="3.600" rx="1.600"/><path d="M12 14v3.600"/>')],
    '🔄': [C.lilac, '<path d="M20 9a8.500 8.500 0 0 0-15.500-1.500M4 3.500v4h4M4 15a8.500 8.500 0 0 0 15.500 1.500M20 20.500v-4h-4"/>'],
    '⚡': [C.gold, '<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"' + S + '/>'],
    '🙂': [C.lime, face(eyes + '<path d="M9 14.800q3 2.400 6 0"/>')],
    '😵‍💫': [C.pink, face('<circle cx="9" cy="10.500" r="2"/><circle cx="15" cy="10.500" r="2"/>' + D(9, 10.500, .6) + D(15, 10.500, .6) + '<path d="M8.500 16q1.750-1.500 3.500 0t3.500 0"/>')],
    '🎣': [C.lilac, '<path d="M4 20.500L17 4"/><path d="M17 4v9.500"/><path d="M17 13.500v2.500a2.500 2.500 0 1 1-2.500-2.500"' + S + '/>'],
    '🖼': [C.lilac, '<rect x="3" y="4" width="18" height="16" rx="2.500"' + S + '/><path d="M3.500 17l5-5 4 4 3-3 5 5"/>' + D(16, 9, 1.500)],
    '🎧': [C.lilac, '<path d="M4.500 15v-3a7.500 7.500 0 0 1 15 0v3"/><rect x="3" y="14" width="4.500" height="6.500" rx="2"' + S + '/><rect x="16.500" y="14" width="4.500" height="6.500" rx="2"' + S + '/>'],
    '⏱': [C.lilac, '<circle cx="12" cy="13.500" r="7.500"' + S + '/><path d="M12 9.500v4l2.500 1.500M10 2.500h4M12 2.500V6M18.500 6.500l1.500-1.500"/>'],
    '💬': [C.lilac, '<path d="M4 5.500A2.500 2.500 0 0 1 6.500 3h11A2.500 2.500 0 0 1 20 5.500v8a2.500 2.500 0 0 1-2.500 2.500H11l-4.500 4v-4A2.500 2.500 0 0 1 4 13.500z"' + S + '/>' + D(8.500, 9.500, .9) + D(12, 9.500, .9) + D(15.500, 9.500, .9)],
    '👨‍🍳': [C.lilac, '<path d="M7 14.500v5.500h10v-5.500"/><path d="M7 14.500a3.500 3.500 0 0 1-.8-6.800 4 4 0 0 1 7.600-1.200 3.500 3.500 0 0 1 4 6.600 3.500 3.500 0 0 1-1.800 1.400"' + S + '/><path d="M7 17.500h10"/>'],
    '☕': [C.gold, '<path d="M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"' + S + '/><path d="M16 10h1.500a2.500 2.500 0 0 1 0 5H16M8 3.500q1 1.500 0 3M12 3.500q1 1.500 0 3"/>'],
    '😍': [C.lime, face(heart(9, 9.700, .8) + heart(15, 9.700, .8) + '<path d="M8.500 14.800q3.500 3 7 0"/>')],
    '🤷': [C.gold, '<circle cx="12" cy="7" r="3"' + S + '/><path d="M5 20c0-4 3-6 7-6s7 2 7 6M5.500 14.500L3 11M18.500 14.500L21 11"/>'],
    '🤯': [C.orange, '<circle cx="12" cy="14" r="7"' + S + '/>' + D(9.500, 13, 1) + D(14.500, 13, 1) + '<ellipse cx="12" cy="16.800" rx="1.800" ry="1.300"/><path d="M12 1.500V4M4.500 4.500l1.800 1.800M19.500 4.500l-1.800 1.800M2 10.500h2.500M19.500 10.500H22"/>'],
    '✍': [C.lilac, '<path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19z"' + S + '/><path d="M14.500 6.500l3 3"/>'],
    '👤': [C.lilac, '<circle cx="12" cy="8" r="3.500"' + S + '/><path d="M5 20c0-4 3-6.500 7-6.500s7 2.500 7 6.500"/>'],
    '🎉': [C.gold, '<path d="M4 20.500l4.500-12 7.500 7.500z"' + S + '/><path d="M13 5l.5 2M17 8.500l2-.5M16 4l1.500-1.500M19.500 12l1.800.8"/>' + D(20.500, 5, 1) + D(12, 3, .9)],
    '💜': [C.violet, '<path d="M12 20.500s-8-4.800-8-10.500a4.500 4.500 0 0 1 8-2.800 4.500 4.500 0 0 1 8 2.800c0 5.700-8 10.500-8 10.500z"' + S + '/>'],
    '💖': [C.pink, '<path d="M12 20.500s-8-4.800-8-10.500a4.500 4.500 0 0 1 8-2.800 4.500 4.500 0 0 1 8 2.800c0 5.700-8 10.500-8 10.500z"' + S + '/><path d="M19.500 2.500v3M18 4h3" />'],
    '👋': [C.gold, '<path d="M7 13V6.500a1.500 1.500 0 0 1 3 0V11M10 11V4.500a1.500 1.500 0 0 1 3 0V11M13 11V5.500a1.500 1.500 0 0 1 3 0V13"/><path d="M16 13V9.500a1.500 1.500 0 0 1 3 0v4.500a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.700L4 14.500a1.500 1.500 0 0 1 2.500-1.500L7 14"' + S + '/>'],
    '👁': [C.lilac, '<path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z"' + S + '/><circle cx="12" cy="12" r="3"/>'],
    '🔊': [C.lilac, '<path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"' + S + '/><path d="M15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>'],
    '🔇': [C.pink, '<path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"' + S + '/><path d="M16 9.500l5 5M21 9.500l-5 5"/>'],
    '♪': [C.lilac, '<path d="M9 18V5.500l11-2V16"/><circle cx="6.500" cy="18" r="2.500"' + S + '/><circle cx="17.500" cy="16" r="2.500"' + S + '/>'],
    '✓': [C.lime, '<path d="M5 12.500l4.500 4.500L19 7.500" stroke-width="2.600"/>'],
  };

  const keys = Object.keys(I).sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SRC = keys.map((k) => esc(k) + '\\uFE0F?').join('|');
  const RE = new RegExp(SRC, 'g'), HAS = new RegExp(SRC);

  const build = (key) => {
    const [color, body] = I[key];
    const s = document.createElement('span');
    s.className = 'ic'; s.style.color = color; s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'icon'); s.dataset.e = key;
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    return s;
  };

  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|TITLE|SVG)$/;
  function iconize(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode && !SKIP.test(n.parentNode.nodeName.toUpperCase()) && HAS.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const hits = []; while (w.nextNode()) hits.push(w.currentNode);
    RE.lastIndex = 0;
    hits.forEach((n) => {
      const text = n.nodeValue, frag = document.createDocumentFragment();
      let last = 0, m; RE.lastIndex = 0;
      while ((m = RE.exec(text))) {
        if (m.index > last) frag.append(text.slice(last, m.index));
        frag.append(build(m[0].replace(/️$/, '')));
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.append(text.slice(last));
      n.parentNode.replaceChild(frag, n);
    });
  }

  let queued = false;
  const again = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; RE.lastIndex = 0; iconize(document.body); }); };
  new MutationObserver(again).observe(document.body, { childList: true, subtree: true, characterData: true });
  iconize(document.body);
  window.dropIcons = { has: (e) => !!I[e.replace(/️/g, '')] };
})();
