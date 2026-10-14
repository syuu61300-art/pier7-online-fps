// Bundles index.html + css + js modules into one self-contained HTML file
// (the format a claude.ai artifact needs). The repository itself runs without this step.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const minify = !process.argv.includes('--dev');

const res = await build({
  entryPoints: [join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify,
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const title = head.match(/<title>.*?<\/title>/)[0];
const fontLinks = (head.match(/<link [^>]*>/g) || []).filter((l) => !l.includes('css/style.css')).join('\n');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script type="module"[^>]*><\/script>/, '').trim();

// artifact format: no doctype/html/head/body; the host adds the skeleton
const page = `${title}\n${fontLinks}\n<style>\n${css}</style>\n${body}\n<script>\n${js}\n</script>\n`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/pier7-artifact.html'), page);
// same page as a full document (open directly in a browser, no server needed for offline play)
const doc = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page}</body></html>`;
writeFileSync(join(root, 'dist/pier7-single.html'), doc);
console.log('built', (page.length / 1024).toFixed(0) + ' KB');
