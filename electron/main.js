// Supertitle Cuer — desktop shell.
// The app itself is dist/Supertitle_Cuer.html (the same file as the standalone
// version). This process adds what a browser page can't do on its own:
// opening .supertitles files from Finder/Explorer, saving without prompts,
// putting the projector window on the second screen, and keeping the
// computer awake during a show.
const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, screen, shell, systemPreferences, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const isMac = process.platform === 'darwin';
const APP_HTML = path.join(__dirname, '..', 'dist', 'Supertitle_Cuer.html');
const HOMEPAGE = 'https://github.com/poetic-pixie/supertitle-cuer';

let win = null;
let projector = null;
let rendererReady = false;
let allowClose = false;
let keepAwakeId = null;
let lastDir = null;
const pendingFiles = [];
const ignoredWords = new Set(); // "Ignore Spelling" lasts until the app quits
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
const readPrefs = () => { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch (_) { return {}; } };
const writePrefs = (o) => { try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...o })); } catch (_) {} };

// ---------- files handed to us by the OS ----------
const isOpenable = (p) => /\.(supertitles|pdf)$/i.test(p || '') && fs.existsSync(p);

function queueOpen(p) {
  if (!isOpenable(p)) return;
  pendingFiles.push(p);
  flushPending();
}

function flushPending() {
  if (!win || !rendererReady) return;
  while (pendingFiles.length) {
    const p = pendingFiles.shift();
    try {
      win.webContents.send('open-file', readPayload(p));
    } catch (e) {
      dialog.showErrorBox('Could not open file', `${p}\n\n${e.message}`);
    }
  }
  if (win.isMinimized()) win.restore();
  win.focus();
}

function readPayload(p) {
  lastDir = path.dirname(p);
  app.addRecentDocument(p);
  return { name: path.basename(p), path: p, bytes: new Uint8Array(fs.readFileSync(p)) };
}

// macOS: double-clicked files arrive here (possibly before the window exists)
app.on('open-file', (e, p) => {
  e.preventDefault();
  queueOpen(p);
});

// Windows: one running copy; files double-clicked later arrive as arguments
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    argv.slice(1).forEach(queueOpen);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ---------- synonyms (English, offline, from WordNet — see scripts/build-thesaurus.py) ----------
let thesaurus = null;
function loadThesaurus() {
  if (thesaurus) return thesaurus;
  thesaurus = new Map();
  try {
    const txt = require('zlib').gunzipSync(fs.readFileSync(path.join(__dirname, 'thesaurus-en.txt.gz'))).toString('utf8');
    for (const line of txt.split('\n')) { const t = line.indexOf('\t'); if (t > 0) thesaurus.set(line.slice(0, t), line.slice(t + 1)); }
  } catch (_) {}
  return thesaurus;
}
async function synonyms(word) {
  const th = loadThesaurus(), w = word.toLowerCase().replace(/’/g, "'");
  const tries = [w];                                   // simple English endings: try the base form too
  if (w.endsWith('ies')) tries.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) tries.push(w.slice(0, -2));
  if (w.endsWith('s')) tries.push(w.slice(0, -1));
  if (w.endsWith('ed')) tries.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('ing')) tries.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('er')) tries.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('est')) tries.push(w.slice(0, -3), w.slice(0, -2));
  for (const t of tries) if (th.has(t)) return th.get(t).split('|').slice(0, 12);
  return [];
}
const matchCase = (orig, w) => (orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w);

// ---------- main window ----------
function createWindow() {
  rendererReady = false;
  allowClose = false;
  // First launch: fill the usable screen (below the menu bar, above the Dock / taskbar) — not full-screen mode.
  // After that, open where and how big the window was last time, as long as that still fits on a screen.
  const wa = screen.getPrimaryDisplay().workArea, saved = readPrefs().windowBounds;
  const fits = saved && screen.getAllDisplays().some((d) => { const a = d.workArea; return saved.x >= a.x - 40 && saved.y >= a.y - 40 && saved.x + saved.width <= a.x + a.width + 40 && saved.y + saved.height <= a.y + a.height + 40; });
  const b = fits ? saved : { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
  win = new BrowserWindow({
    x: b.x, y: b.y,
    width: b.width,
    height: b.height,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#16171b',
    title: 'Supertitle Cuer',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(APP_HTML);

  // The page opens the projector with window.open(..., 'supertitles-projector')
  win.webContents.setWindowOpenHandler(({ frameName, url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; } // web links open in the regular browser
    if (frameName === 'stq-guide') {   // the printable guide (Help → Print the guide)
      return { action: 'allow', overrideBrowserWindowOptions: { title: 'Supertitle Cuer — User Guide', width: 900, height: 1000, autoHideMenuBar: true, backgroundColor: '#ffffff' } };
    }
    if (frameName !== 'supertitles-projector') return { action: 'deny' };
    const ext = otherDisplay();
    const bounds = ext ? ext.bounds : null;
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        title: 'Supertitles — Projector',
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        ...(bounds
          ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
          : { width: 1024, height: 576 }),
        webPreferences: { contextIsolation: true, sandbox: false },
      },
    };
  });
  win.webContents.on('did-create-window', (child, details) => {
    if (details && details.frameName === 'stq-guide') return;
    projector = child;
    child.setMenuBarVisibility(false);
    if (otherDisplay()) setTimeout(() => !child.isDestroyed() && child.setFullScreen(true), 300);
    setTimeout(() => win && !win.isDestroyed() && win.focus(), 700); // keyboard stays with the operator's window
    child.on('closed', () => {
      if (projector === child) projector = null;
    });
  });

  // right-click: spelling suggestions, Learn / Ignore, and Cut / Copy / Paste in text fields
  win.webContents.on('context-menu', async (_e, p) => {
    const wc = win.webContents, items = [];
    const word = (p.selectionText || '').trim();
    const oneWord = /^[\p{L}'’-]{2,40}$/u.test(word) && !p.misspelledWord;
    if (p.misspelledWord) {
      const sugg = (p.dictionarySuggestions || []).slice(0, 6);
      if (sugg.length) sugg.forEach((w) => items.push({ label: w, click: () => wc.replaceMisspelling(w) }));
      else items.push({ label: 'No spelling suggestions', enabled: false });
      items.push({ type: 'separator' },
        { label: `Learn “${p.misspelledWord}”`, click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) },
        { label: 'Ignore Spelling', click: () => { wc.session.addWordToSpellCheckerDictionary(p.misspelledWord); ignoredWords.add(p.misspelledWord); } },
        { type: 'separator' });
    }
    if (oneWord && p.isEditable) {
      const syn = await synonyms(word);
      if (syn.length) items.push({ label: `Synonyms for “${word}”`, submenu: syn.map((w) => ({ label: w, click: () => wc.insertText(matchCase(word, w)) })) });
      else items.push({ label: `No synonyms found for “${word}”`, enabled: false });
    }
    if (oneWord && isMac) items.push({ label: `Look Up “${word}”`, click: () => wc.showDefinitionForSelection() });
    if (oneWord) items.push({ type: 'separator' });
    if (p.isEditable) {
      items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy },
        { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ role: 'copy' });
    }
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  // links (e.g. in Help) open in the regular browser
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // unsaved-changes check before the window closes
  const rememberBounds = () => { if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return; writePrefs({ windowBounds: win.getNormalBounds() }); };
  win.on('resized', rememberBounds); win.on('moved', rememberBounds);
  win.on('close', async (e) => {
    if (allowClose) return;
    e.preventDefault();
    let dirty = false;
    try {
      dirty = await win.webContents.executeJavaScript('window.__stcIsDirty ? window.__stcIsDirty() : false');
    } catch (_) {}
    if (dirty) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Save', 'Don’t Save', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: 'Save changes to this project before closing?',
        detail: 'Cues and slides you haven’t saved will be lost.',
      });
      if (response === 2) return;
      if (response === 0) {
        let saved = false;
        try {
          saved = await win.webContents.executeJavaScript('saveDoc(false)');
        } catch (_) {}
        if (!saved) return;
      }
    }
    allowClose = true;
    win.close();
  });

  win.on('closed', () => {
    if (projector && !projector.isDestroyed()) projector.destroy();
    projector = null;
    win = null;
    setKeepAwake(false);
  });
}

function otherDisplay() {
  const all = screen.getAllDisplays();
  if (all.length < 2 || !win) return null;
  const mine = screen.getDisplayMatching(win.getBounds());
  return all.find((d) => d.id !== mine.id) || null;
}

function moveProjectorToSecondScreen() {
  if (!projector || projector.isDestroyed()) {
    menuCommand('projector');
    return;
  }
  const ext = otherDisplay();
  if (!ext) {
    dialog.showMessageBox(win, {
      type: 'info',
      message: 'No second screen found',
      detail: 'Connect the projector and set it to extend (not mirror) your screen. “❔ How to connect” in the toolbar has step-by-step help.',
    });
    return;
  }
  projector.setFullScreen(false);
  projector.setBounds(ext.bounds);
  setTimeout(() => !projector.isDestroyed() && projector.setFullScreen(true), 300);
}

function setKeepAwake(on) {
  if (on && keepAwakeId === null) keepAwakeId = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && keepAwakeId !== null) {
    powerSaveBlocker.stop(keepAwakeId);
    keepAwakeId = null;
  }
}

// ---------- bridge for the page (see preload.js) ----------
ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  flushPending();
});
ipcMain.on('keep-awake', (_e, on) => setKeepAwake(!!on));
// the guide as a PDF, shipped inside the app (docs/Supertitle_Cuer_Manual.pdf)
const GUIDE_PDF = path.join(__dirname, '..', 'docs', 'Supertitle_Cuer_Manual.pdf');
const GUIDE_NAME = 'Supertitle Cuer User Guide.pdf';
async function saveGuidePdf() {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), GUIDE_NAME), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, fs.readFileSync(GUIDE_PDF));
  return r.filePath;
}
async function openGuidePdf() {
  const p = path.join(app.getPath('temp'), GUIDE_NAME);
  fs.writeFileSync(p, fs.readFileSync(GUIDE_PDF));
  const err = await shell.openPath(p);
  return !err;
}
ipcMain.handle('save-guide-pdf', () => saveGuidePdf());
// Printing through the system's own print dialog (page range, copies, printer, preview, Save as PDF) —
// the page (a printable score or the guide) is laid out in a hidden window first.
ipcMain.handle('guide-pdf-bytes', () => fs.readFileSync(GUIDE_PDF));
ipcMain.handle('print-html', async (_e, html, title) => {
  const f = path.join(app.getPath('temp'), `stq-print-${Date.now()}.html`);
  fs.writeFileSync(f, html);
  const pw = new BrowserWindow({ show: false, title: title || 'Supertitle Cuer', webPreferences: { sandbox: true } });
  try {
    await pw.loadFile(f);
    await pw.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => document.fonts && document.fonts.ready)');
    return await new Promise((res) => pw.webContents.print({ silent: false, printBackground: true }, (ok, why) => res(ok ? 'printed' : (why || 'cancelled'))));
  } finally { pw.destroy(); fs.unlink(f, () => {}); }
});
ipcMain.on('set-theme', (_e, t) => { nativeTheme.themeSource = t === 'day' ? 'light' : 'dark'; });
ipcMain.handle('open-guide-pdf', () => openGuidePdf());
// Follow: macOS asks the user once for the microphone (Windows uses its own privacy settings)
ipcMain.handle('ask-mic', async () => {
  if (!isMac) return true;
  try { return systemPreferences.getMediaAccessStatus('microphone') === 'granted' || await systemPreferences.askForMediaAccess('microphone'); } catch (_) { return true; }
});
ipcMain.on('spell-state', (_e, on) => {
  const mi = Menu.getApplicationMenu() && Menu.getApplicationMenu().getMenuItemById('spell');
  if (mi) mi.checked = !!on;
});
// macOS uses the system spell checker (it picks the language by itself); Windows/Linux choose one here
ipcMain.handle('spell-languages', () => {
  if (isMac || !win) return { available: [], current: [] };
  const ses = win.webContents.session;
  return { available: ses.availableSpellCheckerLanguages || [], current: ses.getSpellCheckerLanguages() };
});
ipcMain.handle('set-spell-language', (_e, lang) => {
  if (isMac || !win) return false;
  try { win.webContents.session.setSpellCheckerLanguages([lang]); writePrefs({ spellLang: lang }); return true; } catch (_) { return false; }
});
ipcMain.on('doc-state', (_e, { path: p, dirty }) => {
  if (!win) return;
  if (isMac) win.setRepresentedFilename(p || '');
  win.setDocumentEdited(!!dirty);
});
ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    defaultPath: lastDir || app.getPath('documents'),
    properties: ['openFile'],
    filters: [
      { name: 'Supertitles projects and scores', extensions: ['supertitles', 'pdf'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readPayload(r.filePaths[0]);
});
ipcMain.handle('save-dialog', async (_e, { suggestedName, kind }) => {
  const filters = kind === 'pdf'
    ? [{ name: 'PDF', extensions: ['pdf'] }]
    : [{ name: 'Supertitles project', extensions: ['supertitles'] }];
  const r = await dialog.showSaveDialog(win, {
    defaultPath: path.join(lastDir || app.getPath('documents'), suggestedName || 'Untitled.supertitles'),
    filters,
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('write-file', async (_e, { path: p, bytes }) => {
  // write to a temporary file first, so a failed save never damages the old file
  const tmp = `${p}.saving-${process.pid}`;
  fs.writeFileSync(tmp, Buffer.from(bytes));
  fs.renameSync(tmp, p);
  lastDir = path.dirname(p);
  app.addRecentDocument(p);
  return true;
});

// ---------- menu ----------
function menuCommand(cmd) {
  if (win) win.webContents.executeJavaScript(`window.__stcMenu && window.__stcMenu(${JSON.stringify(cmd)})`).catch(() => {});
}
const item = (label, cmd, accelerator) => ({ label, accelerator, click: () => menuCommand(cmd) });

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        item('New Project', 'new', 'CmdOrCtrl+N'),
        item('Open…', 'open', 'CmdOrCtrl+O'),
        ...(isMac ? [{ role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] }] : []),
        { type: 'separator' },
        item('Save', 'save', 'CmdOrCtrl+S'),
        item('Save As…', 'saveAs', 'Shift+CmdOrCtrl+S'),
        item('Save As PDF…', 'saveAsPdf', 'Alt+Shift+CmdOrCtrl+S'),
        item('Export Printable Score (PDF)…', 'exportPrintable', 'CmdOrCtrl+E'),
        item('Print Score…', 'printScore', 'CmdOrCtrl+P'),
        { type: 'separator' },
        item('Import Slides…', 'importSlides'),
        item('Export Slides (CSV)', 'exportCsv'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'undo', 'CmdOrCtrl+Z'),
        item('Redo', 'redo', isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { id: 'spell', label: 'Check Spelling While Typing', type: 'checkbox', checked: true, click: () => menuCommand('spell') },
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Edit Mode', 'edit', 'Shift+CmdOrCtrl+E'),
        item('Show Mode', 'show', 'Shift+CmdOrCtrl+R'),
        { type: 'separator' },
        item('Actual Size (100%)', 'view100', 'CmdOrCtrl+0'),
        item('Fit Page Height', 'viewFitH', 'CmdOrCtrl+1'),
        item('Fit Page Width', 'viewFitW', 'CmdOrCtrl+2'),
        { type: 'separator' },
        item('Open Projector', 'projector'),
        { label: 'Move Projector to Second Screen', click: moveProjectorToSecondScreen },
        { type: 'separator' },
        item('Settings…', 'settings', 'CmdOrCtrl+,'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Supertitle Cuer Help', 'help', 'CmdOrCtrl+?'),
        item('How to Connect a Projector', 'connect'),
        { type: 'separator' },
        { label: 'Open the Guide as PDF', click: () => openGuidePdf() },
        { label: 'Save the Guide as PDF…', click: () => saveGuidePdf() },
        item('Print the Guide…', 'printGuide'),
        { type: 'separator' },
        { label: 'Supertitle Cuer on GitHub', click: () => shell.openExternal(HOMEPAGE) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- lifecycle ----------
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  if (!isMac) { const l = readPrefs().spellLang; if (l) try { win.webContents.session.setSpellCheckerLanguages([l]); } catch (_) {} }
  if (!isMac) process.argv.slice(1).forEach(queueOpen); // Windows: file given at launch
  screen.on('display-added', () => {
    if (projector && !projector.isDestroyed() && !projector.isFullScreen()) moveProjectorToSecondScreen();
  });
});
app.on('activate', () => {
  if (!win) createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  // words ignored with "Ignore Spelling" are only for this session
  try { const ses = require('electron').session.defaultSession; ignoredWords.forEach((w) => ses.removeWordFromSpellCheckerDictionary(w)); } catch (_) {}
});
