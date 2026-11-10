#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""给 dsh-pet 打第二个最小补丁：**只对 id === 'queen' 的双向走路素材生效**。

背景：dsh-pet 原生只有一套「按朝向推算方向 + 用镜像翻转让素材跟着朝向」的走路逻辑
（`dir = facing === 'right' ? 1 : -1`，且 facing==='right' 时 video 加 scaleX(-1)）。
我们手上有「向右走 / 向左走」两段**自带方向**的素材，套原生逻辑会出现
「点『向左走』却朝右走」或「视频镜像后跟位移方向相反」的错位。

补丁做法：
  1) 方向优先取动作参数 `params.dir`（配置里 向右走=1、向左走=-1）；
  2) 播这类动作时把 facing 置为 'left'（=不镜像），素材按原样播出，方向与位移一致。

浏览器端 lib/client.js 的 tryMove，桌面端 runtime/electron-helper/sprite.js 的 tryMove。
幂等：含 [queen-patch-dir] 标记就跳过；改前后 node --check；备份 .bak-queen。
"""
import io, os, shutil, subprocess, sys

PLUGIN = r'C:\Users\edward\.dsh\profiles\desktop\node_modules\dsh-pet'
MARK = '[queen-patch-dir]'

CLIENT_ANCHOR = '\t\t\tconst dir = facingRef.current === "right" ? 1 : -1;'
CLIENT_GUARD = 'cfg.id === "queen"'
CLIENT_INSERT = (
    '\t\t\t// [queen-patch-dir] 双向走路素材自带方向：优先用 params.dir，并强制不镜像（facing=left），\n'
    '\t\t\t// 否则「向左走」会朝右走、或镜像后视觉方向与位移相反。\n'
    '\t\t\tconst queenDir = cfg.id === "queen" && chosen.params ? chosen.params.dir : null;\n'
    '\t\t\tif (queenDir) {\n'
    '\t\t\t\tfacingRef.current = "left";\n'
    '\t\t\t\tsetFacing("left");\n'
    '\t\t\t}\n'
    '\t\t\tconst dir = queenDir || (facingRef.current === "right" ? 1 : -1);'
)

SPRITE_ANCHOR = "    const dir = this.facing === 'right' ? 1 : -1;"
SPRITE_INSERT = (
    "    // [queen-patch-dir] 同上：双向走路素材自带方向，用 params.dir 并保持未镜像。\n"
    "    const queenDir = this.pet.id === 'queen' && chosen.params ? chosen.params.dir : null;\n"
    "    if (queenDir) this.facing = 'left';\n"
    "    const dir = queenDir || (this.facing === 'right' ? 1 : -1);"
)


def patch(rel, anchor, replacement, guard_needle):
    path = os.path.join(PLUGIN, rel)
    src = io.open(path, encoding='utf-8').read()
    if MARK in src:
        print('· %s 已打过补丁，跳过' % rel)
        return False
    if src.count(anchor) != 1:
        sys.exit('!! %s 锚点不唯一（%d 处），放弃' % (rel, src.count(anchor)))
    if guard_needle not in src:
        sys.exit('!! %s 里找不到守卫所需的上下文 %r，放弃' % (rel, guard_needle))
    bak = path + '.bak-queen'
    if not os.path.exists(bak):
        shutil.copyfile(path, bak)
    io.open(path, 'w', encoding='utf-8', newline='').write(src.replace(anchor, replacement))
    r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
    if r.returncode != 0:
        shutil.copyfile(bak, path)
        sys.exit('!! %s 语法检查失败，已回滚：\n%s' % (rel, r.stderr[:500]))
    print('✓ %s 已打补丁（备份 .bak-queen）' % rel)
    return True


def main():
    a = patch('lib/client.js', CLIENT_ANCHOR, CLIENT_INSERT, CLIENT_GUARD)
    b = patch('runtime/electron-helper/sprite.js', SPRITE_ANCHOR, SPRITE_INSERT, "this.pet.id === 'queen'")
    print('完成：%s。需刷新页面 + POST /dsh-pet-7340/reload' % ('有改动' if (a or b) else '无改动'))


if __name__ == '__main__':
    main()
