/* Real mouse/key focus regressions in the native main/preload/renderer.
 * electron tests/cue-focus-regression.cjs [--qa=/absolute/tmp/folder]
 * Optional --html=/absolute/baseline.html runs the same cases against a frozen
 * baseline. No installed app, user project, microphone or clipboard is accessed.
 * Run sequentially with other native input tests to avoid OS focus competition.
 */
const { app, BrowserWindow, ipcMain, dialog, session, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const qa = path.resolve(arg('qa') || fs.mkdtempSync(path.join(os.tmpdir(), 'stq-cue-focus-'))), html = arg('html') && path.resolve(arg('html'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stq-cue-focus-profile-'));
fs.mkdirSync(qa, { recursive: true });
for (const key of ['userData', 'sessionData', 'documents', 'crashDumps']) { const d = path.join(profile, key); fs.mkdirSync(d); app.setPath(key, d); }
app.setAppLogsPath(path.join(profile, 'logs')); app.setName('STQ Cue Focus Regression'); app.commandLine.appendSwitch('disable-background-networking');
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); dialog.showSaveDialog = async () => ({ canceled: true }); dialog.showMessageBox = async () => ({ response: 1 });
if (html) { const load = BrowserWindow.prototype.loadFile; BrowserWindow.prototype.loadFile = function (p, ...args) { return load.call(this, path.resolve(p) === path.join(root, 'dist/Supertitle_Cuer.html') ? html : p, ...args); }; }
else execFileSync(process.execPath, [path.join(root, 'scripts/build-html.js')], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
const ready = new Promise(resolve => ipcMain.once('renderer-ready', event => resolve(BrowserWindow.fromWebContents(event.sender))));
const checks = [], errors = [], diagnostics = []; let win, lastState;
app.on('web-contents-created', (_e, c) => c.on('console-message', e => { if (e.level === 'error' || e.level >= 3) errors.push(e.message); }));
app.whenReady().then(() => { session.defaultSession.setPermissionRequestHandler((_, __, done) => done(false)); session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true })); });
require(path.join(root, 'electron/main.js'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function js(code) { const r = await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(e){return {__error:String(e.stack||e)}}})()`, true); if (r?.__error) throw new Error(r.__error); return r; }
async function settle(ms = 45) { await delay(ms); await js('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'); }
async function state() { return js(`return {markers:JSON.parse(JSON.stringify(state.markers)),texts:state.slides.map(s=>s.text),cur,anchor,pickA,pickB,pickAnchor,active:{tag:document.activeElement.tagName,id:document.activeElement.id,slide:document.activeElement.closest('.slide')?.dataset.i||null},askOpen:document.getElementById('askDlg').open};`); }
async function test(name, fn) { if(arg('case')&&!name.includes(arg('case')))return; try { await fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { lastState = await state(); checks.push({ name, pass: false, error: String(error.stack), actual: lastState }); console.error('FAIL ' + name + '\n' + error.message); } }
async function shot(name) { await settle(); fs.writeFileSync(path.join(qa, name + '.png'), (await win.capturePage()).toPNG()); }
async function key(keyCode, modifiers = []) { win.focus(); win.webContents.focus(); win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await settle(); }
async function point(selector) { return js(`const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing pointer target '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();const x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);if(x<0||y<0||x>=innerWidth||y>=innerHeight)throw new Error('Pointer target outside viewport');return {x,y};`); }
async function mouse(selector, button = 'left') { const p = await point(selector); win.focus(); win.webContents.focus(); win.webContents.sendInputEvent({ type: 'mouseMove', ...p }); win.webContents.sendInputEvent({ type: 'mouseDown', ...p, button, clickCount: 1 }); win.webContents.sendInputEvent({ type: 'mouseUp', ...p, button, clickCount: 1 }); await settle(); return p; }
async function focusText(index, start = 1, end = 2) { await js(`const t=document.querySelector('.slide[data-i="${index}"] textarea');t.focus();t.setSelectionRange(${start},${end});`); assert.equal((await state()).active.tag, 'TEXTAREA'); }
const baseTexts = ['Alpha title', 'Bravo title', 'Charlie title'];
const baseMarkers = [{ page: 1, x: .2, y: .18 }, { page: 1, x: .42, y: .32 }, { page: 1, x: .66, y: .46 }];
async function fixture({ lockCues = false, lockOrder = false } = {}) {
  await js(`document.activeElement?.blur();for(const d of document.querySelectorAll('dialog[open]'))d.close();await stopProjectActivity();setDirty(false);resetProject();setMode('edit');
    const pdf=await PDFLib.PDFDocument.create(),p=pdf.addPage([612,792]),f=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);p.drawText('CUE FOCUS REGRESSION',{x:40,y:740,size:18,font:f});
    state.parts=[{id:'focus-score',name:'Generated focus score.pdf',pages:1}];await loadPdfBytes('Generated focus score.pdf',new Uint8Array(await pdf.save()));
    state.markers=${JSON.stringify(baseMarkers)};state.slides=${JSON.stringify(baseTexts)}.map(text=>({text,b:'hard'}));state.settings.flow=false;state.settings.lockCues=${lockCues};state.settings.lockOrder=${lockOrder};
    document.body.classList.remove('flow');undoStack=[];redoStack=[];nudgeT=0;cur=-1;anchor=null;pickA=pickB=pickAnchor=null;updateLocks();changed(true);document.getElementById('score').scrollTop=0;document.getElementById('slides').scrollTop=0;setDirty(false);`);
  await settle(65);
}
async function menuUndo() { const before=await js('return undoStack.length;');assert.ok(before>0,'Undo snapshot exists');const item=Menu.getApplicationMenu().items.flatMap(i=>i.submenu?.items||[]).find(i=>i.label==='Undo');assert.ok(item,'native Undo menu item');item.click();const end=Date.now()+4000;while(Date.now()<end){if(await js(`return undoStack.length===${before-1}&&!restoring;`)){await settle();return;}await delay(10);}throw new Error('Native Undo did not finish its expected snapshot'); }
function unchangedText(s) { assert.deepEqual(s.texts, baseTexts, 'cue command must not edit supertitle text'); }
function scoreFocused(s) { assert.notEqual(s.active.tag, 'TEXTAREA', 'cue selection must leave text editing'); assert.equal(s.active.id, 'score', 'focus belongs to stable score container'); }
const watchdog = setTimeout(() => { console.error('Cue focus regression timed out'); app.exit(1); }, 120000);
(async () => {
  win = await ready; win.setSize(1440, 960); win.show(); win.focus(); await js(`await idbGet('doc');await idbGet('follow');await idbGet('score');`); await settle();
  for (const target of [0, 1]) for (const deleteKey of ['Delete', 'Backspace']) {
    await test(`${deleteKey} after a true ${target === 0 ? 'same' : 'different'}-cue mouse click removes only its marker`, async () => {
      await fixture(); await focusText(0); await mouse(`.mk[data-i="${target}"]`); const selected = await state(); await key(deleteKey); const after = await state();
      unchangedText(after); assert.deepEqual(after.markers, baseMarkers.filter((_, i) => i !== target)); scoreFocused(selected); assert.equal(after.askOpen, false);
      await menuUndo(); assert.deepEqual((await state()).markers, baseMarkers); unchangedText(await state());
    });
  }
  await test('cue lock blocks marker deletion while the editable title remains untouched', async () => {
    await fixture({ lockCues: true }); await focusText(0); await mouse('.mk[data-i="1"]'); await key('Delete'); const s = await state(); unchangedText(s); assert.deepEqual(s.markers, baseMarkers); scoreFocused(s);
  });
  await test('slide lock does not prevent an unlocked selected cue from being deleted', async () => {
    await fixture({ lockOrder: true }); await focusText(0); await mouse('.mk[data-i="1"]'); await key('Backspace'); const s = await state(); unchangedText(s); assert.deepEqual(s.markers, [baseMarkers[0], baseMarkers[2]]); scoreFocused(s);
  });
  await test('both locks preserve cue markers and title text after score selection', async () => {
    await fixture({ lockCues: true, lockOrder: true }); await focusText(0); await mouse('.mk[data-i="1"]'); await key('Backspace'); const s = await state(); unchangedText(s); assert.deepEqual(s.markers, baseMarkers); scoreFocused(s);
  });
  await test('deliberate textarea Delete and Backspace still edit text without deleting cues', async () => {
    await fixture(); await focusText(1); await key('Delete'); let s = await state(); assert.deepEqual(s.texts, ['Alpha title', 'Bavo title', 'Charlie title']); assert.deepEqual(s.markers, baseMarkers);
    await focusText(1, 2, 2); await key('Backspace'); s = await state(); assert.deepEqual(s.texts, ['Alpha title', 'Bvo title', 'Charlie title']); assert.deepEqual(s.markers, baseMarkers); assert.equal(s.active.tag, 'TEXTAREA');
  });
  await test('score click clears a stale slide range before Delete', async () => {
    await fixture({ lockOrder: true }); await focusText(0); await js('pickA=0;pickB=2;pickAnchor=0;updatePicks();'); await mouse('.mk[data-i="1"]'); await key('Delete'); const s = await state();
    unchangedText(s); assert.deepEqual(s.markers, [baseMarkers[0], baseMarkers[2]]); assert.equal(s.askOpen, false); assert.equal(s.pickA, null); assert.equal(s.pickB, null); assert.equal(s.pickAnchor, null);
  });
  await test('native arrows nudge the clicked cue instead of moving the old text caret', async () => {
    await fixture(); await focusText(0, 1, 1); await mouse('.mk[data-i="1"]'); const size = await js('const r=pageEls[0].wrap.getBoundingClientRect();return {w:r.width,h:r.height};');
    await key('Right'); await key('Down', ['shift']); const s = await state(); unchangedText(s); assert.ok(Math.abs(s.markers[1].x - (.42 + 5 / size.w)) < 1e-7); assert.ok(Math.abs(s.markers[1].y - (.32 + 25 / size.h)) < 1e-7); assert.equal(s.cur, 1); scoreFocused(s);
  });
  await test('true mouse dragging moves the visible cue then Delete removes it and Undo restores both stages', async () => {
    await fixture(); await focusText(0); const p = await point('.mk[data-i="1"]'), end = { x: p.x + 24, y: p.y + 18 };
    win.focus(); win.webContents.focus(); win.webContents.sendInputEvent({ type: 'mouseMove', ...p }); win.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseMove', ...end, button: 'left', modifiers: ['leftButtonDown'] }); await settle();
    const visual = await point('.mk[data-i="1"]');
    win.webContents.sendInputEvent({ type: 'mouseUp', ...end, button: 'left', clickCount: 1 }); await settle(); assert.ok(Math.abs(visual.x - end.x) <= 2 && Math.abs(visual.y - end.y) <= 2, 'live marker element follows the pointer, not a detached old marker'); const moved = await state(); unchangedText(moved); assert.notDeepEqual(moved.markers[1], baseMarkers[1]);
    await key('Delete'); let s = await state(); unchangedText(s); assert.deepEqual(s.markers, [baseMarkers[0], baseMarkers[2]]);
    await menuUndo(); s = await state(); assert.deepEqual(s.markers, moved.markers); unchangedText(s); await menuUndo(); assert.deepEqual((await state()).markers, baseMarkers);
  });
  await test('a text edit commits before cue deletion so Undo restores the cue before reverting text', async () => {
    const record=async stage=>diagnostics.push({stage,...await js(`return {undo:undoStack.map(x=>JSON.parse(x.d)),redo:redoStack.map(x=>JSON.parse(x.d)),before:document.querySelector('.slide[data-i="0"] textarea')?._before,active:document.activeElement.tagName,activeId:document.activeElement.id,texts:state.slides.map(s=>s.text)};`)});
    await fixture();await record('fixture');await focusText(0,1,1);await record('focus');await win.webContents.insertText('X');await settle();await record('edited');
    await mouse('.mk[data-i="1"]');await record('cue clicked');await key('Delete');await record('deleted');
    let s=await state();assert.equal(s.texts[0],'AXlpha title');assert.deepEqual(s.markers,[baseMarkers[0],baseMarkers[2]]);
    await menuUndo();await record('undo1');s=await state();assert.deepEqual(s.markers,baseMarkers);assert.equal(s.texts[0],'AXlpha title');await menuUndo();await record('undo2');assert.deepEqual((await state()).texts,baseTexts);
  });
  await test('placing a new cue after text focus lets Delete remove only the new marker', async () => {
    await fixture();await focusText(0);const p=await js(`const r=pageEls[0].wrap.getBoundingClientRect();return {x:Math.round(r.left+r.width*.8),y:Math.round(r.top+r.height*.24)};`);
    win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'mouseMove',...p});win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});await settle();
    const placed=await state();assert.equal(placed.markers.length,4);scoreFocused(placed);unchangedText(placed);
    await key('Delete');let s=await state();assert.deepEqual(s.markers,baseMarkers);unchangedText(s);await menuUndo();assert.deepEqual((await state()).markers,placed.markers);await menuUndo();assert.deepEqual((await state()).markers,baseMarkers);
  });
  await test('right-click removal also leaves text focus and clears stale slide selection', async () => {
    await fixture(); await focusText(0); await js('pickA=0;pickB=2;pickAnchor=0;updatePicks();'); await mouse('.mk[data-i="1"]', 'right'); const s = await state(); unchangedText(s); assert.deepEqual(s.markers, [baseMarkers[0], baseMarkers[2]]); scoreFocused(s); assert.equal(s.pickA, null); assert.equal(s.pickB, null);
  });
  await shot(checks.some(c => !c.pass) ? 'failed-final-state' : 'cue-focus-passed');
  const input = html || path.join(root, 'dist/Supertitle_Cuer.html'); const report = { checks, errors, diagnostics, html: input, htmlSha256: crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'), source: root, profile, actualNativeMouseAndKeyboard: true, installedAppUntouched: true, generatedScoreOnly: true };
  fs.writeFileSync(path.join(qa, 'cue-focus-report.json'), JSON.stringify(report, null, 2));
  const failed = checks.filter(c => !c.pass).length; clearTimeout(watchdog); for (const w of BrowserWindow.getAllWindows()) w.destroy(); console.log(`${checks.length - failed}/${checks.length} cue-focus cases passed. QA: ${qa}`); app.exit(failed || errors.length ? 1 : 0);
})().catch(async error => { console.error(error.stack); try { fs.writeFileSync(path.join(qa, 'harness-failure.json'), JSON.stringify({ error: String(error.stack), checks, lastState, errors }, null, 2)); } catch (_) {} clearTimeout(watchdog); for (const w of BrowserWindow.getAllWindows()) w.destroy(); app.exit(1); });
