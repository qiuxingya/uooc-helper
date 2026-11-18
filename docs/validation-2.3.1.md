# 2.3.1 验证记录

## 真实页面定位（2026-11-18）

用户当前 Edge 打开 `studyvideoh5.zhihuishu.com/stuStudy`。页面已加载助手 v2.3.0，面板显示“当前页面需要人工处理”，播放器继续以网站原有 1.5× 播放，助手所选 2× 未应用。

只读检查发现预加载的腾讯验证码 iframe：300×150，纵坐标 -1000000，父容器为绝对定位且 opacity:0。原判断仅核对自身可见性和尺寸，因此误判为正在验证。

本轮没有填写真实题目、调用付费模型、点击验证码或交卷。后续浏览器控制因 Windows 上无法可靠识别当前 URL 被安全策略停止；未继续操作浏览器、替换其实际加载目录或重新加载开发版。因此真实账号下重载后的二倍速与续播仍待用户验收，不计为已通过。

## 修复范围

- 增加视口位置、尺寸及 iframe 祖先节点的 display/visibility/opacity 检查。
- 仅观察原有页面，不移动、隐藏、删除或操作验证码。实际显示的验证窗口仍暂停助手，完成验证后由用户重新开始。
- 版本 2.3.1；助手 1.2.0 不变，继续单 ZIP 内置，不新增浏览器权限或远程接口。

## 自动验证

专项 3 项通过，覆盖空题干与考试拒绝、原有二倍速/续播及真实形态预加载验证码，记录 `.test-artifacts/zhs-captcha-2.3.1.tap`。

最终完整回归：`node --test --test-concurrency=2 tests/*.test.cjs`，**359 通过、0 失败、0 跳过**，约 199 秒。记录 `.test-artifacts/regression-2.3.1-ci-fix.tap`。

新增回归验证屏幕外且父层透明、屏幕内但父层透明、屏幕外但不透明三种预加载形态均不误停；正常开始后设置为 2×。验证码实际显示时暂停且不发出答题请求，移除验证界面后不自行恢复，用户点击继续才重新播放。均为隔离 Edge 与模拟页面，不把模拟结果当作真实课程验收。

全量保留原优课、学习通、AI教学中心、智慧树题目及连播、密钥、统计、成绩、设置、更新、包内安装器和原生扩展测试。

## GitHub 稳定性回归修复

读取 [2.3.0 失败运行](https://github.com/qiuxingya/uooc-helper/actions/runs/44257198536) 与 [2.2.0 失败运行](https://github.com/qiuxingya/uooc-helper/actions/runs/43894283782)：两次均在 `tests/polymas-learning.test.cjs` 的迟到播放用例，报 `Cannot read properties of undefined (reading 'waitForFunction')`。失败发生在测试取得尚未提交导航的 iframe 时，不是业务断言不通过。

测试辅助方法改为显式等待目标 iframe 的 video 节点及模拟媒体脚本初始化，再返回 Frame；保留原有暂停、取消和新一轮播放断言。增加响应闸门控制的导航延迟用例，证明加载完成前不会进入播放断言，不靠额外固定休眠或跳过测试。

播放器专项 10 项通过，记录 `.test-artifacts/polymas-ci-fix.tap`；原失败用例与强制延迟导航用例连续 5 轮（10 项）均通过，记录 `.test-artifacts/polymas-ci-repeat.tap`。修复不会使历史失败运行变绿；新 GitHub Actions 运行需本轮确认发布、推送后再核验。

## 文档、截图与交付

同步 README 当前版本、下载入口、安装步骤、更新记录及验证链接，更新使用说明、CHANGELOG 和 Release Notes。智慧树面板由 2.3.1 源码及模拟预加载场景重新渲染，图片为 `latest-2.3.1-zhihuishu-panel.png`；390px 窄屏检查未越界。其余未变化界面沿用 2.3.0 及此前模拟截图，优课与学习通两组预览保留。

从唯一工作副本生成内置助手的 `uooc-helper-2.3.1.zip`、`update.json`、`SHA256SUMS.txt`，核对源码、版本、固定下载地址、大小和哈希；不生成独立助手 ZIP。不含 API Key、Cookie、账号信息或浏览器配置。

拟发布至 `qiuxingya/uooc-helper` 的 `main`，标签 `v2.3.1`，拟提交“修复播放误停和 CI iframe 加载竞态”。按 AGENTS.md，等待本轮“确认发布”后提交、推送并创建 Release。
