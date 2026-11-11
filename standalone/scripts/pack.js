// 打一个「双击就能跑」的绿色版：复制一份 Electron 运行时 + 把本应用放进 resources/app/
// 用法：node scripts/pack.js [--electron <electron 目录>] [--out <输出目录>] [--shortcut]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const APP = path.resolve(__dirname, '..');
const REPO = path.resolve(APP, '..');
const DIST = path.resolve(REPO, '..', '..', 'dist');
const DEFAULT_ELECTRON = path.join(process.env.USERPROFILE || '', '.dsh', 'electron');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ELECTRON_DIR = arg('electron', process.env.MIANYIN_ELECTRON || DEFAULT_ELECTRON);
const OUT = path.resolve(arg('out', path.join(DIST, 'MianyinPet')));
const NAME = 'MianyinPet.exe';

function checkElectron(dir) {
  const exe = path.join(dir, 'electron.exe');
  if (!fs.existsSync(exe)) {
    throw new Error(`找不到 Electron：${exe}\n用 --electron 指向一个包含 electron.exe 的目录（Electron 发行版解压根目录）。`);
  }
  return exe;
}

function copyTree(from, to, skip = new Set()) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (skip.has(name)) continue;
    const s = path.join(from, name);
    const d = path.join(to, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyTree(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  checkElectron(ELECTRON_DIR);
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1) Electron 运行时（不带走 default_app.asar，避免抢加载）
  copyTree(ELECTRON_DIR, OUT, new Set(['resources']));
  fs.mkdirSync(path.join(OUT, 'resources'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ELECTRON_DIR, 'resources'))) {
    if (f === 'default_app.asar') continue;
    copyTree(path.join(ELECTRON_DIR, 'resources', f), path.join(OUT, 'resources', f));
  }

  // 2) 应用本体 → resources/app
  const appDir = path.join(OUT, 'resources', 'app');
  copyTree(APP, appDir, new Set(['node_modules', 'scripts', '.git']));
  // 素材目录是打包时生成的，必须存在
  if (!fs.existsSync(path.join(appDir, 'assets', 'queen-config.json'))) {
    execFileSync(process.execPath, [path.join(APP, 'scripts', 'prepare-assets.js')], { stdio: 'inherit' });
    copyTree(path.join(APP, 'assets'), path.join(appDir, 'assets'));
  }

  // 3) electron.exe → MianyinPet.exe（同目录其它 dll 不变）
  fs.copyFileSync(path.join(ELECTRON_DIR, 'electron.exe'), path.join(OUT, NAME));

  // 4) 说明文件
  fs.writeFileSync(
    path.join(OUT, '使用说明.txt'),
    [
      '缅因猫桌宠（独立版）',
      '',
      '双击 MianyinPet.exe 启动，不需要 DeepSeek Harness。',
      '左键拖动 = 移动位置；左键单击 = 摸猫；右键 = 菜单（动作 / 睡觉 / 起来 / 退出）。',
      '退出：右键 → 退出，或任务管理器结束 MianyinPet.exe。',
      '',
      '改素材：把 queen-animation/*.webm 与 queen-config.json 换掉即可（保持文件名与配置里的动画名一致）。',
    ].join('\r\n'),
    'utf8'
  );

  // 5) 桌面快捷方式（可选）
  if (process.argv.includes('--shortcut')) {
    const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
    const lnk = path.join(desktop, '缅因猫桌宠.lnk');
    const ps = [
      '$W = New-Object -ComObject WScript.Shell;',
      `$s = $W.CreateShortcut('${lnk.replace(/'/g, "''")}');`,
      `$s.TargetPath = '${path.join(OUT, NAME).replace(/'/g, "''")}';`,
      `$s.WorkingDirectory = '${OUT.replace(/'/g, "''")}';`,
      "$s.Description = '缅因猫桌宠';",
      '$s.Save();',
    ].join(' ');
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'inherit' });
    console.log(`[pack] 桌面快捷方式：${lnk}`);
  }

  const size = (function walk(dir) {
    let n = 0;
    for (const name of fs.readdirSync(dir)) {
      const s = path.join(dir, name);
      const st = fs.statSync(s);
      n += st.isDirectory() ? walk(s) : st.size;
    }
    return n;
  })(OUT);
  console.log(`[pack] 完成：${OUT}（${(size / 1048576).toFixed(1)} MB）`);
  console.log(`[pack] 启动：${path.join(OUT, NAME)}`);
}

main();
