/* 缅因猫桌宠 · 渲染进程
 * 一个极简状态机：idle 循环（每段播完掷骰）、随机动作、点击回应、移动、睡觉三段。
 * 素材名不带扩展名，视频文件是 assets/queen-animation/<名字>.webm。
 */
(() => {
  const P = window.petHost;
  const stage = document.getElementById('stage');
  const bubble = document.getElementById('bubble');
  const vids = [document.getElementById('va'), document.getElementById('vb')];

  const S = {
    cfg: null,
    anims: null,
    weights: { idle: 50, turn: 0, move: 0 },
    texts: null,
    front: 0, // 当前可见的 video 下标
    anim: '',
    once: true,
    facing: 'right',
    sleeping: false,
    busy: false,
    force: false,
    sleepingPhase: null, // 'start' | 'loop' | 'end'
    wakeAt: 0,
    wakeTimer: null,
    sleepCoolUntil: 0,
    moving: null,
    lastAction: '',
    ignoreMouse: false,
  };

  const R = (arr) => (Array.isArray(arr) && arr.length ? arr : null);
  const pick = (arr, not) => {
    const list = arr || [];
    const pool = list.length > 1 && not ? list.filter((x) => x !== not) : list;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  };
  const asset = (name) => `../assets/queen-animation/${encodeURIComponent(name)}.webm`;

  // ---------- 气泡 ----------
  let bubbleTimer = null;
  function say(text, ms = 3200) {
    if (!text) return;
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.hidden = true;
    }, ms);
  }

  // ---------- 换源 ----------
  function switchTo(name, once = true) {
    if (!name) return;
    const same = S.anim === name && S.once === once;
    S.anim = name;
    S.once = once;
    if (same) {
      // 同动画重复触发：直接从头播，不重新解码
      const el = vids[S.front];
      if (el) {
        el.currentTime = 0;
        el.loop = !once;
        el.play().catch(() => {});
      }
      return;
    }
    const next = vids[1 - S.front];
    const prev = vids[S.front];
    next.classList.remove('is-front');
    next.loop = !once;
    next.src = asset(name);
    const show = () => {
      next.removeEventListener('canplay', show);
      next.classList.add('is-front');
      prev.classList.remove('is-front');
      S.front = 1 - S.front;
      next.play().catch(() => {});
    };
    next.addEventListener('canplay', show);
    // 兜底：文件缺失时不要让状态机卡死
    next.addEventListener('error', () => {
      next.removeEventListener('canplay', show);
      console.warn('[mianyin] 素材加载失败:', name);
      if (once) setTimeout(() => playIdle(), 200);
    });
    next.load();
  }

  // ---------- 播完 ----------
  function onEnded() {
    S.busy = false;
    S.force = false;
    if (S.sleeping) {
      if (S.sleepingPhase === 'start') {
        S.sleepingPhase = 'loop';
        switchTo(pick(S.anims.sleep[0].loop) || S.anims.idle[0], false);
        scheduleWake();
        return;
      }
      if (S.sleepingPhase === 'end') {
        S.sleeping = false;
        S.sleepingPhase = null;
        S.wakeAt = Date.now() + 120000;
        playIdle();
        return;
      }
      return;
    }
    const ev = S.anims.events || {};
    const isEvent = ['balance', 'whisper'].some((k) => (ev[k] || []).includes(S.anim));
    if (isEvent) {
      playIdle();
      return;
    }
    if ((S.anims.clicks || []).includes(S.anim)) {
      playIdle();
      return;
    }
    if ((S.anims.idle || []).includes(S.anim)) {
      roll();
      return;
    }
    // 其它（小动作/生气/移动）：播完回待机，不连播
    playIdle();
  }

  // ---------- 掷骰 ----------
  function rollKind() {
    const w = S.weights || {};
    const fixed = S.cfg.pet.fixedEnabled !== false;
    const turn = fixed ? 0 : w.turn || 0;
    const move = fixed ? 0 : w.move || 0;
    const r = Math.random();
    if (r < (w.idle || 0) / 100) return 'idle';
    if (r < ((w.idle || 0) + turn) / 100) return 'turn';
    if (r < ((w.idle || 0) + turn + move) / 100) return 'move';
    return 'action';
  }

  function pickCategoryAction() {
    const cats = (S.anims.categories || []).filter((c) => (c.actions || []).length && (c.weight || 0) > 0);
    if (!cats.length) return null;
    const total = cats.reduce((s, c) => s + (c.weight || 0), 0);
    let r = Math.random() * total;
    for (const c of cats) {
      r -= c.weight || 0;
      if (r <= 0) return pick(c.actions, S.lastAction);
    }
    return pick(cats[cats.length - 1].actions, S.lastAction);
  }

  function roll() {
    if (S.sleeping) return;
    const sleepCfg = R(S.anims.sleep);
    const canSleep = sleepCfg && Date.now() > (S.sleepCoolUntil || 0);
    if (canSleep && Math.random() < 0.12) {
      S.sleepCoolUntil = Date.now() + 120000;
      sleep();
      return;
    }
    const kind = rollKind();
    if (kind === 'idle') {
      playIdle(true);
      return;
    }
    if (kind === 'action') {
      const act = pickCategoryAction();
      if (act) {
        playOnce(act);
        return;
      }
    }
    playIdle(true);
  }

  // ---------- 播放 ----------
  function playIdle(force) {
    if (S.sleeping) return;
    if (S.busy && !force) return;
    const idle = R(S.anims.idle);
    if (!idle) return;
    const name = pick(idle, S.anim);
    S.busy = false;
    switchTo(name, true);
  }

  function playOnce(name, opts = {}) {
    if (!name) return;
    const isWake = /^起床/.test(name);
    if (S.sleeping && !isWake) {
      say(pick(S.texts.sleepRefuse) || '小猫睡觉中', 3500);
      return;
    }
    if (S.busy && !opts.force && !isWake && name !== S.anim) return;
    const sleepNames = S.anims.sleep ? S.anims.sleep.flatMap((s) => [...(s.start || []), ...(s.loop || []), ...(s.end || [])]) : [];
    S.busy = !sleepNames.includes(name) && !(S.anims.idle || []).includes(name);
    S.lastAction = name;
    switchTo(name, true);
  }

  // ---------- 睡觉 ----------
  function sleep() {
    const cfg = R(S.anims.sleep);
    if (!cfg || S.sleeping) return;
    const seg = cfg[0];
    const start = pick(seg.start);
    if (!start) return;
    S.sleeping = true;
    S.sleepingPhase = 'start';
    S.busy = false;
    say(pick(S.texts.sleepStart), 4000);
    switchTo(start, true);
  }

  function wake() {
    if (!S.sleeping) return;
    clearTimeout(S.wakeTimer);
    const seg = R(S.anims.sleep)[0];
    const end = pick(seg.end);
    S.sleepingPhase = 'end';
    S.busy = false;
    say(pick(S.texts.sleepEnd), 3000);
    if (end) switchTo(end, true);
    else {
      S.sleeping = false;
      playIdle(true);
    }
  }

  function scheduleWake() {
    clearTimeout(S.wakeTimer);
    const ms = 120000 + Math.random() * 120000;
    S.wakeAt = Date.now() + ms;
    S.wakeTimer = setTimeout(() => {
      if (S.sleeping && S.sleepingPhase === 'loop') wake();
    }, ms);
  }

  // ---------- 移动 ----------
  function moveParams(name) {
    const acts = (S.anims.moves && S.anims.moves.actions) || [];
    const hit = acts.find((a) => a.name === name);
    const d = (S.anims.moves && S.anims.moves.default) || {};
    return { dir: hit && hit.params && typeof hit.params.dir === 'number' ? hit.params.dir : null, minDist: d.minDist || 120, maxDist: d.maxDist || 480 };
  }

  async function tryMove(name) {
    // 睡觉中不走动：只提示，别让猫在床上滑行
    if (S.sleeping) {
      say(pick(S.texts.sleepRefuse) || '小猫睡觉中', 3500);
      return false;
    }
    const { dir: fixedDir, minDist, maxDist } = moveParams(name);
    const dir = fixedDir != null ? fixedDir : S.facing === 'right' ? 1 : -1;
    const bounds = await P.getBounds();
    const area = await P.getWorkArea();
    if (!bounds || !area) return false;
    // 可走距离：留出窗口自身的余量，别把猫头撞出屏幕
    const slackL = bounds.x - area.x;
    const slackR = area.x + area.width - (bounds.x + bounds.width);
    const room = dir > 0 ? slackR : slackL;
    const dist = Math.min(maxDist, room);
    if (room <= 8 || dist < minDist * 0.35) {
      // 走不动：方向不对着屏幕外也别干等着，翻个身原地走两步 + 提示
      S.facing = dir > 0 ? 'right' : 'left';
      applyFlip();
      playOnce(name, { force: true });
      say('这边是屏幕边缘，走不过去了…', 2200);
      return false;
    }
    stopMove();
    S.facing = dir > 0 ? 'right' : 'left';
    applyFlip();
    playOnce(name, { force: true });
    const dur = 9000;
    const start = { x: bounds.x, y: bounds.y };
    const speed = dist / (dur / 1000);
    let last = performance.now();
    let moved = 0;
    S.moving = { cancelled: false };
    const token = S.moving;
    const step = (now) => {
      if (!S.moving || S.moving !== token || S.moving.cancelled) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      moved += speed * dt;
      if (moved >= dist) {
        P.setPosition(start.x + dir * dist, start.y);
        S.moving = null;
        return;
      }
      P.setPosition(start.x + dir * moved, start.y);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  }

  function stopMove() {
    if (S.moving) S.moving.cancelled = true;
    S.moving = null;
  }

  function applyFlip() {
    // 素材自带「向右走」「向左走」两段，本身就是各自朝向；
    // 再按 facing 镜像会把向左走翻成向右走的画面，所以这里不翻转。
    for (const v of vids) v.classList.remove('flip');
  }

  // ---------- 鼠标：拖拽 / 单击 / 右键 ----------
  let drag = null;
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.screenX, y: e.screenY, moved: 0, dragging: false };
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (drag) {
      const dx = e.screenX - drag.x;
      const dy = e.screenY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4) drag.dragging = true;
      if (drag.dragging) {
        stage.classList.add('dragging');
        stopMove();
        P.moveWindow(dx, dy);
        drag.x = e.screenX;
        drag.y = e.screenY;
      }
      return;
    }
    hitTest(e);
  });

  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const wasDrag = drag.dragging;
    drag = null;
    stage.classList.remove('dragging');
    if (!wasDrag && e.button === 0) onPetClick();
  });

  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    P.contextMenu();
  });

  /** 透明区域穿透：只有舞台矩形内接收鼠标 */
  function hitTest(e) {
    const r = stage.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const ignore = !inside;
    if (ignore !== S.ignoreMouse) {
      S.ignoreMouse = ignore;
      P.setIgnore(ignore);
    }
  }

  function onPetClick() {
    if (S.sleeping) {
      say(pick(S.texts.sleepRefuse) || '小猫睡觉中', 3500);
      return;
    }
    const clicks = R(S.anims.clicks);
    if (!clicks) return;
    playOnce(pick(clicks), { force: true });
  }

  // ---------- 菜单 ----------
  P.onMenuAction(({ action, name }) => {
    if (action === 'anim') {
      if (name && /^起床/.test(name)) {
        wake();
        return;
      }
      const isMove = ((S.anims.moves && S.anims.moves.actions) || []).some((a) => a.name === name);
      if (isMove) {
        tryMove(name);
        return;
      }
      playOnce(name, { force: true });
      return;
    }
    if (action === 'sleep') return sleep();
    if (action === 'wake') return wake();
    if (action === 'home') return P.home();
    if (action === 'quit') return P.quit();
    if (action === 'toggle-top') {
      S.top = S.top === false;
      P.toggleTop(S.top !== false);
    }
  });

  // ---------- 启动 ----------
  (async function boot() {
    const boot = await P.boot();
    S.cfg = boot;
    S.anims = boot.animations;
    S.weights = boot.weights;
    S.texts = boot.texts;

    const { stageW, stageH } = boot.geo;
    stage.style.width = `${stageW}px`;
    stage.style.height = `${stageH}px`;
    bubble.style.bottom = `${stageH + 60}px`;

    for (const v of vids) {
      v.addEventListener('ended', () => {
        if (v !== vids[S.front]) return;
        onEnded();
      });
      v.muted = true;
      v.playsInline = true;
    }

    P.setIgnore(false);
    applyFlip();
    // 调试/自动化用的小把手（本地应用，不影响使用）
    window.__pet = { S, playOnce, playIdle, sleep, wake, tryMove, roll, switchTo };
    // 开场：先待机，播完自然会开始掷骰
    const idle = R(S.anims.idle);
    if (idle) switchTo(pick(idle), true);
  })();
})();
