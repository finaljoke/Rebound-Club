# 反弹守卫 · REBOUND CLUB 部署说明

这是一个纯静态网页小游戏：没有后端、没有数据库、不需要构建，也不向任何第三方地址发请求。把 `site/` 目录里的文件放到任意静态网站服务器上，绑定域名即可访问。

## 包内文件

```
DEPLOY.md             本说明
nginx.conf.example    nginx 配置示例
SHA256SUMS.txt        site/ 内每个文件的校验值
site/                 网站根目录（上传这个目录里的全部内容）
  index.html          入口
  game.js、core.js 等  游戏脚本（ES Module）
  styles.css
  vendor/             Three.js 0.180.0 本地副本（MIT 许可见 vendor/LICENSE）
  version.json        版本号与对应源码提交
```

总大小约 0.9 MB。

## 环境要求

- 任意能提供静态文件的服务：nginx、Apache、Caddy、宝塔面板、对象存储（OSS / COS 等）加 CDN、Cloudflare Pages、Vercel、Netlify、GitHub Pages 都可以。
- 建议使用 HTTPS。HTTP 也能运行，但现在的手机浏览器对 HTTP 站点限制越来越多。
- 服务器需要把 `.js` 文件以 JavaScript 类型返回（`text/javascript` 或 `application/javascript`）。几乎所有服务器默认如此。包里已经不包含 `.mjs` 文件，不需要额外配置 MIME 类型。

## 部署步骤

1. 解压发布包。
2. 把 `site/` 目录**里面的全部文件和 `vendor/` 子目录**上传到网站根目录，保持目录结构不变。
   - 也可以放在子路径下，例如 `https://example.com/games/rebound/`。页面里的所有路径都是相对路径，不需要改任何文件。
3. 绑定域名并配置 HTTPS 证书（按托管平台的常规方式）。
4. 用 nginx 的话可以参考 `nginx.conf.example`，改掉其中的域名、证书和目录路径。

## 缓存建议

文件名没有带内容哈希，所以更新版本时：

- `index.html` 和 `version.json` 设置为不缓存（`Cache-Control: no-cache`）。
- 其余 `.js`、`.css` 文件建议也用 `no-cache`，或者最多缓存 1 小时。否则玩家更新后可能拿到新旧混合的脚本，出现白屏。
- 如果用了 CDN，每次上传新版本后刷新整个目录的缓存。

## 上线后检查

1. 打开域名，能看到游戏首页和右侧「开始挑战」按钮。
2. 访问 `https://你的域名/version.json`，显示的版本号与发布包名称一致。
3. 点「开始挑战」：第一次进入会出现 3 步小教学，可以点「跳过教学」。立体球场、两名球员和球都正常显示。
4. 按 F12 打开浏览器控制台，没有红色报错。
5. 用手机打开一次，确认可以拖动移动、点击挥击。

如果画面是白屏，最常见的原因：

- 只上传了 `index.html`，或者漏了 `vendor/` 目录。
- 直接双击本地的 `index.html` 打开（`file://` 地址）。浏览器不允许这样加载模块，必须通过网址访问。
- CDN 缓存了旧文件。刷新 CDN 缓存后再试。

不支持 WebGL 的设备会自动切换到 2D 兼容画面，可以正常游玩。

## 其他说明

- **玩家进度**：保存在玩家自己浏览器的本地存储里，按域名区分。换了新域名后，玩家在旧地址的进度不会自动带过来。
- **数据收集**：不收集任何玩家数据，没有统计代码、广告或外部请求。
- **回滚**：保留上一版的 `site/` 目录即可，出问题时整体换回。
- **文件校验**：如需核对文件是否完整，可以用 `SHA256SUMS.txt` 校验（例如 Linux 上在 `site/` 目录里执行 `sha256sum -c ../SHA256SUMS.txt`）。
