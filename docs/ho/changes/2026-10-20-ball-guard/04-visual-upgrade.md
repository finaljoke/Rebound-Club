# 2026-10-22 立体画面升级

用户反馈原文：“整体来说 游戏不够立体”。本轮只升级视觉与兼容层，沿用已确认的玩法、操作、关卡、存储键与站点私有权限。

## 实际改动

- 新增 dist/scene3d.mjs、dist/vendor/three.module.min.js、three.core.min.js、LICENSE（Three.js0.180.0 MIT，静态本地托管）。
- 增加真实透视镜头、厚场地基座、场边看台与台阶、有体积和关节动作的人物、立体拳套/球拍/剑、球体、透明球网及定向阴影。
- 3D坐标统一映射为 (physics.x,height,-physics.z)，不修改 dist/core.mjs。提示圈仍复用 inHitRange。
- 手机镜头按场地边界自动适配。人物略放大，保留全部防守范围；回弹方向通过短叶片转动表现，避免大板旋转与固定碰撞平面不一致。
- WebGL2不可用或运行中丢失上下文时，切换原2D画面；丢失上下文会先暂停，保留本关进度，可以继续。
- 独立审查的一个配色小问题已修复：草地条纹跟随关卡颜色，防止遮住新配色。

## 本轮实际验证

1. 新3D测试先3项失败，完成后通过；镜头边界测试先失败，加入 fit camera 后通过。
2. `npm.cmd test`：22/22 pass，涵盖原关卡/计分/暂停/输入/存储与4项新3D测试。
3. `node --check dist/game.js` 和 `node --check dist/scene3d.mjs`：exit0。
4. 最终 `node scripts/browser-qa.mjs --play --touch`：backend3d；实际可见像素观察与键盘操作完成首关8/8（25.647秒），三次漏球失败、装备解锁、390/360视口、暂停与双指释放均通过，pageerror=[]。
5. `node scripts/browser-qa.mjs --fallback --touch`：关闭WebGL，backend2d，可移动挥击并暂停，pageerror=[]。
6. `node scripts/browser-qa.mjs --context-loss --touch`：起始backend3d，主动丢失图形上下文后自动暂停并切换2D；继续与再次暂停均通过，pageerror=[]。
7. 独立 reviewer review_3d_upgrade 自行运行22测试通过，结论无Critical/Important；后续镜头、人物大小和配色微调均由22测试与最终实际UI跑通覆盖。

实际截图：sites/ball-guard/artifacts/3d-court.png（球场元素截图）、3d-gameplay.png（手机整体界面）。默认 gameplay.png 可能由回退测试覆盖，不能当作3D证据。

## 未验证

微信实机兼容、物理手机性能与人类玩家的难度评价仍待实际设备试玩。当前截图及验证来自本机浏览器和移动视口/触控模拟。

## 发布

沿用 project_id=appgprj_6ad87d4201948191bab039f7713d38e4 与 owner-private 权限。以原生发布工具返回的真实结果追加记录，不以预期地址当作发布成功。

原生发布工具已返回 succeeded。源代码 commit=cffeb6259a63a59833c76b3636bbdc53fcd453ed；deployment_id=appgdep_6ad95e8f68288191a4caf269c6b11892；version_id=appgprj_6ad87d4201948191bab039f7713d38e4~appgver_6d2f356d374081918dc48386ea77972f。

实际发布 URL：https://rebound-guard-01a1384a.yellowwren33.chatgpt.site 。Git 工作区干净，用户原有浏览器进度键保持不变。
