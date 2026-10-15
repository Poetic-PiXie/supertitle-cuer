// Builds docs/Supertitle_Cuer_Manual.pdf from docs/manual/manual.html (the same text as the in-app Help).
// Run with Electron:  npx electron scripts/build-manual-pdf.js   (needs a display; on Linux use xvfb-run)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mdir = path.join(root, 'docs', 'manual');
const pkg = require(path.join(root, 'package.json'));
const out = path.join(root, 'docs', 'Supertitle_Cuer_Manual.pdf');

const body = fs.readFileSync(path.join(mdir, 'manual.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'build', 'icon.png')).toString('base64');
const toc = [...body.matchAll(/<section data-id="([^"]+)" data-part="([^"]*)">\s*<h2>([^<]+)<\/h2>/g)];
let part = '', tocHtml = '';
for (const [, id, p, title] of toc) {
  if (p !== part) { part = p; tocHtml += `<div class="tp">${p}</div>`; }
  tocHtml += `<a href="#${id}">${title}</a>`;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Supertitle Cuer — User Guide</title>
<base href="file://${mdir}/">
<style>
@page { size: A4; margin: 18mm 17mm 20mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1d1f24; margin: 0; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; page-break-after: always; }
.cover img.icon { width: 34mm; height: 34mm; border-radius: 7mm; margin-bottom: 10mm; }
.cover h1 { font-size: 34pt; margin: 0; letter-spacing: -.01em; }
.cover .sub { font-size: 16pt; color: #555; margin: 3mm 0 14mm; }
.cover .by { font-size: 13pt; }
.cover .ver { margin-top: 2mm; color: #777; }
.toc { page-break-after: always; }
.toc h2 { font-size: 20pt; margin: 0 0 6mm; }
.toc .tp { font-size: 9pt; text-transform: uppercase; letter-spacing: .08em; color: #888; margin: 6mm 0 1.5mm; }
.toc a { display: block; color: #1d1f24; text-decoration: none; font-size: 12pt; padding: 1.2mm 0; border-bottom: .2mm dotted #ccc; }
section { page-break-before: always; }
section[data-id="welcome"] { page-break-before: auto; }
h2 { font-size: 20pt; margin: 0 0 4mm; color: #111; }
h3 { font-size: 13pt; margin: 6mm 0 2mm; color: #111; page-break-after: avoid; }
p, li, dd { orphans: 3; widows: 3; }
a { color: #b4740b; text-decoration: none; }
.lead { font-size: 12pt; }
.byline { font-size: 12pt; color: #555; margin-top: -2mm; }
.ui { font-weight: 700; white-space: nowrap; }
kbd { display: inline-block; min-width: 1.3em; text-align: center; font: 8.5pt/1.5 Menlo, Consolas, monospace; background: #f2f3f5; border: .25mm solid #c8cbd2; border-bottom-width: .6mm; border-radius: 1.2mm; padding: 0 1.2mm; }
code, pre { font: 9pt Menlo, Consolas, monospace; background: #f4f5f7; border: .2mm solid #dcdfe4; border-radius: 1mm; }
code { padding: 0 1mm; }
pre { padding: 2mm 3mm; white-space: pre-wrap; }
figure { margin: 3mm 0 4mm; page-break-inside: avoid; }
figure img { max-width: 100%; max-height: 120mm; border-radius: 1.5mm; border: .2mm solid #bbb; display: block; }
figure.small img { max-width: 70%; }
figcaption { font-size: 9pt; color: #666; margin-top: 1.5mm; }
dt { font-weight: 700; margin-top: 2.5mm; page-break-after: avoid; }
dd { margin: .5mm 0 0 6mm; }
ol.callouts { counter-reset: co; list-style: none; padding-left: 0; }
ol.callouts > li { counter-increment: co; position: relative; padding-left: 9mm; margin: 1.6mm 0; }
ol.callouts > li::before { content: counter(co); position: absolute; left: 0; top: .2mm; width: 5.6mm; height: 5.6mm; border-radius: 50%; background: #e5484d; color: #fff; font: 700 8.5pt/5.6mm Helvetica, Arial; text-align: center; }
li.fig { list-style: none; margin-left: -5mm; }
.tip, .note { background: #fbf6ea; border-left: .9mm solid #f2b134; padding: 2mm 3.5mm; border-radius: 0 1.5mm 1.5mm 0; page-break-inside: avoid; }
.note { background: #f3f4f6; border-left-color: #9aa0aa; }
table.keys { border-collapse: collapse; margin: 2mm 0; }
table.keys td, table.keys th { padding: 1.3mm 5mm 1.3mm 0; vertical-align: top; text-align: left; border-bottom: .2mm solid #eee; }
table.keys th { padding-top: 4mm; color: #888; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .07em; }
tr { page-break-inside: avoid; }
.keybox { background: #eef4ff; border: .3mm solid #9dbbe8; border-radius: 2mm; padding: 2mm 3.5mm; margin: 3mm 0 4mm; page-break-inside: avoid; }
.keybox .kbt { font-size: 8pt; font-weight: 700; color: #2a5bb0; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 1mm; }
.keybox .kbr { display: grid; grid-template-columns: 52mm 1fr; gap: 3mm; padding: .9mm 0; border-top: .2mm solid #d3e0f5; font-size: 9.5pt; }
.keybox .kbr:first-of-type { border-top: 0; }
.lockbox { background: #fdf3df; border: .3mm solid #e2b85c; border-radius: 2mm; padding: 2.5mm 3.5mm; margin: 3mm 0; page-break-inside: avoid; }
figure.logo img { max-width: 62mm; border: 0; border-radius: 4mm; }

table.exports { border-collapse: collapse; margin: 3mm 0; font-size: 9.5pt; }
table.exports th, table.exports td { border: .25mm solid #ccc; padding: 1.5mm 2.5mm; text-align: left; vertical-align: top; }
table.exports th { background: #f3f4f6; }
</style></head><body>
<div class="cover"><img class="icon" src="${icon}" alt=""><h1>Supertitle Cuer</h1><div class="sub">User Guide</div>
<div class="by">by <b>poetic PiXie</b></div><div class="ver">Version ${pkg.version}</div></div>
<div class="toc"><h2>Contents</h2>${tocHtml}</div>
${body}
</body></html>`;

app.whenReady().then(async () => {
  const tmp = path.join(mdir, '.print.html');
  fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ show: false, width: 1200, height: 1600, webPreferences: { offscreen: true, webSecurity: false } });
  await win.loadFile(tmp);
  await win.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))');
  // screenshots (and the cover icon, shrunk) go into the PDF as JPEG — far smaller than the lossless images Chromium would embed
  const n = await win.webContents.executeJavaScript(`Promise.all([...document.querySelectorAll('figure img, img.icon')].map(async i => {
    const s = i.classList.contains('icon') ? 360 / i.naturalWidth : 1, c = document.createElement('canvas');
    c.width = Math.round(i.naturalWidth * s); c.height = Math.round(i.naturalHeight * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(i, 0, 0, c.width, c.height); i.src = c.toDataURL('image/jpeg', 0.86); await i.decode(); })).then(a => a.length)`);
  console.log('images as JPEG:', n);
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4', printBackground: true, generateDocumentOutline: true, generateTaggedPDF: true,
    displayHeaderFooter: true, margins: { marginType: 'custom', top: 0.6, bottom: 0.7, left: 0.6, right: 0.6 },
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="font:7.5pt Helvetica,Arial;color:#888;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Supertitle Cuer ${pkg.version} — User Guide · poetic PiXie</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  fs.writeFileSync(out, pdf); fs.unlinkSync(tmp);
  console.log(`Wrote ${path.relative(root, out)} (${(pdf.length / 1e6).toFixed(2)} MB)`);
  app.quit();
});
