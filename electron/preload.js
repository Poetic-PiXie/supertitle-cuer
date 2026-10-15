// The bridge between the page (dist/Supertitle_Cuer.html) and the desktop shell.
// The page checks for window.stc to know it's running as the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stc', {
  platform: process.platform,
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  saveDialog: (opts) => ipcRenderer.invoke('save-dialog', opts),
  writeFile: (path, bytes) => ipcRenderer.invoke('write-file', { path, bytes }),
  keepAwake: (on) => ipcRenderer.send('keep-awake', !!on),
  docState: (s) => ipcRenderer.send('doc-state', s),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, f) => cb(f)),
  ready: () => ipcRenderer.send('renderer-ready'),
  askMic: () => ipcRenderer.invoke('ask-mic'),
  saveGuidePdf: () => ipcRenderer.invoke('save-guide-pdf'),
  openGuidePdf: () => ipcRenderer.invoke('open-guide-pdf'),
  setTheme: (t) => ipcRenderer.send('set-theme', t),
  printHtml: (html, title) => ipcRenderer.invoke('print-html', html, title),
  spellState: (on) => ipcRenderer.send('spell-state', !!on),
  spellLanguages: () => ipcRenderer.invoke('spell-languages'),
  setSpellLanguage: (lang) => ipcRenderer.invoke('set-spell-language', lang),
});
