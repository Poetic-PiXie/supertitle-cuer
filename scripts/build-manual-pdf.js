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
const html = require(path.join(root, 'src', 'guide-print.js')).document(body, { version: pkg.version, icon, base: `file://${mdir}/` });

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
