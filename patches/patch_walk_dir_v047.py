# -*- coding: utf-8 -*-
"""给 dsh-pet 0.4.7 重打「走路方向」补丁（desktop helper）。

背景：0.4.7 升级覆盖了 0.3.10 时代的 [queen-patch-dir]。
新锚点：runtime/electron-helper/sprite/playback.js 的 tryMove()，
        lib/client.js 的 planMoveAction()。
逻辑：素材自带方向（moves.actions[].params.dir）优先于「朝向推导」，
      并且把 facing 固定为 left（不镜像），否则镜像会让「向右走」素材看着朝左走。
"""
import io
import os
import shutil
import subprocess
import sys

DSH = os.path.expanduser("~/.dsh")
PET = os.path.join(DSH, "profiles", "desktop", "node_modules", "dsh-pet")

DESK = os.path.join(PET, "runtime", "electron-helper", "sprite", "playback.js")
WEB = os.path.join(PET, "lib", "client.js")

OLD_DESK = """    const dir = this.facing === 'right' ? 1 : -1;
    const W = VIEW.w;"""

NEW_DESK = """    // [queen-dir] 素材自带方向（params.dir）优先：两段走路素材各自朝一个方向，
    // 用朝向推导会出现「向右走的素材在往左移动」。有 dir 时强制不镜像（facing=left）。
    const qdir =
      chosen.params && typeof chosen.params.dir === 'number' ? chosen.params.dir : null;
    if (qdir !== null) this.facing = 'left';
    const dir = qdir !== null ? qdir : this.facing === 'right' ? 1 : -1;
    const W = VIEW.w;"""

OLD_WEB = """	const dir = input.facing === "right" ? 1 : -1;"""

NEW_WEB = """	// [queen-dir] 素材自带方向（params.dir）优先，避免镜像与位移方向相反
	const qdir = chosen.params && typeof chosen.params.dir === "number" ? chosen.params.dir : null;
	const dir = qdir !== null ? qdir : input.facing === "right" ? 1 : -1;"""


def patch(path, old, new, tag):
    src = io.open(path, encoding="utf-8").read()
    if tag in src:
        print("[skip] 已打过补丁：%s" % path)
        return
    if src.count(old) != 1:
        raise SystemExit("[fail] 锚点命中 %d 次（期望 1）：%s" % (src.count(old), path))
    bak = path + ".bak-queen-dir"
    if not os.path.exists(bak):
        shutil.copyfile(path, bak)
    io.open(path, "w", encoding="utf-8", newline="").write(src.replace(old, new, 1))
    rc = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    if rc.returncode != 0:
        shutil.copyfile(bak, path)
        raise SystemExit("[fail] node --check 失败，已回滚：%s\n%s" % (path, rc.stderr))
    print("[ok] %s" % path)


def revert(path):
    bak = path + ".bak-queen-dir"
    if os.path.exists(bak):
        shutil.copyfile(bak, path)
        print("[revert] %s" % path)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "revert":
        revert(DESK)
        revert(WEB)
    else:
        patch(DESK, OLD_DESK, NEW_DESK, "[queen-dir]")
        patch(WEB, OLD_WEB, NEW_WEB, "[queen-dir]")
