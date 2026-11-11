# patches

针对 **dsh-pet**（`%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-pet`）的客户端补丁，
只对 `pet.id === 'queen'` 生效，其它宠物（例如橘猫 maodie）行为不变。

**当前 dsh-pet 是 0.4.7**，用下面两个脚本；它们会自己检查锚点，不匹配就报错退出（不会写坏文件）。

| 脚本 | 作用 | 改的文件 | 标记 |
|---|---|---|---|
| `patch_walk_dir_v047.py` | 走路方向按素材自带的 `params.dir`（0.4.7 原生只看朝向，导致「向右走」往左移） | `runtime/electron-helper/sprite/playback.js`、`lib/client.js` | `[queen-dir]` |
| `patch_queen_v047.py` | 动作播完回待机不连播 / 动作必须播完 / 菜单点播可打断 / 自动入睡 / 自动起床 / 醒来冷却 | `runtime/electron-helper/sprite/playback.js`、`sprite/menu.js` | `[queen-047]` |
| `migrate_sleep_native.py` | 把旧的「作息」类别配置迁移成 0.4.7 原生 `animations.sleep` | `tools/build_actions.py` | — |
| `patch_idle_after_action.py` | **0.3.x 专用**（0.4.7 已被原生行为 + 上面的脚本取代，不要再用） | `lib/client.js`、`sprite.js` | `[queen-patch]` |
| `patch_walk_dir.py` | **0.3.x 专用** | 同上 | `[queen-patch-dir]` |
| `patch_switch_same.py` | **0.3.x 专用**（0.4.7 原生已没有这个 bug） | `lib/client.js` | `[queen-patch-switch]` |

用法（每个脚本都支持 apply / revert，幂等、自动备份 `*.bak-*`、改完 `node --check`）：

```
set DSH_HOME=%USERPROFILE%\.dsh
python patch_walk_dir_v047.py apply
python patch_queen_v047.py apply
```

`[queen-sleep]`（作息状态机 + 动作播完守卫 + 睡觉气泡）体积较大、插入点分散，
未做成脚本；如需在别的机器上复现，请对照本包 `docs/sprite-queen-sleep.md` 的说明手工合并。

> 补丁会随 dsh-pet 升级被覆盖，升级后需要重新 apply。
