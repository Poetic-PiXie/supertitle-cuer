// Supertitle Cuer — desktop shell.
// The app itself is dist/Supertitle_Cuer.html (the same file as the standalone
// version). This process adds what a browser page can't do on its own:
// opening .supertitles files from Finder/Explorer, saving without prompts,
// putting the projector window on the second screen, and keeping the
// computer awake during a show.
const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, screen, shell } = require('electron');
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

// ---------- main window ----------
function createWindow() {
  rendererReady = false;
  allowClose = false;
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#16171b',
    title: 'Supertitle Cuer',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(APP_HTML);

  // The page opens the projector with window.open(..., 'supertitles-projector')
  win.webContents.setWindowOpenHandler(({ frameName, url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; } // web links open in the regular browser
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
  win.webContents.on('did-create-window', (child) => {
    projector = child;
    child.setMenuBarVisibility(false);
    if (otherDisplay()) setTimeout(() => !child.isDestroyed() && child.setFullScreen(true), 300);
    setTimeout(() => win && !win.isDestroyed() && win.focus(), 700); // keyboard stays with the operator's window
    child.on('closed', () => {
      if (projector === child) projector = null;
    });
  });

  // links (e.g. in Help) open in the regular browser
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // unsaved-changes check before the window closes
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
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Edit Mode', 'edit', 'CmdOrCtrl+1'),
        item('Show Mode', 'show', 'CmdOrCtrl+2'),
        { type: 'separator' },
        item('Open Projector', 'projector', 'CmdOrCtrl+P'),
        { label: 'Move Projector to Second Screen', accelerator: 'Shift+CmdOrCtrl+P', click: moveProjectorToSecondScreen },
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
        item('How to Connect a Projector', 'connect'),
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
  if (!isMac) process.argv.slice(1).forEach(queueOpen); // Windows: file given at launch
  screen.on('display-added', () => {
    if (projector && !projector.isDestroyed() && !projector.isFullScreen()) moveProjectorToSecondScreen();
  });
});
app.on('activate', () => {
  if (!win) createWindow();
});
app.on('window-all-closed', () => app.quit());
