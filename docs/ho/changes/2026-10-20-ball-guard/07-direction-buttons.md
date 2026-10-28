# 手机左右方向按钮

用户在手机试玩后反馈滑动区域太小，要求改成左、右箭头。

本轮改动：
- 用独立的大号左/右按钮替换滑轨；按住持续移动，松开停止，按住时变为深绿色。
- 390px屏宽下各77×68px，360px下72×68px，320px下62×68px；横屏为80×68px。方向键间距至少8px。
- 按触点分别记录方向，挥击/技能触点释放不会停止移动；双方向相互抵消，松开一侧恢复另一侧。
- 指针捕获支持滑出按钮后松手；cancel、失焦、暂停清空输入。保留A/D和方向键，聚焦按钮也支持Enter/Space按住移动。
- 调整手机控制行空间，更新帮助、README、发布检查文案，以及既有浏览器QA的旧滑动操作。

本轮由Codex修改：dist/input.mjs、dist/game.js中HUD与方向绑定、dist/index.html方向按钮与帮助、dist/styles.css方向控制布局、README.md、tests/input.test.mjs、scripts/control-qa.mjs、scripts/ui-qa.mjs、scripts/skill-qa.mjs、scripts/browser-qa.mjs、scripts/release/DEPLOY.md。

同期其他代理在更新dist/core.mjs、dist/scene3d.mjs与tests/skill-flow.test.mjs的大招演出；未覆盖其改动。本轮不提交混合工作树，不发布仍在本地打磨的技能版本。

验证：
- 输入回归先红后绿（5个新行为失败→通过）。
- 最后一次npm test：111/111通过。中途并行大招修改曾使两项大招演出测试失败，最新完整测试已通过。
- node scripts/control-qa.mjs：390×844、360×640、320×568、844×390、1440×1000通过。实际浏览器读取玩家位置，验证按住/松开、双指挥击/技能按钮、两方向抵消、滑出后释放、触点取消、暂停、失焦及键盘操作；pageerrors=[]。
- 素材截图和结果：artifacts/controls/directions-390.png、directions-360.png、directions-320.png、directions-844.png、directions-1440.png、qa.json。
- 修改的JS语法检查及git diff --check通过。CDP touchEnd的触点列表是要释放的触点，QA已经按实际事件日志确认并修正。
- 本次使用Chrome手机视口和触摸模拟，尚未在真实手机上复测。

node scripts/ui-qa.mjs --play完整对局回归通过：准备/选择关卡装备/对局/双触点/暂停/帮助/返回/自然失败/重试，以及实际输入通关、进入第2关并解锁球拍；pageerrors=[]。本地试玩地址保持http://localhost:4173/，已有服务持续运行。
