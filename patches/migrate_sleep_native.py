# -*- coding: utf-8 -*-
"""把「作息」从自定义类别迁到 dsh-pet 0.4.7 的原生睡觉状态机（animations.sleep）。

0.4.7 原生提供：animations.sleep = [{start:[...], loop:[...], end:[...]}]，
宿主 /sleep、/wake 路由 + 渲染端 setSleep()：start 播完 → loop 循环 → end 播完 → 回随机链；
睡觉期间随机链停、菜单非白名单动作只弹 sleepRefuseTexts 提示。
所以不再需要 sprite 侧的 [queen-sleep] 补丁，配置即可。
"""
import io
import os
import subprocess
import sys

P = r"D:\project\dsh\_pkg\pet-builder\tools\build_actions.py"
MARK = "animations.sleep"

SLEEP_CAT = """        # 「作息」只做手动入口（weight 0 → 随机链永远抽不到）：去睡觉 / 起床1 / 起床2。
        # 「睡觉」是循环状态，由 sprite 补丁在「去睡觉」播完后直接切过去，不进菜单。
        {'id': '作息', 'weight': 0, 'actions': ['去睡觉', '起床1', '起床2']},
"""

SLEEP_ANIM = """            # 0.4.7 原生睡觉状态机（animations.sleep）：start 播完 → loop 循环 → end 播完 → 回随机链。
            # 睡觉期间随机链停、菜单其它动作只弹 sleepRefuseTexts，满足「这条链里不插别的动作」。
            'sleep': [{'start': ['去睡觉'], 'loop': ['睡觉'], 'end': ['起床1', '起床2']}],
"""

TEXTS = """        'sleepStartTexts': ['小猫要去睡了…', '困了，先趴一会儿'],
        'sleepEndTexts': ['睡醒啦～', '伸个懒腰'],
        'sleepRefuseTexts': ['小猫睡觉中，请通过「起来」唤醒'],
"""


def main():
    src = io.open(P, encoding="utf-8").read()
    if MARK in src:
        print("[skip] 已经迁过（%s 存在）" % MARK)
        return
    if SLEEP_CAT not in src:
        raise SystemExit("[fail] 找不到「作息」类别块，未改动")
    if SLEEP_CAT not in src or "\n            'categories': cats,\n" not in src:
        raise SystemExit("[fail] 锚点不匹配")
    src = src.replace(SLEEP_CAT, "")
    src = src.replace(
        "\n            'categories': cats,\n",
        "\n            'categories': cats,\n" + SLEEP_ANIM,
        1,
    )
    anchor = "        'animationWeights': {'idle': 50, 'turn': 0, 'move': 0},\n"
    if anchor not in src:
        raise SystemExit("[fail] 找不到 animationWeights 行")
    src = src.replace(anchor, anchor + TEXTS, 1)
    io.open(P, "w", encoding="utf-8", newline="").write(src)

    rc = subprocess.run([sys.executable, "-c", "import ast,io; ast.parse(io.open(r'%s',encoding='utf-8').read())" % P])
    if rc.returncode != 0:
        raise SystemExit("[fail] 语法检查失败")
    print("[ok] build_actions.py 已迁移到原生 sleep")


if __name__ == "__main__":
    main()
