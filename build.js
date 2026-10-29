// Regenerates public/videos.json (and thumbnails) after you add or remove videos: node build.js
const { makePosters, writeManifest } = require('./server');
makePosters().then(() => { writeManifest(); console.log('public/videos.json updated'); });
