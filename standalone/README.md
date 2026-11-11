# 缅因猫桌宠（独立版）

不依赖 DSH 的独立桌面宠物程序：透明置顶、无边框、可拖动、带托盘。

## 运行

需要一个 Electron 运行时（本项目不在 npm 上发布 Electron 二进制，二选一）：

### 方式 A：用 npm 安装 Electron（推荐给开发者）

```bash
cd standalone
npm install --save-dev electron
npx electron .
```

### 方式 B：用现成的 Electron 发行版打包成绿色版

1. 下载 Electron 发行版（例如 https://github.com/electron/electron/releases 里的 `electron-vXX-win32-x64.zip`），解压到任意目录；
2. 修改 `scripts/pack.js` 顶部的 `ELECTRON_DIR` 指向该目录；
3. 执行：

```bash
node scripts/pack.js            # 生成 ../dist/MianyinPet/
node scripts/pack.js --shortcut # 顺便在桌面建快捷方式
```

生成的 `MianyinPet/` 目录里 `MianyinPet.exe` 双击即可运行。

> Windows 提示：如果复制出来的 `MianyinPet.exe` 启动即退出（退出码 `0x80000003`），直接把快捷方式指向原版 `electron.exe`、参数填应用目录即可：
> `electron.exe "…\MianyinPet\resources\app"`

## 操作

| 操作 | 效果 |
| --- | --- |
| 左键点猫 | 随机播一个「点击回应」动作 |
| 按住拖动 | 移动位置 |
| 右键 | 菜单：动作▸ / 睡觉 / 起来 / 回到初始位置 / 置顶 / 打开素材目录 / 退出 |
| 左键点托盘图标 | 显示 / 隐藏小猫 |
| 右键托盘图标 | 隐藏显示、回到初始位置、打开素材目录、退出 |
| Alt+F4 | 只隐藏，不退出（真退出用托盘菜单） |

## 行为

- 待机时每播完一段会掷骰：约 12% 去睡觉，其余按权重在「待机 / 小动作 / 生气」里选；
- 睡觉是两段基础状态：`待机 →（去睡觉）→ 睡觉（循环）→（起床1 / 起床2）→ 待机`，这条链里不会被随机动作插入；
- 睡觉时点猫 / 点菜单其它动作只会弹提示「小猫睡觉中，请通过『起来』唤醒」；
- 走路是真实位移：`向左走` / `向右走` 按 `moves.actions[].params.dir` 决定方向，走到屏幕边缘会原地迈步并提示；
- 动作播完才回待机（不会播到一半被随机动作打断）；从菜单手动选的动作可以打断当前动作。

## 素材

`assets/` 已包含 28 段动作 WebM、13 张碎碎念表情和 `queen-config.json`。

替换素材直接改这里的文件即可（文件名 = 配置里的动画名，**不带扩展名**，例如 `待机.webm` 对应配置里的 `"待机"`）。改完重启程序。

重新从 `pet/` 目录生成 `assets/`：

```bash
node scripts/prepare-assets.js
```

## 调试

```bash
# 带 DevTools 与控制台日志启动
MIANYIN_DEBUG=1 MIANYIN_LOG=1 npx electron .

# 用 CDP 直接调状态机（需要先带 --remote-debugging-port=9333 启动）
node scripts/cdp.js "JSON.stringify(window.__pet.S)"
```

页面里暴露了 `window.__pet = { S, playOnce, playIdle, sleep, wake, tryMove, roll, switchTo }` 方便调试。

## 已知限制

- 只支持 Windows（用到 `transparent`、`alwaysOnTop('screen-saver')`、`setIgnoreMouseEvents`）；
- 高 DPI 缩放下窗口按逻辑像素计算，150% 及以上建议实测一下位置；
- 碎碎念是本地固定文案 + 表情图轮换，不接大模型。
