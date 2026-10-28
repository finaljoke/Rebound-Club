# 场外潮玩观众 · 2026-10-23

用户要求打磨观众，并明确规定座位、crowd接口、进球跳起/落回、暂停、reduceMotion和绘制预算不变；要求执行npm test、perf-qa、skill-qa。

实现：
- 新增dist/crowd.mjs，将观众细分为服装/坐姿腿脚、头部/耳朵/鼻子、五官、短发/波波头/运动帽、独立手臂和手掌，共8个InstancedMesh批次。全体无投影，服装和肤色确定性变化，配色低于主角的饱和度。
- scene3d.mjs保留原来的三层看台和seats生成式，32名观众的位置不变；返回的crowd仍是body InstancedMesh。
- 平时轻微晃动，进球后依原窗口跳起并错开节奏鼓掌或挥手。全部部件使用传入的场景now；暂停时矩阵完全冻结，reduceMotion下无动态动作。
- 每帧复用Object3D与Matrix4，无新对象、几何或材质分配；细小装饰使用低面数几何，当前完整场景约7.8万三角形（含阴影统计）。边界在构建后计算并为欢呼留余量，不逐帧重建。
- scripts/crowd-qa.mjs使用真实批量模型渲染休息/欢呼近景，发现并修正鼓掌手掌进衣服及头发顶面重叠问题。

范围：dist/crowd.mjs、scene3d.mjs的观众块/导入、tests/crowd.test.mjs、scripts/crowd-qa.mjs和README；保留已有未提交球员美术和并行发布/缓存改动，不提交混合工作树、不发布站点。

验证：
- 新增两项行为回归先红后绿：所有批次的暂停/恢复、头身跟随；reduceMotion与连续更新资源不增加。
- 最终npm test：140/140通过，原scene-p2/perf约束均通过。
- 最终node scripts/perf-qa.mjs：PASS；大厅87、手机比例对局101、横屏85次实际绘制，均低于110；三角形分别76972/77608/74878；60帧内画布尺寸读取0次，preserveDrawingBuffer=false。
- Node基准对局快照可见对象/投影对象：95 / 32，低于100 / 50；返回crowd.count=32。此口径对应既有perf测试选取的状态，不代表全技能特效峰值。
- node scripts/crowd-qa.mjs：休息/欢呼截图无pageerror，已人工检查。
- 语法和git diff --check通过。
- node scripts/skill-qa.mjs：退出码0，结果逐项检查通过，errors=[]。四种尺寸控件均可见可点；双指旋转50→0且保持移动；爆发100→0、只发球/计击一次；暂停、失焦冻结；中途重试重置；上下文丢失后2D继续；减少动态效果、基础教学、普通打法通关/下一关、纯2D技能均正常。

额外诊断说明：包含射门路线与全部技能特效的节点统计峰值探测为旋转152、爆发160；此处统计所有visible节点，不是相机裁剪后的实际绘制调用，也不是既有perf.test的基准状态。观众自身固定8批次（原2批次），本轮未重构其他轨迹/技能特效，因此不宣称所有特效时刻节点数≤100。

截图：artifacts/crowd/spectators-rest.png、spectators-cheer.png；实际手机比例对局截图artifacts/perf/play-390.png。浏览器模拟不等于手机真机性能测试。
