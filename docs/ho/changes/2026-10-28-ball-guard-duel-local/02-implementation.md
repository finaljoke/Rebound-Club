# 实现报告：对战版 P0（两名玩家互攻互守，本机验证 + 同步层原型）

## Design and round reference

- 设计：`.ho/changes/2026-10-28-ball-guard-duel-local/01-design.md`，第 1 轮。2026-10-28 用户回复「批准」，包括 D2、D5、D7、D8、D9 这几项设计者决定。
- 分支：`feat/duel-local`，基于 main `a36dbed`，共 7 个提交（`8c1a1e3` … `0b8a9e4`，加上大厅入口 `6a3aedf`）。没有合并，没有部署。
- AC15 的问题用户已回答（选 a），已写进设计 Amendments A1。大厅入口按用户要求加上，见设计 Amendments A2。
- **还差 AC21 真人试玩**，所以 `status` 保持 `implementing`。

## Task completion table

| # | 任务 | 结果 | 提交 |
|---|---|---|---|
| 1 | 开工检查 | 完成。工作区干净；记录了 `scene3d.mjs`、`characters.mjs`、`game.js`、`build-release.mjs`、`README.md`、`keeper.glb` 的 SHA-256，每次改之前都核对过，没有发现别人的改动；记下了 main 上 `keeper-balance` 的输出 | — |
| 2 | 对称规则（D1–D3） | 完成 | `8c1a1e3` |
| 3 | 击球一致性（AC5） | 完成 | `8c1a1e3` |
| 4 | 对称 AI 与平衡脚本（D4） | 完成 | `8c1a1e3` |
| 5 | 同步层（D9、D10） | 完成 | `8c1a1e3` |
| 6 | 音效拆分（D12） | 完成 | `90cfbd9` |
| 7 | 远端角色出拳动作 | 完成 | `352043c` |
| 8 | 画面对战分支（D6） | 完成 | `61d477b` |
| 9 | 对战页面（D5、D11） | 完成 | `2df1ed5` |
| 10 | 发布排除（D7） | 完成。本地打包验证后已删除这个包，没有上传 | `2df1ed5` |
| 11 | 浏览器验收与单机回归 | 完成 | `2df1ed5` |
| 12 | README 与本报告 | 完成 | `0b8a9e4` |

## Actual file changes

**新增**

- `dist/duel-core.mjs`：对称规则，参数集中在 `DUEL`（先进 5 球、球速 `LEVELS[0].speed`、门框 2.6）。
  - 状态存在 A 的坐标系里，B 的视角是 A 的半圈旋转（`mirrorBall`）。
  - 击球、挥空、旋转、爆发都把单机 `core.mjs` 的写法搬到各自视角里计算。
  - B 打出的球在 B 的视角里飞行（`flyBall`），因为 `advanceBall` 的旋转限幅是围绕 +z 方向的。
  - 用 `auth` 决定哪一方由本机判定；非判定方的球到线就停住（`hold`）。
  - `applyMessage` 处理对方的消息，追帧时按发送方的方式逐步扣减顿帧（`stopThenFly`）。
  - `duelSwingPreview`：在状态副本上跑真实规则，预览这一下挥击的结果。
- `dist/duel-bot.mjs`：`createBot({seed,level})`，`decide(view,dt)` 只看自己的视角，只输出 `{axis,swing,skill}`。
- `dist/duel-view.mjs`：`viewFor(state,side,offset)` 把对战状态翻成单机形状，并就地刷新同一个对象，因为场景按对象身份管理特效。视图里带 `hints`、`opponent`、`mode:'duel'`。
- `dist/duel-net.mjs`：
  - `createLoopback({delayMs,jitterMs,seed,now})`：两端按序投递，支持 `flush`、`delayNext`、`setDelay`；
  - `createClient({side,transport,now})`：`step`、`view`、`pause`、`resume`、`start`、`clock`。
- `dist/duel.html`、`dist/duel.js`、`dist/duel.css`：对战页面。
- `dist/sfx.mjs`：从 `game.js` 原样搬出的音效与震动代码，另加 `setSound`。
- `tests/duel-core.test.mjs`（7 条）、`tests/duel-net.test.mjs`（3 条）、`tests/duel-view.test.mjs`（4 条）。
- `scripts/duel-balance.mjs`、`scripts/duel-qa.mjs`。

**修改**

- `dist/scene3d.mjs`：
  - `buildWorld(assets,{duel})`：对战时近端球门半宽改为 `LEVELS[0].goalHalf`，远端角色站在 `GOAL_Z-PLAYER_Z`；
  - 测量远端角色的出拳接触帧（`OPP_PUNCH`，只在对战时测）；
  - `update` 里的规则提示改用 `s.hints||SINGLE_HINTS`；
  - 对战时远端角色走独立的出拳/横移分支，单机时的飞扑分支原样保留；
  - 对战时不显示 `reachBar`，落点圈按对手击球框宽度判红绿；
  - 返回值加了 `oppPunch`、`duel`；`create3DRenderer` 加第三个参数 `options`。
- `dist/characters.mjs`：`keeper.clips` 加入 `punchRight`、`punchLeft`。
- `dist/models/keeper.glb`：由 `pack-characters.mjs` 重新生成，515140 → 615160 字节。
- `dist/game.js`：删除音效代码块，改为导入 `sound`、`buzz`、`setSound`；音效开关里加了 `setSound(soundOn)`。
- `scripts/build-release.mjs`：跳过 `dist/` 下以 `duel.`、`duel-` 开头的文件。
- `README.md`：新增「对战版（P0，本机测试）」一节。

**命令附带产生的变化**

- `node scripts/pack-characters.mjs` 会重新复制 `dist/models/KAYKIT-LICENSE.txt`。工作区里这个文件的换行符因此变了，但 Git 统一换行后内容和原来相同，所以没有进入任何提交。

**没有改的文件**：`core.mjs`、`input.mjs`、`storage.mjs`、`index.html`、`ui.mjs`、`lobby.css`、`.openai/hosting.json`、`scripts/release/*`、`release-qa.mjs`。

## Deviations and reasons

1. **AC15 的绘制预算一半和项目现状不符。已解决：用户 2026-10-28 回复「那就a」，写进设计 Amendments A1，测试按现有两条不变。**
   - AC15 原文：「对战模式下连续渲染 300 帧，期间有击中和进球 → 几何体、贴图、场景对象总数不增长；可见物体 ≤100、投影物体 ≤50（与 `perf.test` 相同的阈值）」。
   - 实测：按「每一帧都统计」的读法，对战逐帧最多 160 个可见物体。**单机版用同一种逐帧统计方式也会到 162**，主要是飞行时地上的 48 个路线点。`perf.test` 实际只在大厅和刚发球这两个时刻统计，单机在飞行中的帧本来就超过 100。
   - 我目前的处理：`tests/duel-view.test.mjs` 拆成两条。一条是「300 帧不增长」，按原文断言。另一条在 `perf.test` 的同样时机（准备状态、发球后），用同样的阈值断言，两条都通过。
   - 浏览器里的真实绘制调用（`duel-qa`）：对局中峰值 87～100 次，全程在 110 以内。
   - 需要你选一个：(a) 接受「与 `perf.test` 相同时机」的读法，我把 AC15 写进设计的 Amendments；(b) 坚持逐帧 ≤100，那单机也要一起削减路线点等提示，超出本次范围；(c) 改用浏览器绘制调用 ≤110（`duel-qa` 已经在测）作为逐帧标准。
2. **同步层对时方法换了。** 设计 D9 写的是「往返时间的一半（指数平均）」，实现时先按 NTP 四时间戳取最快往返做，结果在 150±30 毫秒的对称抖动下误差有 5～10 毫秒，追帧会差一步，最大偏差 0.26 米，AC12 不通过。现在改为：双方各自统计最近 120 条消息里「到达 − 发送」的最小值，并随每条消息告诉对方，两个最小值之差的一半就是时钟差。AC12 因此通过。ping/pong 只保留下来测往返时间。这是设计没写到的实现细节，没有改变任何行为约定。
3. **传输接口多了几个方法。** 设计写的是 `transport: {send, onMessage, close}` 和 `createLoopback(...)` 返回 `[transportA, transportB]`。实现完全照这个，另外：`onMessage` 的回调多一个到达时间参数，供对时用；返回的数组上挂了 `flush`、`delayNext`、`setDelay`，用于回环投递、AC13 的人为延迟和页面上的延迟开关。
4. **按键触发的决定盖这一步开始时的时间戳。** 旋转是在按键时立即出手的，比这一步的模拟早一步，如果盖结束时的时间戳，追帧会多算一步。现在 `createClient.step` 会先把按键产生的消息盖上 `t-dt` 发出去。
5. **排队事件先发出，再判断阶段。** `stepDuel` 在阶段检查之前就把排队事件放进 `events`。否则对方发来的决胜球 `goal` 事件会因为对局已经 `won` 而永远发不出来（AC11 测出来的）。
6. **AI 的接口签名。** 设计写的是 `decide(localView)`，实现是 `decide(view, dt=1/60)`，多出来的 `dt` 用来计算反应时间。
7. **对手的爆发没有蓄力演出。** 远端玩家放爆发时，本机这边会一起冻结 1.1 秒，但不播放环绕推近、横幅这些演出，演出只给发动方自己看。设计没有写这一点，是我的决定，不影响规则。
8. **提交说明有一处不准。** `0b8a9e4` 的说明里写了「状态徽章改为丢球、比分标签不换行」，这两处其实已经包含在 `2df1ed5` 里，`0b8a9e4` 只改了 README。我没有改写历史。
9. **大厅入口（设计 Amendments A2，用户要求）。** 设计 D7 原本不放入口。用户要求后，`6a3aedf` 改了 `dist/index.html`（「开始游戏」→「单机对战 · 打 AI 门将」，新增「玩家联机对战」链接，带 `data-dev-only`）、`dist/lobby.css`（入口样式，含夜间配色和两种窄屏尺寸）、`scripts/build-release.mjs`（打包时从 `index.html` 去掉 `data-dev-only` 链接；若任何文件还有 `data-dev-only` 或 `href="./duel.html"` 就报错）。按「开始游戏」查找按钮的 5 个 QA 脚本改为按「单机对战」查找，断言不变；`DEPLOY.md`、`README.md` 同步按钮名。守卫第一版写成匹配任意 `duel.html` 字样，被 `characters.mjs` 的注释误拦，改为只匹配链接。
   - 验证（本轮在 `6a3aedf` 的改动上实际运行）：`npm test` 177/177 通过；`node scripts/<名>-qa.mjs` 对 lobby、ui、browser、shell、control、arena、desktop、skill、audio、perf、art、crowd、duel 全部退出码 0；`node scripts/build-release.mjs` 后发布包 `index.html` 里 `lobby-duel|duel.html` 计数 0、「单机对战」按钮在，`node scripts/release-qa.mjs <包>` 输出 PASS，验完删掉该包；390×844、844×390、1280×800 三种尺寸截图检查无重叠、无横向滚动（`scrollWidth` 等于视口宽），电脑上点入口进入 `http://localhost:4173/duel.html`。
10. **近端球门与远端对称（用户反馈，`e24e0aa`）。** 用户转述玩家反馈：「玩家的场地球框 聚光灯 和 ai 电脑是不一样的」。对战页近端原来沿用单机的全透明球框、两侧没有挡板。现在 `buildWorld({duel:true})` 的近端改为白色实心门柱、门口两侧深色 LED 挡板（单独的 `near-boards` 组，亮面朝镜头），横梁、后框、球网保持半透明，因为第一版做成实心后横屏下横梁压住了近端主角的腿。聚光灯没改：近端两座灯塔一直在，只是位于镜头后方、画面外。单机版近端保持原设计（整条底线都是球门、半透明，`camera-fx.test` 有断言），是否改等用户决定。
   - 验证（本轮实际运行）：`npm test` 177/177 通过；`node scripts/duel-qa.mjs` PASS，对局绘制峰值竖屏 82、横屏 79；`art`、`perf`、`arena` QA 退出码 0；看过 `artifacts/duel/match-390x844.png`、`match-844x390.png`。

## Verification commands and observed results

以下全部是本轮实际运行的结果。

| 命令 | 结果 |
|---|---|
| `npm test` | tests 177，pass 177，fail 0（原有 163 条全部还在，新增 14 条） |
| AC2：`git diff main -- dist/core.mjs dist/input.mjs dist/storage.mjs dist/index.html dist/ui.mjs dist/lobby.css \| wc -c` | 0 |
| AC3：main 与分支各跑 `node scripts/keeper-balance.mjs`，再 `diff` | IDENTICAL |
| AC4–AC9：`tests/duel-core.test.mjs` | 7/7 通过。击球一致性实际比对了 ≥40 组，软球、普通、重炮三种都覆盖到 |
| AC10：`node scripts/duel-balance.mjs 200 1` 跑两次，再 `cmp` | SAME。200 局全部打完，没有超时；A 胜率 0.52；每分平均 36.4 拍，中位数 28，P90 76；每分 23.2 秒；每局 183 秒；打偏 0、撞墙 0、挥空 120；重炮 28%，左 28%，右 29%，旋转 8%，爆发 7% |
| AC11–AC13：`tests/duel-net.test.mjs` | 3/3 通过（20 局两边比分、胜者、进球顺序完全一致；追帧偏差 ≤0.05 米；晚到 2 秒的消息让球停在线上等待，之后继续） |
| AC14、AC15（不增长部分）：`tests/duel-view.test.mjs` | 4/4 通过；AC15 的绘制预算部分见 Deviations 第 1 条 |
| AC16：`node scripts/pack-characters.mjs` 后 `ls -l dist/models` | `keeper.glb` 615160 字节（≤819200）；`striker.glb` 552524 字节，`sha256sum -c` 与 main 相同 |
| AC17、AC18：`node scripts/duel-qa.mjs` | PASS。竖屏绘制调用：大厅 71、开局 87、对局峰值 87、转屏后 84；横屏：68、84、100、87。两种屏幕都只用按键打出了比分变化；250 毫秒下打出一分，无报错；本机双人：远端按 ← 时 x 从 0 变到 −1.70，按 ↑ 能挥击。截图在 `artifacts/duel/` |
| AC19：`ui-qa --play`、`arena-qa`、`audio-qa`、`perf-qa`、`lobby-qa`、`control-qa`、`skill-qa`、`desktop-qa`、`shell-qa`、`crowd-qa`、`art-qa` | 全部退出码 0。`ui-qa` errors: []；arena、audio、perf、desktop、shell 都是 PASS（perf：大厅 62、对局 65、横屏 72）；lobby flows: passed；control、skill、crowd、art errors: [] |
| AC20：`node scripts/build-release.mjs`，再 `release-qa` | 31 个文件，`duel*` 0 个，有 `sfx.js`；release-qa PASS（离线下 3D 进入对局）。之后删除了 `release/rebound-club-2026-10-28-2df1ed5` |

**补充观察（不是验收标准）**：两个 AI 通过回环对打，每个延迟各 20 局，1/60 秒步进。

| 延迟 | 每分平均拍数 | 每局秒数 |
|---|---|---|
| 0 ms | 36.3 | 170 |
| 150 ms | 15.6 | 103 |
| 250 ms | 8.3 | 61 |

0 毫秒的结果和同一状态下双方本地判定的平衡脚本（36.4 拍）一致，说明同步层本身不改变比赛。延迟越高回合越短，原因是接球方收到对方击球时，球已经追帧往前飞了一段，留给反应的时间变少。

另外，同样的回环如果按 1/120 秒步进，0 毫秒那组 20 局一局都没打完：AI 的按键误差是按「每次决策」计的，决策变密，误差时间就减半，AI 几乎不失误。这是 AI 参数的特性，不是同步问题。

## Unverified items and reasons

- **AC21 真人试玩**：回合长度是否合适、远端对手的出拳是否看得懂、150 毫秒下的手感能否接受，都需要用户本人试玩。
- **真机网络**：P0 只有本机回环。真实网络是非对称、会丢包重传的，对时和追帧在真实网络下的表现要等 P1 再测。
- **手机性能**：`duel-qa` 只在桌面 Chrome 上测了绘制调用，没测真机帧率。

## Remaining risks

- **回合太长**：AI 对 AI 在 0 延迟下每分平均约 36 拍、23 秒，最长的一分 135 秒。真人失误会更多，但如果试玩也觉得太长，可以调 `DUEL.speed`、`goalHalf`，或回合加速倍率（`RALLY_STEP`、`RALLY_CAP` 是单机常量，要调的话得在 `DUEL` 里另设，需要先问）。
- **高延迟压缩反应时间**：150 毫秒下回合长度减半，说明接球难度明显上升。可选的缓解办法是给追帧设上限，或者在收到消息时局部放慢球速。这属于 P1 的设计决定。
- **对时假设两个方向的最快单程一样长**：真实网络上下行不对称时，时钟差会有偏差。P1 需要实测。
- **暂停**：回环下暂停期间还在路上的消息，年龄里会包含暂停的时长；P0 的本机暂停只是测试功能，联机暂停留到 P1 再定。
- **画面**：`scene3d.mjs` 里单机分支的代码没有动，只是包进了 `else`；现有场景测试和 `arena-qa`、`art-qa` 都通过。
