// 缅因猫桌宠 · 独立版主进程
// 透明置顶窗 + 一个渲染页，所有动画/行为逻辑在 renderer/pet.js 里。
const { app, BrowserWindow, ipcMain, Menu, screen, shell, Tray, nativeImage } = require('electron');
const path = require('node:path');
const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');
const fs = require('node:fs');

const ROOT = __dirname;
const ASSETS = path.join(ROOT, 'assets');
const CONFIG_PATH = path.join(ASSETS, 'queen-config.json');

/** 读配置：返回宠物条目 + 动画表（读不到就用最小兜底，保证能开窗）。 */
function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.warn('[mianyin] 读配置失败，用兜底配置：', e.message);
  }
  const pet = (raw.pets && raw.pets[0]) || {};
  return {
    pet: {
      id: pet.id || 'queen',
      name: pet.name || '缅因',
      size: Number(pet.size) || 400,
      fixedEnabled: pet.fixedEnabled !== false,
    },
    animations: raw.animations || {
      idle: ['待机'],
      turn: [],
      drag: [],
      clicks: ['伸爪拍屏幕'],
      moves: { default: {}, actions: [] },
      categories: [],
      events: {},
      sleep: [],
    },
    weights: raw.animationWeights || { idle: 50, turn: 0, move: 0 },
    memes: raw.memes || {},
    texts: {
      sleepStart: raw.sleepStartTexts || ['困了，先趴一会儿'],
      sleepEnd: raw.sleepEndTexts || ['睡醒啦～'],
      sleepRefuse: raw.sleepRefuseTexts || ['小猫睡觉中，请通过「起来」唤醒'],
    },
  };
}

const APP = loadConfig();

/** 窗口几何：舞台 16:9，宽度 = size，上下留出气泡/拖拽空间。 */
function windowSize() {
  const stageW = APP.pet.size;
  const stageH = Math.round((stageW * 9) / 16);
  const marginX = Math.round(stageW * 0.5);
  const marginTop = 120;
  const marginBottom = 60;
  return {
    stageW,
    stageH,
    width: stageW + marginX * 2,
    height: stageH + marginTop + marginBottom,
    marginX,
    marginTop,
  };
}

let win = null;
let geo = null;

function createWindow() {
  geo = windowSize();
  const area = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    width: geo.width,
    height: geo.height,
    x: area.x + area.width - geo.width - Math.round(geo.marginX * 0.2),
    y: area.y + area.height - geo.height + geo.marginBottom,
    frame: false,
    transparent: true,
    icon: ICON_PATH,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(ROOT, 'preload.js'),
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenu(null);
  if (process.env.MIANYIN_LOG === '1') {
    const d = screen.getPrimaryDisplay();
    console.log('[mianyin] bounds=', JSON.stringify(win.getBounds()), 'scale=', d.scaleFactor, 'workArea=', JSON.stringify(d.workArea), 'bounds=', JSON.stringify(d.bounds));
  }
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  setupTray();
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });

  if (process.env.MIANYIN_DEBUG === '1') win.webContents.openDevTools({ mode: 'detach' });
}

// 单实例：再点一次图标只把已有窗口提到前面
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
  });

  app.whenReady().then(() => {
  setupTray();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // ---------------- 托盘（任务栏右下角：显示/隐藏、置顶、退出） ----------------
let tray = null;
function setupTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('缅因猫桌宠');
  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: win && win.isVisible() ? '隐藏小猫' : '显示小猫', click: () => togglePet() },
      { type: 'separator' },
      { label: '回到初始位置', click: () => {
        showPet();
        if (!win || !geo) return;
        const a = screen.getPrimaryDisplay().workArea;
        win.setPosition(a.x + a.width - geo.width - Math.round(geo.marginX * 0.2), a.y + a.height - geo.height + geo.marginBottom);
      } },
      { label: '打开素材目录', click: () => shell.openPath(require('node:path').join(APP_DIR, 'assets')) },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
  };
  rebuild();
  tray.on('click', () => { rebuild(); togglePet(); });
  tray.on('right-click', () => rebuild());
}
function showPet() {
  if (!win) return;
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
}
function hidePet() {
  if (win) win.hide();
}
function togglePet() {
  if (!win) return;
  if (win.isVisible()) hidePet();
  else showPet();
}

app.on('window-all-closed', () => app.quit());
}

// ---------- 渲染进程 IPC ----------

ipcMain.handle('boot', () => ({
  pet: APP.pet,
  animations: APP.animations,
  weights: APP.weights,
  texts: APP.texts,
  geo,
  assetBase: path.join(ASSETS, 'queen-animation'),
  memesDir: path.join(ASSETS, 'queen-memes'),
}));

/** 透明边缘穿透：非舞台区域不挡鼠标。forward 保证移动事件仍能进页面。 */
ipcMain.on('set-ignore', (_e, ignore) => {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

/** 拖拽：传屏幕坐标，主进程负责真正移动窗口。 */
ipcMain.on('move-window', (_e, { dx, dy }) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

ipcMain.handle('get-bounds', () => (win && !win.isDestroyed() ? win.getBounds() : null));
ipcMain.handle('get-window-geo', () => geo);
ipcMain.handle('get-work-area', () => screen.getPrimaryDisplay().workArea);
ipcMain.handle('set-position', (_e, { x, y }) => {
  if (!win || win.isDestroyed()) return;
  win.setPosition(Math.round(x), Math.round(y));
});

/** 右键菜单：用原生菜单，分类来自配置，顺序与 dsh-pet 一致。 */
ipcMain.on('context-menu', () => {
  if (!win || win.isDestroyed()) return;
  const a = APP.animations;
  const item = (label, action) => ({ label, click: () => win.webContents.send('menu-action', { action }) });
  const animItem = (name) => ({ label: name, click: () => win.webContents.send('menu-action', { action: 'anim', name }) });

  const template = [
    {
      label: '动作',
      submenu: [
        { label: '待机', submenu: (a.idle || []).map(animItem) },
        { label: '点击回应', submenu: (a.clicks || []).map(animItem) },
        { label: '移动', submenu: (a.moves && a.moves.actions ? a.moves.actions : []).map((m) => animItem(m.name)) },
        ...(a.categories || []).map((c) => ({ label: c.id, submenu: (c.actions || []).map(animItem) })),
      ],
    },
    { type: 'separator' },
    ...(a.sleep && a.sleep.length ? [item('睡觉', 'sleep'), item('起来', 'wake')] : []),
    { type: 'separator' },
    item('回到初始位置', 'home'),
    item('置顶（开/关）', 'toggle-top'),
    { type: 'separator' },
    { label: '打开素材目录', click: () => shell.openPath(ASSETS) },
    item('退出', 'quit'),
  ];
  Menu.buildFromTemplate(template).popup({ window: win });
});

ipcMain.on('toggle-top', (_e, on) => {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(!!on, 'screen-saver');
});

ipcMain.on('quit', () => app.quit());

ipcMain.on('home', () => {
  if (!win || !geo) return;
  const area = screen.getPrimaryDisplay().workArea;
  win.setPosition(area.x + area.width - geo.width - Math.round(geo.marginX * 0.2), area.y + area.height - geo.height + 60);
});
