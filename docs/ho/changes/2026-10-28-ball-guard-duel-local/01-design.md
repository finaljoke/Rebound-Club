# 对战版 P0：两名玩家互攻互守（本机验证 + 同步层原型）

## Background and goal

用户希望在「反弹守卫」里加入玩家对战，并能通过网络和朋友连线。用户 2026-10-28 的原话：「我指的是 有来有回 的 只是把目前的守门的换成 玩家1 一样 可以进攻那种 这样两个都是可以进攻的了」。

所以对战版的玩法是：保留现在的守门弹球，把远端的 AI 门将换成「玩家 2」。玩家 2 和主角一样戴拳套、能挥击、能用技能。两人各守一个门，球打过来就挥拳打回去，谁漏球谁丢分。

整件事分三期：

- **P0（本变更）**：规则对称化，在本机验证好不好玩。对手可以是对称的 AI，也可以是同一台电脑上的第二套键盘。同时做好联机用的同步层，用「本机回环 + 模拟延迟」来验证。
- P1：房间码联机。用 Cloudflare Worker + Durable Objects 开房和牵线，对打数据优先走 WebRTC 直连，连不上就由 Durable Object 转发。
- P2：断线重连、延迟显示、分享房间链接等。

P0 的目标是回答两个问题，P1 再开工：

1. 两个人互相打，回合会不会太长或太短，好不好玩？
2. 在 80～250 毫秒的模拟延迟下，「球在谁那半场谁判定」的同步方式，手感能不能接受？

P0 完成后，P1 只需要把「本机回环」换成真实的网络传输，规则和同步逻辑都不用重写。

## Confirmed decisions

来源：用户 2026-10-28 的对话。

1. 玩法：保留守门弹球，远端 AI 门将换成和主角一样能进攻的玩家 2，两边对称（原话见上）。不用 `feat/rally-prototype` 的网球规则。
2. 联机先只做「朋友房间码」，不做随机匹配（属于 P1，本变更不实现）。
3. 用户的网站托管在 Cloudflare Pages。P1 的牵线与兜底转发用 Cloudflare Worker + Durable Objects，不另租服务器（本变更不实现，只按这个方向设计接口）。
4. 分期按 P0 / P1 / P2 走，先做 P0：规则对称化 + 本机测试（对称 AI 或第二套键盘）+ 模拟网络延迟开关。用户回复「确定」，同意开始写 P0 设计。
5. 两边都有拳套、重炮、左右变向、旋转和爆发技能（我在上一轮说明里列出，用户随后回复「确定」）。
6. 沿用项目规矩：不部署、不发布；合并 main 要用户明确同意；不放宽或删除测试来掩盖问题，改旧断言要说明理由；面向用户的文字一律用简体中文；动手前看 `git status`，不覆盖别人未提交的改动；单机守门版的玩法不变。

## Open questions

none。

设计者自己做的取舍在「Proposed design and trade-offs」里都标了 **【设计者决定】**，请在批准时一起过目。最值得看的有三条：

- D2：两端都用门框宽度判进球，打偏会弹回来；
- D7：对战页面先不放进大厅，也不进发布包；
- D9：同步方式选「球权方说了算」。

## Non-goals

- 不做真实联网：没有房间码、Worker、Durable Object、WebRTC，这些都是 P1。
- 不改单机守门版的任何规则和数值：`dist/core.mjs` 一个字都不改，关卡、门将 AI、教学、存档也不动。
- 不做对战的 2D 兼容画面：不支持 WebGL2 时，对战页只显示提示和返回链接。
- 不做对战战绩存档、排行榜、账号、表情互动、分享战绩图。
- 不做新的美术资源。玩家 2 继续用现有的 KayKit Barbarian 占位模型，只是多打包两个出拳动作。
- 对战里没有关键球慢动作和进球特写机位（理由见 D8），也没有门将飞扑。
- 不合并 `feat/rally-prototype`，也不合并 `spike/cartoon-arena`。

## Current state with evidence

项目路径：`C:\Users\HUFAN\.codex\visualizations\2026\10\14\01a1384a-37ae-7441-83d7-0fcd547b7a67\sites\ball-guard`。以下事实基于 main `a36dbed`，2026-10-28 读取时工作区干净，`npm test` 163/163 通过。

**规则层是单边结构（`dist/core.mjs`，402 行）**

- 坐标：近端是主角，`PLAYER_Z=1.6`；球过 `z<=0` 就算丢球，不看横向位置（`core.mjs:382`）。远端门将线在 `KEEPER_Z=9.3`，球门线 `GOAL_Z=9.7`，端墙 `FAR_WALL=9.8`；侧墙 `SIDE=3.82`（`core.mjs:30`）。
- 远端只有门将：`moveKeeper`（`core.mjs:274-299`）会读招、看规律。`farEnd`（`core.mjs:310-341`）在球过门将线时判扑救；扑住就按固定公式把球打回来。进球要求球在门框 `goalHalf` 以内，门框外的球撞端墙弹回（`'wide'`）。
- 只有主角能挥击：`attack`（`core.mjs:93`），`strike`（`core.mjs:140-160`）。击球时机决定是不是重炮（`PERFECT_BAND`）；击球那一刻按住的方向决定出球方向（`aimAngle`，`core.mjs:46`）；回合越长球越快（`RALLY_STEP=1.05`，上限 `RALLY_CAP=1.6`）。
- 技能 `useSkill`（`core.mjs:206`）只作用于主角。旋转默认往远离门将的一侧拐（`spinShot` 读 `s.keeper.x`，`core.mjs:171`）；爆发冻结整局 1.1 秒（`tick` 中的 `phase==='skill'`）。
- 规则里没有 `Math.random`、`Date.now`，固定 1/120 秒一步（`stepGame`，`core.mjs:391`）。门将的「失误量」来自 `Math.sin(s.shots*2.3+...)`，同样的输入得到同样的结果。
- 已导出、可直接复用的纯函数和常量：`advanceBall`、`foldX`、`aimAngle`、`ballHeight`、`hitZone`、`WEAPONS`、`PACE`、`RUN`、`PLAYER_Z`、`MAX_AIM`、`PERFECT_BAND`、`RALLY_STEP`、`RALLY_CAP`、`POWER`、`SOFT`、`AIM_SHARE`、`SPIN_SHARE`、`SIDE`、`GOAL_Z`、`SKILLS`、`LEVELS`。未导出的有：`strike`、`whiffReason`、`spinShot`、`launchBurst`、`tick`、`serve`。

**画面层（`dist/scene3d.mjs`，740 行）**

- `buildWorld(assets)`（`scene3d.mjs:12`）里，主角是 `striker`（Rogue 模型），远端是 `goalie`（Barbarian 模型），见 `scene3d.mjs:180-183`。门将朝向翻转 180°，站在 `-KEEPER_Z`。
- 主角出拳按 `s.swing.time` 采样（`scene3d.mjs:505-507`，`PUNCH` 由 `striker.measureReach` 实测，`scene3d.mjs:187`）。门将姿态由飞扑时间线 `trackDive`、`poseKeeper`、`poseGoalie`、`keeperReach` 驱动（`scene3d.mjs:347-420`、`518-528`）。
- `world.update(s,axis,reduceMotion,time)`（`scene3d.mjs:474`）读取单机状态里的这些字段：`phase`、`ball`、`player`、`keeper.x/target/dive/diveDir`、`swing`、`skill`、`shot`、`lastShot`、`lastGoal`、`power`、`flash`、`hitstop`、`elapsed`、`pose`、`level.goalHalf/color`、`energy`。提示部分还会调用 `hitZone`、`swingPreview`、`skillStatus`、`spinPreview`、`predictFlight`、`goalLock`。
- 进球落点圈的颜色（`scene3d.mjs:562`）：门框外是灰色；在门将 `KEEPER_REACH` 范围内是红色；否则是绿色。门将扑救范围条 `reachBar` 画在门将脚下（`scene3d.mjs:601`）。
- 近端球门（`scene3d.mjs:95-100`）的门柱在 `x=±4`，比侧墙还宽，表示「整条近端线都是球门」；远端球门在 `-FAR_WALL`，门框宽度跟随 `goalHalf`。

**角色**

- `dist/characters.mjs`：`striker` 的动作有 `punchLeft/punchRight`；`keeper` 只有 `idle`、`strafeLeft/Right`、`diveLeft/Right`、`cheer`、`hurt`，没有出拳。
- 已用脚本确认原始文件 `vendor-download/kaykit/Barbarian.glb` 里有 `Unarmed_Melee_Attack_Punch_A` 和 `Unarmed_Melee_Attack_Punch_B`（与 Rogue 同名）。`scripts/pack-characters.mjs` 只打包 `characters.mjs` 里列出的动作。目前 `keeper.glb` 是 515140 字节，上一个变更定的上限是每个 ≤800 KB。

**入口与界面（`dist/game.js`，409 行）**

- 单一全局状态 `game=createGame(...)`（`game.js:20`）。主循环 `frame`（`game.js:359`）调用 `stepGame`，然后逐个处理事件，负责提示、音效和震屏。
- 音效（`bus`、`tone`、`noise`、`sound`、`buzz`，`game.js:29-93`）写在 `game.js` 里，没有导出。
- `dist/input.mjs` 的 `createInput()` 把 ←/→ 和 A/D 合并成同一个 `axis`，所以分不出两个玩家。
- 慢动作：`frame` 用 `goalLock` 判断要不要放慢模拟时间（`game.js:362-363`）。

**测试与脚本惯例**

- `npm test` = `node --test tests/*.test.mjs`。场景测试通过 `tests/helpers/characters.mjs` 加载去掉贴图的模型，再 `buildWorld(assets)`。
- 模拟玩家只能通过真实输入行动，也就是移动轴加挥击；用带种子的随机数模拟按键误差（`tests/strategy.test.mjs:7`、`scripts/keeper-balance.mjs`）。
- 浏览器 QA 脚本用本机 Playwright（`C:/Users/HUFAN/.cache/codex-runtimes/.../qa.cjs`）和 Chrome，需要 4173 端口的本地服务（例如 `scripts/arena-qa.mjs:6-11`）。
- `scripts/build-release.mjs` 会把 `dist/` 下的所有文件复制进发布包（`build-release.mjs:20-23`），目前没有排除任何文件。

## Proposed design and trade-offs

### 总体结构

```
duel-core.mjs   对称规则：两名球员、一颗球、比分。纯函数，不碰 DOM
duel-bot.mjs    对称 AI：只通过「移动轴 + 挥击 + 技能」行动
duel-net.mjs    同步层：消息格式、球权判定、回环传输（可设延迟和抖动）
duel-view.mjs   视角转换：把对战状态翻成「我在近端」的单机形状，交给 scene3d
duel.html / duel.js / duel.css   对战页面：选对手、计分、结算
sfx.mjs         从 game.js 原样搬出的音效与震动（两个页面共用）
```

单机版的 `core.mjs` 和规则完全不动，对战规则另写在 `duel-core.mjs` 里。

【否决】把 `core.mjs` 改成两边通用。单机版有 163 条测试、平衡脚本和六关数值都绑在它上面，改坏的风险远大于重复几十行击球代码的成本。两边击球结果是否一致，由「击球一致性」测试（AC5）兜住。

### D1. 坐标与「本地视角」

- 对战球场沿用单机尺寸。A（房主/近端）站在 `z=PLAYER_Z=1.6`，B 站在 `z=COURT-PLAYER_Z`，其中 `COURT=GOAL_Z=9.7`。A 的球门线在 `z=0`，B 的在 `z=COURT`。
- 对战状态统一存在 A 的坐标系里。B 的**本地视角**是镜像：`x→-x`、`z→COURT-z`，速度也同样取反。
- 每个玩家在自己的本地视角下，和单机版主角的处境一样：自己在 `PLAYER_Z`，往 `+z` 打，对方球门在 `GOAL_Z`。所以挥击判定、重炮、瞄准、旋转、爆发都按单机规则在本地视角里计算，再转回 A 的坐标系。
- `duel-core` 导出 `toLocal(state, side)` / `fromLocal(...)` 一组转换函数，测试要验证来回转换不变。

### D2. 进球、打偏与发球 【设计者决定】

- **两端都用门框判进球**：球过某一端的球门线，横向在 `DUEL.goalHalf=2.6` 以内，就是对方得 1 分；在门框外则撞端墙弹回，记为「打偏」，不得分，规则和单机远端的 `'wide'` 相同（含 `boardAngle` 小偏转）。
- 理由：单机近端「整条线都是球门」，是因为主角不用扑救。对战里双方都要防守，两端得一样，而远端门框规则已经现成。代价是近端球门要按门框重画（见 D6）。
- 【否决】两端都是整条线算球门：远端球门、落点圈、打偏规则都要重做，而且「打偏」会消失，侧墙借力的价值也跟着下降。
- **先进 5 球获胜**（`DUEL.goals=5`）。没有生命数，也没有练习球。
- **发球**：开局发向 A；之后每次进球，发向刚丢球的一方，相当于进球方发球。发球的位置、速度按单机 `serve` 的写法，在接球方的本地视角里生成：球从对方身前出发（本地 `z=GOAL_Z-PLAYER_Z-.3` 附近，`x` 取发球方位置并限制在 ±1.5），速度为 `-DUEL.speed`，横移 `±.65*PACE` 交替。
- **球速**：`DUEL.speed=LEVELS[0].speed`（即 4×PACE）。回合加速沿用 `RALLY_STEP`、`RALLY_CAP`，每次进球后重置。重炮 ×`POWER`，软球 ×`SOFT`，和单机一样。
- 所有对战参数集中在 `duel-core.mjs` 的 `DUEL` 对象里。

### D3. 球员与技能

- 每个球员有 `x`、`swing`、`energy`、`held`（按住的方向）。移动速度 `RUN`，限制在 ±3.45，球进框后站定的规则和单机一致。
- 只有球朝自己飞来（本地视角 `vz<0`）时才能击中；挥空、软球、收招的规则和单机 `tick`、`strike`、`whiffReason` 一致。
- 能量：两边各自开局 50，回能规则同 `SKILLS`。旋转「不按方向时往远离对方的一侧拐」，这里的「对方」用对手当前的 `x`（单机是门将 `x`）。
- 爆发：冻结整局 1.1 秒，两边都停；出手时读发动方按住的方向。

### D4. 对称 AI（`duel-bot.mjs`）

- 接口：`createBot({seed, level})` 返回 `decide(localView) → {axis, swing:boolean, skill:null|'spin'|'burst'}`。它只看自己的本地视角，只通过输入行动，不能直接改状态。
- 行为沿用 `tests/strategy.test.mjs` 的写法：预测落点并移过去；击球前用 `swingPreview` 的同类函数挑一个「不在对方击球框正前方」的方向；用带种子的 ±1 帧误差模拟按键。能量满 100 时有一定概率放爆发，≥50 时偶尔放旋转。
- 一个难度档 `level:'normal'`，参数集中在文件顶部。P0 不做难度选择。

### D5. 本机两种对手

对战页 `duel.html` 开局时选：

- **对战 AI**（手机、电脑都能用）：玩家用和单机完全相同的按键和触屏按钮。
- **本机双人**（只在电脑上显示这个选项）：两人共用一个屏幕，画面是 A 的视角。
  - 【设计者决定】按键：A 用 A/D 移动、空格挥击、Q 旋转、E 爆发；B 用 ←/→ 移动、↑ 挥击、`,` 旋转、`.` 爆发。
  - B 的左右按**屏幕方向**：按 ← 往屏幕左边走（换到 B 的本地视角，就是往 B 自己的右边走）。挥击瞄准也一样按屏幕方向。
- 两套按键由 `duel.js` 自己维护，不修改 `input.mjs`（它把 ←/→ 和 A/D 合并成了同一个轴）。

### D6. 画面：把对战状态翻成单机形状

- `duel-view.mjs` 的 `viewFor(state, side)` 返回一个对象，字段和单机状态里 `world.update` 读取的一致（见 Current state）：`player` 是自己，`keeper.x` 是对手位置（`target` 同 `x`，`dive` 恒为 0），`ball` 已镜像到自己视角。另外新增 `opponent: {x, swing, axis}`，以及 `mode:'duel'`。
- `scene3d.mjs` 的改动，只在 `s.mode==='duel'` 时生效，单机分支的输出保持不变：
  - 远端角色改用和主角相同的出拳姿态函数：按 `opponent.swing.time` 采样出拳，按对手实际位移播横移动作，并且不走飞扑时间线。实现上可以把主角的姿态代码抽成一个函数，两个角色共用，但单机画面不能变（由现有场景测试保证）。
  - 远端角色的出拳片段用 Barbarian 的 `Unarmed_Melee_Attack_Punch_A/B`，加进 `characters.mjs` 的 `keeper.clips`，再重跑 `pack-characters.mjs`。出拳时机同样用 `measureReach` 实测。
  - 不显示 `reachBar`。落点圈改用对手击球框判断颜色：落点在对手当前 `x±WEAPONS.glove.width` 以内为红色，门框外为灰色，其余为绿色。
  - 近端球门按 `goalHalf` 重画成和远端相同的门框（门柱在 `±goalHalf`）。
- 提示类函数（`hitZone`、`swingPreview`、`skillStatus`、`spinPreview`、`predictFlight`）由 `duel-core` 提供对战版本，按本地视角返回和单机相同形状的结果；`scene3d` 在对战模式下调用这些版本。具体做法是 `viewFor` 返回的对象带一个 `hints` 字段，里面是这几个函数，`scene3d` 在对战模式下优先使用它。
- `goalLock` 在对战模式下恒为 `null`（D8）。

### D7. 入口与发布 【设计者决定】

- ~~P0 **不在大厅放入口**，只能直接打开 `http://localhost:4173/duel.html`。~~ 已由 Amendments A2 改为：大厅有入口，打包时去掉。
- `scripts/build-release.mjs` 把 `duel.html`、`duel.js`、`duel.css` 和 `duel-*.mjs` 排除在发布包之外。
- 理由：P0 没有联机，只有 AI 和本机双人，不该被当成正式功能发出去。P1 联机可用之后，再加大厅入口、取消排除。
- `sfx.mjs` 会进发布包，因为单机版也用它。

### D8. 对战中没有慢动作和进球特写 【设计者决定】

- 单机的关键球慢动作，是直接放慢模拟时间（`game.js:362-363`）。联机时两台手机如果各自放慢，模拟时间就对不上了。所以对战从一开始就不放慢。进球时只保留「普通进球的轻微推近」、彩带和观众欢呼。
- 顿帧（每次击中 0.05 秒、重炮 0.07 秒、进球 0.12 秒）保留：它只在本机暂停画面，同步层会把它算进去（D9）。

### D9. 同步方式：球权方说了算 【设计者决定】

**球权**：球正朝谁飞，谁就是球权方。球权方的客户端负责判定所有改变球状态的事：

- 自己的击球、软球、挥空、旋转、爆发发动与出手；
- 自己这一端的进球（丢球）和打偏；
- 发向自己的发球。

另一方的客户端只按同样的物理推进球，不判定这些事，直到收到球权方的消息。

**消息**（`duel-net.mjs` 定义，可以序列化成 JSON）：

| 类型 | 谁发 | 内容 |
|---|---|---|
| `pos` | 双方，每秒 30 次 | 自己的 `x`、`axis`、挥击状态（`swing.time`，或者没在挥击） |
| `serve` | 接球方 | 发球后的球状态 |
| `hit` | 击球方 | 击球后的球状态（`x,z,vx,vz,curve,kind`）、击球种类、击球方能量、回合倍率 |
| `burstStart` | 发动方 | 爆发开始，带位置 |
| `wide` | 打偏那一端的球权方 | 弹回后的球状态 |
| `goal` | 丢球方 | 新比分；比赛是否结束 |
| `ping` / `pong` | 双方 | 用来估算往返延迟 |

- 每条消息带递增序号 `seq`，以及发送方的模拟时间 `t`。传输层保证按序到达：P1 用 WebRTC 可靠有序通道或 WebSocket，两者都保证按序。
- **接收方追帧**：收到 `serve`、`hit`、`wide` 后，把球设成消息里的状态，再按「单程延迟估计（往返时间的一半，指数平均）」用 `advanceBall` 往前推，抵消路上耽误的时间。画面上的球从旧位置用 0.15 秒平滑过渡到新位置，不瞬移。
- **等待判定**：非球权方这边，如果球已经到了对方的球门线还没收到消息，就让球停在线上，等消息到了再处理。
- **对手位置**：用 `pos` 消息缓冲约 100 毫秒后插值显示。
- **比分**只由 `goal` 消息改变，所以两边的比分不会不一致。
- 【否决】回滚同步（格斗游戏常用的 rollback）：要求两台机器逐帧算出完全相同的结果，但不同手机的 `Math.sin/atan2` 可能有末位差异，出错难排查。
- 【否决】服务器说了算：拳套判定窗口只有 0.12 秒，网络往返一次就会让「打中了却判没中」变得常见。
- 已知代价：球权方的判定发生在本机，理论上可以作弊；对朋友房间可以接受，P3 再考虑校验。

**传输接口**（P1 照这个接口实现）：

```js
// transport: {send(msg), onMessage(fn), close()}
createLoopback({delayMs, jitterMs, seed}) // 返回 [transportA, transportB]，按序投递，延迟 = delay ± jitter
createClient({side, transport, controller}) // controller 是本地玩家输入或 bot；返回 {state, step(dt), view()}
```

### D10. 本机怎么用同步层

- **对战 AI**：页面里跑两个客户端，A 由玩家操作，B 由 bot 操作，用回环传输连起来。延迟默认 0，可以在页面的「网络模拟」开关里选 0 / 80 / 150 / 250 毫秒，抖动固定为延迟的 20%。画面只显示 A 的视角。这样不联网，也能感受联机下的手感。
- **本机双人**：只跑一个客户端，两边都在本地判定，没有延迟开关。
- **暂停**：只在本机暂停两个客户端，不属于协议内容（P1 再定联机暂停）。

### D11. 界面

- 对战页的外观沿用 `styles.css` 和 `lobby.css` 的夜场配色；移动、挥击、技能按钮的布局和单机一样。
- 开局页：选「对战 AI」或「本机双人」（后者只在非触屏设备上显示）、网络模拟延迟（只在对战 AI 时显示）、「开始对战」按钮、「返回单机」链接（指向 `index.html`）。
- 对局中：顶部比分胶囊「我 3 : 2 对手」、先进 5 球；能量与技能按钮只显示自己的；浮动提示沿用单机的「进球！」「打偏了」「重炮！」等文案。丢球提示改为「丢球！」，不扣生命。
- 结算：「你赢了」或「对手赢了」、比分、「再来一局」、「返回单机」。
- 不支持 WebGL2：显示「对战需要 3D 画面，当前设备不支持」和返回链接。

### D12. 音效拆分

- 把 `game.js` 里的 `bus`、`tone`、`noise`、`sound`、`buzz` 及其常量原样搬到 `dist/sfx.mjs`。`game.js` 改为导入它们，行为不变。
- `duel.js` 复用同一套音效。

## Files in scope

**新增**

- `dist/duel-core.mjs`、`dist/duel-bot.mjs`、`dist/duel-net.mjs`、`dist/duel-view.mjs`
- `dist/duel.html`、`dist/duel.js`、`dist/duel.css`
- `dist/sfx.mjs`
- `tests/duel-core.test.mjs`、`tests/duel-net.test.mjs`、`tests/duel-view.test.mjs`
- `scripts/duel-balance.mjs`、`scripts/duel-qa.mjs`

**修改**

- `dist/scene3d.mjs`：只增加对战分支（D6），单机输出不变
- `dist/characters.mjs`：只给 `keeper.clips` 加 `punchLeft`、`punchRight`
- `dist/models/keeper.glb`：由 `pack-characters.mjs` 重新生成
- `dist/game.js`：只做 D12 的音效搬迁
- `scripts/build-release.mjs`：只加 D7 的排除规则
- `README.md`：加一节「对战版（P0，本机测试）」

**不得修改**

- `dist/core.mjs`
- `dist/input.mjs`、`dist/storage.mjs`
- `dist/index.html`、`dist/ui.mjs`、`dist/lobby.css`（P0 不加大厅入口）；Amendments A2 后 `dist/index.html`、`dist/lobby.css` 改为在范围内，`dist/ui.mjs` 仍不改
- 现有测试的断言含义。确实要改测试时，必须在实现报告里逐条写明理由。
- `.openai/hosting.json`、`scripts/release/*`、`scripts/release-qa.mjs`

## Ordered tasks

从 main 新开分支 `feat/duel-local`。每个阶段结束都跑完整的 `npm test`，然后单独提交一次。

1. **开工检查**：`git status` 干净；记下 `node scripts/keeper-balance.mjs` 在 main 上的输出，作为 AC3 的对照。
2. **对称规则（D1–D3）**：写 `duel-core.mjs`，导出 `DUEL`、`createDuel`、`startDuel`、`stepDuel(state, dt, inputs)`（`inputs={a:{axis}, b:{axis}}`）、`duelAttack(state, side)`、`duelSkill(state, side, kind, axis)`、`toLocal`/`fromLocal`；写 `tests/duel-core.test.mjs`。
3. **击球一致性（AC5）**：同一个本地处境下，对比 `duel-core` 的击球结果和单机 `core.mjs` 的 `swingPreview`/`strike` 结果。
4. **对称 AI 与平衡脚本（D4）**：写 `duel-bot.mjs` 和 `scripts/duel-balance.mjs`。
5. **同步层（D9、D10）**：写 `duel-net.mjs`（消息格式、球权、追帧、等待判定、回环传输、`createClient`）和 `tests/duel-net.test.mjs`。
6. **音效拆分（D12）**：`sfx.mjs`，`game.js` 改为导入；跑 `node scripts/audio-qa.mjs`。
7. **角色出拳动作**：`characters.mjs` 加动作，重跑 `node scripts/pack-characters.mjs`，确认 `keeper.glb` ≤800 KB。
8. **画面对战分支（D6）**：`duel-view.mjs`、`scene3d.mjs` 对战分支，写 `tests/duel-view.test.mjs`。
9. **对战页面（D5、D11）**：`duel.html`、`duel.js`、`duel.css`，包括两种对手、延迟开关、计分、结算、WebGL2 检查。
10. **发布排除（D7）**：改 `build-release.mjs`，本地跑一遍打包检查后删除产物，不上传。
11. **浏览器验收**：写 `scripts/duel-qa.mjs`（见 AC17、AC18），跑全部单机 QA 脚本做回归。
12. **收尾**：README 增加对战一节；写 `02-implementation.md`（实际改动、偏离设计之处、测试改动清单及理由、平衡数据）。

## Acceptance criteria

| # | Action | Expected observable result | How to verify |
|---|---|---|---|
| AC1 | 跑 `npm test` | 全部通过，0 fail；原有 163 条测试的名字全部还在 | 命令输出 |
| AC2 | `git diff main -- dist/core.mjs dist/input.mjs dist/storage.mjs dist/index.html dist/ui.mjs dist/lobby.css` | 无输出 | 命令输出 |
| AC3 | 在 main 和分支上分别跑 `node scripts/keeper-balance.mjs` | 两次输出完全相同 | 对比两次输出 |
| AC4 | `createDuel()` 后，对任意状态调用 `fromLocal(toLocal(s,'b'),'b')` | 球和球员的位置、速度与原状态相差 <1e-9 | `tests/duel-core.test.mjs` |
| AC5 | 构造 A 和 B 各自的本地处境，使其与某个单机局面相同（同球位置、速度，同球员 x，同按住方向，同挥击时刻），各挥击一次 | 出球种类（soft/clean/perfect）一致；本地视角下出球角度、速度，与单机局面（`createGame` 后摆成同一处境，`attack` 并用 `stepGame` 推进到击中）的结果相差 <1e-9；A、B 两边结果互为镜像 | `tests/duel-core.test.mjs` |
| AC6 | 让球越过 B 的球门线：一次 `|x|<=2.6`，一次 `|x|>2.6` | 前者 A 得 1 分，下一球发向 B；后者记为打偏，球反向弹回，比分不变 | `tests/duel-core.test.mjs` |
| AC7 | 任一方得到第 5 分 | `phase==='won'`，`winner` 为该方，`stepDuel` 不再推进 | `tests/duel-core.test.mjs` |
| AC8 | B 在球朝 A 飞时挥击 | 不会击中，记为挥空；只有球朝自己飞时才能击中 | `tests/duel-core.test.mjs` |
| AC9 | B 能量 ≥50，球在框内时放旋转，不按方向 | 能量减 50；球朝远离 A 当前位置的一侧拐弯（本地视角下的方向与单机按门将位置的规则一致） | `tests/duel-core.test.mjs` |
| AC10 | 两个 bot 在同一个客户端里（本机双人模式）打 200 局，种子固定，跑 `node scripts/duel-balance.mjs` | 脚本输出 JSON，包含每局总拍数、每分平均拍数、平均每分耗时、A 胜率、各击球种类占比、打偏次数；同一个种子跑两次，输出逐字相同。数值本身只供观察，不设通过线 | 命令输出，对比两次输出 |
| AC11 | 用 `createLoopback({delayMs:150,jitterMs:30,seed:1})` 连两个客户端，双方都是 bot，打 20 局 | 每一局结束时两边的比分、胜者完全相同；每个 `goal` 事件两边都出现，且只出现一次 | `tests/duel-net.test.mjs` |
| AC12 | 同上，记录每条 `hit` 消息到达时，接收方追帧后的球位置 | 与发送方在同一模拟时刻的球位置相差 ≤0.05 米（延迟估计稳定后，从第 3 条消息起计） | `tests/duel-net.test.mjs` |
| AC13 | 回环传输人为把某条 `hit` 消息延后 2 秒 | 接收方的球停在发送方的球门线上等待（`z` 不越过该线），收到后继续；比分不出错 | `tests/duel-net.test.mjs` |
| AC14 | 用 `viewFor(state,'a')` 和 `viewFor(state,'b')` 分别构建场景并 `update` | 两者的近端角色都是 `jersey-body` 主角模型、站在自己的 `x`；远端角色位于对手 `x` 的镜像位置；对手挥击时远端角色出拳手的前伸量 ≥ 该片段实测最大值的 80%；`reachBar` 不可见 | `tests/duel-view.test.mjs` |
| AC15 | 对战模式下连续渲染 300 帧，期间有击中和进球 | 几何体、贴图、场景对象总数不增长；在 `perf.test` 统计的同样时机（准备状态、发球后），可见物体 ≤100、投影物体 ≤50（见 Amendments A1） | `tests/duel-view.test.mjs` |
| AC16 | 跑 `node scripts/pack-characters.mjs` 后 `ls -l dist/models` | `keeper.glb` ≤ 819200 字节，`striker.glb` 大小与 main 相同 | 命令输出 |
| AC17 | 跑 `node scripts/duel-qa.mjs`（需要 4173 端口服务） | 输出 PASS：竖屏 390×844、横屏 844×390 各打开 `duel.html`，选「对战 AI」，只通过按键打进 1 球（或丢 1 球）后比分变化；截图输出到 `artifacts/duel/`；控制台无报错；绘制调用 ≤110 | 命令输出，加上截图 |
| AC18 | `duel-qa` 中把网络模拟设为 250 毫秒再打一分 | 比分正常变化，无报错 | 命令输出 |
| AC19 | 跑 `node scripts/ui-qa.mjs --play`、`arena-qa`、`audio-qa`、`perf-qa`、`lobby-qa`、`control-qa`、`skill-qa`、`desktop-qa`、`shell-qa`、`crowd-qa`、`art-qa` | 全部 PASS（`art-qa` 为 errors: []），说明单机版没有回归 | 命令输出 |
| AC20 | 跑 `node scripts/build-release.mjs`，列出发布包里的 `site/` 文件 | 没有 `duel` 开头的文件；有 `sfx.js`；之后跑 `node scripts/release-qa.mjs release/<包名>` 输出 PASS。验证后删除这个包，不上传 | 命令输出 |
| AC21 | 打开 `http://localhost:4173/duel.html`，在手机或电脑上和 AI 打一局；电脑上再试本机双人；把延迟开到 150 毫秒再打一局 | 用户本人确认：回合长度是否合适、远端对手的出拳是否看得懂、150 毫秒下手感能否接受 | 用户试玩反馈，写进实现报告 |

## Risks and approval boundaries

**必须先问用户的情况**

- 需要修改 `dist/core.mjs`，或任何会改变单机规则和数值的地方。
- 需要放宽现有断言才能通过，比如提高绘制预算，或改变 `keeper-dive`、`goal-cam` 断言的含义。
- `keeper.glb` 加入出拳后超过 800 KB。
- 平衡数据显示回合明显不成立，例如 bot 对 bot 平均每分超过 40 拍或少于 2 拍，需要调 `DUEL` 以外的规则（比如击球框宽度、跑速）。调 `DUEL` 里的参数可以，但要在报告里写明。
- 实现过程中发现「球权方说了算」在回环测试里无法让两边比分一致，需要换同步方案。
- 合并到 main、部署、生成正式发布包；P1 的任何联网工作，包括注册或配置 Cloudflare Worker。

**已知风险**

- **回合可能太长**：防守方击球框横向 ±0.9，跑速 9.3 米/秒，而门框只有 ±2.6。bot 之间可能一直打不进。AC10 的平衡数据先看清楚，再决定要不要调 `DUEL.speed`、`goalHalf` 或加速倍率。
- **延迟下的「瞬移感」**：单程 125 毫秒、球速 10 米/秒时，收到消息后球要追约 1.25 米。0.15 秒的平滑过渡能否接受，要等 AC21 真人试玩。
- **接球方的反应时间被压缩**：球权交接时，接球方看到回球比实际晚一个单程延迟。延迟高时会显得对手的球更快。
- **画面改动波及单机**：`scene3d.mjs` 里主角和门将的姿态代码要抽函数共用，容易误改单机画面。现有场景、门将飞扑、镜头测试和 `arena-qa` 截图是防线。
- **多人协作**：用户也会让 Codex 改代码。开工和每次提交前都看 `git status`，不覆盖别人未提交的改动。

## Amendments

### A1（第 1 轮实现中，2026-10-28）AC15 绘制预算的统计时机

- 问题：AC15 的「可见物体 ≤100」如果按每一帧统计，对战最多 160 个，单机按同样方式统计也有 162 个（飞行时地上 48 个路线点）。而 `perf.test` 只在准备状态和发球后统计。要按哪种口径？选项：(a) 与 `perf.test` 相同时机；(b) 每一帧都 ≤100，单机也要一起削减；(c) 改看浏览器真实绘制次数 ≤110。
- 用户原话：「那就a」。
- 改动：AC15 改为在 `perf.test` 的同样时机（准备状态、发球后）断言可见物体 ≤100、投影物体 ≤50；「300 帧不增长」那半句不变。浏览器真实绘制次数仍由 `scripts/duel-qa.mjs` 按 ≤110 检查，作为额外保障，不是 AC15 的一部分。

### A2（第 1 轮实现后，2026-10-28）大厅入口

- 背景：用户问「单机版本的 ai门将 防守的模式去哪里了」，单机版一直在 `index.html`，对战页没有入口（D7）。
- 用户原话：「大厅加一下吧  改成 单机对战（进入打 AI 门将）   玩家联机对战（新做的）」。
- 改动：D7 的「不在大厅放入口」作废。大厅的「开始游戏」改名为「单机对战 · 打 AI 门将」，下面新增「玩家联机对战 · 两边都能进攻 · 测试版」链接到 `duel.html`。该链接带 `data-dev-only`，`build-release.mjs` 打包时从 `index.html` 去掉，并检查发布包里没有指向 `duel.html` 的链接；对战文件仍不进发布包。`dist/index.html`、`dist/lobby.css` 因此进入改动范围；按按钮名查找的 QA 脚本（arena、browser、control、lobby、ui）、`scripts/release/DEPLOY.md`、`README.md` 跟着改名，断言内容不变。
