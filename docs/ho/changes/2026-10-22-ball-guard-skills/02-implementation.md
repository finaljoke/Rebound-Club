# 实施记录：旋转回击与爆发回击

## Round 2

### 1. Design and round reference
- 设计：`01-design.md`，Amendments「Round 2」（用户 2026-10-22 反馈：爆发特写太短、单调）。
- 游戏仓库分支 `feat/burst-show`（自 main e7d24d4），提交 21093ce；未合并、未发布。

### 2. Task completion table
| 任务 | 结果 |
|---|---|
| 爆发演出 0.50s → 1.10s，节拍集中到 `SKILLS.burst` | done |
| 环绕推近、停留缓推、出手、拉回的镜头；正常构图恢复后才发球 | done |
| 光环、火花、手部发光、球光晕与颤动、冲击波、横幅、暗角、速度线、开场与出手闪白 | done |
| 爆发球尾迹加粗、发球震屏；减少动态效果简化 | done |
| 出手节拍事件 `burstStrike`、蓄力音效对齐 1.1s、出手音 | done（第 2 轮补充：GPT 完成移动按钮改动后接入，见 D2-1） |
| 2D 兼容画面的同步演出 | done（第 2 轮补充，见 D2-3） |

### 3. Actual file changes
- `dist/core.mjs`：`SKILLS.burst.duration` 1.1，新增 `freeze/push/strike/release`；演出时钟越过 `strike` 时发 `burstStrike` 事件。
- `dist/scene3d.mjs`：新的节拍、镜头环绕与缓推（`cine.theta/r`），预建的光环、火花、手部发光、球光晕、冲击波，以及挂在相机下的屏幕层（暗角、速度线、横幅、闪白，canvas 纹理，node 测试环境无纹理）；爆发尾迹；发球震屏 `kick`；暴露 `burstFx`。
- `dist/game.js`（补充，在 GPT 改动之上追加，未改动其内容）：`charge` 音改为持续到 `SKILLS.burst.strike` 的上扬音加 5 下逐渐加快的心跳；新增 `strike` 音（低频轰鸣、噪声爆裂、高频泛音）并在 `burstStrike` 事件时播放；2D 兼容画面按同一节拍加深压暗、蓄力环随蓄力变粗、横幅切入（中场空白处）、出手闪白与冲击环，减少动态效果时不滑入、不闪白。
- `tests/skill-flow.test.mjs`：把写死 0.5 秒/固定帧数的 6 处改为读取 `SKILLS.burst`；时间线测试改为新节拍并检查各特效的出现与收起；特写取景测试取停留段中点。

### 4. Deviations and reasons
- D2-1 音效未接入：实施时工作区有另一位代理（用户确认为 GPT）未提交的手机左右移动按钮改动，涉及 `game.js`、`index.html`、`styles.css`、`input.mjs`、README、多个 QA 脚本。为避免并行写入冲突，本轮只改 `core.mjs`、`scene3d.mjs`、`tests/skill-flow.test.mjs`；原计划用 DOM 实现的横幅、暗角、速度线、闪白改为 3D 相机下的屏幕层。待对方完成后需在 `game.js` 处理 `burstStrike`（出手音）并把 `charge` 音延长到约 0.75s。补充：用户告知 GPT 已完成后已接入。
- D2-2 提交范围：只提交上述 3 个文件；他人改动保留在工作区未提交、未修改。
- D2-4 设计外修复：合并后 GPT 的 lobby-qa 暴露跳过教学时大厅菜单闪一帧，在 `finishTutorial` 补与 `beginTutorial` 相同的界面刷新；未改测试。
- D2-3 2D 兼容画面：首次提交时仍是第 1 轮的蓄力环与压暗；补充后已加横幅、闪白、冲击环。2D 横幅首版放在顶部会被门将压住，已移到中场空白处。

### 5. Verification commands and observed results（Round 2）
- `npm test`（含他人未提交改动的工作树）：开工时 `pass 111 / fail 0`；提交前 `pass 111 / fail 0`。
- `node --test tests/skill-flow.test.mjs tests/scene3d.test.mjs tests/camera-fx.test.mjs`：`pass 26 / fail 0`（中间一次特写取景失败：停留段推近 8% 时竖屏头顶 y=0.022 出框，改为 4% 并抬高注视点后通过）。
- 浏览器逐帧（headless Chrome，390×844，测试浏览器只读拦截 `game.js`；在 0.10/0.30/0.60/0.78/1.00 秒与发球后各按真实暂停键截图）：errors []；各帧依次可见开场闪白与横幅切入、环绕推近与光环火花、特写中人物/发光拳套/带光圈的球、出手闪白与冲击波、拉回、正常构图下的橙色爆发球。

- 补充（接入音效与 2D 后）：`npm test` → `pass 111 / fail 0`。临时实测脚本（真实键盘打满能量后按 K；只读拦截 `game.js` 并包装 `cues` 记录调用）：3D 与 2D（`--disable-webgl --disable-3d-apis`，`renderer=2d`）均为 `charge` 在演出 0.008–0.017s、`strike` 在 0.767s、发球后 `punch`+`impact`，errors []。2D 截图 0.05/0.3/0.6/0.8/1.0s：横幅（移到中场后）不压门将，出手帧有闪白与冲击环。

- 合并与发布（Round 2 收尾）：GPT 的移动按钮与大厅改动单独提交 47f679e（拆出 game.js 中我的改动后 npm test pass 111）；我的音效/2D/README/升级说明 7265ebd；快进合并 main。main 上 `node scripts/control-qa.mjs` exit 0 errors []；`node scripts/lobby-qa.mjs` 首次 exit 1（第 50 行：跳过教学后大厅菜单仍可见）——探针确认是 finishTutorial 开局后未立即刷新界面导致菜单闪一帧，补 phaseUI/hud 后 exit 0，`ui-qa` exit 0 errors []，npm test pass 111，提交 66f42e3（D2-4）。`node scripts/build-release.mjs` → rebound-club-2026-10-22-66f42e3（dirty false，14 个站点文件），zip 242978 字节 SHA-256 5ac9a210fec094597f67e9dc04a97fc20df76aff860c6121ebfc58f05de3094f；解压后 sha256sum -c 全部 OK；python http.server 根路径与 /games/rebound/ 子路径各开一次：errors []、无 4xx、js 为 application/javascript、renderer 3d、跳过教学后进入比赛、方向按钮可见、version.json 一致。

### 6. Unverified items and reasons
- 音效只验证了调用时机（拦截 `cues` 记录调用），没有人耳试听音色。真机与手机帧率。演出加长后的节奏是否合适需真人试玩。

### 7. Remaining risks
- 演出从 0.5 秒变为 1.1 秒，频繁使用时可能拖慢短局节奏；时长集中在 `SKILLS.burst.duration`，可再调。
- 屏幕层每帧更新透明度/位置，无新建对象（资源计数测试覆盖）；未在手机真机上测性能。

## Round 1 (superseded)

## 1. Design and round reference

- 设计：`.ho/changes/2026-10-22-ball-guard-skills/01-design.md`（第一轮设计，无 Amendments）
- 本记录：Round 1，2026-10-22，实施者 Claude Code
- 游戏仓库：`sites/ball-guard`，分支 `feat/skills`（自 `main` = bbf60bf 开出），提交 2dd59a7、661015a、dd4b43a、cf18b30；未合并、未发布
- 开工前 change.yaml 为 `draft`（pending：等待用户采纳）。用户本轮明确指示「以 01-design.md 作为本轮实现依据」，视为采纳，状态改为 `implementing`（见 Deviations D1）。

## 2. Task completion table

| # | 设计任务 | 结果 |
|---|---|---|
| 1 | 阅读规则与当前 diff，列出将触及的已有修改，不撤销他人工作 | done。设计快照中的未提交修改已由上一轮提交为 bbf60bf；开工时工作区干净。期间按用户要求把上一轮分支快进合并入 main（D2）。所有待改文件在写入前做了 SHA-256 核对；切换分支导致的仅 CRLF 差异已逐文件确认内容与 HEAD 一致。 |
| 2 | 集中技能参数、接受条件、能量与一次性事件/统计测试 | done。`SKILLS` 配置、`useSkill`/`skillStatus`/`burstZone`、能量结算、`s.queued` 命令事件队列、ui 统计；`tests/skills.test.mjs`。 |
| 3 | 旋转纯推进与碰撞、无副作用预测；方向、侧墙、扑回、远端墙、门线测试 | done。`advanceBall` 为模拟与预测共用；`predictFlight`/`spinPreview`；门将线/门线按穿越点插值；`tests/trajectory.test.mjs`。 |
| 4 | 按钮/键盘/能量条，双触点与重复输入 | done。技能坞（能量条带50刻度、旋转/爆发按钮带文字状态与左右旋箭头）、J/K、独立 pointer。 |
| 5 | 爆发核心阶段与0.50秒锁定发射，相机/光效/动作/音效 | done。核心 `phase:'skill'` 自有时钟冻结一切；场景按秒读取时间线做压暗、补光、蓄力环、蓄力-出手动作、侧后特写与恢复。 |
| 6 | 减少动态效果、2D、上下文丢失、失焦、旋转屏幕、重试、退出 | done（旋转屏幕仅单元测试，见第6节）。 |
| 7 | 六关三装备确定性场景与实际试玩，小幅调参并记录 | done。旋转曲率 0.035→0.06（D3），数据见第5节。 |
| 8 | 本地试玩结果、截图、已验证与未验证 | done。截图在 `sites/ball-guard/artifacts/skills/`（git 忽略）。未发布、未停止本地服务。 |

验收项：AC1–AC7、AC9–AC15 满足；AC8 中「换关」「旋转屏幕」在浏览器内未单独演练，靠同路径的重试/回准备浏览器验证与中途改尺寸的单元测试覆盖（见第6节）。

## 3. Actual file changes

游戏仓库 `sites/ball-guard`：
- `dist/core.mjs`：`SKILLS` 参数表；`ACTIVE_PHASES` 加入 `skill`；`advanceBall`（旋转曲率、停弯点、侧墙反射清旋）；`createGame` 新增 `energy/skill/skillSeq/queued`（教学局能量0）；`strike` 普通/完美回能、清除技能属性；`addEnergy`（50/100 首次越过事件）、`burstZone`、`skillStatus`、`useSkill`、`registerContact`、`launchBurst`、`predictFlight`、`spinPreview`；`farEnd` 改为按穿越点判定门将线与门线，扑回/远端墙清除 `curve/kind`；`tick` 增加爆发时钟分支、改用 `advanceBall`；`stepGame` 先投递 `s.queued`。
- `dist/ui.mjs`：统计新增 `spinShots/spinGoals/burstShots/burstGoals` 与高光文案；`hitFeel` 支持 `spin`/`burst`；`SKILL_STATE` 文案。
- `dist/game.js`：导入技能接口；`trySkill`（失败零扣费+原因提示）；技能按钮 pointerdown/click、J/K（忽略 repeat）；HUD 能量条与按钮状态/方向；技能事件的声音、弹字、提示；首次提示（会话内一次）；2D 回退的路线改用 `predictFlight`、旋转短弧、爆发边界、蓄力环与压暗；新增合成音 `charge/whirl/deny`；状态徽标 `skill:'爆发蓄力'`。
- `dist/scene3d.mjs`：路线点改用 `predictFlight`（共享几何）；旋转短弧点池；爆发边界框；旋转球青绿尾迹与快速球纹、爆发球放大橙色；技能接触特效；爆发蓄力环、补光、压暗、蓄力/出手姿势；相机以 `base/baseQuat/aim0` 为正常取景，特写只在 `shake()` 中按权重混合，恢复总是用最新 resize 结果。
- `dist/index.html`：技能坞 DOM；帮助新增技能说明。
- `dist/styles.css`：技能坞、能量条、按钮状态、教学中隐藏、≤380px 与矮横屏适配。
- `tests/skills.test.mjs`（新）、`tests/trajectory.test.mjs`（新）、`tests/skill-flow.test.mjs`（新，含场景镜头/取景/资源测试）。
- `scripts/skill-qa.mjs`（新）：技能浏览器 QA。
- `scripts/ui-qa.mjs`：全新存档开局若出现教学条，先点「跳过教学」（D7）。
- `README.md`：技能规则与 QA 命令。

变更目录：`change.yaml`（status、implementer、pending）、本文件。

## 4. Deviations and reasons

- D1 状态：设计为 `draft`、等待采纳。用户本轮指令「先完整阅读以下设计文档，将它作为本轮实现依据」视为采纳，改为 `implementing`。
- D2 合并：实施途中用户要求「上一轮的代码先合并一下到main中」。已将 `feat/feel-tutorial`（含 `feat/readability` 与两次 Sites 提交）快进合并入 main（合并后 `npm test` 83/83），删除两个已合并分支，技能工作在 `feat/skills` 上继续。
- D3 调参（设计允许「基于试玩小幅调参并记录」）：旋转曲率 `0.035 → 0.06 rad/场地距离`；初始角 0.22、停弯 70%、上限 0.65 未改。理由（离线确定性模拟，真实关卡门将参数）：默认值下旋转在 6 关的进球率都低于同样出手的普通回击（L1 33% vs 41%，L4 0% vs 4%），且按「每个接球位置是否存在进球选择」统计，旋转几乎不提供普通回击做不到的进球（仅 L3 有 6 个位置），而「只有普通能进」在 L4–L6 有 12–18 个，玩家没有理由花 50。曲率 0.06 时 L3–L6 出现 3–6 个「只有旋转能进」，「只有普通能进」降到 0–9，形成真实取舍。0.08 更强（L4–L6 只有旋转能进 9–15 个），但已超出「小幅」，保留为备选，需用户决定。曲率增大也使打偏率上升（全网格统计约 33%→46%），旋转短弧预览与路线终点提示用于帮助玩家避开打偏方向。
- D4 拒绝原因新增 `charging`（「蓄力中」）：爆发演出期间再次请求技能原本落入 `state`（「待开球」），文案误导；按设计「能量不足/等球进框/收招中为不同状态」的精神增加该状态。
- D5 门将线/门线的穿越点插值对所有球生效（不只爆发）：同一判定函数，普通球的差异在一步位移以内；全部既有测试通过。
- D6 命令事件队列：`useSkill` 的事件写入 `s.queued`，下一次 `stepGame` 作为该步事件投递，避免被 `events=[]` 吞掉；`attack()` 原有行为未改。
- D7 `scripts/ui-qa.mjs`：上一轮引入首次教学后，全新存档开局进入教学，教学中不会自然失败，原脚本在「等待自然失败」处 40 秒超时（本轮首次运行 exit 1）。设计允许「必要适配」：开局后若教学条可见则点击真实的「跳过教学」按钮。未改其他断言。
- D8 未新建 `tests/skill-scene` 等额外测试文件：场景镜头、特写取景、预览可见性、资源计数测试放在 `tests/skill-flow.test.mjs`。
- D9 首次提示（技能介绍、首次满能量）按「页面会话内一次」实现，未写入长期存档（设计要求能量不入存档，提示持久化未指定）。
- D10 旋转按钮的左右旋箭头在来球飞向玩家时持续显示（不限于可释放时），便于提前看到方向；短弧预览仅在可释放时显示。
- D11 浏览器 QA 读取状态方式：`scripts/skill-qa.mjs` 在测试浏览器中拦截 `game.js` 追加只读 `window.__qa`（生产文件不变）；爆发所需 100 能量由键盘机器人正常回球攒出，不写入任何状态。为确认镜头与资源计数，临时性的排查脚本在测试浏览器中额外拦截了 `scene3d.mjs` 暴露 world/renderer（未入库）。

## 5. Verification commands and observed results（Round 1，本轮实际运行）

- `npm test`（最终，cf18b30 前工作树）：`ℹ tests 108 / ℹ pass 108 / ℹ fail 0`。
- `node --check dist/game.js`：通过。
- `node scripts/skill-qa.mjs`（第二次完整运行，修正 QA 自身的 CDP 松指写法后）：exit 0，`errors: []`。要点：
  - 布局：390×844、360×640、844×390、1440×1000 下挥击/旋转/爆发/能量条/移动区均在视口内且 elementFromPoint 命中，scrollWidth = 视口宽；360 宽技能按钮 44×48。
  - 双触点：一指按住移动、另一指点旋转 → 能量 50→0，lastShot `spin`，球带曲率，人物继续移动（`keptMoving: true`）。
  - 爆发：连按 K 三次 → 能量 100→0 一次，`seqDelta 1`、`hitsDelta 1`，演出中暂停冻结（技能时间与球位置不变），出球速度 12.41、kind `burst`。
  - 演出中重试 → phase playing、能量50、skill null、hits 0；演出中失焦 → paused 且冻结，恢复后只发一次；演出中 WebGL 失效 → 2D、paused、保留技能时间，恢复后只发一次。
  - 减少动态效果：只发一次，100→0。教学：能量0、技能坞隐藏、J/K无效。普通打法（不用技能）通关第1关并进入第2关，新局能量50。2D 回退：旋转 50→0、爆发只发一次。
- 首次 `node scripts/skill-qa.mjs`：exit 0，唯一不符为 `keptMoving:false`；排查脚本记录指针事件显示 QA 用 `touchEnd` 列出移动手指，CDP 因而松开的是移动手指（`pointerup#2@move-control`）；改为只保留移动手指的 `touchMove` 后，移动在技能手指松开后持续（axis 0.83，x 1.12→1.89→3.01）。属 QA 写法问题，游戏逻辑未改。
- `node scripts/ui-qa.mjs --play`：首次 exit 1（`page.waitForFunction: Timeout 40000ms exceeded`，scripts/ui-qa.mjs:67，原因见 D7）；适配后 exit 0，`errors: []`，流程「ready / selectors / match / pause / help / return / natural loss / retry」，胜利「零失球，漂亮拿下！」，`nextLevel 02`，`unlockedGear racket`。
- 爆发镜头排查（测试浏览器内读取 `world.cine`）：修复前 cine.w 在技能时间 0.117s 已 0.86、0.283s 已归 0（时间线被按比例压缩，见第7节已修复）；修复后 0.283s、0.317s 时 cine.w = 1，出手瞬间特写截图人物头脚、拳套与球均在画面内。
- 20 轮浏览器资源计数（测试浏览器、headless Chrome、桌面机）：每轮等待旋转可放→J→暂停→重开，共 20 次释放；renderer.info 在第1/5/10/15/20 轮均为 `geometries 218, textures 9, programs 9`，帧率 61，errors []。
- 离线调参脚本（真实关卡规则，门将不改）：默认参数进球率 L1–L6 普通/旋转/爆发 = 41/33/44、30/24/39、7/0/26、4/0/30、13/7/35、4/2/22（%）；正面爆发（门将站在球路上）21/21 被扑；曲率 0.06 下可复现绕位案例 44 个（11 个位置×4 种误判），已固化 L4 x=0 t=0.6、L5 x=0 t=±0.4 为测试。

## 6. Unverified items and reasons

- 真机：未在任何手机/微信内验证；所有手机尺寸为桌面 Chrome 无头模拟，触控为 CDP 模拟。帧率 61 是桌面机 headless 数据，不代表手机。
- 音效听感：合成音只验证了触发时机与开关，未人耳评估。
- AC8「换关」中途：浏览器内只演练了演出中重试与回准备（与换关同走 `ready()` 路径）；未单独在演出中切换关卡。
- AC8「旋转屏幕」：浏览器内未在演出中改变视口；由单元测试「中途 resize(1.6) 后按新尺寸恢复取景（位置与朝向）」覆盖。
- 平衡：调参依据是确定性网格模拟与机器人，不是大样本真人试玩；旋转/爆发是否「好用但不过强」需要真人体验。
- iOS 后台返回音频 `interrupted` 的旧问题未处理（与本轮无关）。

## 7. Remaining risks

- 旋转曲率 0.06 是对设计默认值 0.035 的 1.7 倍调整，若用户认为超出「小幅」，可改回或取 0.08 更强版本（只改 `SKILLS.spin.curve`，绕位测试需重新取案例）。
- 爆发在后段关卡进球率（22–35%）明显高于普通回击（4–13%），由 100 能量门槛约束；若真人攒能过快可能偏强。
- 门线穿越插值对普通球同样生效，改变了极少数擦柱球的判定（更准确），可能与上一轮手感有细微差异。
- 已修复且有回归测试：爆发镜头时间线最初按比例而非按秒计算（特写提前结束、出手瞬间为普通视角）；特写机位最初过近导致人物出框。
