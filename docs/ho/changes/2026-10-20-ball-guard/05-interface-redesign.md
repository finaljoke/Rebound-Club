# 界面产品化改造 · 2026-10-22

用户已认可准备/对局/结算的界面方向，并明确要求“你来界面改造吧”。基线 ebecbd011cbef012d7bab81e918fb1b8f0f4b11d，保留 Claude 新增的门将、练习保护、射门预判、击球区及策略平衡。

本轮范围：index.html、styles.css、game.js 的表现与页面组织；新增 ui.mjs 用于界面状态与真实本局统计，及对应测试；不改 core.mjs、input.mjs、storage.mjs 或 scene3d.mjs。

1. 准备页：清晰品牌、可见的立体球场、当前关卡与装备摘要、唯一主按钮。选择关卡与装备在有焦点管理的原生对话框内完成。
2. 对局页：收起准备内容；全视口布局突出球场；比分、机会、暂停固定可见；操作不依赖滚动。
3. 结算页：明确胜负、进球/连击/真实重炮统计；胜利下一关、失败重试；保留返回准备与暂停继续。
4. 视觉：奶油白/深绿/橙色潮玩俱乐部，统一 SVG 装备和控件图标、字体层级、状态色；减少动态偏好继续生效。

验证：基线60项测试通过；界面状态/统计先写失败用例；再检查390×844、360×640、1440×1000的准备/对局/结算，选择器焦点、双指、暂停、返回、实际通关与失败、2D回退。发布沿用现有 owner-private Site，微信实机仍未验证。

## 实施结果

- 主要文件：dist/index.html、styles.css、game.js；新增 ui.mjs、tests/ui.test.mjs、scripts/ui-qa.mjs；更新README当前界面验证方法。
- core.mjs、input.mjs、storage.mjs、scene3d.mjs 与基线无差异，原存档键和 Claude 最近的玩法/平衡/3D提示全部保留。
- 准备：完整球场预览、赛前摘要、关卡/装备原生对话框、唯一开始主按钮；选择后保留键盘焦点。
- 对局：单视口；390×844球场高度578px、360×640高度391px，操作与反馈均在屏内；赛前面板收起。
- 结算：统一胜负卡、实际进球/最高连击/重炮击球/分数、本局亮点、下一关或重试、返回俱乐部；练习保护期间丢球后不宣称零失球。

## 本轮验证和审查

1. 初始UI状态及统计4项测试先失败后通过；练习丢球“零失球”回归另先失败后通过。
2. 最终 `npm.cmd test`：65/65 pass；game.js、ui.mjs和ui-qa.mjs语法检查exit0。
3. `node scripts/ui-qa.mjs --play`：真实页面键盘事件驱动完成首关，显示“零失球，漂亮拿下！”、2次最高连击、0次重炮击球、2200分；进入第02关并通过UI选择已解锁球拍。使用独立参考模拟控制输入，不读改运行中游戏状态。
4. 同一脚本验证准备CTA首屏可见、对局不溢出、原生选择器/焦点、帮助、暂停冻结、返回、自然失败、重试、双触点独立释放，pageerror=[]。
5. 独立 reviewer review_product_ui 指出360px和短横屏结算被响应式网格覆盖，以及练习丢球后零失球文案不真实。两项均复现、补失败用例并修正，不重复派发审查。
6. 原结算回归检测到 courtHeight=52、cardHeight=42、按钮clickable=false。修正后390px/360px/844×390的结算球场高度分别760/558/317px，主按钮均通过elementFromPoint真实点击命中检查。
7. `node scripts/ui-qa.mjs --fallback`：backend2d，准备/选择/对局/暂停/帮助/失败/重试/双指与三种结算尺寸均通过，pageerror=[]。
8. `node scripts/ui-qa.mjs --context-loss`：运行中从3D丢失上下文，暂停→2D回退→继续成功；该项在最终仅涉及结算CSS和文案的修正前检查，相关回退代码此后未变。

截图在 sites/ball-guard/artifacts/ui-*.png；默认截图可能被fallback检查覆盖为2D背景，ui-victory-390.png和ui-victory-360.png来自3D通关检查。JSON结果为最近一次命令输出，前次真实结果以上述本轮日志为准。

## 当前限制

没有真实微信/实体手机测试。浏览器触控模拟及视口检查不等同于微信真机；当前发布保持本人私有访问。

## 发布结果

官方 source workflow 成功推送并打包 commit=3376f0b9f187988ee84392ac6eb0bd925176f4a5，Git工作区干净。

原生 save_version_and_deploy_private 返回 succeeded；deployment_id=appgdep_6ad986b293708191a8d90caf4d345728；version_id=appgprj_6ad87d4201948191bab039f7713d38e4~appgver_dbf320fe90348191b78119c077483919。

实际网址：https://rebound-guard-01a1384a.yellowwren33.chatgpt.site 。用户原本的 localhost:4173 服务不由本轮创建，因此保留运行，不做停止。
