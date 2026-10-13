# 贡献指南

欢迎改进字段识别、输入框兼容性、键盘操作、资料维护与文档。请先阅读 README 中的支持范围。

## 本地运行

在 Chrome/Edge 扩展管理页加载 `smart-autofill/`，修改代码后重新加载扩展并刷新测试页面。运行代码没有安装或构建步骤。

开发验证使用 Node.js 24 和 Python 3：

```bash
node --test tests/core.test.mjs tests/profile-schema.test.mjs tests/field-tree.test.mjs tests/content-lifecycle.test.mjs
node scripts/verify-public.mjs
python scripts/package-extension.py
```

`node tests/browser-smoke.mjs chrome` / `edge` 可运行 Windows 浏览器验收；默认浏览器路径在脚本中列出。测试使用独立临时配置和虚构资料，不要切换成自己的日常浏览器配置。

## 实现原则

- 保持原生 HTML/CSS/JavaScript 和本地资料存储。
- 只处理用户当前选中的字段，用户选择后填写。
- 保留下拉框排除规则；不要增加整页自动填写、自动提交或验证码处理。
- 采集当前控件附近的有限信息，不扫描整页个人数据。
- 推荐和记录显示可以调整，原始资料、数组、多段文本和前导零必须保留。
- 新权限、网络请求或超出当前范围的功能，请先开 Issue 说明必要性。

## 提交反馈与 PR

说明触发方式、浏览器与扩展版本、预期结果和实际结果。使用最小 HTML 示例或虚构截图，不要提交完整简历、招聘平台账号、Cookie、token 或登录后的敏感页面。

PR 请写明具体问题、修改后的行为、验证方式和支持边界。行为变化补充有意义的测试；文案或其他低影响调整无需增加机械重复的测试。

## 私人文件

`personal-data/`、`artifacts/`、`dist/`、本地配置和密钥由 `.gitignore` 排除。公开示例只放在 `examples/`，且必须使用虚构内容。提交前查看 `git diff --cached` 和 `git ls-files`。
