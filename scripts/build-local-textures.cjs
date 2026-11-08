// Origin-clean texture URLs let the standalone file:// preview use WebGL.
// Run again only when replacing the original portrait or its depth map.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const imagePath = path.join(root, 'assets', 'images');
const dataURL = name => 'data:image/png;base64,' + fs.readFileSync(path.join(imagePath, name)).toString('base64');
const textures = { color: dataURL('hero-original.png'), depth: dataURL('hero-depth.png') };
fs.writeFileSync(path.join(imagePath, 'hero-textures.js'), '/* Exact local PNG bytes for standalone preview. */\nwindow.HeroDepthTextures = Object.freeze(' + JSON.stringify(textures) + ');\n');
console.log('Local texture bundle created.');
