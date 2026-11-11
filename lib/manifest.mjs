// 安装清单与文件判定：所有"这个文件该不该覆盖"的判断都收在这里。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 仓库内清单文件名（放在 pets/queen/ 下，跟着素材一起发）。 */
export const MANIFEST_NAME = '.mianyin-manifest.json';
/** 安装状态文件名（放在 pet/ 根下，记录上次装了什么，用于判断"用户改过没有"）。 */
export const STATE_NAME = '.mianyin-pet-state.json';

export function sha256(buf) {
    return createHash('sha256').update(buf).digest('hex');
}

/** 文件 sha256；文件不存在返回 undefined（不是抛错）。 */
export function hashFile(path) {
    try {
        return sha256(readFileSync(path));
    }
    catch {
        return undefined;
    }
}

export function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return undefined;
    }
}

export function writeJson(path, data) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function readState(path) {
    const state = readJson(path);
    if (!state || typeof state !== 'object' || !state.files)
        return undefined;
    return state;
}

export function writeState(path, state) {
    writeJson(path, state);
}

/**
 * 目标文件相对清单的判定：
 * - `missing` 目标不存在 → 复制
 * - `same`    内容与仓库版本一致 → 什么都不做
 * - `changed` 存在但不一致 → 用户改过（没有 --force 就保留）
 */
export function fileVerdict({ source, target }) {
    if (!existsSync(target))
        return 'missing';
    const want = hashFile(source);
    const have = hashFile(target);
    if (want !== undefined && want === have)
        return 'same';
    return 'changed';
}

export function manifestPath(sourceDir) {
    return join(sourceDir, MANIFEST_NAME);
}
