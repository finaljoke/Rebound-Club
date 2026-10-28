# 潮玩人物造型精修 · 2026-10-23

用户希望继续打磨人物美术。本轮在既有精致潮玩运动场方向上修改本地3D资产。

改动：
- 头型采用柔和的圆角轮廓与微收下颌，略增头部存在感；调整发型块面，增加橙色/米白运动发带。
- 发带与五官贴花沿真实头部曲面生成，避免把平面或普通圆环贴在非匹配轮廓上形成穿插或浮片。
- 圆筒球衣改成带收腰的圆角轮廓；袖口、肩部、胸前条纹、队徽与侧边配色统一；背号改成本地抗锯齿运动数字。
- 球鞋增加圆润鞋头、分层鞋底、鞋舌、鞋带与侧面配色；拳套进一步圆润并补齐腕带轮廓。
- 保持buildAthlete/buildGlove接口、关节位置与可切换的拳套本体/细节层。继续使用现有mergeRigidParts，未修改性能优化代码。
- scripts/art-qa.mjs中守门员预览手套配色同步实际游戏现有的白色。

范围：dist/art.mjs、scripts/art-qa.mjs、README.md。期间其他代理修改场景/看台与桌面布局，本轮未覆盖这些工作，也未提交混合工作树或发布线上。

验证：
- npm test：137/137通过，包括模型关节、肩袖连接、装备切换、技能特写取景和渲染预算。
- node scripts/art-qa.mjs：正面、背面、守门员和三装备挥击实际WebGL渲染，无pageerror；已人工查看。
- node scripts/perf-qa.mjs：通过；本次手机比例大厅81、对局95、横屏79次绘制（含阴影），均在现有110阈值内；60帧内无重复画布尺寸读取，不保留画面缓冲。
- 语法和git diff --check通过。实际游戏截图中背号、发带、袖口与鞋子可辨识。
- 本次为桌面Chrome手机视口与触摸环境验证，不代表手机真机帧率。

预览：
- artifacts/character-before-2026-10-23.png：修改前近景留档。
- artifacts/character-material-sheet.png：新造型正背面与守门员。
- artifacts/character-strike-sheet.png：三种装备出手。
- artifacts/perf/play-390.png：实际手机比例对局。

本地试玩地址仍为http://localhost:4173/。
