// 只暴露最小 IPC 面：不做 nodeIntegration，动画素材走 file:// 相对路径。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petHost', {
  boot: () => ipcRenderer.invoke('boot'),
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),
  getBounds: () => ipcRenderer.invoke('get-bounds'),
  getWorkArea: () => ipcRenderer.invoke('get-work-area'),
  setPosition: (x, y) => ipcRenderer.invoke('set-position', { x, y }),
  contextMenu: () => ipcRenderer.send('context-menu'),
  toggleTop: (on) => ipcRenderer.send('toggle-top', on),
  home: () => ipcRenderer.send('home'),
  quit: () => ipcRenderer.send('quit'),
  onMenuAction: (fn) => ipcRenderer.on('menu-action', (_e, payload) => fn(payload)),
});
