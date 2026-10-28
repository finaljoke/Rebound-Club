# 精致潮玩运动场素材升级

## 已批准范围

用户确认采用「精致的潮玩运动场」风格。本次深化真实3D人物、装备与球场，延续奶油白、深绿、橙色的运动俱乐部界面，以及蓝黄守门员配色。

## 实现

- 新增 `dist/art.mjs`，统一圆角几何、关节人物、拳套和本地程序纹理。人物补充发型、表情、球衣号码、领口/袖口、袜子与鞋带；拳套具有衬垫、拇指、护腕及缝线。
- `scene3d.mjs` 使用共享素材工厂，增加草地粗糙/凹凸细节、圆角台基、铺装接缝、木条座椅、花盆边缘及完整侧面/顶面球网。远端球门更新时保留复用标牌几何，避免已释放资源被再次使用。
- 肩部为固定旋转支点；拳套左右手按来球位置出手，球拍和剑独立转腕。人物动作仅由已有游戏时间驱动，暂停保持同一姿态。
- 使用本地 MIT 授权 Three.js 0.180.0 官方 `RoundedBoxGeometry`，仅调整其导入路径。无远程贴图或新包安装。
- `scripts/art-qa.mjs` 输出实际3D角色正背面、守门员及三种装备出手姿态的素材检查图；不会加入游戏页面。

核心规则、输入、存档、UI、HTML/CSS和相机取景均未修改。以 `3376f0b9f187988ee84392ac6eb0bd925176f4a5` 为基础。

## 验证与审查

- `npm test`：69 项通过，0 失败。新增素材测试覆盖关节部件、确定性本地纹理、拳套细节切换。新增挥击回归先失败后通过，覆盖全程肩袖连接及工具击打面高度/前伸方向。
- `node --check`：art、scene3d及素材检查脚本通过；`git diff --check` 无空白错误。
- 实际 Chrome/WebGL 素材图：`artifacts/character-material-sheet.png`、`artifacts/character-strike-sheet.png`，无 pageerror，人工查看了正背面和三种装备出手。
- 最终 `node scripts/ui-qa.mjs --play` 通过：3D后端、390×844与360×640布局、移动和挥击双触点、暂停/帮助/返回、自然失败/重试、三个比例下可点击结算按钮，以及真实DOM输入赢下第1关、进入第2关并解锁球拍，pageerrors=[]。素材改造后的 `--context-loss` 也验证了3D失去上下文后暂停、切换2D并恢复。
- 独立审查发现整条手臂平移导致肩袖与躯干分离；已复现、移除肩部平移，改为固定支点旋转，并增加工具手腕转动。无其他 Critical/Important/Minor 发现。
- 之前资源基线约190 meshes / 143 shadow casters / 21,799 triangles；升级后约254 / 142 / 35,203。阴影尺寸与像素比限制保持原有配置。未进行真实手机或微信性能测量。
- 既有 `localhost:4173` 服务保留，由用户/Claude拥有。

## 发布

同一 owner-private Site 已发布成功，保留原访问范围。

- URL: https://rebound-guard-01a1384a.yellowwren33.chatgpt.site
- source commit: `aa13f5e9ce10d6d3057f66ec3960600c5b40eb5a`
- deployment: `appgdep_6ad98fbba0288191bc973fdda7a1bcd0`
- version: `appgprj_6ad87d4201948191bab039f7713d38e4~appgver_f63008c77af881919ac17ede8cafcf3b`
- Native publication result: `status=succeeded`, `failure_message=null`。
