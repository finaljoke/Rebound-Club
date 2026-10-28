# Round 1 implementation

## Design and round reference

设计：本目录01-design.md，第1轮。用户于2026-10-23在本对话明确回复“批准”。change.yaml已先从draft变更为ready_for_implementation，再进入implementing。

基线HEAD：69abec5f27ca686c932261f42de6a939cc1c7038。使用独立rally文件进行源码隔离，保留共享工作树里其他代理的未提交改动；没有提交、切换分支、发布或部署。

本地入口：http://localhost:4173/rally.html；最高点比较入口：http://localhost:4173/rally.html?power=apex 。

## Task completion table

| Task | Outcome |
|---|---|
| 1. 物理、判定、计分、发球与记录 | done：真实高度、连续碰撞时间，按设计C的顺序归属失分，交替发球、抢5、逐分事实记录 |
| 2. 合法球路与预测 | done：solveShot反解、净空检查、镜像借墙；predictFlight复用advanceBall，200目标与预测误差测试通过 |
| 3. 玩家击球 | done：左右按住移动、限速辅助纵深、一次落地后0.2–1.7高度窗口、时机选边、两种完美规则、软球和挥空 |
| 4. 强攻型AI和反制 | done：三种重炮条件，至少0.5秒前兆、慢回中、深处重炮出界；窄窗口反制、1.1倍速度上限及额外0.15秒反应延迟 |
| 5. 独立画面 | done：隔网球场、复用人物/材质、另建球拍、真实球高/影子/落点圈/击球区、蓄力动作/环/发光与镜头取景、暂停冻结 |
| 6. 页面接线 | done：计分、暂停/重试、失分提示、结算、复制JSON、音效、减少动态效果；不使用旧存档和能量 |
| 7. 三尺寸真实键盘整局 | done：两轮均通过；最终390×844/844×390/1440×900各完成整局，并出现重炮和反制尝试，复制JSON与比分一致 |
| 8. 发布排除和回归 | done：发布排除精确一行；发布包无rally、离线检测PASS；原版ui-qa --play通过；最终全量163/163通过 |

## Actual file changes

仓库内：
- dist/rally-core.mjs：纯规则模块，RALLY参数、advanceBall、solveShot、predictFlight、create/start/step/attack/pause/resume、击球预判与计分记录。
- dist/rally-scene.mjs：独立Three场景；仅读取既有art模块；createRallyRenderer生命周期与响应式取景。
- dist/rally.html、dist/rally.css、dist/rally.js：独立页面、操作/反馈/音效/复制记录，不向旧大厅增加入口。
- tests/rally-core.test.mjs：18项规则与完整回合测试。
- tests/rally-scene.test.mjs：5项真实球高、取景、蓄力、暂停与反制闪光测试。
- scripts/rally-qa.mjs：只在测试浏览器注入只读观察器，使用真实键盘事件完成三尺寸整局、暂停与复制记录；--smoke仅检查可见性/启动/暂停。
- scripts/build-release.mjs：新增一行跳过basename以rally开头文件。首次读取SHA-256为B64A607C947674B53927131F8E999483F8835ADC82EDD59159DE4E3EB21D25B8，写入前复核一致；修改后为C8D6CFF70AB5C90B56B85B105ABAC4B75200CD8A73EC29BABDF58354F1A4DDFD。

本变更目录：
- change.yaml：记录批准、实施者与阶段。
- 03-plan.md：接口、任务和检查重点。
- 02-implementation.md：本轮实际结果。

未写入dist/art.mjs、dist/scene3d.mjs、dist/crowd.mjs、旧core/input/game/index/styles、旧测试或存档。它们可能存在其他代理的并发改动；不能把整个工作树diff当成本轮内容。

生成的忽略文件：artifacts/rally/截图、逐分JSON、QA结果、npm日志；release/rebound-club-2026-10-23-69abec5-dirty/发布检查包。输出目录已核对在工作区release内。

## Deviations and reasons

没有改变设计C、一次落地后才能击球、抢5或小样隔离等已确认规则。以下为设计允许的数值/工程选择：

- 球半径/落地中心高度0.14，重力6、反弹0.72/0.9、侧墙±3.82、网高0.62保持设计值；连续碰撞使用解析事件时间，避免步末位置导致错误下网或先后顺序。
- AI横向速度由建议4.2调为2.6，接球半宽0.40；回中速度仍为正常速度45%，反应0.25，反制后仍额外0.15。调参依据是实际确定性回合出现无休止互相接住，需要让强攻手回位破绽可被利用。未强制AI漏球或直接判玩家得分。
- 普通/重炮/软球/反制目标纵深为8.1/7.7/6.8/9.2；普通/重炮/软球参考飞行时间为1.65/1.32/1.85；对手重炮参考1秒并保证足够水平速度，以支持合法的借力反制；反制最大速度12.5。
- 玩家普通球辅助到预测最高点附近，面对重炮辅助到弹起上升段；对手辅助到上升段。所有移动有速度上限。增加预测apex输出，确保最高点模式能在真实比赛中尝试。
- 自动站位范围玩家-2.1～3.3、对手6.7～11.65；允许底线外接已合法落地的球，只有首次落地越底线判出界。
- 镜头额外纳入双方在自动站位极限的双脚（设计只列头顶和底线），修复横屏退到底线外时脚被裁掉；不改变玩法。
- 末次起手期间球已第二次落地，也属于已尝试但没碰到球的whiff；新增回归保证记录不误写double-bounce。
- 独立审阅发现玩家反制的球拍闪光缺项，已按设计G补0.18秒短闪，时间读取规则elapsed，暂停时冻结。
- 未新建worktree或提交混合工作树，避免影响共享目录中的并发美术工作。小样不修改现有游戏入口，发布脚本排除全部rally前缀文件。

## Verification commands and observed results

本节均为本轮实际执行，不引用旧轮测试冒充当前结果。

- node --test tests/rally-core.test.mjs：物理5项、球路2项、规则/击球/AI/整局等逐步先红后绿。收尾新增场景合计23/23通过。
- node --test tests/rally-core.test.mjs tests/rally-scene.test.mjs：最终23 tests，23 pass，0 fail。
- npm test：初轮161/161通过；收尾新增2项后163/163通过。包含原有140项，未减少旧测试。最终日志artifacts/rally/npm-test.log。
- node scripts/rally-qa.mjs --smoke：390×844、844×390、1440×900无溢出，按钮在画面内且可点、3D启动、暂停冻结，errors=[]。
- node scripts/rally-qa.mjs：第一轮三尺寸均完成5:0整局；重炮6/6/8，反制尝试6/6/8，反制成功6/6/7，errors=[]。收尾后最终轮三尺寸仍全部完成5:0整局；重炮8/9/6，反制尝试8/9/6，反制成功6/7/6，耗时102/113/95秒。各自复制JSON可解析，逐分数量等于比分总和，重开记录清零，errors=[]，PASS=true。结果artifacts/rally/qa.json、records-390.json、records-844.json、records-1440.json。
- node scripts/ui-qa.mjs --play：旧守门版本的准备/选择/对局/双触点/暂停/帮助/返回/失败/重试、真实键盘通关与进入下一关/装备解锁通过，errors=[]。
- node scripts/build-release.mjs：生成rebound-club-2026-10-23-69abec5-dirty，文件22（另有version.json共23个site文件）；独立枚举rally*数量0。
- node scripts/release-qa.mjs release/rebound-club-2026-10-23-69abec5-dirty：PASS；service worker受控，缓存22/22，图标正常，断网后screen=match、renderer=3d。无发布或部署。
- node --check dist/rally-core.mjs、dist/rally-scene.mjs、dist/rally.js、scripts/rally-qa.mjs及git diff --check：收尾检查全部通过。
- 独立只读审阅rally_prototype_review：初版21/21新单测通过；额外300局确定性随机时机模拟全部结束，无异常，累计44,739次击球、13,856次重炮、2,915次反制。无Critical/Important，1项Minor球拍闪光已修复并用回归验证。审阅者未修改工作树或另开浏览器。

## Unverified items and reasons

- 尚未找真人比较两种完美规则、判断前兆是否易读、反制是否有成就感及是否主动重开。按设计J，这是下一阶段试玩工作，不用机器人胜率代替真人结论。
- 未验证实际手机/微信设备性能、触摸手感和音效听感；浏览器QA为桌面Chrome不同视口与真实键盘事件。
- 非目标：2D回退、存档、离线缓存、分享、弧线/能量/爆发、其他对手、观众和正式教学。
- 旧版完整skill-qa、perf-qa未在本轮重复；旧版运行源码未被本轮改动，已实跑原版ui-qa与发布离线QA作隔离回归。
- 内部独立审阅在收尾3项小修前完成；修订后由实施者用23项回归和完整流程补证据，等待外部ho-review。

## Remaining risks

- 手感及数值仍是样机参数。机器人可读精确预判，不能用其5:0结果宣称面向真人的平衡成立。
- 共享美术模块仍由其他代理工作，后续改变导出接口可能影响小样；应按设计同步只读导入，不反向修改这三个文件。
- 小样只限本地；本轮检查的发布流程为build-release排除路径。任何直接上传整个dist目录的其他发布方式都不能据此宣称已排除小样，需单独核对。
- 工程验收已经完成，change.yaml转为ready_for_review，等待ho-review；真人试玩观察仍待进行。

