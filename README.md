# filisimusic

一个纯静态的中文器乐作品档案：聆听音乐，阅读创作与修订记录，下载可再生成的 REAPER 工程源文件。

当前版本收录 **40 首已完成作品**：10 首灵感短篇与 30 首长篇。页面曲数与总时长直接读取目录，不把尚未完成的作品计入。

## 运行

不需要安装前端依赖或构建工具。运行 `python3 -m http.server 8080 --bind 127.0.0.1`，在浏览器打开 `http://127.0.0.1:8080`。不要直接用 `file://` 打开 HTML，因为播放器需要读取 JSON 目录。

使用 Node.js 运行 `npm test`，检查纯函数、目录、资源完整性、工程 ZIP CRC 和隐私字段。`npm run check` 另外检查 JavaScript 语法。没有 npm 依赖需要下载。

## GitHub Pages

此项目为 GitHub Pages 项目站点编写，所有应用与媒体路径均为相对路径，支持 `/filisimusic/` 子目录。

1. 将本目录内容提交到 `ThySummer14/filisimusic` 的 `main` 分支。
2. 在仓库的 Settings → Pages → Build and deployment 中选择 **Deploy from a branch**。
3. 选择 **main / (root)**，保存。
4. 等待 GitHub Pages 部署完成，以 GitHub 显示的部署地址为准，并验证页面、播放和工程下载。

`.nojekyll` 已随项目提供。网站已在 [filisimusic 音乐馆](https://thysummer14.github.io/filisimusic/) 上线，发布源为 main / (root)。每次目录更新以对应的 GitHub Actions 部署状态为准；已验证的版本和范围见 `QA.md`。

## 文件结构

- `index.html` / `styles.css` / `app.js`：界面与原生 HTML audio 播放器
- `core.js`：筛选、时间、队列与封面图形等可独立测试的纯函数
- `data/catalog.json`：页面使用的中文目录与相对资源路径
- `data/source-catalog.json`：经过清理的原始制作记录，保留原文乐谱说明与检查事实
- `data/editorial.zh.json`：依据上述记录整理的中文短介绍与修订摘要
- `data/assets-manifest.json`：公开 MP3 与工程 ZIP 的大小和 SHA-256
- `audio/`：40 份 MP3，按稳定曲目 ID 命名
- `projects/`：40 份可再生成工程源文件 ZIP
- `scripts/import_collection.py`：导入已批准的制作目录与本地素材映射；本地映射不复制到仓库
- `scripts/check_integrity.py` / `tests/`：资源、隐私与播放器逻辑检查

## 音乐与工程的边界

这些是 **AI 辅助编写、程序合成音色的器乐作品**，经过实际 REAPER 离线导出。乐器名称指配器角色和合成音色，不代表真人演奏、实录或商业音源。标题是创作意象，不是作者真实经历。

各曲目保留草稿后的两轮实质修订。《末班车之后》和《玻璃公路》另含最终校正，共四个实际导出版本；其余曲目为三个版本。页面展示源记录中的具体改动，而非虚构的听审结论。

工程 ZIP 是 **可再生成的轻量源文件包**，包含乐谱、MIDI、REAPER 工程与生成脚本，**不含现成音频分轨或完整无损版本档案**。请先阅读 ZIP 内 README，按其中版本和依赖要求生成音频素材，再打开 REAPER 工程。不可把 ZIP 描述为解压后无需生成素材即可原样播放的完整分轨工程。

40 首作品的源记录报告了实际 REAPER 导出与 PCM 数值检查；完整逐曲人工听审尚未完成。浏览器播放功能测试也不等于听感评价。更详细的界面测试状态见 `QA.md`。

## 使用

- 点击曲目封面的播放键；标题或「制作手记」打开详细记录
- 按系列、风格或关键词筛选；支持时长排序和分页展开
- 播放队列在选曲时使用当前筛选结果；随后筛选不会打断正在播放的队列
- 一组播放结束后停止；手动上一首、下一首可循环
- 空格播放或暂停，左右方向键前后跳 5 秒，P/N 切换曲目
- 输入框、按钮、链接和滑块聚焦时不会触发全局播放快捷键
- 不自动播放，不提前下载整套音乐。仅选中曲目后才设置音频地址
- 本地存储只保留音量。没有第三方字体、播放器、统计脚本或追踪嵌入

## 更新目录

先准备经过授权与清理的源目录 JSON 和独立本地素材映射，然后运行：

`python3 scripts/import_collection.py --catalog /path/to/approved/catalog.json --asset-map /path/to/private/assets.local.json`

导入器验证来源与复制后的 SHA-256。绝不将本地素材映射、私有存储链接、账号资料、凭证或未清理的制作目录提交到仓库。新增作品后同步维护中文说明，再运行检查。

本仓库没有声明音乐或代码的再分发、商用许可。公开访问本身不等于授予这些权利。
