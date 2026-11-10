# patches

针对 **dsh-pet**（`%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-pet`）的客户端补丁，
只对 `pet.id === 'queen'` 生效，其它宠物（例如橘猫 maodie）行为不变。

| 脚本 | 作用 | 改的文件 | 标记 |
|---|---|---|---|
| `patch_idle_after_action.py` | 随机动作播完直接回待机，不连播 | `lib/client.js`、`runtime/electron-helper/sprite.js` | `[queen-patch]` |
| `patch_walk_dir.py` | 走路方向按素材自带的 `params.dir`，不再只由朝向决定 | 同上 | `[queen-patch-dir]` |
| `patch_switch_same.py` | 修 dsh-pet 的「同一动画原地重播」捷径导致永远不换源 | `lib/client.js` | `[queen-patch-switch]` |

用法（每个脚本都支持 apply / revert，幂等、自动备份 `*.bak-*`、改完 `node --check`）：

```
set DSH_HOME=%USERPROFILE%\.dsh
python patch_idle_after_action.py apply
python patch_walk_dir.py apply
python patch_switch_same.py apply
```

`[queen-sleep]`（作息状态机 + 动作播完守卫 + 睡觉气泡）体积较大、插入点分散，
未做成脚本；如需在别的机器上复现，请对照本包 `docs/sprite-queen-sleep.md` 的说明手工合并。

> 补丁会随 dsh-pet 升级被覆盖，升级后需要重新 apply。
