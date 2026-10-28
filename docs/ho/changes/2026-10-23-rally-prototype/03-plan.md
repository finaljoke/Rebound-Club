# 对打小样实施计划

目标：按已批准的01-design.md Round 1实施独立rally页面，不修改守门规则及三个并发美术文件。

实现方式：本会话直接实施，独立rally文件提供源码隔离；保留共享工作树上的并发修改，不把他人文件加入提交。设计Ordered tasks为主计划，以下只补充工程接口。

## 接口与顺序

- [x] 1. tests/rally-core.test.mjs先覆盖重力/反弹、侧墙、网与落地顺序。dist/rally-core.mjs提供RALLY、advanceBall(ball,dt,onEvent)、createRally(options)、startRally(state)、stepRally(state,dt,axis)、pauseRally/resumeRally。
- [x] 2. solveShot(origin,target,options)按目标和时间反解初速度，处理镜像目标与净空；predictFlight(ball,options)使用advanceBall，返回首次落点/落地后接触点和轨迹。覆盖200个确定性目标与预测误差。
- [x] 3. attackRally、hitZone、inHitRange、attackPreview和玩家辅助纵深移动；power=contact/apex。测试早中晚、软球、挥空。
- [x] 4. 对手接球、空当回球、三种重炮条件与0.5秒前兆；同挥击键反制、1.1倍速度与额外0.15秒反应延迟。测试真实回合及强攻出界。
- [x] 5. rally-scene提供buildRallyWorld、createRallyRenderer，使用已有素材构建独立隔网场景，镜头边界搜索、落点圈、影子、击球框和蓄力提示；新scene测试验证取景和暂停。
- [x] 6. rally.html/rally.css/rally.js接线；保持左右按住移动和单挥击键。自动发球、抢5、结算事实记录与JSON复制、音效和减少动态效果。
- [x] 7. scripts/rally-qa.mjs在390x844、844x390、1440x900通过真实键盘打一整局；只读状态观察，不向生产代码添加测试入口。
- [x] 8. 读取并比对build-release文件指纹后仅增加rally*排除，生成发布包并运行release-qa；完整npm test与原版本浏览器回归。

## 核心状态与边界

规则球坐标为x/y/z，y真实参与重力与净空。内部固定1/120秒步长；advanceBall按连续碰撞时间推进，回调顺序为同一时刻先网、再墙、再落地。每拍hitter/bounces/crossedNet标记由核心管理。事件在命令队列和固定步长间消费一次。points/records只在失分时结算一次。

球路、预测、自动纵深共用advanceBall；UI和场景不写规则状态。核心不依赖DOM/Three。相机和动画读取规则时间，暂停时不推进。

## 检查重点

高速度或同一步撞墙/过网/落地；合法一次弹地后越底线不提前判出界；挥空后仍可补救并正确清除该拍标记；两种完美规则记录不混淆；重炮前兆不足0.5秒不得击出；暂停/失焦清输入；新比赛不携带旧记录；发布包和离线缓存不含rally文件。

记录：所有未指定数值选择集中在RALLY，并在02-implementation.md记录。状态仅在全部验收完成后改为ready_for_review。
