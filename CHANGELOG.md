# CHANGELOG

## 1.0.5

- 仓库升级为标准 DSH 插件：`package.json` 声明 `dsh.bundle`，宿主半侧（`lib/index.js`）加载时把 `pet/` 同步到 `$DSH_HOME/dsh-pet/pet/`
- 新增命令行安装器 `tools/cli.mjs`（`--dry-run` / `--force` / `--prune` / `--rollback`）：sha256 清单、增量安装、你改过的文件不覆盖、覆盖前备份
- 新增 `tools/make-manifest.mjs`（刷新 `pet/.mianyin-manifest.json`）与 `tools/patch-walk-dir.mjs`（可选：左右走路方向各走各的）
- README 补插件安装方式与英文说明

## 1.0.4

- 28 段动画：待机 / 小动作 15 / 生气 3 / 点击回应 2（另 4 个动作双挂）/ 走路 2 / 作息 4 / 说话 1
- 修「几乎总是待机」：events.balance/whisper 不再指向 idle，改用独立「说话」
- 权重调整：idle 60→50，小动作 20→30（生气保持 10）
- 修「向右走」脸被画布裁切（逐帧跟踪对齐）、「拍西瓜」透明、「伸爪拍屏幕」底部透明缝
- 眼睛清晰度（CRF 26 + 锐化 0.5）、尾巴右端碎点清理
- 作息状态机：待机 ⇄ 睡觉（自动 + 菜单手动），链内不插随机动作
- 睡着前不响应「起床」；右键菜单点播可打断当前动作，随机链/宿主事件仍不能打断
- 走路位移距离翻倍（minDist 60→120 / maxDist 240→480）
- 碎碎念换成缅因猫自己的 13 张表情包（pet/queen-memes 独占目录）+ 专属猫设人设
