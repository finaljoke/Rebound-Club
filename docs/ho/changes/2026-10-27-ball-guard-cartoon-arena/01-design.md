# 卡通动感竞技风：正式游戏画面改造，装备只保留拳套

## Background and goal

用户玩下来不喜欢原来的美术方向（米色低对比的潮玩积木风），具体抱怨是「玩家以及防守动作很木讷，缺乏灵性」，希望「场景 + 人物都精美一点」，成为一个合格的游戏产品。

2026-10-27 在 `spike/cartoon-arena` 分支做了一个一次性样板页 `dist/spike.html`，内容包括：夜场球场、带骨骼动画的占位角色、卡通着色加描边、击中特效、飞扑与进球演出。用户玩过后说「玩下来挺可以的，这种感觉才对」。

本次改造要把样板验证过的画面和动作接进正式游戏：

- 对局里的规则、判定、关卡、操作手感一律不变，只换画面层和界面皮肤。
- 装备只保留拳套，移除球拍和剑。

完成后，玩家在同一套玩法里看到的应该是夜场竞技氛围、会呼吸会看球的角色、有分量的出拳和飞扑，以及配套的深色界面。

## Confirmed decisions

都是用户在 2026-10-27 的对话里确认的：

1. 美术方向选「卡通动感竞技风」，不保留潮玩风，也不做写实风。参考对象是 Lethal League、Windjammers 2、马力欧激战前锋。
2. 动作要用带骨骼的角色加动画片段，再叠一层程序化动作，替换现在由积木零件拼成的人物。
3. 样板（`spike/cartoon-arena` 分支，提交 `f44e8e5`）的效果得到认可：「这种感觉才对」。
4. 装备只保留拳套：「我认为就只保留拳套就行了」。
5. 现在先用 KayKit Adventurers（CC0）做占位角色。正式角色以后由用户走「GPT 画设定图 → 图片转 3D → Mixamo 绑骨骼和动作」的流程提供，所以角色接口要能直接换模型。
6. 沿用这个项目的规矩：不部署、不发布；合并 main 要用户明确同意；不放宽或删除测试来掩盖问题，改旧断言要说明理由；所有面向用户的文字用简体中文。

## Open questions

none。

方案里有几处是设计者的取舍，不是用户逐项定的，都在下面「Proposed design and trade-offs」里标了 **【设计者决定】**，请在批准时一并过目。最值得看的是第 1 条：对局中不移植样板的推镜头。

## Non-goals

- 不制作正式角色模型，也不接入 Mixamo 守门员专用动作。这次只做好可以换模型的接口和打包流程，占位角色继续用 KayKit。
- 不改任何规则和数值：球速、门将 AI、技能、关卡、教学、计分、顿帧时长都不动。拳套的参数（`width/reach/windup/active/recovery/whiff`）原样保留。
- 不加新玩法，不做背景音乐和每日挑战。
- 不重画 2D 兼容画面（无 WebGL2 时的回退），只删掉其中球拍和剑的绘制分支。
- 不动网球分支 `feat/rally-prototype`，不合并样板分支 `spike/cartoon-arena`（它只作参照，最后可以由用户决定删除）。
- 不部署，不生成发布包。按项目规矩，`build-release.mjs` 和 `release-qa.mjs` 只在本地跑一遍做验证。
- 不改微信小游戏相关内容。

## Current state with evidence

项目路径：`C:\Users\HUFAN\.codex\visualizations\2026\10\14\01a1384a-37ae-7441-83d7-0fcd547b7a67\sites\ball-guard`。以下事实基于 main `fcac352`（2026-10-27 读取，工作区当时干净）。

**画面层接口**

- `dist/game.js:197` 调用 `create3DRenderer(canvas)`，失败时 `fallbackRenderer()` 退回 2D；`webglcontextlost` 也会退回 2D。
- `dist/scene3d.mjs:588` 的 `create3DRenderer` 返回 `{quality, render(state,axis,reduceMotion,shake), dispose}`。其中 `render` 内部调用 `world.update(...)`、`world.shake(...)`、`renderer.render(...)`。
- `dist/scene3d.mjs:8` 的 `buildWorld()` 是同步函数，返回 `{scene,camera,sun,hero,keeper,farGoal,nearGoal,ball,platform,gear,zone,aim,target,reachBar,fx,spinArc,burstEdges,chargeRing,burstFx,trail,wallFx,crowd,sign,cine,goalCam,goalCamPose,update,project,resize,shake}`。
- 质量分档：`QUALITY_TIERS`（`scene3d.mjs:578`）按持续掉帧逐级降低像素比和阴影贴图，阴影来自 `world.sun`。

**人物现状**

- 两个人物都由 `art.mjs` 的 `buildAthlete` 用圆角方块拼成，用 `mergeRigidParts` 合并零件（`scene3d.mjs:134-153`）。
- 主角走路是两条腿按正弦摆动：`legs.forEach(... Math.sin(s.elapsed*16+i*Math.PI)*.48)`，见 `scene3d.mjs:400`。
- 出拳按规则层的挥击时间计算：`punch=Math.sin(Math.min(1,sw.time/(w.windup+w.active))*Math.PI)`，见 `scene3d.mjs:402`。打左手还是右手由 `punchLeft=s.ball.x<s.player.x-.08` 决定，见 `scene3d.mjs:403`。
- 拳套的挥击参数：起手 0.03 秒、判定 0.12 秒、收招 0.14 秒（`core.mjs:17`）。所以出拳动画不能有可见的预备动作，按下的瞬间就要接近出拳姿态。
- 门将飞扑是一条完整的时间线：`trackDive`、`poseKeeper`、`aimArms`、`keeperReach`、`beatenDive`、`saveStretch`（`scene3d.mjs:275-337`）。提前 0.24 秒起跳，近身、边缘、全力三档，双手瞄准触球点，侧身落地后起身。`tests/keeper-dive.test.mjs` 有 5 条测试覆盖这些行为。
- 门将准备姿态：球飞向球门时下蹲前倾（`keeperReady`，`scene3d.mjs:418-420`）。

**装备的分布**

- `core.mjs:16-20` 定义 `WEAPONS`，三项分别是 glove、racket、sword。`createGame(level,weapon='glove')` 遇到无效装备会退回 glove（`core.mjs:78`）。装备不写进存档：`storage.mjs` 里没有 weapon 字段，`game.js:20` 只是会话变量。
- 大厅：`index.html:46` 有「上场装备」按钮（`data-action="choose-gear"`），`index.html:57` 有装备列表 `#weapons` 和 `#weapon-note`。`game.js:100-109` 负责渲染装备列表、写解锁提示「完成第一关，解锁球拍和剑。」、显示当前装备图标和名字。
- 结算页：`game.js:136` 第一关通关时副标题写「新装备就位：球拍与剑」。
- 手感：`ui.mjs:35-38` 的 `gearFeel` 定义三种装备的击中闪光、颜色和音效；`ui.mjs:25-26` 有球拍和剑的图标。
- 2D 回退：`game.js:298-320` 按装备分支绘制。
- 3D 装备：`scene3d.mjs:142-150` 构建 `gear.glove/racket/sword`；`scene3d.mjs:213` 起按装备区分击中闪光。
- 测试和脚本里的引用：`tests/scene3d.test.mjs:21-24`（「球拍和剑替换持有装备」）、`scene3d.test.mjs:50-62`（遍历三种装备）、`tests/camera-fx.test.mjs:33`（遍历三种装备）、`tests/perf.test.mjs:49-50`、`tests/core.test.mjs:21`（「六关各装备……都能通关」）、`scripts/ui-qa.mjs:37,112-114`、`scripts/lobby-qa.mjs:38`、`scripts/art-qa.mjs:34-35`。`scripts/browser-qa.mjs:113` 也有引用，但 README 已注明该脚本「是旧版规则的脚本，已不适用」。

**测试约束（Node 里直接构建场景图）**

- 有 9 个测试文件 `import {buildWorld} from '../dist/scene3d.mjs'`，一共约 35 处调用 `buildWorld()`，然后读取上面那些返回字段，以及 `jersey-body`、`jersey-number`、`glove-body`、`post-left`、`post-right`、`spectators` 这几个对象名。
- `tests/perf.test.mjs:18-19`：每种状态下可见物体 ≤100、投影物体 ≤50。
- `scripts/perf-qa.mjs:24`：浏览器里大厅、对局、横屏三种情况的绘制调用都 ≤110。
- `tests/camera-fx.test.mjs` 有两条规则：「镜头只随画面尺寸变化，对局中移动、击球不推拉镜头」，以及「连续渲染更新不新建物体、几何体或材质」。
- `tests/scene-p2.test.mjs`：暂停时整个画面静止。`tests/crowd.test.mjs`：减少动态效果时观众不动。

**加载与发布**

- 启动遮罩：`index.html:19`（「正在载入球场…」「首次打开约需下载 1 MB」），由 `game.js:420` 在接线完成后撤掉。
- 发布：`scripts/build-release.mjs` 会把 `dist/` 下所有文件复制进发布包，写进 `sw.js` 的离线缓存清单，并检查所有相对导入都能解析。因此 `dist/` 里不能留样板文件，新增的 `.glb` 会自动被缓存。
- vendor 约定：`dist/vendor/RoundedBoxGeometry.js` 把 three 改成相对导入 `./three.module.min.js`，不用 importmap。

**样板分支的已验证内容**（`spike/cartoon-arena`，`f44e8e5`）

- `dist/spike/actors.mjs`：加载 GLB；运行时按色相换衣服和头发颜色；卡通着色（`MeshToonMaterial` 加轮廓光）；描边用反向外壳，法线取平均以免硬边裂开；用 `measureReach` 实测动画里拳头最靠前的时刻；头和胸跟球转动（每帧先恢复动画原姿态，否则没有关键帧的骨骼会越转越多）；挤压回弹；贴地修正（侧扑时大头不会陷进地面）。
- `dist/spike/arena.mjs`：星空渐变、灯光塔加光柱、滚动 LED 广告板、三面看台、实例化观众、可鼓起的球网。
- `dist/spike/fx.mjs`：闪光、冲击环、火花、彩带、丝带拖尾。注意这些都是每次击中时新建对象，不符合现有的「不新建对象」测试。
- GLTFLoader 会把骨骼名里的点号去掉：`hand.l` 变成 `handl`。
- 实测 GLB 体积：每个角色 3.5MB，其中 JSON 头 1.9MB、动作数据 1.3MB，几何体只有约 0.25MB。只保留约 10 个动作并去掉武器挂件后，估计约 0.6MB。
- 已验证在 Node 24 里，把 GLB 的贴图去掉后，`GLTFLoader.parse` 能解析出 76 个动作、6 块蒙皮网格、41 根骨骼，按动画采样能得到手的世界坐标。验证脚本在设计者本机的临时目录里，没有提交。

## Proposed design and trade-offs

### 总体做法：在现有画面层上换皮，保持接口不变

`buildWorld` 的返回字段、`create3DRenderer` 的 `render/dispose/quality`、所有与规则绑定的提示（击球框、甜点带、方向箭头、路线终点、旋转弧线、爆发特写、进球特写、撞墙冲击圈）都保留。这次替换四样东西：人物、环境、材质与特效、界面皮肤。

【否决】按样板重写一个新的 scene 模块。原因：现有的提示和演出有 60KB 代码、几十条测试，都和规则判定一一对应。重写等于把可读性相关的工作重做一遍，风险远大于收益。

### A. 装备只保留拳套

- `core.mjs`：`WEAPONS` 只留 `glove`，参数一字不改。其余引用 `WEAPONS[s.weapon]` 的代码保持原样，`createGame` 遇到 racket 或 sword 继续退回 glove。
- 【设计者决定】保留 `weapon` 字段和 `WEAPONS` 结构，不把拳套参数内联进规则。这样改动最小，以后想加外观类装备也有地方挂。
- 大厅去掉「上场装备」按钮和装备对话框里的装备部分。关卡选择对话框不变。
- 【设计者决定】第一关通关不再给新奖励，结算页副标题去掉「新装备就位」那一支，回到正常的胜利文案。以后可以考虑拳套配色之类的外观奖励，本次不做。
- `ui.mjs` 删掉 racket 和 sword 的手感与图标；`game.js` 删掉 2D 里的球拍和剑绘制、装备列表渲染和点击处理；`scene3d.mjs` 删掉 `gear.racket/sword`。
- `gear` 字段改成 `{glove}`，保留这个字段名，避免测试大面积改名。

### B. 角色资源与加载

**资源打包**

- 新增 `scripts/pack-characters.mjs`，不引入任何依赖。它从 `vendor-download/`（已被 gitignore）读取原始 GLB，然后：
  - 只保留角色配置里列出的动作片段；
  - 去掉不可见的挂件网格（武器、披风、帽子）；
  - 把剩下的缓冲区压实；
  - 输出到 `dist/models/striker.glb` 和 `dist/models/keeper.glb`，同时复制 KayKit 授权文件。
- 原始包的来源要写在脚本注释里：`https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0`，提交 `672074b73ba276876a19e8816ecdc5241817ab47`。主角用 `Rogue.glb`，门将用 `Barbarian.glb`。
- 【否决】用 gltf-transform 处理。它会给一个「无需安装依赖」的项目引入 npm 依赖。

**角色配置**

新增 `dist/characters.mjs`，导出 `CHARACTERS`。每个角色一项，包含：

- `url`、身高、朝向；
- 换色规则（衣服换成队色，头发压暗）；
- 背号；
- 手套颜色和尺寸；
- **动作映射表**：逻辑名 → 片段名。主角需要 `idle`、`strafeLeft`、`strafeRight`、`punchLeft`、`punchRight`、`cheer`、`hurt`；门将需要 `idle`、`strafeLeft`、`strafeRight`、`diveLeft`、`diveRight`、`block`、`cheer`、`hurt`。

以后换成 Mixamo 角色时，只改这个配置和打包脚本，画面代码不动。片段名映射是换模型的唯一接口。

**角色模块**

新增 `dist/actor.mjs`，把样板 `actors.mjs` 的已验证做法正式化：

- 加载时把同一角色的多块蒙皮网格合并成一个 `SkinnedMesh`（它们共用同一套骨架和材质），再配一层描边外壳。这样每个角色只占 2 次绘制，加上手套。
- 卡通着色加轮廓光，换色在运行时完成。
- 背号贴在胸骨上，对象名沿用 `jersey-number`；合并后的身体网格命名为 `jersey-body`，手套本体命名为 `glove-body`，测试按名字查找不受影响。
- 手套沿用 `art.mjs` 的 `buildGlove`，换成卡通材质，挂到 `handl` 和 `handr` 骨骼上。

**动作由状态采样，不自由播放**

样板里动作是靠 mixer 自己往前播的。正式版每帧根据规则状态和场景时钟，算出每个动作层该在哪一帧、权重多少，然后 `mixer.update(0)` 统一求一次姿态。好处有三个：

1. 暂停时画面自然冻结，满足 `scene-p2` 的「暂停全静止」要求；
2. 测试结果可重复；
3. 出拳严格贴合规则层的挥击时间。

各层的计算方式：

- **待机**：按场景时钟循环。
- **横移**：按 `axis` 和实际速度混合左右横移片段，循环相位用 `s.elapsed`。
- **出拳**：按 `s.swing.time` 映射到片段时间。`[0, windup]` 从「出拳时刻前约 0.1 秒」快速推到出拳时刻，判定期间停在出拳姿态附近，收招时播完随势动作。左右手沿用现有 `punchLeft` 规则选择。出拳时刻在加载时用 `measureReach` 实测，不手填。
- **庆祝和受挫**：主角在 `goal` 事件播庆祝，在 `miss`（漏球）播受挫；门将在被进球时播受挫。触发时间记在场景时钟上，从而和暂停联动。
- **程序化层**：头和胸跟球（每帧先恢复动画原姿态再叠加），移动时倾身，击中和落地时挤压回弹（减少动态效果时关闭），最后做贴地修正。

**门将飞扑**

保留现有的 `trackDive`、`keeperReach`、`beatenDive`、`saveStretch` 时间线和全部判断，只替换最终姿态的输出：

- `poseKeeper` 原来输出身体倾倒和胯部下沉，改为驱动角色的翻滚轴（以胯部为支点）和下沉量；
- 飞扑片段 `diveLeft/diveRight` 按扑救幅度 `a` 采样；
- `aimArms` 改为对上臂和前臂做两段骨骼的反向运动学，让双手朝目标点伸，权重沿用现有的 `w`；
- 起身期间按 `land` 回到准备姿态；
- `keeperReach` 要改为在骨骼角色上实测，因为「门将够不着时指尖差一点」的分档依赖这个数据；
- 贴地修正保证头、手套、胯部都不低于地面。

### C. 夜场球场

- **天空和雾**：星空渐变天空球，雾色用深海军蓝；天空不受雾影响。
- **灯光塔**：四座灯塔，带发光面、加法混合的光晕精灵和淡淡的光柱。这些都没有投影，不增加阴影绘制。
- **主光**：沿用 `world.sun` 这个名字，作为模拟灯光的主方向光，继续负责投影，质量分档照常工作。另加冷色轮廓光（不投影）和暖色补光。
- **场地**：草皮改成高饱和条纹绿，场地中央有一圈亮光，四周压暗，把视线收到中间。
- 【设计者决定】草皮颜色不再随关卡变化。原来 `s.level.color` 用来给草皮着色，现在改为给 LED 广告板的强调色和轮廓光着色。夜场里草皮变色会显得脏，LED 变色则一眼能看出换关了。
- **侧墙和远端**：换成深色墙体，上面是 LED 广告板。广告内容按场景时钟滚动，暂停时停，减少动态效果时不滚动。
- **看台和观众**：看台改成深色阶梯。观众继续用 `crowd.mjs` 的实例化批次（对象名 `spectators`、座位表、进球欢呼、暂停冻结、减少动态效果时静止都保留），只换成卡通材质和高饱和队服配色。
- **招牌**：`sign` 和它的摆放规则（`placeSign`：竖屏挂在门将头顶上方，横屏不挂）保留，外观改成发光灯牌。
- **球门**：门柱和横梁换成发光白，对象名 `post-left/post-right` 保留；远端球网沿用现有的鼓起逻辑。近端球门继续半透明。
- **静态场景**：仍然在构建时按材质合并（`mergeRigidParts` 的思路），控制绘制次数。

### D. 球、特效、镜头

- **球**：卡通着色加描边，尺寸不变；重炮外观、滚动、侧旋、拉伸都保留，只调颜色。
- **击中特效**：只留拳套这一套。在现有闪光基础上加入样板的冲击环、火花、光晕。全部在构建时一次性建好放进对象池，每帧只改位置、缩放和透明度，满足「连续渲染不新建对象」。完美击球更大更亮，沿用 `hitFeel` 的强度。
- **进球彩带**：一个实例化批次，构建时建好，进球时复用；减少动态效果时不放。
- **拖尾**：保留现有的环形缓冲和「随球速变亮变粗」，外观换成加法混合的暖色丝带。
- **镜头**：取景规则 `resize()`、震动、关键球进球特写 `goalCam` 全部保留。
- 【设计者决定】对局中**不移植**样板的「击球后推向球门」镜头。样板每球结束就重新开球，推镜头没有代价；正式玩法是一颗球反复来回，门将扑住后球会立刻弹回，镜头若在推进中，玩家就看不清回球和自己的位置。现有测试也明确要求对局中不推拉镜头。进球时的戏剧感由现有的关键球特写（慢动作、跟球机位）和普通进球的轻微推近承担，换上新场景和新特效后会比原来更明显。如果用户更想要样板的推镜头，这是一个独立的小改动，可以另外加。

### E. 加载流程

- `buildWorld(assets)` 改为接收已加载好的角色资源，仍然是同步函数。
- `create3DRenderer(canvas)` 立即返回，多一个 `ready` 字段（一个 Promise）。它负责加载两个 GLB，加载完成后才构建场景；完成前 `render` 什么都不画。
- `game.js` 在 3D 模式下等 `ready` 完成再撤启动遮罩。加载失败就调用 `fallbackRenderer()`，退回 2D 继续玩，并在反馈区说明「已切换兼容画面」。
- 启动遮罩的说明文字按实际下载量更新，例如「首次打开约需下载 2 MB」，数字按打包后的实际总量写。
- 测试新增 `tests/helpers/characters.mjs`：用 fs 读取 `dist/models/*.glb`，去掉贴图后交给 `GLTFLoader.parse`（Node 没有图片解码器），返回可以传给 `buildWorld` 的资源。现有测试统一改成 `buildWorld(await loadCharacters())`。这是机械替换，断言不变。
- vendor 方面：从 three@0.180.0 取 `GLTFLoader.js` 和 `BufferGeometryUtils.js`，放到 `dist/vendor/` 下，把 three 的导入改成 `./three.module.min.js`（沿用 RoundedBoxGeometry 的做法），和 MIT 授权放在一起。

### F. 界面皮肤

配色改成深海军蓝底、橙色主按钮、青色和金色点缀；标题和判定字用粗斜体加深色描边（参照样板的「进球！」字样）。范围包括：

- 启动遮罩
- 大厅（`lobby.css`）
- 对局 HUD 与浮动提示
- 暂停和帮助对话框
- 关卡选择对话框
- 结算页
- 分享战绩图的配色（`share.mjs`）
- `manifest.webmanifest` 的 `theme_color` 和 `background_color`

布局、按钮位置和交互不变；现有各屏幕尺寸的布局规则保留，只换颜色和字体样式。帮助对话框里提到装备的文案一并更新。

### G. 收尾

- README 更新三处：美术方向、角色资源与打包流程、只保留拳套。
- `scripts/art-qa.mjs` 改为输出两个新角色的近景，不再是三种装备的对照图。
- `spike.html` 和 `spike/` 不进入这个分支，不出现在 `dist/` 里。

## Files in scope

**修改**

- `dist/core.mjs`：只允许改 `WEAPONS` 表及其注释
- `dist/scene3d.mjs`
- `dist/art.mjs`：退役 `buildAthlete`；保留并改造 `buildGlove`；`makeSurfaceTexture`、`netGeometry`、`mergeRigidParts` 按需保留
- `dist/crowd.mjs`：只改材质和配色
- `dist/game.js`
- `dist/ui.mjs`
- `dist/share.mjs`：只改配色
- `dist/index.html`、`dist/styles.css`、`dist/lobby.css`、`dist/manifest.webmanifest`
- `tests/` 下涉及 `buildWorld` 或装备的文件：`scene3d`、`perf`、`scene-p2`、`crowd`、`goal-cam`、`keeper-dive`、`camera-fx`、`motion`、`art`、`core`，以及其他按名字引用 racket 或 sword 的测试
- `scripts/ui-qa.mjs`、`scripts/lobby-qa.mjs`、`scripts/art-qa.mjs`、`scripts/perf-qa.mjs`（只在必要时调整等待加载的逻辑，预算数字不改）
- `README.md`

**新增**

- `dist/actor.mjs`
- `dist/characters.mjs`
- `dist/models/striker.glb`、`dist/models/keeper.glb`、`dist/models/KAYKIT-LICENSE.txt`
- `dist/vendor/GLTFLoader.js`、`dist/vendor/BufferGeometryUtils.js`
- `scripts/pack-characters.mjs`
- `scripts/arena-qa.mjs`
- `tests/helpers/characters.mjs`
- `tests/actor.test.mjs`
- `tests/weapons.test.mjs`：也可以把这部分断言并入 `core.test.mjs`

**不得修改**

- `dist/core.mjs` 中 `WEAPONS` 以外的任何内容
- `dist/input.mjs`、`dist/storage.mjs`
- `scripts/release/*`、`scripts/build-release.mjs`、`scripts/release-qa.mjs`
- `.openai/hosting.json`

## Ordered tasks

每个阶段结束都跑完整的 `npm test`，然后在分支上单独提交一次。分支从 main 新开，建议命名 `feat/cartoon-arena`。

1. **开工检查**：`git status`，确认没有别人未提交的改动；从 main 新建分支。
2. **装备只留拳套（A）**：
   - 改 `core.mjs` 的 `WEAPONS`、`ui.mjs`、`game.js`、`index.html`、`scene3d.mjs` 里的装备分支；
   - 调整 `ui-qa`、`lobby-qa`；
   - 删除或改写只针对球拍和剑的测试，每一条都在提交说明里写清理由；
   - 新增测试：`createGame(0,'racket').weapon==='glove'`，`createGame(0,'sword').weapon==='glove'`。
3. **vendor 和资源（B 的前半部分）**：放入 GLTFLoader 和 BufferGeometryUtils；写 `pack-characters.mjs`，生成两个 GLB 和授权文件；写 `tests/helpers/characters.mjs`。
4. **加载流程（E）**：`create3DRenderer` 增加 `ready`，`buildWorld(assets)`；`game.js` 等 `ready` 再撤遮罩，失败退回 2D；把测试里的 `buildWorld()` 机械替换为 `buildWorld(await loadCharacters())`。这一步人物还是旧的积木人，先保证加载链路和所有测试都通。
5. **角色模块（B 的后半部分）**：写 `actor.mjs` 和 `characters.mjs`，包括合并网格、描边、换色、背号、手套，以及按状态采样的各层动作；新增 `tests/actor.test.mjs`。
6. **主角接入**：在 `scene3d.mjs` 里用新角色替换 `buildAthlete` 的主角，出拳按 `s.swing.time` 采样，接上待机、横移、庆祝和受挫。
7. **门将接入**：换成新角色；把 `trackDive` 的输出接到翻滚、下沉、飞扑片段和双臂反向运动学；在骨骼角色上重新实测 `keeperReach`；加贴地修正。`keeper-dive` 的 5 条测试的断言含义不得改变。
8. **夜场环境（C）**：天空、灯塔、主光和辅光、草皮、LED 墙、看台、观众配色、招牌、球门；静态部分合并；关卡颜色改为驱动 LED 和轮廓光。
9. **球、特效、拖尾、彩带（D）**：全部预先建好放入对象池；保留现有镜头规则。
10. **性能核对**：跑 `perf.test` 和 `node scripts/perf-qa.mjs`。如果超预算，先合并和削减特效，不改预算数字。
11. **界面皮肤（F）**：启动遮罩、大厅、HUD、对话框、结算页、分享图、manifest；更新启动遮罩的下载量文案。
12. **验收脚本**：
    - 新增 `scripts/arena-qa.mjs`，做两件事：
      1. 竖屏 390×844 和横屏 844×390 各截取大厅、对局、进球三张图，输出到 `artifacts/arena/`；
      2. 拦截 `*.glb` 请求，确认退回 2D、遮罩撤掉、能开始对局。
    - 改造 `art-qa.mjs`。
13. **收尾（G）**：更新 README；完整跑一遍下面的验收表；写 `02-implementation.md`，包括实际改动、偏离设计的地方、测试改动清单及理由。

## Acceptance criteria

| # | Action | Expected observable result | How to verify |
|---|---|---|---|
| AC1 | 跑 `npm test` | 全部通过，0 fail | 命令输出 |
| AC2 | `git diff main -- dist/core.mjs` | 只有 `WEAPONS` 去掉 racket 和 sword 两项，以及相关注释；glove 一行完全相同 | 读 diff |
| AC3 | 在 Node 里调用 `createGame(0,'racket')` 和 `createGame(0,'sword')` | 两者的 `.weapon` 都是 `'glove'` | 新增单测 |
| AC4 | 在 `dist/index.html`、`dist/game.js`、`dist/ui.mjs`、`dist/scene3d.mjs` 里搜索 `racket\|sword\|球拍\|choose-gear\|weapon-note` | 0 处匹配 | `git grep -n -E "racket\|sword\|球拍\|choose-gear\|weapon-note" -- dist` |
| AC5 | 在 main 和分支上分别跑 `node scripts/keeper-balance.mjs`，对比输出 | 拳套部分的数字完全一致（证明规则没变） | 两次输出 diff |
| AC6 | 跑 `node scripts/pack-characters.mjs` | 生成 `dist/models/striker.glb` 和 `keeper.glb`，每个 ≤ 800 KB；`dist/models/KAYKIT-LICENSE.txt` 存在 | `ls -l dist/models` |
| AC7 | 用 `tests/helpers/characters.mjs` 加载两个角色，再调用 `buildWorld(assets)` | 每个角色恰好有 1 个身体蒙皮网格（对象名 `jersey-body`），且有 `jersey-number` 和 `glove-body` | `tests/actor.test.mjs` |
| AC8 | 新建对局并按住挥击，使 `s.swing.time` 等于 `WEAPONS.glove.windup` | 出拳那只手的前伸量 ≥ 该片段实测最大前伸量的 80% | `tests/actor.test.mjs` |
| AC9 | 让门将完成一次全力飞扑，从起跳到起身逐帧检查 | 头部下沿、两只手套、胯部的世界高度在每一帧都 ≥ 0 | `tests/actor.test.mjs` |
| AC10 | 跑 `tests/keeper-dive.test.mjs` | 5 条测试全部通过，测试名和断言含义与 main 相同（只允许改对象查找方式） | 命令输出，加上对比该文件的 diff |
| AC11 | 暂停对局后，用不同的时间参数连续调用两次 `w.update` | 两次之间所有骨骼的四元数、观众矩阵、LED 贴图偏移都不变 | `tests/scene-p2.test.mjs`（扩展） |
| AC12 | 在 `reduceMotion=true` 下连续更新 | 观众不动，LED 不滚动，不出现彩带，角色不做挤压回弹 | `tests/crowd.test.mjs` 和 `tests/actor.test.mjs` |
| AC13 | 连续渲染 300 帧，期间包含击中、进球、扑救 | `renderer.info.memory` 的几何体数和贴图数不增长；场景对象总数不增长 | `tests/camera-fx.test.mjs`（现有用例保留并通过） |
| AC14 | 跑 `tests/perf.test.mjs` | 可见物体 ≤100，投影物体 ≤50，阈值与 main 相同 | 命令输出 |
| AC15 | 跑 `node scripts/perf-qa.mjs` | 大厅、对局、横屏的绘制调用都 ≤110 | 输出 PASS |
| AC16 | 跑 `node scripts/arena-qa.mjs` | 输出 6 张截图（两种屏幕各大厅、对局、进球）；拦截 `.glb` 后画布 `data-renderer` 为 `2d`，启动遮罩已撤，能进入对局 | 输出 PASS，查看 `artifacts/arena/` |
| AC17 | 跑 `node scripts/ui-qa.mjs --play`、`lobby-qa`、`control-qa`、`skill-qa`、`audio-qa`、`desktop-qa`、`shell-qa`、`crowd-qa` | 全部 PASS | 命令输出 |
| AC18 | 跑 `node scripts/build-release.mjs`，再跑 `node scripts/release-qa.mjs release/<包名>` | 打包成功；离线缓存包含两个 `.glb`；release-qa 输出 PASS；发布包里没有 `spike` 字样的文件 | 命令输出和包内文件列表；本地验证完就删除，不上传 |
| AC19 | 打开 `http://localhost:4173/`，竖屏玩第 1 关 | 夜场环境；主角是骨骼角色，打出橙色拳套；门将会侧扑；进球有彩带和观众欢呼；界面是深色配色 | `arena-qa` 截图，加上用户本人试玩确认 |
| AC20 | 查看 `dist/` 下的文件 | 没有 `spike.html`、`spike/`，也没有 `vendor/loaders/`、`vendor/utils/` 这两个样板目录 | `ls dist dist/vendor` |

## Risks and approval boundaries

**必须先问用户的情况**

- 任何需要改 `core.mjs` 中 `WEAPONS` 以外规则的情况。
- 任何需要放宽现有断言才能通过的情况，比如提高绘制预算，或改变 `keeper-dive`、`goal-cam` 断言的含义。遇到就停下来问。
- 角色 GLB 打包后超过 800 KB，或者 `perf-qa` 超过 110 次绘制、削减后仍降不下来。
- 合并到 main、部署、生成正式发布包。

**已知风险**

- **低端手机性能。** 两个蒙皮角色、描边和更多特效，在中低端安卓上的帧率没有实测过；`perf-qa` 只覆盖桌面 Chrome。建议合并前用户在自己的手机上试玩，质量分档会自动降级兜底。
- **出拳起手只有 0.03 秒。** 动作片段的预备段必须压得很短，否则手跟不上判定。AC8 专门检查这一点。
- **占位角色比例偏大头。** 正式角色目标头身比约 1:3.5。换模型以后要重跑 `keeperReach` 实测和 `arena-qa`。
- **测试改动量大。** 约 35 处 `buildWorld()` 要改成传入资源，并且要改成异步加载。这是机械改动，但实现者必须在 `02-implementation.md` 里列出每个被修改或删除的断言及理由。
- **多人协作。** 用户也会让 Codex 改代码。开工和每次提交前都要看 `git status`；别人未提交的改动不覆盖、不重置，也不替他提交。
- **样板分支保留作参照。** 不合并 `spike/cartoon-arena`；是否删除由用户决定。

## Amendments

### 第 1 轮补充（2026-10-27，实现过程中）

**用户反馈原话**：看过样板页后说「继续开工 我挺喜欢这一版本的 人物大小和视角方向 击打感觉 和 球的状态 拖尾 特效之类的」，随后又说「球速也可以保持样例的那种速度」。

**确认的问题与用户选择**（选择题，用户原选项文字）：

1. 镜头距离 →「拉近到样板那样（推荐）」：人物在屏幕上约放大 1.4 倍；主角那一排左右侧墙允许出画；镜头随主角左右轻移，保证主角不出画；相应修改 2 条取景测试。
2. 射门推镜头 →「只在进球时推近（推荐，现状）」：维持设计者决定 1，不改。
3. 球速 →「整体提速约 1.5 倍并重调门将（推荐）」：所有关卡来球与射门同比加快，难度梯度不变；重调门将参数使各关进球率与现在接近；教学保持慢速；所有平衡测试仍须通过。
4. 顿帧 →「每次击中都停约 0.05 秒（推荐）」：普通击中也有约 0.05 秒顿帧，重炮与进球仍更长。

**因此设计上的变化**：

- Non-goals 中「不改任何规则和数值……顿帧时长都不动」改为：允许按第 3、4 项修改球速、门将参数与普通击中顿帧，其余规则不动；所有平衡类测试的断言含义不得放宽。
- 球、拖尾、击中特效按样板的观感实现（奶白底波浪纹球、沿飞行拉伸、连续光带、击中镜头前冲），见实现报告。
- Files in scope 增加 `dist/vendor/SkeletonUtils.js`（克隆骨架，使加载一次的资源可构建多个场景；实现中发现的需要）。

**由上述选择带来的验收标准调整**（实现者按用户答复改写，供复审核对）：

- AC2 改为：`git diff main -- dist/core.mjs` 只包含 `WEAPONS` 去掉球拍和剑、`PACE` 统一提速（`LEVELS` 加载时换算、发球横向速度、爆发上限、`RUN`、`GRAVITY` 基准）、第 5 关门将原始速度 1.5→1.45、普通击中顿帧 0.05，以及相关注释；拳套参数一字不改。
- AC5 改为：`node scripts/keeper-balance.mjs` 的第 3～6 关「无脑交替」「看空当」两项进球率，与 main 相差不超过 5 个百分点（对应用户说的「进球率与现在接近」）；其余指标如实列出差异。
- 取景测试的「主角那一排两侧墙入画」改为「主角走到两侧仍完整在画面内」；「对局中镜头不动」改为「只随主角横向平移，不推拉、不转向」。
