// mianyin-pet 宿主半侧：把 pets/queen 下的素材同步进 dsh-pet 的素材目录。
//
// dsh-pet 只扫 pet/ 的**下一层**：pet/<前缀>-config.json 与 pet/<前缀>-animation/，
// 所以素材必须平铺，不能塞进 pet/queen/ 子目录（见 dsh-pet lib/index.js 的 scanPetFiles）。
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    MANIFEST_NAME,
    STATE_NAME,
    fileVerdict,
    hashFile,
    manifestPath,
    readJson,
    readState,
    writeState,
} from './manifest.mjs';

/** Cordis 插件名，与 cordis.patch.yml 里的 `id` 一致。 */
export const name = 'mianyin-cat-queen';
/** webServer 未就绪时 ctx.webServer 是 undefined；声明依赖让 cordis 等路由就绪再 apply。 */
export const inject = ['webServer'];

/** 本包根目录（lib/ 的上一级）。 */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** 素材源目录（仓库里的 pets/queen）。 */
export const SOURCE_DIR = join(PLUGIN_ROOT, 'pet');
/** 宠物条目名 = pet/<前缀>-config.json 的前缀。 */
export const PET_ID = 'queen';
/** 备份目录名（放在 pet/ 下，不放进宠物素材目录，免得被 dsh-pet 当成素材）。 */
export const BACKUP_DIR_NAME = '.mianyin-pet-backup';

export function dshHome() {
    const fromEnv = process.env.DSH_HOME;
    return fromEnv && fromEnv.trim() ? resolve(fromEnv) : join(homedir(), '.dsh');
}

/** dsh-pet 的素材根目录。 */
export function petRootDir(home = dshHome()) {
    return join(home, 'dsh-pet', 'pet');
}

export function statePath(home = dshHome()) {
    return join(petRootDir(home), STATE_NAME);
}

function timestamp(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** 递归列出目录下的相对路径（统一用 /，与清单一致）。 */
function listFiles(root, prefix = '') {
    const out = [];
    for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            out.push(...listFiles(root, rel));
        else
            out.push(rel);
    }
    return out;
}

/**
 * 安装/升级素材。
 * @param {{home?: string, force?: boolean, prune?: boolean, dryRun?: boolean}} options
 */
export function installPet(options = {}) {
    const home = options.home ?? dshHome();
    const force = options.force === true;
    const prune = options.prune === true;
    const dryRun = options.dryRun === true;

    const manifest = readJson(manifestPath(SOURCE_DIR));
    if (!manifest || !manifest.files)
        throw new Error(`缺少安装清单：${manifestPath(SOURCE_DIR)}（先在仓库里跑 node tools/make-manifest.mjs）`);

    const version = manifest.version;
    const target = petRootDir(home);
    const stateFile = statePath(home);
    const previous = readState(stateFile);
    const previousVersion = previous?.version;

    const copied = [];
    const updated = [];
    const skipped = [];
    const removed = [];
    const warnings = [];
    let backupDir = null;

    const ensureBackup = () => {
        if (backupDir)
            return backupDir;
        const dir = join(target, BACKUP_DIR_NAME, timestamp());
        if (!dryRun)
            mkdirSync(dir, { recursive: true });
        backupDir = dir;
        return dir;
    };
    const backupFile = (rel) => {
        const src = join(target, rel);
        if (!existsSync(src))
            return;
        const dir = ensureBackup();
        const dst = join(dir, rel);
        if (!dryRun) {
            mkdirSync(dirname(dst), { recursive: true });
            copyFileSync(src, dst);
        }
    };

    for (const [rel, info] of Object.entries(manifest.files)) {
        const src = join(SOURCE_DIR, rel);
        const dst = join(target, rel);
        if (!existsSync(src)) {
            warnings.push(`清单里有、仓库里没有：${rel}`);
            continue;
        }
        const verdict = fileVerdict({ source: src, target: dst });
        if (verdict === 'same')
            continue;
        if (verdict === 'missing') {
            if (!dryRun) {
                mkdirSync(dirname(dst), { recursive: true });
                copyFileSync(src, dst);
            }
            copied.push(rel);
            continue;
        }
        // changed：文件和仓库版本不同 —— 可能是你改的，也可能是旧版本
        if (force) {
            backupFile(rel);
            if (!dryRun)
                copyFileSync(src, dst);
            updated.push(rel);
        }
        else {
            skipped.push(rel);
        }
    }

    // --prune：删掉"上次装过、这次仓库里没有"的素材（只有你显式要求才删，且先备份）
    if (prune && previous?.files) {
        for (const rel of Object.keys(previous.files)) {
            if (manifest.files[rel])
                continue;
            const dst = join(target, rel);
            if (!existsSync(dst))
                continue;
            backupFile(rel);
            if (!dryRun)
                rmSync(dst, { force: true });
            removed.push(rel);
        }
    }

    // 守卫：配置里引用的动画必须都有对应的 <名字>.webm（少一个就会静默放不出动作）
    const configPath = join(target, `${PET_ID}-config.json`);
    const config = readJson(configPath);
    if (config?.animations) {
        const animDir = join(target, `${PET_ID}-animation`);
        const missing = [];
        const pools = [
            ...(config.animations.idle ?? []),
            ...(config.animations.drag ?? []),
            ...(config.animations.clicks ?? []),
            ...(config.animations.turn ?? []),
            ...(config.animations.moves?.actions ?? []).map((a) => a.name),
            ...(config.animations.categories ?? []).flatMap((c) => c.actions ?? []),
            ...(config.animations.sleep ?? []).flatMap((g) => [...(g.start ?? []), ...(g.loop ?? []), ...(g.end ?? [])]),
        ];
        for (const anim of new Set(pools)) {
            if (!existsSync(join(animDir, `${anim}.webm`)))
                missing.push(anim);
        }
        if (missing.length > 0)
            warnings.push(`配置引用了不存在的动画：${missing.join('、')}`);
    }
    if (config?.memes) {
        const memeDir = join(target, `${PET_ID}-memes`);
        const missing = Object.keys(config.memes).filter((m) => !existsSync(join(memeDir, `${m}.png`)));
        if (missing.length > 0)
            warnings.push(`配置引用了不存在的表情：${missing.join('、')}`);
    }

    const files = {};
    for (const rel of Object.keys(manifest.files)) {
        const sha = hashFile(join(target, rel));
        if (sha !== undefined)
            files[rel] = { sha256: sha, bytes: manifest.files[rel].bytes };
    }
    const changed = copied.length + updated.length + removed.length > 0;
    const status = previousVersion === undefined ? 'installed' : changed || previousVersion !== version ? 'updated' : 'up-to-date';

    if (!dryRun) {
        writeState(stateFile, {
            version,
            previousVersion: previousVersion ?? null,
            updatedAt: new Date().toISOString(),
            target,
            files,
        });
    }

    return {
        status,
        version,
        previousVersion,
        mode: force ? 'force' : 'safe',
        target,
        copied,
        updated,
        skipped,
        removed,
        warnings,
        backupDir: changed ? backupDir : null,
        dryRun,
    };
}

/** 从备份目录还原（默认取最新一个）。 */
export function rollbackPet({ home = dshHome(), backupDir } = {}) {
    const target = petRootDir(home);
    let dir = backupDir;
    if (!dir) {
        const root = join(target, BACKUP_DIR_NAME);
        if (!existsSync(root))
            throw new Error(`没有备份目录：${root}`);
        const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
        if (dirs.length === 0)
            throw new Error(`备份目录是空的：${root}`);
        dir = join(root, dirs[dirs.length - 1]);
    }
    const restored = [];
    for (const rel of listFiles(dir)) {
        const dst = join(target, rel);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(join(dir, rel), dst);
        restored.push(rel);
    }
    return { restored, backupDir: dir };
}

/** Cordis 入口：加载时安装/升级素材。失败只记日志，不让插件整体加载失败。 */
export function apply(ctx) {
    const logger = ctx?.logger;
    const info = (m) => (typeof logger?.info === 'function' ? logger.info(m) : console.log(m));
    const warn = (m) => (typeof logger?.warn === 'function' ? logger.warn(m) : console.warn(m));
    try {
        const r = installPet();
        if (r.status === 'up-to-date')
            info(`[mianyin-cat-queen] 素材已是最新（v${r.version}）：${r.target}`);
        else
            info(`[mianyin-cat-queen] ${r.status === 'installed' ? '已安装' : '已升级'} v${r.previousVersion ?? '-'} → v${r.version}：${r.target}`);
        if (r.copied.length + r.updated.length > 0)
            info(`[mianyin-cat-queen] 写入 ${r.copied.length + r.updated.length} 个素材，保留 ${r.skipped.length} 个你改过的文件`);
        if (r.backupDir)
            info(`[mianyin-cat-queen] 覆盖前的文件已备份到 ${r.backupDir}`);
        for (const w of r.warnings)
            warn(`[mianyin-cat-queen] ${w}`);
    }
    catch (error) {
        warn(`[mianyin-cat-queen] 素材安装失败：${error instanceof Error ? error.message : String(error)}`);
    }
    info('[mianyin-cat-queen] 装好若没看到猫：右键宠物 → 重载配置（或重启 DSH）；显示位置选「仅桌面」或「两者」');
}

export { MANIFEST_NAME, STATE_NAME };
