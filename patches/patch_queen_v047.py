# -*- coding: utf-8 -*-
"""dsh-pet 0.4.7 重打「缅因猫」行为补丁（等价 0.3.10 时代的 [queen-sleep] + [queen-patch] + 打断守卫）。

四块，都只对 pet.id === 'queen' 生效（maodie / main 不受影响）：
1. 自动入睡：待机链每次播完 12% 概率去睡（醒来后 2 分钟冷却）；
2. 自动醒来：睡下后 2~4 分钟自己起（醒来播 end 段，走原生睡觉状态机）；
3. 动作守卫：随机链/宿主自动来源不能打断正在播的动作；菜单/点播（qForce）可打断；
4. 随机动作播完回待机，不连播下一个动作。
用法：python tools/patch_queen_v047.py [revert]
"""
import io
import os
import shutil
import subprocess
import sys

DSH = os.path.expanduser("~/.dsh")
HELP = os.path.join(DSH, "profiles", "desktop", "node_modules", "dsh-pet",
                    "runtime", "electron-helper")
PB = os.path.join(HELP, "sprite", "playback.js")
MENU = os.path.join(HELP, "sprite", "menu.js")

# (文件, 标记, 原文, 替换后)
EDITS = [
    (PB, "动作必须播完：随机链", """  playOnce(name, playbackId, url) {
    this.switchTo(name, true, playbackId, url);
  },""", """  playOnce(name, playbackId, url) {
    // [queen-047] 动作必须播完：随机链/宿主自动来源不能打断正在播的动作；
    // 菜单与第三方点播会把 qForce 置 true（用户显式选择 → 允许打断）。睡觉三段一律放行。
    const sleepy =
      Array.isArray(this.animations.sleep) &&
      this.animations.sleep.some(
        (s) =>
          (s.start || []).includes(name) || (s.loop || []).includes(name) || (s.end || []).includes(name),
      );
    if (this.pet.id === 'queen' && this.qBusy && !this.qForce && !sleepy && name !== this.anim) return;
    if (this.pet.id === 'queen') {
      this.qBusy = !sleepy && !(this.animations.idle || []).includes(name);
    }
    this.switchTo(name, true, playbackId, url);
  },"""),

    (PB, "自动入睡：待机链每播完一段", """    if (this.sleeping) return;
    this.stopMove();
    const { animations, animationWeights } = { animations: this.animations, animationWeights: this.weights };""",
     """    if (this.sleeping) return;
    // [queen-047] 自动入睡：待机链每播完一段有 12% 概率去睡（醒来后 2 分钟冷却），
    // 与菜单/快捷键手动入睡并存；真正进睡由宿主 /sleep 写叶子、setSleep 接管。
    if (
      this.pet.id === 'queen' &&
      Array.isArray(this.animations.sleep) &&
      this.animations.sleep.length > 0 &&
      Date.now() > (this.qSleepCoolUntil || 0) &&
      Math.random() < 0.12
    ) {
      this.qSleepCoolUntil = Date.now() + 120000;
      this.postSleepAction('sleep');
      return;
    }
    this.stopMove();
    const { animations, animationWeights } = { animations: this.animations, animationWeights: this.weights };"""),

    (PB, "自动醒来：睡下后 2~4 分钟", """    this.playOnce(state.start);
    console.log(stamp + ' 进睡：' + state.start + ' → ' + state.loop);""",
     """    this.playOnce(state.start);
    // [queen-047] 自动醒来：睡下后 2~4 分钟自己起（醒来走 end 段 → 随机链，与手动叫醒同一条路）
    if (this.pet.id === 'queen') {
      if (this.qWakeTimer) window.clearTimeout(this.qWakeTimer);
      this.qWakeTimer = window.setTimeout(
        () => {
          this.qWakeTimer = null;
          if (this.sleeping) this.postSleepAction('wake');
        },
        120000 + Math.random() * 120000,
      );
    }
    console.log(stamp + ' 进睡：' + state.start + ' → ' + state.loop);"""),

    (PB, "醒了就拆掉自动入睡的定时器", """      this.sleepPhase = 'end';
      this.stopMove();""", """      this.sleepPhase = 'end';
      // [queen-047] 醒了就拆掉自动睡醒的定时器，避免残留定时器把下一次睡眠提前叫醒
      if (this.qWakeTimer) {
        window.clearTimeout(this.qWakeTimer);
        this.qWakeTimer = null;
      }
      this.stopMove();"""),

    (PB, "一段播完 = 空闲：清掉守卫标记", """  handleEnded() {
    // 播放回执：前台视频真的播完了""", """  handleEnded() {
    // [queen-047] 一段播完 = 空闲：清掉守卫标记，允许下一段开始
    if (this.pet.id === 'queen') {
      this.qBusy = false;
      this.qForce = false;
    }
    // 播放回执：前台视频真的播完了"""),

    (PB, "随机动作播完回待机", """    this.playIdle();
  },

  // 互动/事件动画播完后恢复工作状态档位循环""", """    // [queen-047] 随机动作播完回待机，不连播下一个动作（idle 不放这里，交给 playIdle 掷骰）
    if (this.pet.id === 'queen') {
      const catActions = (this.animations.categories || []).reduce(
        (acc, c) => acc.concat(c.actions || []),
        [],
      );
      if (catActions.includes(this.anim) && this.animations.idle.length) {
        this.playOnce(S.pick(this.animations.idle, this.anim));
        return;
      }
    }
    this.playIdle();
  },

  // 互动/事件动画播完后恢复工作状态档位循环"""),

    (MENU, "菜单点播：用户显式选择", """    if (this.animations.moves.actions.some((a) => a.name === leaf.anim)) {
      const moved = this.tryMove(leaf.anim, playbackId);
      if (moved === false) this.playOnce(leaf.anim, playbackId);
      // moved === true = 已有移动/抛掷在进行中（没换源）：本段不会真的播起来 → 如实回 failed/busy
      else if (moved === true && playbackId) this.reportPlayback(playbackId, 'failed', 'busy');
      return;
    }""", """    // [queen-047] 菜单点播：用户显式选择 → 允许打断当前动作
    this.qForce = true;
    if (this.animations.moves.actions.some((a) => a.name === leaf.anim)) {
      const moved = this.tryMove(leaf.anim, playbackId);
      if (moved === false) this.playOnce(leaf.anim, playbackId);
      // moved === true = 已有移动/抛掷在进行中（没换源）：本段不会真的播起来 → 如实回 failed/busy
      else if (moved === true && playbackId) this.reportPlayback(playbackId, 'failed', 'busy');
      this.qForce = false;
      return;
    }"""),

    (MENU, "菜单点播后复位 qForce", """    this.playOnce(leaf.anim, playbackId);
  },

  closeMenu() {""", """    this.playOnce(leaf.anim, playbackId);
    this.qForce = false; // [queen-047] 菜单点播后复位，避免后续随机来源也享受「可打断」
  },

  closeMenu() {"""),
]


def apply():
    changed = set()
    for path, mark, old, new in EDITS:
        src = io.open(path, encoding="utf-8").read()
        if mark in src:
            print("[skip] 已有：%s :: %s" % (os.path.basename(path), mark))
            continue
        if src.count(old) != 1:
            raise SystemExit("[fail] 锚点命中 %d 次（期望 1）：%s\n%r"
                             % (src.count(old), os.path.basename(path), old[:70]))
        bak = path + ".bak-queen047"
        if not os.path.exists(bak):
            shutil.copyfile(path, bak)
        io.open(path, "w", encoding="utf-8", newline="").write(src.replace(old, new, 1))
        changed.add(path)
        print("[ok] %s :: %s" % (os.path.basename(path), mark))
    for path in (changed or {PB, MENU}):
        rc = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if rc.returncode != 0:
            for p in (PB, MENU):
                bak = p + ".bak-queen047"
                if os.path.exists(bak):
                    shutil.copyfile(bak, p)
            raise SystemExit("[fail] node --check 失败，已回滚：\n%s" % rc.stderr)
        print("[check] ok: %s" % os.path.basename(path))


def revert():
    for path in (PB, MENU):
        bak = path + ".bak-queen047"
        if os.path.exists(bak):
            shutil.copyfile(bak, path)
            print("[revert] %s" % os.path.basename(path))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "revert":
        revert()
    else:
        apply()
