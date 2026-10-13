# 验证记录

版本：0.3.2。浏览器验收日期：2026-10-13；开源发布检查：2026-10-14。

## 已完成验证

- 单元测试：28 项通过，涵盖规则识别、资料校验、来源读取、级联树、快捷键和内容脚本生命周期。
- Chrome 155.0.8059.40：46 项浏览器检查通过。
- Edge 155.0.4283.45：46 项浏览器检查通过。

浏览器检查在独立临时配置中实际加载 MV3 扩展，通过鼠标与键盘操作页面，并使用真实 chrome.storage.local。所有资料与截图均为虚构内容，不读取日常浏览器配置。工具使用 Node.js 内置模块和 DevTools Protocol，没有 Playwright、Selenium 或应用后端。

## 覆盖范围

| 项目 | 验证内容 |
| --- | --- |
| 扩展加载 | MV3、仅 storage 权限、所有入口与图标存在 |
| 字段识别 | 23 个常用字段，label、placeholder、name、id、autocomplete、ARIA、title 和有限附近文本加权 |
| 资料维护 | 140 项字段定义、13 个分类、7 类重复记录、嵌套联系人、数组和多段文本 |
| 用户主动触发 | 页面加载和脚本 focus 不自行弹出；点击、Tab 或真实 Alt+Z 可以唤起 |
| 快捷键排除 | 密码、只读、下拉框、非输入焦点和脚本模拟按键不触发 |
| 原生填写 | 只改变当前字段，触发 input/change、保留焦点、关闭菜单；number 拒绝非数字时恢复原值 |
| 下拉框排除 | select、datalist、combobox、自定义选择语义及关联候选列表；运行时转换为下拉后关闭菜单 |
| 事件拦截 | 控件阻止 click/keydown 冒泡时仍能使用捕获阶段监听 |
| 内嵌与组件输入框 | 同源 HTTP/srcdoc iframe 和开放 Shadow DOM 原生输入框可点击、快捷键唤起及填写 |
| JSON | 解析与预览不改变存储，确认后替换；无效结构拒绝；导出再次导入保留完整资料 |
| 常用字段来源 | 教育信息来自同一条最近开始的经历；明确在职的工作、求职岗位与城市使用对应来源；用户手动覆盖保留 |
| 级联选择 | 分类、内容摘要、字段三级选择；选择叶子后确认才填写；每列独立滚动 |
| 内容摘要 | 七类记录按学校、公司、项目等内容标识；管理页标题随编辑更新；手机号、证件号和完整职责不进入摘要 |
| 键盘与搜索 | 上下移动、左右切换列、Esc 关闭，中文摘要与英文键搜索 |
| 窄屏布局 | 375px 管理页、三级菜单和视口底部浮窗无横向溢出 |
| 数据更新 | 已打开网页读取新保存资料；旧异步响应不能覆盖新导入；失效上下文显示刷新提示 |
| Popup | 本地资料摘要、来源读取与管理入口 |

## 公开文件与发布包

公开目录只包含代码、通用字段结构、文档、虚构样例与虚构截图。personal-data、artifacts、dist 和本地配置由 Git 忽略。

运行 `node scripts/verify-public.mjs` 检查被 Git 跟踪的文件：排除私人路径、凭据特征、语法错误和断裂的本地文档链接，验证示例能通过正式导入器。如果本机存在私人 profile-import.json，还会额外核对公开文本不含其中的身份与联系方式；CI 没有私人文件，因此不执行这部分本地检查。

发布 ZIP 只包含 smart-autofill 文件夹与原 MIT 许可证，标准库脚本重新打开 ZIP 验证结构、版本与完整性，并生成 SHA-256 校验值。扩展包不包含测试资料、测试工具或私人的导入文件。

## 验证边界

React/Vue 相关检查验证原生 setter、受控输入 value tracker 与 input 事件机制，没有引入框架运行时。尚未在所有实际招聘网站或真实框架业务逻辑上验证。

跨域/沙盒 iframe、封闭 Shadow DOM、contenteditable、日期组件、浏览器内置页、扩展商店页和本地 file 页面不属于当前验证范围。网站格式校验、控件行为和浏览器站点授权仍可能影响使用。Alt+Z 不能绕过浏览器权限或不可编辑控件。

本项目没有整页自动填写、自动提交或性能对比测评。上述检查数量不代表网站兼容率，也不代表与其他自动填写方案的准确率比较。

## 复现

```bash
node --test tests/core.test.mjs tests/profile-schema.test.mjs tests/field-tree.test.mjs tests/content-lifecycle.test.mjs
node scripts/verify-public.mjs
python scripts/package-extension.py
node tests/browser-smoke.mjs chrome
node tests/browser-smoke.mjs edge
```

浏览器脚本默认使用 Windows 标准安装路径，可在 executables 中调整。CI 运行单元测试、公开文件检查和打包，不运行浏览器检查。

更新扩展后重新加载，并刷新已打开的网页；浮窗右上角版本号应为 0.3.2。文档中的公开演示图位于 doc/assets，其他本地验收产物位于被忽略的 artifacts。
