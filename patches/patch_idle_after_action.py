#!/usr/bin/env python
"""给 dsh-pet 打一个最小补丁：**只对 id === 'queen' 的宠物**，
让「分类随机动作（categories）」播完之后直接回待机，而不是再掷一次骰子连播下一个动作。

浏览器端 lib/client.js（handleEnded 末尾的 pickNext()）
桌面端 runtime/electron-helper/sprite.js（handleEnded 末尾的 playIdle()）

幂等：已打过（含 [queen-patch] 标记）就跳过；改前后各做一次 node --check；备份 .bak-queen。
"""
import io, os, shutil, subprocess, sys

PLUGIN = r'C:\Users\edward\.dsh\profiles\desktop\node_modules\dsh-pet'
MARK = '[queen-patch]'

CLIENT_ANCHOR = '\t\t\tpickNext();\n\t\t};'
CLIENT_INSERT = '''\t\t\t// [queen-patch] 随机动作（categories）播完 → 直接回待机，不连播下一个动作。
\t\t\t// 只对 queen 生效（其它宠物的随机链语义不变：它们仍走 pickNext 重新掷骰）。
\t\t\tif (cfg.id === "queen" && animations.idle.length) {
\t\t\t\tconst inCat = (animations.categories ?? []).some((c) => (c.actions ?? []).includes(animRef.current));
\t\t\t\tif (inCat) {
\t\t\t\t\tif (resumeWorkStatusAnim()) return;
\t\t\t\t\tsetAnim(pick(animations.idle, animRef.current));
\t\t\t\t\tsetOnce(true);
\t\t\t\t\tsetSeq((s) => s + 1);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t}
\t\t\tpickNext();
\t\t};'''

SPRITE_ANCHOR = '    this.playIdle();\n  }'
SPRITE_INSERT = '''    // [queen-patch] 随机动作（categories）播完 → 直接回待机，不连播（与浏览器端同一语义）。
    if (this.pet.id === 'queen' && this.animations.idle.length) {
      const cats = this.animations.categories ?? [];
      if (cats.some((c) => (c.actions ?? []).includes(this.anim))) {
        if (this.resumeWorkStatusAnim()) return;
        this.playOnce(S.pick(this.animations.idle, this.anim));
        return;
      }
    }
    this.playIdle();
  }'''


def patch(rel, anchor, replacement):
    path = os.path.join(PLUGIN, rel)
    src = io.open(path, encoding='utf-8').read()
    if MARK in src:
        print('· %s 已打过补丁，跳过' % rel)
        return False
    if src.count(anchor) != 1:
        sys.exit('!! %s 锚点不唯一（%d 处），放弃' % (rel, src.count(anchor)))
    bak = path + '.bak-queen'
    if not os.path.exists(bak):
        shutil.copyfile(path, bak)
    out = src.replace(anchor, replacement)
    io.open(path, 'w', encoding='utf-8', newline='').write(out)
    r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
    if r.returncode != 0:
        shutil.copyfile(bak, path)
        sys.exit('!! %s 语法检查失败，已回滚：%s' % (rel, r.stderr[:400]))
    print('✓ %s 已打补丁（备份 %s）' % (rel, os.path.basename(bak)))
    return True


if __name__ == '__main__':
    a = patch('lib/client.js', CLIENT_ANCHOR, CLIENT_INSERT)
    b = patch('runtime/electron-helper/sprite.js', SPRITE_ANCHOR, SPRITE_INSERT)
    print('完成：%s' % ('有改动，需刷新页面 + POST /dsh-pet-7340/reload' if (a or b) else '无改动'))
