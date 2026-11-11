// 生成 pets/queen/.mianyin-manifest.json：素材清单 = 版本 + 每个文件的 sha256 与大小。
// 改了素材之后必须重跑一次，否则安装器判断不出"用户改过没有"。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_NAME, hashFile } from '../lib/manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'pet');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function walk(dir, prefix = '') {
    const out = [];
    for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.name === MANIFEST_NAME)
            continue;
        if (entry.isDirectory())
            out.push(...walk(dir, rel));
        else
            out.push(rel);
    }
    return out.sort();
}

const files = {};
for (const rel of walk(SRC)) {
    const path = join(SRC, rel);
    const buf = readFileSync(path);
    const sha = hashFile(path);
    if (!sha)
        throw new Error(`算不出 sha256：${rel}`);
    files[rel] = { sha256: sha, bytes: buf.length };
}

const manifest = {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    files,
};
writeFileSync(join(SRC, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`已写 ${join(SRC, MANIFEST_NAME)}：v${manifest.version}，${Object.keys(files).length} 个文件`);
