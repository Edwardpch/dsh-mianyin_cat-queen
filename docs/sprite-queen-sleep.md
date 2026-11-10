# [queen-sleep] 作息状态机（手工合并说明）

目标文件：`runtime/electron-helper/sprite.js`（桌面层）；网页层如需同样行为，改 `lib/client.js` 对应位置。

## 1. 构造函数

锚点：`this.frozen = false;` 之前

```js
// [queen-sleep] 作息状态机（只有 queen 用）：idle / sleep 两个基础状态。
this.qState = 'idle';   // 'idle' | 'sleep'
this.qBusy = false;     // 当前动作是否必须播完
this.qWakeAt = 0;       // 早于这个时间点不自动入睡
this.qWakeTimer = null;
```

## 2. `playOnce(name, playbackId, url)` 开头

```js
// [queen-sleep] 作息门禁 + 「动作必须播完」
if (this.pet.id === 'queen') {
  const isWake = name === '起床1' || name === '起床2';
  if (this.qState === 'sleep' && !isWake) {
    if (name !== this.anim) this.qSleepHint();
    return;
  }
  if (this.qBusy && !isWake && name !== '去睡觉' && name !== this.anim) return;
  this.qBusy = !this.animations.idle.includes(name);
}
```

## 3. `handleEnded()` 里，`const { animations } = { animations: this.animations };` 之后

```js
if (this.pet.id === 'queen') {
  this.qBusy = false;
  if (this.anim === '去睡觉') { this.qState = 'sleep'; this.switchTo('睡觉', false); this.qScheduleWake(); return; }
  if (this.anim === '起床1' || this.anim === '起床2') {
    this.qState = 'idle'; this.qWakeAt = Date.now() + 120000;
    if (animations.idle.length) this.playOnce(S.pick(animations.idle, this.anim));
    return;
  }
  if (this.qState === 'sleep') { this.switchTo('睡觉', false); return; }
}
```

## 4. `playIdle()`

```js
if (this.pet.id === 'queen') {
  if (this.qState === 'sleep') { this.switchTo('睡觉', false); return; }
  // 自动入睡：待机播完后 12% 概率，且已过冷却
  const dyn = (this.animations.categories ?? []).find((c) => (c.actions ?? []).includes('去睡觉'));
  if (dyn && Date.now() > this.qWakeAt && Math.random() < 0.12) { this.playOnce('去睡觉'); return; }
}
```

## 5. `onClick(e)`

```js
// [queen-sleep] 睡觉时点猫：弹提示，不播点击动作
if (this.pet.id === 'queen' && this.qState === 'sleep') { this.qSleepHint(); return; }
```

## 6. 追加两个方法

```js
qSleepHint() {
  // 复用 whisper 气泡：小猫睡觉中，请通过『起床』唤醒
  ...
}
qScheduleWake() {
  // 2~4 分钟后随机播 起床1 / 起床2
  ...
}
```

## 关键前提

`animations.events.balance` / `events.whisper` **不能包含 idle 的名字**。
`sprite.js` 的 `handleEnded()` 把 events 里的动画当「事件动画」，播完直接 `playOnce(idle)` 并 `return`，
不再进 `playIdle()` 的随机链 —— 把 idle 放进 events 会让宠物「几乎永远待机」。
本包使用独立的 `说话`（内容与待机相同的副本）承担这个角色。
