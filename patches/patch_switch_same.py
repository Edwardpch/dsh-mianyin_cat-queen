"""修 web 端「切换动画被同动画防重分支吞掉」的问题（只对 queen 生效）。

背景（2026-11-10 实测）：
  `lib/client.js` 的 switchTo 里有一条「同一动画被再次选中 → 原地重播」的捷径：
      if (!pendingRef.current && sameFront.current && sameFront.current.classList.contains("is-front")
          && animRef.current === next && sameFront.current.src && sameFront.current.loop === !nextOnce) { ...replay... return; }
  但 `animRef.current = anim` 是在**渲染期**赋值的（3813-3814 行），所以它永远等于刚请求的 next，
  这条捷径对「换动画」也成立。再加上 pickNext 一律 setOnce(true)（loop=false），条件里的
  `loop === !nextOnce` 也恒真 → 每次切换都在捷径里 return，<video> 永远放第一段（待机），
  日志上表现为 switchTo(next=炸毛) 之后既没有 fetch、也没有 load/error。

修法：只在「该 <video> 里真正装着的就是 next」时才走捷径 —— 载入成功时把 next 写到
`el.dataset.petAnim`，条件里加 `cfg.id !== "queen" || sameFront.current.dataset.petAnim === next`。
对其它宠物保持原样（不改变 maodie 行为）。

用法：python tools/patch_switch_same.py apply|revert
"""
import io
import os
import shutil
import sys

PLUG = r"C:\Users\edward\.dsh\profiles\desktop\node_modules\dsh-pet\lib\client.js"
BAK = PLUG + ".bak-switch"
TAG = "[queen-patch-switch]"

COND_OLD = '&& animRef.current === next && sameFront.current.src'
COND_NEW = ('&& (cfg.id !== "queen" || sameFront.current.dataset.petAnim === next) '
            '&& animRef.current === next && sameFront.current.src')

SRC_OLD = '\t\t\t\tel.src = obj;'
SRC_NEW = ('\t\t\t\tel.src = obj;\n'
           '\t\t\t\t// ' + TAG + ' 记下这个 <video> 里真正装的是哪段素材（切换防重判断要用）\n'
           '\t\t\t\tel.dataset.petAnim = next;')


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def apply():
    src = read(PLUG)
    if TAG in src:
        print("already patched")
        return 0
    if not os.path.exists(BAK):
        shutil.copyfile(PLUG, BAK)
        print("backup ->", BAK)
    assert src.count(COND_OLD) == 1, "cond anchor count=%d" % src.count(COND_OLD)
    assert src.count(SRC_OLD) == 1, "src anchor count=%d" % src.count(SRC_OLD)
    src = src.replace(COND_OLD, COND_NEW)
    src = src.replace(SRC_OLD, SRC_NEW)
    write(PLUG, src)
    print("patched")
    return 0


def revert():
    if not os.path.exists(BAK):
        print("no backup, nothing to do")
        return 1
    shutil.copyfile(BAK, PLUG)
    os.remove(BAK)
    print("restored from backup")
    return 0


if __name__ == "__main__":
    sys.exit(apply() if (len(sys.argv) < 2 or sys.argv[1] == "apply") else revert())
