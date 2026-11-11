#!/usr/bin/env node
// 可选补丁：让「向右走 / 向左走」两段素材各走各的方向。
//
// 为什么需要它：dsh-pet 0.4.7 的走路方向只由「朝向」决定（planMove/tryMove 里
// `const dir = facing === 'right' ? 1 : -1`），而朝向只在 turn 动画播完时翻转。
// 缅因猫没有转头素材（turn: []），于是朝向恒为初始值 —— 两个走路动作会往同一个方向走。
// 本脚本给 dsh-pet 的桌面端与网页端各加 3 行：动作自带 params.dir 时以它为准，并强制不镜像。
//
//   node tools/patch-walk-dir.mjs            打补丁（幂等，先备份成 *.bak-mianyin）
//   node tools/patch-walk-dir.mjs --revert   还原
//   node tools/patch-walk-dir.mjs --dsh-pet <目录>   指定 dsh-pet 安装目录
//
// 注意：dsh-pet 升级会覆盖回去（覆盖后重跑一次即可）。
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dshHome } from '../lib/index.js';

const argv = process.argv.slice(2);
const revert = argv.includes('--revert');
const explicit = (() => {
    const i = argv.indexOf('--dsh-pet');
    return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined;
})();

function findDshPet() {
    if (explicit)
        return explicit;
    const profiles = join(dshHome(), 'profiles');
    if (!existsSync(profiles))
        throw new Error(`找不到 ${profiles}，用 --dsh-pet 指定 dsh-pet 目录`);
    for (const entry of readdirSync(profiles, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const dir = join(profiles, entry.name, 'node_modules', 'dsh-pet');
        if (existsSync(dir))
            return dir;
    }
    throw new Error(`在 ${profiles} 下没找到 node_modules/dsh-pet，用 --dsh-pet 指定`);
}

const EDITS = [
    {
        file: join('runtime', 'electron-helper', 'sprite', 'playback.js'),
        from: "    const dir = this.facing === 'right' ? 1 : -1;",
        to: [
            '    // [mianyin-pet] 素材自带方向（params.dir）优先：两段走路素材各自朝一个方向，',
            '    // 只按朝向推导会出现「向右走的素材在往左移动」。有 dir 时强制不镜像（facing = left）。',
            '    const qdir = chosen.params && typeof chosen.params.dir === \'number\' ? chosen.params.dir : null;',
            "    if (qdir !== null) this.facing = 'left';",
            "    const dir = qdir !== null ? qdir : this.facing === 'right' ? 1 : -1;",
        ].join('\n'),
    },
    {
        file: join('lib', 'client.js'),
        from: '\tconst dir = input.facing === "right" ? 1 : -1;',
        to: [
            '\t// [mianyin-pet] 素材自带方向（params.dir）优先，避免镜像与位移方向相反',
            '\tconst qdir = chosen.params && typeof chosen.params.dir === "number" ? chosen.params.dir : null;',
            '\tconst dir = qdir !== null ? qdir : input.facing === "right" ? 1 : -1;',
        ].join('\n'),
    },
];

const root = findDshPet();
let touched = 0;
for (const edit of EDITS) {
    const path = join(root, edit.file);
    const backup = `${path}.bak-mianyin`;
    if (revert) {
        if (existsSync(backup)) {
            copyFileSync(backup, path);
            console.log(`已还原 ${edit.file}`);
            touched += 1;
        }
        continue;
    }
    if (!existsSync(path)) {
        console.log(`跳过（不存在）：${edit.file}`);
        continue;
    }
    const text = readFileSync(path, 'utf8');
    if (text.includes('const qdir')) {
        console.log(`已是补丁状态：${edit.file}`);
        continue;
    }
    if (!text.includes(edit.from)) {
        console.log(`跳过（找不到锚点，dsh-pet 版本可能变了）：${edit.file}`);
        continue;
    }
    if (!existsSync(backup))
        copyFileSync(path, backup);
    writeFileSync(path, text.replace(edit.from, edit.to), 'utf8');
    console.log(`已打补丁：${edit.file}（备份 ${edit.file}.bak-mianyin）`);
    touched += 1;
}
if (touched === 0)
    console.log('没有改动。');
else
    console.log('完成：重载 DSH 页面 / 重启桌面宠物后生效。');
