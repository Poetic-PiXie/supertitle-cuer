// Builds the standalone single-file app (dist/Supertitle_Cuer.html) by inlining
// pdf.js and pdf-lib into src/app.html. The desktop app loads this same file.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = (p) => path.join(root, 'node_modules', p);
const pkg = require(path.join(root, 'package.json'));

let html = fs.readFileSync(path.join(root, 'src', 'app.html'), 'utf8');
const libs = {
  PDFJS: nm('pdfjs-dist/build/pdf.min.js'),
  PDFJSWORKER: nm('pdfjs-dist/build/pdf.worker.min.js'),
  PDFLIB: nm('pdf-lib/dist/pdf-lib.min.js'),
  FOLLOWJS: path.join(root, 'src', 'follow.js'),
};
for (const [key, file] of Object.entries(libs)) {
  const code = fs.readFileSync(file, 'utf8');
  if (/<\/script/i.test(code)) throw new Error(`${file} contains </script>`);
  const marker = `/*@@${key}@@*/`;
  if (!html.includes(marker)) throw new Error(`missing ${marker} in src/app.html`);
  html = html.split(marker).join(code);
}
// the guide (docs/manual), with its screenshots inlined, for the in-app Help
const mdir = path.join(root, 'docs', 'manual');
let manual = fs.readFileSync(path.join(mdir, 'manual.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
manual = manual.replace(/src="(shots\/[^"]+)"/g, (m, f) => {
  const p = path.join(mdir, f);
  if (!fs.existsSync(p)) return 'src="" data-missing="' + f + '"';
  const ext = path.extname(f).slice(1).replace('jpg', 'jpeg');
  return 'src="data:image/' + ext + ';base64,' + fs.readFileSync(p).toString('base64') + '" loading="lazy"';
});
if (!html.includes('/*@@MANUAL@@*/')) throw new Error('missing /*@@MANUAL@@*/ in src/app.html');
html = html.split('/*@@MANUAL@@*/').join(manual);
html = html.split('@@VERSION@@').join(pkg.version);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'Supertitle_Cuer.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${(html.length / 1e6).toFixed(2)} MB, v${pkg.version})`);
