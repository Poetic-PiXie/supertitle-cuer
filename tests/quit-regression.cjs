/* Pure close/quit protocol cases:
 *   node tests/quit-regression.cjs --pure
 * Native process-exit verification (isolated Electron children; no user profile):
 *   node tests/quit-regression.cjs --native [--qa=/absolute/tmp/folder]
 * Native mode uses the existing dist HTML and never rebuilds/packages the app.
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'), mainPath = path.join(root, 'electron/main.js'), source = fs.readFileSync(mainPath, 'utf8');
const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const qa = path.resolve(arg('qa') || path.join(os.tmpdir(), 'stq-quit-qa'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function until(fn, label, timeout = 6000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(10); } throw new Error('Timeout: ' + label); }
function between(a, b) { const start = source.indexOf(a), end = source.indexOf(b, start); assert.ok(start >= 0 && end > start, 'source extraction markers'); return source.slice(start, end); }
function pureHarness(config = {}) {
  const handlers = new Map(), pending = [], calls = { quit: 0, prompt: 0, save: 0, clean: 0, prepare: 0, created: 1, closed: 0 };
  let c, closeHandler, dirty = !!config.dirty;
  function makeWindow() {
    let destroyed = false;
    const w = { isDestroyed: () => destroyed, on: (name, f) => { if (name === 'close') closeHandler = f; }, webContents: { executeJavaScript: async code => {
      if (code.includes('__stcPrepareClose')) { calls.prepare++; if (config.prepareGate) await config.prepareGate.promise; }
      else if (code.startsWith('saveDoc')) { calls.save++; if (config.saveResult !== false && !config.editsDuringSave) dirty = false; return config.saveResult !== false && !dirty; }
      else if (code.includes('__stcIsDirty')) return dirty;
      else if (code.includes('__stcCleanClose')) calls.clean++;
    } }, close() {
      let prevented = false; const promise = closeHandler({ preventDefault() { prevented = true; } }); pending.push(promise);
      if (prevented) app.quitting = false;
      else { destroyed = true; calls.closed++; c.win = null; if (app.quitting) app.exited = true; else handlers.get('window-all-closed')(); }
    } }; return w;
  }
  const app = { quitting: false, exited: false, on: (name, fn) => handlers.set(name, fn), isReady: () => true, quit() {
    calls.quit++; app.quitting = true; let prevented = false;
    handlers.get('before-quit')({ preventDefault() { prevented = true; } });
    if (prevented) { app.quitting = false; return; }
    if (c.win && !c.win.isDestroyed()) c.win.close(); else app.exited = true;
  } };
  c = vm.createContext({ app, win: null, allowClose: false, closePending: false, quitRequested: false, rendererDirty: dirty, isMac: config.isMac !== false,
    createWindow() { if (c.quitRequested) return; calls.created++; c.allowClose = false; c.win = makeWindow(); },
    dialog: { showMessageBox: async () => { calls.prompt++; return { response: config.promptGate ? await config.promptGate.promise : config.response ?? 1 }; } } });
  c.win = makeWindow();
  vm.runInContext(between("  win.on('close', async (e) => {", "  win.on('closed', () => {"), c);
  vm.runInContext(between("app.on('before-quit', e => {", 'app.whenReady().then'), c);
  vm.runInContext(between("app.on('activate', () => {", '// Like Word:'), c);
  vm.runInContext(between("app.on('window-all-closed',", "app.on('will-quit',"), c);
  return { c, app, calls, config, activate: () => handlers.get('activate')(), async flush() { for (let i = 0; i < pending.length; i++) await pending[i]; }, setDirty: value => { dirty = value; } };
}
async function pureCases() {
  const checks = [];
  async function test(name, fn) { await fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); }
  await test('first clean Quit resumes native app quit after its async close check', async () => { const h = pureHarness(); h.app.quit(); await h.flush(); assert.equal(h.app.exited, true); assert.equal(h.calls.prepare, 1); assert.equal(h.calls.clean, 1); assert.equal(h.calls.quit, 2); });
  await test('dirty Save and Don’t Save approve Quit once', async () => { for (const response of [0, 1]) { const h = pureHarness({ dirty: true, response }); h.app.quit(); await h.flush(); assert.equal(h.app.exited, true); assert.equal(h.calls.prompt, 1); assert.equal(h.calls.save, response === 0 ? 1 : 0); } });
  await test('Cancel resets quit intent and permits a later normal Quit', async () => { const h = pureHarness({ dirty: true, response: 2 }); h.app.quit(); await h.flush(); assert.equal(h.app.exited, false); assert.equal(h.c.quitRequested, false); assert.equal(h.c.allowClose, false); h.config.response = 1; h.app.quit(); await h.flush(); assert.equal(h.app.exited, true); assert.equal(h.calls.prompt, 2); });
  await test('failed Save keeps the window alive and resets quit intent', async () => { const h = pureHarness({ dirty: true, response: 0, saveResult: false }); h.app.quit(); await h.flush(); assert.equal(h.app.exited, false); assert.equal(h.c.quitRequested, false); assert.equal(h.calls.clean, 0); });
  await test('edits arriving during successful Save still prevent Quit', async () => { const h = pureHarness({ dirty: true, response: 0, editsDuringSave: true }); h.app.quit(); await h.flush(); assert.equal(h.app.exited, false); assert.equal(h.c.quitRequested, false); assert.equal(h.calls.clean, 0); });
  await test('repeated Quit while one prompt is open produces only one prompt', async () => { const gate = deferred(), h = pureHarness({ dirty: true, promptGate: gate }); h.app.quit(); await until(() => h.calls.prompt === 1, 'pending prompt'); h.app.quit(); h.app.quit(); gate.resolve(1); await h.flush(); assert.equal(h.app.exited, true); assert.equal(h.calls.prompt, 1); assert.equal(h.calls.prepare, 1); });
  await test('Quit during an in-flight red-window close retains the Quit request', async () => { const gate = deferred(), h = pureHarness({ prepareGate: gate }); h.c.win.close(); h.app.quit(); gate.resolve(); await h.flush(); assert.equal(h.app.exited, true); assert.equal(h.calls.prepare, 1); });
  await test('ordinary Mac red-window close stays running and activation reopens', async () => { const h = pureHarness(); h.c.win.close(); await h.flush(); assert.equal(h.app.exited, false); assert.equal(h.c.win, null); h.activate(); assert.equal(h.calls.created, 2); assert.equal(h.c.allowClose, false); });
  await test('activation cannot recreate an absent operator while Quit is pending', async () => { const h = pureHarness(); h.c.quitRequested = true; h.c.win = null; h.activate(); assert.equal(h.calls.created, 1); });
  await test('Windows last-window close still terminates the app', async () => { const h = pureHarness({ isMac: false }); h.c.win.close(); await h.flush(); assert.equal(h.app.exited, true); assert.equal(h.calls.clean, 1); });
  await test('Windows dirty Cancel keeps its last window alive', async () => { const h = pureHarness({ isMac: false, dirty: true, response: 2 }); h.c.win.close(); await h.flush(); assert.equal(h.app.exited, false); assert.ok(h.c.win); assert.equal(h.c.quitRequested, false); });
  return checks;
}
async function childCase(name) {
  const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
  const resultPath = arg('child-result'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stq-native-quit-'));
  for (const key of ['userData', 'sessionData', 'documents', 'crashDumps']) { const d = path.join(profile, key); fs.mkdirSync(d); app.setPath(key, d); }
  app.setAppLogsPath(path.join(profile, 'logs')); app.setName('STQ Isolated Quit Regression'); app.commandLine.appendSwitch('disable-background-networking');
  BrowserWindow.prototype.show = function () {}; // Keep only this test process’s windows hidden.
  const stats = { prepare: 0, prompt: 0, save: 0, clean: 0, created: 0, quitRequests: 0, cancelOrFailureStayedAlive: false, redCloseStayedAlive: false }, events = [];
  let win, promptResolve, readyToExit = false, done = false;
  const readyWaiters = [];
  ipcMain.on('renderer-ready', event => { win = BrowserWindow.fromWebContents(event.sender); const resolve = readyWaiters.shift(); if (resolve) resolve(win); });
  const nextWindow = () => new Promise(resolve => readyWaiters.push(resolve));
  app.on('browser-window-created', (_e, w) => { stats.created++; const execute = w.webContents.executeJavaScript.bind(w.webContents); w.webContents.executeJavaScript = (code, ...args) => { if (code.startsWith('window.__stcPrepareClose')) stats.prepare++; if (code.startsWith('saveDoc')) stats.save++; if (code.startsWith('window.__stcCleanClose')) stats.clean++; return execute(code, ...args); }; });
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); dialog.showSaveDialog = async () => ({ canceled: true });
  dialog.showMessageBox = async () => { stats.prompt++; events.push('prompt'); if (name === 'repeated') return { response: await new Promise(resolve => { promptResolve = resolve; }) }; return { response: name === 'cancel' ? 2 : ['save', 'failed-save', 'edits-during-save'].includes(name) ? 0 : 1 }; };
  function write(pass, error) { if (done) return; done = true; fs.writeFileSync(resultPath, JSON.stringify({ name, pass, error, stats, events, profile, actualMainProcess: true, mainSha256: crypto.createHash('sha256').update(source).digest('hex') }, null, 2)); }
  app.on('will-quit', () => { events.push('will-quit'); try { assert.equal(readyToExit, true, 'no unexpected process termination'); assert.ok(stats.clean >= 1); if (['save', 'dont-save', 'cancel', 'failed-save', 'edits-during-save', 'repeated'].includes(name)) assert.equal(stats.prompt, 1); if (name === 'save') assert.equal(stats.save, 1); if (name === 'repeated') assert.equal(stats.prepare, 1); write(true); } catch (e) { write(false, String(e.stack)); } });
  const watchdog = setTimeout(() => { write(false, 'Child timed out; native quit did not terminate it'); app.exit(2); }, 12000); watchdog.unref();
  app.whenReady().then(() => { if (process.platform === 'darwin') app.setActivationPolicy('prohibited'); session.defaultSession.setPermissionRequestHandler((_, __, cb) => cb(false)); session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, cb) => cb({ cancel: true })); });
  const initial = nextWindow(); require(mainPath); await initial;
  async function js(code) { return win.webContents.executeJavaScript(`(async()=>{${code}})()`, true); }
  async function installFixture(dirty = name !== 'clean' && name !== 'pending-close' && name !== 'red-close') {
    await js(`window.__quitDirty=${dirty};window.__quitGate=null;window.__stcIsDirty=()=>window.__quitDirty;window.__stcPrepareClose=async()=>{if(window.__quitGate)await window.__quitGate;};window.__stcCleanClose=()=>{};saveDoc=async()=>{${name === 'failed-save' ? 'return false;' : name === 'edits-during-save' ? 'window.__quitDirty=true;return true;' : 'window.__quitDirty=false;return true;'}};`);
  }
  const requestQuit = () => { stats.quitRequests++; app.quit(); };
  await installFixture();
  if (['cancel', 'failed-save', 'edits-during-save'].includes(name)) {
    requestQuit(); await until(() => stats.prompt === 1, 'first prompt'); await delay(180);
    assert.equal(win.isDestroyed(), false); assert.equal(done, false); stats.cancelOrFailureStayedAlive = true;
    await js('window.__quitDirty=false;'); readyToExit = true; requestQuit();
  } else if (name === 'repeated') {
    requestQuit(); await until(() => stats.prompt === 1, 'deferred prompt'); requestQuit(); requestQuit(); await delay(60); assert.equal(stats.prompt, 1); readyToExit = true; promptResolve(1);
  } else if (name === 'pending-close') {
    await js('window.__quitGate=new Promise(resolve=>window.__releaseQuitPrepare=resolve);'); win.close(); await until(() => stats.prepare === 1, 'pending red close'); requestQuit(); app.emit('activate', {}, false); assert.equal(stats.created, 1); readyToExit = true; await js('window.__releaseQuitPrepare();');
  } else if (name === 'red-close') {
    const old = win; old.close(); await until(() => old.isDestroyed(), 'red close'); await delay(80); assert.equal(done, false); assert.equal(stats.quitRequests, 0); stats.redCloseStayedAlive = true;
    const reopened = nextWindow(); app.emit('activate', {}, false); await reopened; assert.equal(stats.created, 2); await installFixture(false); readyToExit = true; requestQuit();
  } else { readyToExit = true; requestQuit(); }
  // Success intentionally has no app.exit(): only production app.quit may end it.
}
async function supervisedNative() {
  const electron = require('electron'), results = [];
  for (const name of ['clean', 'save', 'dont-save', 'cancel', 'failed-save', 'edits-during-save', 'repeated', 'pending-close', 'red-close']) {
    const resultPath = path.join(qa, 'native-' + name + '.json'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [__filename, '--child-case=' + name, '--child-result=' + resultPath], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
    child.stdout.on('data', b => { output = (output + b).slice(-12000); }); child.stderr.on('data', b => { output = (output + b).slice(-12000); });
    const outcome = await new Promise((resolve, reject) => { const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Supervisor timeout: ' + name)); }, 18000); child.once('error', e => { clearTimeout(timeout); reject(e); }); child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); }); });
    const report = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null; fs.writeFileSync(path.join(qa, 'native-' + name + '.log'), output);
    assert.equal(outcome.code, 0, name + ' native exit: ' + JSON.stringify(outcome) + '\n' + output); assert.equal(report?.pass, true, JSON.stringify(report)); results.push({ name, ...outcome, report: resultPath, pass: true }); console.log('PASS actual native process quit: ' + name);
  }
  return results;
}
if (arg('child-case')) {
  childCase(arg('child-case')).catch(error => { const { app } = require('electron'); fs.writeFileSync(arg('child-result'), JSON.stringify({ name: arg('child-case'), pass: false, error: String(error.stack) }, null, 2)); app.exit(1); });
} else {
  (async () => { fs.mkdirSync(qa, { recursive: true }); const pure = await pureCases(), native = process.argv.includes('--native') ? await supervisedNative() : [];
    fs.writeFileSync(path.join(qa, 'quit-regression-report.json'), JSON.stringify({ pure, native, source: mainPath, mainSha256: crypto.createHash('sha256').update(source).digest('hex'), installedAppUntouched: true, profilesIsolated: true }, null, 2)); console.log(`${pure.length} pure cases and ${native.length} supervised native exits passed. QA: ${qa}`);
  })().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
