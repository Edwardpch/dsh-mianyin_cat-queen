#!/usr/bin/env node
// 安装器命令行（不装 DSH 也能用）：
//   node tools/cli.mjs                 安全安装/升级（你改过的文件保留）
//   node tools/cli.mjs --dry-run       只看会做什么，不写盘
//   node tools/cli.mjs --force         强制按仓库版本重刷（先备份）
//   node tools/cli.mjs --prune         顺便删掉旧版本留下的多余素材（先备份）
//   node tools/cli.mjs --rollback      从最近一次备份还原
//   node tools/cli.mjs --home <dir>    指定 DSH 数据目录（默认 $DSH_HOME 或 ~/.dsh）
//   node tools/cli.mjs --json          输出 JSON
import { resolve } from 'node:path';
import { dshHome, installPet, petRootDir, rollbackPet } from '../lib/index.js';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined;
};

const home = value('--home') ?? dshHome();
const json = has('--json');

try {
    if (has('--rollback')) {
        const r = rollbackPet({ home, backupDir: value('--backup') });
        if (json) {
            console.log(JSON.stringify(r, null, 2));
            process.exit(0);
        }
        console.log(`已从 ${r.backupDir} 还原 ${r.restored.length} 个文件到 ${petRootDir(home)}`);
        process.exit(0);
    }

    const r = installPet({ home, force: has('--force'), prune: has('--prune'), dryRun: has('--dry-run') });
    if (json) {
        console.log(JSON.stringify(r, null, 2));
        process.exit(0);
    }
    console.log(`版本 ${r.previousVersion ?? '(未安装)'} → ${r.version}（${r.mode}${r.dryRun ? '，dry-run 未写盘' : ''}）`);
    console.log(`目标 ${r.target}`);
    console.log(`新增 ${r.copied.length}｜更新 ${r.updated.length}｜保留 ${r.skipped.length}｜移除 ${r.removed.length}`);
    for (const w of r.warnings)
        console.log(`提示：${w}`);
    if (r.backupDir)
        console.log(`覆盖前备份：${r.backupDir}`);
    if (r.dryRun)
        console.log('（dry-run：以上都没真的写盘）');
    else if (r.status === 'up-to-date')
        console.log('已是最新。');
    else
        console.log('完成：刷新 DSH 页面（或右键宠物 → 重载配置）即可看到效果。');
}
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
