/* Read-only scanned-score stress test. Does not export the duplicated score.
 * electron tests/scanned-multi-section-regression.cjs --score=/path/score.pdf
 *   [--sections=20] [--qa=/absolute/tmp/folder]
 * Uses a temporary profile, muted output, no network/microphone/user app data.
 */
const { app, BrowserWindow, session, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const score = arg('score'); if (!score) throw new Error('Provide --score=/absolute/read-only/score.pdf');
const sections = Number(arg('sections') || 20); if (!Number.isInteger(sections) || sections < 1 || sections > 20) throw new Error('sections must be1–20');
const root = path.resolve(__dirname, '..'), qa = path.resolve(arg('qa') || fs.mkdtempSync(path.join(os.tmpdir(), 'stq-scanned-'))), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stq-scanned-profile-'));
fs.mkdirSync(qa, { recursive: true });
const original = fs.readFileSync(score); if (original.length > 25 * 1024 * 1024) throw new Error('Input limit25MiB exceeded');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originalHash = hash(original), phases = [], errors = []; let win, finished = false;
for (const key of ['userData', 'sessionData', 'documents', 'crashDumps']) { const d = path.join(profile, key); fs.mkdirSync(d); app.setPath(key, d); }
app.setAppLogsPath(path.join(profile, 'logs')); app.commandLine.appendSwitch('disable-background-networking'); app.commandLine.appendSwitch('enable-precise-memory-info');
const preload = path.join(profile, 'fixture-preload.cjs'); fs.writeFileSync(preload, `require('electron').contextBridge.exposeInMainWorld('__scannedFixture',{read:()=>require('electron').ipcRenderer.invoke('scanned-fixture-read')});`);
ipcMain.handle('scanned-fixture-read', event => { if (event.sender !== win?.webContents) throw new Error('Unexpected renderer'); return original; });
execFileSync(process.execPath, [path.join(root, 'scripts/build-html.js')], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function js(code) { const r = await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(e){return {__error:String(e.stack||e)}}})()`, true); if (r?.__error) throw new Error(r.__error); return r; }
function memory() { const pid = win?.webContents.getOSProcessId(); return app.getAppMetrics().find(v => v.pid === pid)?.memory || null; }
async function phase(name, fn) { const started = performance.now(), result = await fn(); const p = { name, elapsedMs: +(performance.now() - started).toFixed(2), rendererMemoryKiB: memory(), ...result }; phases.push(p); console.log('PASS ' + name + ' ' + p.elapsedMs + 'ms'); return p; }
async function shot(name) { await js('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'); await delay(80); fs.writeFileSync(path.join(qa, name + '.png'), (await win.capturePage()).toPNG()); }
function finish(status, detail = {}) { if (finished) return; finished = true; clearInterval(memoryGuard); clearTimeout(watchdog); const after = hash(fs.readFileSync(score)); const report = { status, sections, scoreName: path.basename(score), inputBytes: original.length, inputSha256Before: originalHash, inputSha256After: after, originalUnchanged: after === originalHash, phases, errors, profile, source: root, maxMergedBytes: 200 * 1024 * 1024, microphoneDenied: true, networkDenied: true, audioMuted: true, exportedDuplicatedScore: false, ...detail }; fs.writeFileSync(path.join(qa, 'scanned-multi-section-report.json'), JSON.stringify(report, null, 2)); if (win && !win.isDestroyed()) win.destroy(); app.exit(status === 'pass' ? 0 : status === 'bounded-stop' ? 2 : 1); }
const watchdog = setTimeout(() => finish('bounded-stop', { reason: '240second test budget reached' }), 240000);
const memoryGuard = setInterval(() => { if (!win || win.isDestroyed()) return; const m = memory(); if (m?.workingSetSize > 1900 * 1024) finish('bounded-stop', { reason: 'Renderer working set exceeded1900MiB guard', memoryAtStop: m }); }, 1000);
(async () => {
  await app.whenReady(); session.defaultSession.setPermissionRequestHandler((_, __, done) => done(false)); session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } }); win.webContents.setAudioMuted(true); win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  await win.loadFile(path.join(root, 'dist/Supertitle_Cuer.html')); await js(`await idbGet('doc');await idbGet('follow');await idbGet('score');`);
  await phase('build-and-load-duplicated-scanned-score', () => js(`
    setDirty(false);resetProject();window.confirm=()=>true;
    const bytes=new Uint8Array(await window.__scannedFixture.read());
    const src=await PDFLib.PDFDocument.load(bytes), out=await PDFLib.PDFDocument.create(), n=src.getPageCount();
    state.parts=[];state.markers=[];state.slides=[];refRuns={};
    for(let s=0;s<${sections};s++){
      (await out.copyPages(src,Array.from({length:n},(_,i)=>i))).forEach(p=>out.addPage(p));
      const id='scan-'+s;state.parts.push({id,name:'Scanned section '+(s+1)+'.pdf',title:'Scanned section '+(s+1),pages:n});
      for(let c=0;c<3;c++){state.markers.push({page:s*n+1+Math.floor(c*(n-1)/2),x:.22,y:.22,t:.1+c*.4});state.slides.push({text:'Scanned section '+(s+1)+' / title '+(c+1),b:'hard'});}
      const f=new Float32Array(Math.ceil(1.2*STCFollow.FPS)*STCFollow.NB);for(let i=0;i<f.length;i+=STCFollow.NB){f[i+s%12]=1;f[i+12]=-20;f[i+13]=3;}
      refRuns[id]={source:'file',name:'Small generated reference '+(s+1),duration:1.2,feat:STCFollow.pack(f),audio:null};
    }
    const merged=new Uint8Array(await out.save());if(merged.byteLength>200*1024*1024)throw new Error('Merged score exceeded200MiB guard');
    window.__mergedBytes=merged.byteLength;await loadPdfBytes('Scanned multi-section stress.pdf',merged);setMode('show');changed(true);goTo(-1,false);setDirty(false);
    window.__snap=()=>({parts:JSON.parse(JSON.stringify(state.parts)),markers:JSON.parse(JSON.stringify(state.markers)),slides:JSON.parse(JSON.stringify(state.slides)),refs:Object.fromEntries(Object.entries(refRuns).map(([id,r])=>[id,{meta:refMeta(r),feat:STCSlideTransfer.base64(r.feat)}]))});window.__baseline=window.__snap();
    return {originalPages:n,pages:pdfDoc.numPages,sections:partsList().length,mergedBytes:merged.byteLength,references:Object.keys(refRuns).length,featureBytes:Object.values(refRuns).reduce((n,r)=>n+r.feat.byteLength,0)};`));
  assert.equal(await js(`return partsList().length===${sections}&&state.markers.length===${sections * 3};`), true);
  const points = [0, Math.floor(sections / 2), sections - 1, 0], samples = [];
  for (const s of points) {
    samples.push(await phase('jump-to-scanned-section-' + (s + 1), async () => {
      const selectedAt=performance.now();
      const selection = await js(`const start=performance.now(),i=cuesOf('scan-${s}')[0];goTo(i);return {selectionCallMs:performance.now()-start,currentPart:autoSection().part.id,currentPage:state.markers[i].page,targetPage:(state.markers[i+1]||state.markers[i]).page};`);
      let targetReady=false;const until=performance.now()+8000;
      while(performance.now()<until){targetReady=await js(`return pageEls[${selection.targetPage-1}].renderedW>0;`);if(targetReady)break;await delay(25);}
      const targetReadyMs=+(performance.now()-selectedAt).toFixed(2);
      return { ...selection,targetReady,targetReadyMs, ...await js(`return {renderedPages:pageEls.filter(p=>p.renderedW>0).length,pixels:pageEls.reduce((n,p)=>n+p.canvas.width*p.canvas.height,0),largestPixels:Math.max(...pageEls.map(p=>p.canvas.width*p.canvas.height)),activeRenders:activePageRenders,jsHeapUsed:performance.memory?.usedJSHeapSize||null};`) };
    }));
  }
  for (const p of samples) { assert.ok(p.renderedPages <= 8); assert.ok(p.largestPixels <= 8000000); assert.ok(p.activeRenders <= 2); }
  await shot('scanned-' + sections + '-sections');
  const beforeSave = memory();
  if ((beforeSave?.workingSetSize || 0) > 1000 * 1024) { finish('bounded-stop', { reason: 'Skipping serialization because renderer already exceeds1000MiB working set', saveReopenTested: false }); return; }
  await phase('serialize-in-memory-project', () => js(`window.__roundtrip=await buildProjectPdf();return {projectBytes:window.__roundtrip.byteLength};`));
  await phase('reopen-in-memory-project', () => js(`setDirty(false);resetProject();await openAny(new File([window.__roundtrip],'Scanned stress roundtrip.supertitles'),null);if(JSON.stringify(window.__snap())!==JSON.stringify(window.__baseline))throw new Error('Roundtrip changed section/cue/reference data');return {pages:pdfDoc.numPages,sections:partsList().length};`));
  await phase('dispose-score-canvas-backing', async () => { await js('window.__oldPages=[...pageEls];await stopProjectActivity();setDirty(false);resetProject();'); await delay(80); assert.equal(await js('return pageEls.length===0&&window.__oldPages.every(p=>p.canvas.width===0&&p.canvas.height===0);'), true); return {}; });
  assert.deepEqual(errors, []); assert.equal(hash(fs.readFileSync(score)), originalHash); finish('pass', { saveReopenTested: true });
})().catch(async error => { console.error(error.stack); try { if (win && !win.isDestroyed()) await shot('failure'); } catch (_) {} finish('fail', { error: String(error.stack) }); });
