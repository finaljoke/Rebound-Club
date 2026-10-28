# 实施记录 · Round 1

## 1. Design and round reference

- 设计：01-design.md，含 2026-10-21 网页优先修订。
- 计划：docs/superpowers/plans/2026-10-21-ball-guard-web.md。
- 用户明确授权：“那就开始做吧”。本会话直接实现；独立审查由 final_game_review 执行，之后按失败用例修复，不重复派发审查。
- 本轮网页可玩交付已通过本地验证；微信真机项未验证，因此整体 change 状态保留 implementing，不将原始微信目标误记为完成。

## 2. Task completion table

| 设计任务 | 本轮结果 |
|---|---|
| 1：设计与计划 | 已完成。用户确认网页优先并明确要求开始；计划与实际工程路径已记录。 |
| 2：场景、镜头、移动、双区触控 | 已完成。Canvas 斜俯视第三人称，Pointer Events 多触点隔离，键盘补充。 |
| 3：单球、边界、回弹板、拳套 | 已完成。单球固定步长模拟，板角可见，碰墙不计回击。 |
| 4：完整首关状态流程 | 已完成。准备、发球、失误、暂停、胜利、失败和重试；实际键盘首关 8/8。 |
| 5：补位与命中反馈 | 自动控制输入已验证六关三装备可达；真实 UI 完成首关。人类玩家耐玩性仍需试玩。 |
| 6：装备与六关、本地保存 | 已完成。首关后解锁球拍与剑、顺序关卡、完美评价和最高分；拒绝存储降级。 |
| 7：微信真机 | 未验证。当前可用环境为桌面浏览器与移动视口/触控模拟，无微信实机。 |

## 3. Actual file changes

工程：sites/ball-guard/。

| 文件 | 内容 |
|---|---|
| package.json | 无运行时依赖；npm start、npm test |
| .gitignore | 忽略 QA 图片、压缩包和临时环境 |
| .openai/hosting.json | 官方 helper 持久化唯一 Site project_id 与 dist 静态目录 |
| dist/index.html | 中文界面、球场、关卡、装备、玩法说明与可达按钮 |
| dist/styles.css | 响应式桌面/手机布局，安全区，窄屏结果卡与滚动兜底 |
| dist/core.mjs | 六关三装备、单球物理、挥击时窗、计分、生命周期、共享命中范围 |
| dist/input.mjs | 移动触点身份、按键、取消与重置 |
| dist/storage.mjs | 本地记录、数据清理、存储拒绝降级 |
| dist/game.js | 完整 Canvas 球场/人物/装备、轨迹、提示、Web Audio、实际输入与主循环 |
| tests/core.test.mjs | 12 项核心行为测试，包含全 18 个关卡/装备组合与误导提示边界 |
| tests/input.test.mjs | 3 项输入隔离、取消、按键释放测试 |
| tests/storage.test.mjs | 3 项保存、损坏/拒绝、非法记录测试 |
| scripts/serve.mjs | 本项目静态预览服务器 |
| scripts/browser-qa.mjs | 本机独立浏览器 QA：布局、冻结、双指、实际键盘通关、失败与窄屏结果卡 |
| README.md | 启动、操作、验证方式与微信真机限制 |

artifacts/ 下截图与 browser-qa.json 是 QA 命令产物，不进入静态部署包；Git 由 Sites 官方 workflow 初始化及同步。

## 4. Deviations and reasons

- 用户选择网页优先，因此首版不创建正式微信小游戏工程。保留第三人称与全部确认玩法。
- 原文件清单补充 scripts/browser-qa.mjs，用于真实 UI 验证，不改变产品功能。
- 使用 Canvas 2D 透视绘图实现卡通 2.5D，全角色可见；无外部图像、字体、CDN 或运行时库。
- 没有既有 Git 工程，执行期使用测试日志和本文记录；Sites workflow 在交付阶段创建独立仓库，没有在 System32 建仓，也未创建额外工作树。
- 打包初次调用 Windows 自带 bash.exe 进入缺少 /bin/bash 的 WSL，已定位到官方 packager 调用 bash；仅为该进程前置已安装的 Git Bash PATH，不修改系统配置。
- Git Bash tar 随后把 Windows 盘符解释为远程地址；为同一打包进程设置 TAR_OPTIONS=--force-local 后，官方 helper 成功打包。只改变打包环境，不修改插件或游戏源码。
- 双指 QA 初次把移动触点传给 CDP touchEnd，事件日志确认实际释放了移动触点。修正为释放攻击触点后检查通过；未据此改动工作正常的产品输入实现。
- 独立审查指出窄屏结算裁切、球越过人物后亮圈仍提示可击打。两项均复现并修正；命中提示与实际碰撞改用同一 inHitRange 判定。未遗留审查 Minor。

## 5. Verification commands and observed results

本节全部为本轮实际运行记录。

1. `node --test tests/core.test.mjs`：初始 8 fail / 3 pass；实现后 11/11 pass。
2. `node --test tests/input.test.mjs tests/storage.test.mjs`：初始 5 fail / 1 pass；实现后全套 17/17 pass。
3. 提示范围回归先失败：`undefined !== false`；共享判定实现后 `npm.cmd test` 为 18/18 pass。
4. `node --check dist/game.js`：exit 0。
5. `node scripts/browser-qa.mjs`：HTTP 200；390×844、360×640 无横向溢出且攻击按钮在首屏；暂停截图完全一致；pageerror=[]。
6. `node scripts/browser-qa.mjs --play`：真实 UI 键盘首关 8/8，约 26.9 秒；选择球拍并等待三次漏球，失败结算正常，第二关已解锁。
7. 窄屏结果卡回归先失败：360×640 球场 top=200,bottom=475.1875；旧卡片 bottom=564.59375，被裁切。
8. 修正后 `node scripts/browser-qa.mjs --play --touch`：exit 0；双指移动/攻击/独立释放通过；暂停冻结；真实键盘首关 8/8，27.227 秒；胜利卡 top=220.765625,bottom=454.40625，位于球场内；失败卡也完整位于球场内；pageerror=[]。
9. 独立审查：18 项组合的可达性由核心测试实际模拟验证；不是对真实人类难度的结论。审查原 17 项测试独立通过，两个重要发现已由上述 RED→GREEN 覆盖。
10. Sites 官方 workflow：exit 0；已推送 commit `c70ef646de8cba48c41dcfe8f345ab516f82d5db`；生成 rebound-guard-deploy.tar.gz（16896 bytes）；Git 工作区干净。
11. `save_version_and_deploy_private`：返回 status=succeeded，deployment_id=`appgdep_6ad882f0ebf8819195c804f08edef6c1`，version_id=`appgprj_6ad87d4201948191bab039f7713d38e4~appgver_72824d4083cc8191b6e275f5663d5f91`；URL=https://rebound-guard-01a1384a.yellowwren33.chatgpt.site。该结果验证私有部署成功；未开放公众访问。

截图：sites/ball-guard/artifacts/desktop.png、gameplay.png、victory.png、victory-360.png、defeat.png；最终浏览器结果见 artifacts/browser-qa.json。

## 6. Unverified items and reasons

- AC14 微信真机、实体双指设备、微信安全区、音频及切回：没有实机环境。移动视口与 CDP 双触点通过不能替代实机记录。
- 人类玩家的难度与耐玩性：自动操作证明可完成，仍需用户试玩评价。
- 部署由原生工具验证成功；未另行以用户身份测试外部浏览器登录流程。

## 7. Remaining risks

- 浏览器进度仅保存在当前设备/浏览器；被清理后会丢失，无账号同步。
- 私有 Site 仅本人可访问；发给朋友或要求微信内无登录访问需要另外决定托管与分享权限。
- 六关初始参数可调；拳套可达性已有自动测试，但人类操作容错还需试玩。
