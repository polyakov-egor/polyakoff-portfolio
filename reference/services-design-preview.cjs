/* Local-only preview of the real Services subtree; never staged for hosting. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<section class="services"');
const end = html.indexOf('</section>', start) + '</section>'.length;
const backdrop = html.slice(html.indexOf('<div class="about-backdrop" data-site-backdrop'), html.indexOf('<main>'));
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]+>/g)].map(m => m[0]).join('\n');
fs.writeFileSync(path.join(__dirname, 'services-design-preview.html'), `<!doctype html><html lang="en"><head><base href="/"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Services design verification</title>${styles}<script src="./squircle.js" defer></script><script src="./chapter-assets.js" defer></script><script src="./services.js" defer></script><script src="./reference/services-design-preview.js" defer></script></head><body>${backdrop}<main>${html.slice(start, end)}</main></body></html>`);
