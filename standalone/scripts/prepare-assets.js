// 把仓库里的素材复制到本应用的 assets/（打包前跑一次，改素材后重跑）
const fs = require('node:fs');
const path = require('node:path');

const APP = path.resolve(__dirname, '..');
const REPO = path.resolve(APP, '..');
const SRC_PET = path.join(REPO, 'pet');
const OUT = path.join(APP, 'assets');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(from)) {
    const s = path.join(from, name);
    if (!fs.statSync(s).isFile()) continue;
    fs.copyFileSync(s, path.join(to, name));
    n += 1;
  }
  return n;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const cfg = path.join(SRC_PET, 'queen-config.json');
  if (!fs.existsSync(cfg)) throw new Error(`缺少配置：${cfg}（先跑 tools/install_queen.py 或从发布包解压）`);
  fs.copyFileSync(cfg, path.join(OUT, 'queen-config.json'));

  const anims = copyDir(path.join(SRC_PET, 'queen-animation'), path.join(OUT, 'queen-animation'));
  const memesDir = path.join(SRC_PET, 'queen-memes');
  const memes = fs.existsSync(memesDir) ? copyDir(memesDir, path.join(OUT, 'queen-memes')) : 0;

  console.log(`[assets] ${anims} 段动画、${memes} 张表情 → ${OUT}`);
}

main();
