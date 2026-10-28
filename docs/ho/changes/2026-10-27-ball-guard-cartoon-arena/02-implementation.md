# 实现报告：卡通动感竞技风改造，装备只保留拳套

## Design and round reference

- 设计：`.ho/changes/2026-10-27-ball-guard-cartoon-arena/01-design.md`，第 1 轮。用户于 2026-10-27 批准（「ok 那就开工吧」），含 4 项设计者决定。
- 实现过程中用户追加的意见和 4 个选择，已写进设计文档的 Amendments「第 1 轮补充」，包括随之调整的 AC2、AC5 和两条取景测试。
- 分支：`feat/cartoon-arena`，基于 main `fcac352`，共 9 个提交（`6a1ede4` … `77f0608`）。未合并，未部署。

## Task completion table

| # | 任务 | 结果 | 提交 |
|---|---|---|---|
| 1 | 开工检查，新建分支 | 完成：工作区干净；记录了 40 个待改文件的 SHA-256 | — |
| 2 | 装备只留拳套（A） | 完成 | `6a1ede4` |
| 3 | vendor 与资源打包（B 前半） | 完成 | `1e0b370` |
| 4 | 异步加载流程（E），测试改为传入资源 | 完成 | `1e0b370` |
| 5 | 角色模块（B 后半） | 完成 | `1e0b370`、`2bd75a1` |
| 6 | 主角接入 | 完成 | `2bd75a1` |
| 7 | 门将接入 | 完成 | `2bd75a1` |
| 8 | 夜场环境（C） | 完成 | `833cb99` |
| 9 | 球、特效、拖尾、彩带（D） | 完成；按用户追加意见向样板看齐 | `02e35b5`、`1de5f94` |
| 10 | 性能核对 | 完成：对局 65 次绘制（上限 110） | — |
| 11 | 界面皮肤（F） | 完成 | `1de5f94` |
| 12 | 验收脚本 arena-qa，改写 art-qa | 完成 | `97be482` |
| 13 | README 与本报告 | 完成 | `77f0608` |
| 追加 | 用户选择：镜头拉近并随主角横移、提速 1.5 倍并重调门将、每次击中顿帧 0.05 秒 | 完成 | `df4d533` |

## Actual file changes

**规则层**

- `dist/core.mjs`：
  - `WEAPONS` 只留 `glove`，一字未改；
  - 新增 `PACE=1.5`，`LEVELS` 在声明处换算（`speed×PACE`，门将 `speed×PACE`、`delay÷PACE`）；
  - 发球横向速度 `.65×PACE`；`burst.maxSpeed` 为 `12.5×PACE`；新增 `RUN=6.2×PACE`；`GRAVITY` 按 `4×PACE` 的基准速度换算；
  - 第 5 关门将原始速度 1.5→1.45；普通击中 `hitstop` 为 0.05（完美击球 0.07 不变）；
  - 一句注释里的 racket 改为 glove。

**画面层**

- `dist/scene3d.mjs`：
  - 骨骼角色接入；门将姿态改为根节点倾倒加骨骼姿态，实测伸展表；
  - 夜场环境、LED、灯光塔、天空；
  - 卡通球（波浪纹、沿飞行拉伸）、光带拖尾、击中光晕/冲击环/火花、镜头前冲、进球彩带；
  - 取景去掉侧墙约束，镜头横向跟随（`FOLLOW=.4`）；
  - `create3DRenderer` 增加 `ready`，`buildWorld(assets)`；
  - 返回值新增 `actors`、`punch`、`led`、`confetti`、`cameraFollow`；删除装备分支。
- 新增 `dist/actor.mjs`、`dist/characters.mjs`、`dist/models/{striker,keeper}.glb`、`dist/models/KAYKIT-LICENSE.txt`。
- 新增 vendor：`dist/vendor/GLTFLoader.js`、`BufferGeometryUtils.js`、`SkeletonUtils.js`，来自 three@0.180.0，three 的导入改为相对路径。
- `dist/art.mjs`：删除 `buildAthlete`、贴花和头部形状（93 行）。
- `dist/crowd.mjs`：卡通材质，俱乐部配色。

**界面与其他前端文件**

- `dist/game.js`：删除装备列表、选择、2D 球拍/剑绘制、「新装备就位」文案、`string`/`blade` 音效；改为 3D 就绪后再撤启动遮罩，加载失败退回 2D。
- `dist/ui.mjs`：删除球拍/剑的图标与手感。
- `dist/index.html`：删除装备入口与装备对话框区域；`theme-color` 改深色；启动文案改为「约需下载 2 MB」。
- `dist/styles.css`、`dist/lobby.css`：末尾追加夜场覆盖层；删除装备相关规则。
- `dist/share.mjs`、`dist/manifest.webmanifest`：深色配色。

**脚本、测试、文档**

- 脚本：新增 `pack-characters.mjs`、`arena-qa.mjs`；重写 `art-qa.mjs`；`ui-qa.mjs`、`lobby-qa.mjs` 去掉装备步骤。
- 测试：新增 `tests/actor.test.mjs`（6 条）、`tests/helpers/characters.mjs`、`tests/helpers/framing.mjs`；修改的测试见下面的「测试改动清单」。
- `README.md`：已更新。
- 未修改：`input.mjs`、`storage.mjs`、`scripts/release/*`、`build-release.mjs`、`release-qa.mjs`、`.openai/hosting.json`。

## Deviations and reasons

1. **新增 `dist/vendor/SkeletonUtils.js`**（不在原文件清单内）。测试大多是同步函数，需要「加载一次资源、构建多个场景」，所以 `createActor` 要克隆骨架。设计文档的 Amendments 已补记。
2. **角色身高**：主角 2.0 米、门将 1.85 米，而不是设计初稿的 2.2 米。占位角色的胯部只在身高约 1/5 处，上身过长。门将再高的话，被晃过的全力飞扑要么倾斜不足 1.1（不像飞身），要么伸展超过 1.6 米、盖住球路，两者都违反 `keeper-dive` 测试。为此还把飞扑的胯部滑移设为 0（`HIP_SLIDE`）。这是表现参数，规则未动，阈值未改。
3. **姿态求值方式**：three.js 的混合器在骨骼值不变时不会写入。所以每帧先把骨骼恢复成上一帧的动画快照再求值，避免停在绑定姿势或累积程序化修改。实现细节，不影响设计。
4. **门将横移的判定**：从「目标点与站位不同」改为「两个模拟步之间实际有位移」。原条件下，测试里移动速度为 0 的门将会一直播横移动画。表现层判定，不改规则。
5. **修了一个既有界面 bug**：沉浸式对局里，教学提示条同时有 `top` 和 `bottom`，会被拉满整个画面（main 上也存在）。加了 `bottom:auto`。这超出「只改颜色」的范围，但属于修错。
6. **按用户追加意见做的改动**：样板式的球、光带、镜头前冲、取景、提速、顿帧，均已记入设计 Amendments。
7. **门将平衡**：第 4、6 关「老实提前按」上升约 12 个百分点（见验证结果）。我试过调高这两关的读招参数（`read` 0.7～1），结果没有变化，判断是提速后留给门将读招的时间变短了。按现状保留，请复审判断是否要进一步调整。

**测试改动清单（每条都有理由）**

| 文件 | 改动 | 理由 |
|---|---|---|
| core | 「六关各装备」→「六关拳套」，断言装备表为 `['glove']`；新增旧装备回退测试 | 球拍、剑已移除 |
| scene3d | 删除「球拍和剑替换持有装备」 | 同上 |
| scene3d | 删除「挥击全程肩袖连接球衣」 | 蒙皮网格没有可分离的零件，原测试会空跑 |
| scene3d | 取景测试：侧墙两点换成「主角走到两侧仍在画面内」 | 用户选择拉近镜头 |
| perf | 去掉切到球拍的步骤，保留拳套断言 | 球拍已移除 |
| camera-fx | 只测拳套闪光，「三种闪光不同」改为断言拳套是 burst | 球拍、剑已移除 |
| camera-fx | 「对局中镜头不动」改为「只横移，不推拉、不转向」；取景点同 scene3d | 用户选择 |
| feel | 「三种手感不同」改为断言拳套是 burst 加 punch；强度、寿命、动势断言保留 | 球拍、剑已移除 |
| art | 删除 `buildAthlete` 测试 | 函数已退役；「背号随胸口」由 actor.test 覆盖 |
| keeper-dive、motion | 蒙皮网格改用 `getVertexPosition` 取动画后的顶点；胸口和上身改读 `userData.chest/torso`；阈值未改 | 绑定姿势不等于画出来的姿势 |
| scene-p2 | 暂停快照加入两名球员的全部骨骼 | 补强 AC11 |
| motion | 弧线测试的速度字面量乘 `PACE` | 提速；含义不变（第 1 关发球弧顶 0.9） |
| tutorial | 普通发球速度改为 `hypot(.65×PACE, speed)` | 提速 |
| aim | 亮框内按住方向的帧数改为 `24/PACE` | 提速后让球行进的距离与原来相同 |
| skill-flow | 减少动态效果的爆发镜头测试，基准取自主角就位后的取景 | 横向跟随不是推镜头 |
| 9 个测试文件 | `buildWorld()` 改为 `buildWorld(assets)` | 设计要求的机械替换 |

## Verification commands and observed results

以下全部是本轮实际运行的结果。

| 命令 | 结果 |
|---|---|
| `npm test` | tests 163, pass 163, fail 0 |
| `node scripts/perf-qa.mjs` | PASS；大厅 62、对局 65、横屏 72 次绘制（上限 110） |
| `node scripts/ui-qa.mjs --play` | errors: []，参考模拟打通第 1 关，提速后仍可通关 |
| control-qa、skill-qa | errors: [] |
| audio-qa、desktop-qa、shell-qa | PASS |
| crowd-qa | 退出码 0 |
| lobby-qa | flows: passed |
| `node scripts/arena-qa.mjs` | PASS：竖屏、横屏都打进一球；拦截 `.glb` 后为 2d、遮罩已撤、可开局 |
| `node scripts/art-qa.mjs` | errors: []，实测出拳帧 0.5 秒 |
| `node scripts/pack-characters.mjs` | striker 3532KB→540KB，keeper 3529KB→503KB，各 7 个动作 |
| `ls -l dist/models` | keeper.glb 515140，striker.glb 552524，KAYKIT-LICENSE.txt 891 字节 |
| `git grep -n -E "racket\|sword\|球拍\|choose-gear\|weapon-note" -- dist` | 0 处匹配 |
| `node scripts/build-release.mjs` 后 `node scripts/release-qa.mjs release/rebound-club-2026-10-27-97be482` | PASS；30/30 个文件进入离线缓存（含两个 glb）；断网后以 3D 进入对局；发布包中 spike 匹配 0。验证后已删除该包 |
| `ls dist dist/vendor` | 没有 `spike.html`、`spike/`，也没有 `vendor/loaders`、`vendor/utils` |

**门将平衡（`node scripts/keeper-balance.mjs`，main → 本分支）**

| 关 | 无脑交替 | 看空当 | 骗门将 | 老实提前按 |
|---|---|---|---|---|
| 3 | 16% → 16% | 29% → 28% | 64% → 60% | 21% → 19% |
| 4 | 38% → 42% | 52% → 56% | 84% → 86% | 18% → 30% |
| 5 | 30% → 32% | 67% → 64% | 72% → 66% | 24% → 14% |
| 6 | 26% → 26% | 71% → 71% | 71% → 71% | 29% → 42% |

调整后的 AC5（「无脑交替」「看空当」差距不超过 5 个百分点）满足。

## Unverified items and reasons

- **AC19 的真人试玩部分**：要用户本人在手机上试玩确认手感、提速后的难度和画面，代码侧无法代替。`arena-qa` 的截图部分已完成。
- **中低端安卓的真机帧率**：本机只有桌面 Chrome，`perf-qa` 只测绘制次数，没有测真机帧率。
- **微信内置浏览器兼容性**：未验证，不在本次范围内。

## Remaining risks

- **提速 1.5 倍后的手感**：只经过机器人和平衡脚本验证，人的反应是否跟得上要靠试玩；`PACE` 一个常量就能回调。
- **门将尺寸**：比样板小约 10%，是为了让飞扑「指尖差一点够到」而做的折中。换成腿更长的正式角色后，需要重测 `keeperReach` 和取景。
- **下载量**：首次打开约 2.2MB，main 是 1MB；首屏会等模型加载完。
- **2D 兼容画面**：仍是旧风格（属于非目标）。
- **工作区换行符**：多个文件在工作区里是 LF；`core.autocrlf=true` 会在提交时统一处理，不影响仓库内容。
