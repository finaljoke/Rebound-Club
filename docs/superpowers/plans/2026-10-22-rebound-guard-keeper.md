# 反弹守卫 AI 守门员 + 核心手感 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「对齐 + 连按」的单人回弹改成与 AI 守门员的一球攻守对决，并补足击球手感。

**Architecture:** 规则全部在 `dist/core.mjs`（纯函数式状态 + 120Hz 定步长模拟，确定性、无随机数）；`dist/scene3d.mjs` 只读状态渲染；`dist/game.js` 处理界面、输入、音效、顿帧/震屏的表现层。

**Tech Stack:** 原生 ES modules、Three.js 0.180.0（本地 vendor）、WebAudio、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-22-rebound-guard-keeper-design.md`

## Global Constraints

- 纯静态、无构建、无外部 CDN；`core.mjs` 不得引用 DOM 或 Three.js。
- 存档键 `rebound-club-v2`。
- 界面文案中文；代码风格沿用现有紧凑写法。
- reduced-motion 下关闭顿帧和震屏。
- `npm test`、`node --check dist/game.js` 必须通过。

## Review Focus

1. 暂停 / 切后台发生在 `goal` 阶段或顿帧中：恢复后应继续倒数，不丢球、不重复计分。→ Task 2 测试 `进球倒数期间暂停可恢复`。
2. 球恰好打在门柱边（|x| ≈ goalHalf）或守门员身体边缘：只能有一种结果（扑救 / 进球 / 墙反弹），不能穿过远端。→ Task 2 测试 `远端任何位置都不会穿出场地`。
3. 回合球速达到上限后继续击球：不再增长；漏球/进球后重置为 1。→ Task 1 测试。
4. 在 `won`/`lost` 后继续调用 `stepGame`/`attack`：状态不变。→ Task 2 测试。
5. 切换关卡后远端门宽和守门员位置立即更新，不残留上一关。→ Task 4 测试 `门宽随关卡更新`。

---

### Task 1: 击球判定、方向、软球、挥空惩罚、回合加速、顿帧、计分

**Files:**
- Modify: `dist/core.mjs`
- Test: `tests/core.test.mjs`（重写击球相关用例）

**Interfaces:**
- Produces:
  - `WEAPONS[id] = {name,subtitle,width,reach,windup,active,recovery,whiff}`
  - 常量导出：`PLAYER_Z=1.6, MAX_AIM, PERFECT_BAND, RALLY_STEP=1.05, RALLY_CAP=1.6, POWER=1.35, SOFT=.8`
  - 状态新增：`rally`(1 起)、`power`(bool，最近一程是否重炮)、`shots`、`hitstop`(秒)、`lastShot`(`'soft'|'left'|'straight'|'right'|'perfect'`)、`ball.z0/ball.z1`（本程起止纵深，供弧线）
  - `swing = {time, hit, armed}`：`armed` 为窗口打开那一刻球是否已在击球区
  - 事件：`swing, hit, perfect, soft, whiff`
  - `ballHeight(s) -> number`：视觉高度，0.73 + 弧线
- 规则：
  - 甜点 `sweet = player.z + reach*.5`；`t = clamp((b.z - sweet)/(reach*.5), -1, 1)`。
  - 窗口打开那一 tick 记录 `armed = inHitRange(s)`。
  - 正常击球（armed）：`angle = -t*MAX_AIM`（早 → 左）；`|t|<=PERFECT_BAND` → 完美，出球速度 ×POWER，`hitstop=.07`。
  - 软球（未 armed、窗口中途撞上）：`angle=0`，速度 ×SOFT，不判完美。
  - 每次击中 `rally=min(RALLY_CAP, rally*RALLY_STEP)`，出球速度 = `level.speed*rally*(POWER|SOFT|1)`。
  - 窗口结束未击中：`swing` 寿命加 `whiff`，发 `whiff` 事件。
  - 计分：击中 100，完美 +50。

- [ ] **Step 1:** 写失败测试：`早挥往左晚挥往右正中直线`（同一来球，分别在 t≈+.8 / -.8 / 0 时调用 attack，断言 `vx<0 / vx>0 / |vx|<.05`）；`完美只看球与甜点距离`；`提前挥拍是软球`（ball 在区外时 attack，球撞入后 `lastShot==='soft'`、`vx===0`、速度 = level.speed*SOFT*rally）；`回合加速有上限`（连续 20 次击中后 `rally===1.6`）；`连按至少漏掉三成`（三件装备 × 40 个不同到达相位，每 tick 调用 attack，命中率 ≤ .7，且软球占命中的 > 50%）；`顿帧期间模拟冻结`。
- [ ] **Step 2:** `npm test` 确认这些用例失败。
- [ ] **Step 3:** 实现上述规则，调 `WEAPONS` 参数直到连按测试通过（起始：glove `.9/1.0/.03/.12/.14/.5`，racket `1.2/1.1/.05/.13/.2/.5`，sword `.95/1.6/.06/.14/.28/.55`）。
- [ ] **Step 4:** `npm test` 通过。

### Task 2: AI 守门员、远端球门、进球阶段、胜负

**Files:**
- Modify: `dist/core.mjs`
- Test: `tests/core.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `rally/power/shots/hitstop`。
- Produces:
  - `LEVELS[i] = {name,tag,goals,speed,goalHalf,keeper:{delay,speed,error},color}`（数值见 spec 3.6，起始 goals `3,3,4,4,5,5`，speed `4.3,4.6,4.9,5.2,5.5,5.8`）
  - 常量：`KEEPER_Z=9.3, FAR_WALL=9.8, SIDE=3.82, KEEPER_REACH=.55`
  - 状态：`keeper={x,delay,dive,diveDir}`、`goals`
  - `ACTIVE_PHASES=['playing','serving','miss','goal']`；新阶段 `goal`（countdown 1.2 后重新发球）
  - 事件：`save, goal`（另保留 `wall, serve, miss, win, lose`）
- 规则：
  - 玩家击球时 `keeper.delay = level.keeper.delay`，误差 `err = level.keeper.error*Math.sin(shots*2.3+levelIndex)`。
  - 球朝远端：delay 归零后，朝 `clamp(直线预判x + err, ±goalHalf)` 以 `keeper.speed` 移动；不预判侧墙。
  - 其他时候以 `keeper.speed*.35` 回中。
  - 球 `z>=KEEPER_Z` 且 `|x|<=goalHalf`：`|x-keeper.x|<=KEEPER_REACH` → 扑救（反向，角度 `clamp((x-keeper.x)/KEEPER_REACH*.35)`，速度 `level.speed*rally`，`keeper.dive=.35`）；否则进球（`goals++`，得分 1000，`power` 时 +500，`hitstop=.12`，`rally=1`，进 `goal` 阶段或 `won`）。
  - 球在门口外则到 `FAR_WALL` 反弹，并加确定性扰动 `sin(elapsed*.65+levelIndex*.8)*.15`。
  - 漏球：`misses++`、`rally=1`、`combo=0`；3 次 `lost`。

- [ ] **Step 1:** 写失败测试：`第1关正中普通直线被扑住`；`第1关边路直线重炮进门`（player.x=1.9，完美击球）；`门口外撞墙反弹守门员不参与`；`守门员确定性`（同输入两局 JSON 相同）；`进N球通关并计分`；`丢3球失败`；`进球倒数期间暂停可恢复`；`远端任何位置都不会穿出场地`（扫 x∈[-3.8,3.8] 发向远端，断言 2 秒内 vz 变负或 goals 增加，且 z<=FAR_WALL）；`结束后状态冻结`。删除旧的回弹板、目标回击数用例；更新 `六关各装备均能通关` 为「会走位+掐时机的脚本 AI 能通关」。
- [ ] **Step 2:** `npm test` 确认失败。
- [ ] **Step 3:** 实现；调 `LEVELS.keeper` 参数使上两个验收测试和通关测试同时成立。
- [ ] **Step 4:** `npm test` 通过。

### Task 3: 存档 v2

**Files:** Modify `dist/storage.mjs`；Test `tests/storage.test.mjs`
- [ ] **Step 1:** 测试 `旧版存档被忽略`：`getItem` 只对 `rebound-club-v1` 返回数据时，`unlocked===0`。
- [ ] **Step 2:** 改 `KEY='rebound-club-v2'`，`npm test` 通过。

### Task 4: 3D 场景：守门员、远端球门、弧线、镜头、震屏

**Files:** Modify `dist/scene3d.mjs`；Test `tests/scene3d.test.mjs`

**Interfaces:**
- Consumes: `LEVELS[i].goalHalf`、`s.keeper`、`ballHeight(s)`、`KEEPER_Z`。
- Produces: `buildWorld()` 返回值新增 `keeper`（Group）、`farGoal`（Group）；删除 `paddles`、`board`；`render(state, axis, reduceMotion, shake=0)`。
- 人物构建抽成 `person(jersey, accent)`，玩家与守门员共用；守门员朝向玩家，`dive>0` 时侧倾扑救。
- 远端墙按 `goalHalf` 分为左右两段，门柱 + 网与近端结构一致；关卡切换时更新。
- 球高度用 `ballHeight(s)`，地面影子/落点圈仍在地面。
- 镜头压低，保证两门可见；保留自适应 `resize`。

- [ ] **Step 1:** 改写测试：`守门员与远端门存在且有体积`；`守门员位置与状态一致`（keeper.x=1.2 → `w.keeper.position.x===1.2`，`z===-KEEPER_Z`）；`门宽随关卡更新`；`球高度来自 ballHeight`；保留镜头边界测试（边界点加入远端门顶）。
- [ ] **Step 2:** 实现，`npm test` 通过。

### Task 5: 界面、事件反馈、音效、2D 兼容

**Files:** Modify `dist/game.js`、`dist/index.html`、`dist/styles.css`（仅小改）

- HUD：`进球 0 / N` 替换「回击进度」；显示回合速度倍率（`×1.15`）。
- 事件 → 弹字：`perfect` 「重炮！」、`soft` 「软球」、`whiff` 「挥空」、`save` 「被扑住」、`goal` 「进球！」、`miss` 「丢球」；`hit` 显示方向「偏左 / 直线 / 偏右」。
- 顿帧：使用 core 的 `hitstop`；reduced-motion 下每帧把 `game.hitstop=0`。
- 震屏：`perfect .12`、`goal .2`、`miss .15`，指数衰减，传给 `render`；2D 下用 canvas translate。
- `sound(kind)` 重写为「低频正弦冲击 + 短噪声」叠加，区分 hit/perfect/soft/whiff/save/goal/miss/wall/win。
- 所有 `['playing','serving','miss']` 改用 `ACTIVE_PHASES`。
- 浮层与帮助文案：进 N 球通关、早打往左晚打往右、站边路打重炮、提前挥是软球。
- 2D 画面：远端墙分段 + 门口 + 守门员矩形人物；去掉回弹板。

- [ ] **Step 1:** 实现；`node --check dist/game.js`、`npm test` 通过。
- [ ] **Step 2:** 浏览器打开 `http://localhost:4173`，桌面与 390px 宽各打一局：确认守门员会移动和扑救、能进球、软球/挥空/重炮弹字出现、控制台无错误，截图存 `artifacts/`。

### Task 6: 手感调参与验收

- [ ] **Step 1:** 用脚本 AI 在 core 层跑统计：每关「只打正中普通球」进球率、「边路重炮」进球率、「无脑连按」存活回合数，对照 spec 3.6 验收标准调参。
- [ ] **Step 2:** `npm test` 全部通过，浏览器复测一局。
