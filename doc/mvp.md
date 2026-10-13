# 浏览器半自动表单填充插件实现方案

## 1\. 项目目标

开发一个轻量级 Chrome / Edge 浏览器扩展，用于招聘网站、报名网站、信息登记网站等场景下的半自动表单填写。

核心原则：

-   不追求整页自动填写
    
-   不针对具体网站编写 DOM 适配代码
    
-   用户主动点击输入框后才触发
    
-   插件只分析当前输入框
    
-   自动猜测字段类型
    
-   用户确认后再填写
    
-   个人资料统一维护
    
-   所有数据仅保存在本地浏览器
    
-   不使用服务器
    
-   不上传用户隐私数据
    

目标体验：

```
用户点击某个输入框
        ↓
插件分析当前输入框
        ↓
猜测字段类型
        ↓
显示一个小型浮动菜单
        ↓
推荐：
手机号

其他：
姓名
邮箱
学校
专业
学历
...
        ↓
用户点击某项
        ↓
对应内容写入当前输入框
```

---

# 2\. 技术栈

采用最轻量实现。

```
Chrome Extension Manifest V3
HTML
CSS
Vanilla JavaScript
chrome.storage.local
```

不使用：

```
React
Vue
Angular
Node.js 后端
数据库
远程 API
Playwright
Selenium
```

插件需要兼容：

```
Google Chrome
Microsoft Edge
```

由于 Edge 与 Chrome 均基于 Chromium，一套代码即可运行。

---

# 3\. 插件整体架构

推荐目录结构：

```
smart-autofill/
│
├── manifest.json
│
├── content/
│   ├── content.js
│   ├── detector.js
│   ├── filler.js
│   └── floating-menu.js
│
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
│
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
│
├── data/
│   └── field-rules.js
│
├── styles/
│   └── content.css
│
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
└── README.md
```

各模块职责：

```
content.js
负责监听页面输入框焦点变化。

detector.js
负责分析当前输入框并猜测字段类型。

filler.js
负责把内容正确写入 INPUT / TEXTAREA。

floating-menu.js
负责在输入框旁显示推荐菜单。

popup
插件图标点击后的快捷入口。

options
维护用户个人资料、字段、自定义映射等。

field-rules.js
维护字段识别规则。
```

---

# 4\. 核心使用逻辑

整个插件严格采用“用户主动触发”的方式。

流程：

```
1. 用户进入招聘网站

2. 用户点击：
   手机号码输入框

3. content.js 捕获 focusin

4. detector.js 获取当前输入框相关信息：

   label
   placeholder
   name
   id
   autocomplete
   aria-label
   title
   周围文字

5. detector.js 根据关键词进行打分

6. 得到：

   phone = 95
   email = 10
   name = 5

7. floating-menu.js 显示：

   推荐
   手机号

   其他
   姓名
   邮箱
   学校
   专业

8. 用户点击“手机号”

9. filler.js 写入手机号

10. 模拟 input / change 事件

11. 网站前端正常接收到内容
```

不要自动填入。

必须经过用户点击确认。

---

# 5\. 支持的表单元素

第一版支持：

```
<input type="text">
<input type="tel">
<input type="email">
<input type="number">

<textarea>

contenteditable
```

后续再考虑：

```
select
自定义下拉组件
Element Plus
Ant Design
React Select
日期选择器
级联选择器
```

第一版不要尝试处理复杂下拉框。

---

# 6\. 输入框检测

监听：

```
document.addEventListener("focusin", handleFocus);
```

只处理：

```
INPUT
TEXTAREA
contenteditable="true"
```

示例：

```
function handleFocus(event) {
    const element = event.target;

    if (!isEditableElement(element)) {
        return;
    }

    const info = collectFieldInfo(element);

    const candidates = detectField(info);

    showFloatingMenu(element, candidates);
}
```

---

# 7\. 字段信息采集

需要采集以下信息：

```
type
name
id
placeholder
autocomplete
aria-label
title
label
父元素文本
前一个兄弟节点文本
附近 1~2 层 DOM 文本
```

统一结构：

```
{
    type: "",
    name: "",
    id: "",
    placeholder: "",
    autocomplete: "",
    ariaLabel: "",
    title: "",
    label: "",
    nearbyText: ""
}
```

例如页面：

```
<div class="form-item">
    <label>联系电话</label>
    <input
        name="mobilePhone"
        placeholder="请输入手机号码"
        type="tel"
    />
</div>
```

采集结果：

```
{
    "type": "tel",
    "name": "mobilePhone",
    "placeholder": "请输入手机号码",
    "label": "联系电话"
}
```

---

# 8\. 字段识别机制

不要使用复杂 AI。

第一版采用：

```
关键词 + 权重打分
```

例如手机号：

```
phone: {
    keywords: [
        "手机号",
        "手机号码",
        "手机",
        "联系电话",
        "联系电话",
        "mobile",
        "mobilephone",
        "phone",
        "telephone",
        "tel"
    ]
}
```

邮箱：

```
email: {
    keywords: [
        "邮箱",
        "电子邮箱",
        "电子邮件",
        "邮件地址",
        "email",
        "e-mail",
        "mail"
    ]
}
```

学校：

```
school: {
    keywords: [
        "学校",
        "院校",
        "毕业院校",
        "毕业学校",
        "就读学校",
        "大学",
        "university",
        "college",
        "school"
    ]
}
```

专业：

```
major: {
    keywords: [
        "专业",
        "所学专业",
        "专业名称",
        "major"
    ]
}
```

---

# 9\. 字段权重

不同来源使用不同权重。

推荐：

```
autocomplete    +100
label           +80
placeholder     +70
aria-label      +70
name            +60
id              +50
title           +40
附近文字         +30
input type      +80
```

例如：

```
<label>手机号</label>

<input
    type="tel"
    name="mobile"
    placeholder="请输入手机号"
>
```

评分：

```
label:
手机号
+80

type:
tel
+80

name:
mobile
+60

placeholder:
手机号
+70

phone 总分：
290
```

最终排序：

```
phone 290
email 0
name 0
```

---

# 10\. 字段识别结果

detectField 返回：

```
[
    {
        key: "phone",
        label: "手机号",
        score: 290
    },
    {
        key: "email",
        label: "邮箱",
        score: 20
    }
]
```

只展示：

```
Top 5
```

例如：

```
推荐

手机号

────────────

其他

邮箱
姓名
学校
专业
```

---

# 11\. 个人资料数据结构

使用：

```
chrome.storage.local
```

数据格式：

```
{
    "profile": {
        "basic": {
            "name": "",
            "gender": "",
            "phone": "",
            "email": "",
            "birthday": "",
            "idCard": ""
        },

        "education": {
            "school": "",
            "major": "",
            "degree": "",
            "educationLevel": "",
            "graduationDate": ""
        },

        "location": {
            "province": "",
            "city": "",
            "address": "",
            "postalCode": "",
            "hometown": ""
        },

        "job": {
            "currentCompany": "",
            "currentPosition": "",
            "expectedPosition": "",
            "expectedCity": ""
        },

        "certificate": {
            "cet4": "",
            "cet6": "",
            "computerLevel": ""
        },

        "custom": []
    }
}
```

---

# 12\. 建议第一版字段

第一版建议支持约 20 个高频字段。

## 基础信息

```
姓名
手机号
邮箱
性别
出生日期
身份证号
民族
籍贯
现居城市
详细地址
邮编
```

## 教育信息

```
学校
学院
专业
学历
学位
入学时间
毕业时间
```

## 求职信息

```
期望岗位
期望城市
当前单位
当前岗位
```

可以先不处理：

```
复杂经历
项目描述
论文信息
实习经历
自我评价
```

这些适合后续增加“文本模板”。

---

# 13\. 自定义字段

必须支持用户自行增加字段。

例如：

```
字段名称：
导师姓名

内容：
张三

关键词：
导师
导师姓名
指导教师
supervisor
advisor
```

数据结构：

```
{
    "id": "custom_001",
    "label": "导师姓名",
    "value": "张三",
    "keywords": [
        "导师",
        "导师姓名",
        "指导教师",
        "supervisor",
        "advisor"
    ]
}
```

这样插件不需要升级，就可以不断扩展。

---

# 14\. 浮动菜单设计

菜单位置：

```
当前输入框右下角
```

例如：

```
┌──────────────────┐
│ ★ 推荐            │
│                  │
│ 手机号            │
│                  │
│ ─────────────── │
│ 姓名              │
│ 邮箱              │
│ 学校              │
│ 专业              │
│                  │
│ ⚙ 管理个人资料    │
└──────────────────┘
```

菜单尽量小。

不要遮挡页面。

推荐宽度：

```
180px ~ 240px
```

---

# 15\. 浮窗出现规则

只有以下情况显示：

```
用户主动 focus 输入框
```

以下情况隐藏：

```
点击页面其他区域

按 ESC

输入框失焦

完成一次填写
```

不要页面加载后主动弹出。

不要自动扫描整个网页。

---

# 16\. 输入框填充机制

不能只使用：

```
element.value = value;
```

因为 React / Vue 页面可能不会识别。

推荐实现：

```
function setNativeValue(element, value) {
    const prototype =
        element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;

    const descriptor =
        Object.getOwnPropertyDescriptor(
            prototype,
            "value"
        );

    descriptor.set.call(element, value);

    element.dispatchEvent(
        new Event("input", {
            bubbles: true
        })
    );

    element.dispatchEvent(
        new Event("change", {
            bubbles: true
        })
    );
}
```

需要兼容：

```
普通 HTML
React
Vue
Angular
jQuery
```

---

# 17\. contenteditable

对于：

```
<div contenteditable="true">
```

使用：

```
element.textContent = value;

element.dispatchEvent(
    new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
    })
);
```

---

# 18\. Popup 功能

点击浏览器插件图标显示：

```
Smart Autofill

当前状态：
✓ 已启用

----------------

姓名
手机号
邮箱
学校

----------------

管理个人资料

暂停当前网站

设置
```

popup 不承担主要填充功能。

主要填写入口仍然是：

```
输入框旁边浮窗
```

---

# 19\. Options 设置页

Options 页面用于维护个人资料。

布局：

```
个人信息
────────────────────

基本信息
姓名
手机号
邮箱
性别
出生日期

教育信息
学校
专业
学历
学位

地址信息
籍贯
现居城市
地址
邮编

求职信息
期望岗位
期望城市

────────────────────

自定义字段

+ 新增字段
```

---

# 20\. 数据导入导出

必须支持：

```
导出 JSON
导入 JSON
```

例如：

```
{
    "name": "张三",
    "phone": "13800000000",
    "email": "test@example.com"
}
```

用途：

```
换电脑
备份
多人维护不同配置
从现有个人资料 JSON 导入
```

---

# 21\. 数据安全

所有个人资料必须：

```
仅保存在 chrome.storage.local
```

禁止：

```
上传服务器
调用第三方 API
Google Analytics
日志上报
远程数据库
远程模型
```

README 明确说明：

```
本插件不会上传任何个人资料。
所有数据仅存储在本地浏览器中。
```

---

# 22\. 权限设计

manifest 权限尽量最小。

推荐：

```
{
    "permissions": [
        "storage"
    ]
}
```

content\_scripts：

```
{
    "matches": [
        "http://*/*",
        "https://*/*"
    ]
}
```

不要申请：

```
cookies
history
downloads
webRequest
tabs
clipboardRead
```

除非未来确实需要。

---

# 23\. 网站黑名单

支持用户关闭某些网站。

例如：

```
禁止自动运行：

bank.com
paypal.com
alipay.com
```

默认建议对以下类型页面禁用：

```
银行
支付
密码
登录
```

如果：

```
<input type="password">
```

必须直接忽略。

绝对不能对密码输入框显示插件菜单。

---

# 24\. 字段识别算法示例

伪代码：

```
function detectField(info) {

    const result = [];

    for (const rule of FIELD_RULES) {

        let score = 0;

        score += match(
            info.autocomplete,
            rule,
            100
        );

        score += match(
            info.label,
            rule,
            80
        );

        score += match(
            info.placeholder,
            rule,
            70
        );

        score += match(
            info.ariaLabel,
            rule,
            70
        );

        score += match(
            info.name,
            rule,
            60
        );

        score += match(
            info.id,
            rule,
            50
        );

        score += match(
            info.nearbyText,
            rule,
            30
        );

        if (score > 0) {

            result.push({
                key: rule.key,
                label: rule.label,
                score
            });

        }
    }

    return result.sort(
        (a, b) =>
            b.score - a.score
    );
}
```

---

# 25\. nearbyText 获取原则

不要扫描整页。

只获取当前输入框附近少量内容。

推荐：

```
input
↓
parentElement
↓
最多向上查找 2~3 层
```

限制最大文本：

```
200 字符
```

避免：

```
整个页面 innerText
```

否则可能：

```
性能差
错误识别
获取无关文本
```

---

# 26\. 推荐字段判断

例如：

```
score >= 100
```

显示：

```
★ 推荐
```

例如：

```
手机号
95%
```

不需要真的计算概率。

UI 可以仅显示：

```
推荐：手机号
```

不要展示复杂算法。

---

# 27\. 用户纠错机制

这个功能非常重要。

例如插件猜：

```
推荐：手机号
```

但实际上该字段是：

```
紧急联系人电话
```

用户可以：

```
选择其他字段
```

不要求插件必须猜对。

核心设计理念：

```
AI/规则负责推荐
人负责确认
```

因此识别错误不会造成严重问题。

---

# 28\. 学习功能

第二阶段可以增加轻量学习。

例如：

某网站：

```
name="candidateMobile"
```

第一次：

```
插件猜错
用户选择“手机号”
```

插件记录：

```
{
    "candidateMobile": "phone"
}
```

以后再遇到：

```
candidateMobile
```

直接提高 phone 权重。

不要做机器学习。

只做：

```
本地映射记忆
```

---

# 29\. 本地学习结构

```
{
    "learnedMappings": [
        {
            "pattern": "candidateMobile",
            "field": "phone"
        },
        {
            "pattern": "graduateSchool",
            "field": "school"
        }
    ]
}
```

甚至可以按网站保存：

```
{
    "example.com": {
        "candidateMobile": "phone"
    }
}
```

---

# 30\. 不要做的事情

第一版禁止做成复杂项目。

不要：

```
整页 DOM 扫描

自动点击下一步

自动提交

自动登录

验证码识别

自动选择所有下拉框

AI 大模型字段识别

服务器

数据库

用户账号体系

自动上传个人资料
```

第一版核心只有：

```
点输入框

↓

识别当前字段

↓

用户选择

↓

填写
```

---

# 31\. 第一阶段 MVP

第一阶段必须实现：

```
Manifest V3

个人资料维护

chrome.storage.local

input / textarea 检测

字段识别

关键词规则

浮动菜单

点击填写

React/Vue 输入框兼容

20 个常用字段

JSON 导入

JSON 导出
```

完成这些即可发布内部使用版本。

---

# 32\. 第二阶段功能

MVP 稳定后增加：

```
自定义字段

自定义关键词

网站级学习

字段映射记忆

contenteditable

快捷键

网站黑名单

暂停插件

更多招聘字段
```

---

# 33\. 第三阶段功能

后续根据实际使用再考虑：

```
下拉框自动推荐

日期组件

省市区

学历选择

学校选择

专业选择

经历模板

项目模板

自我评价模板

快捷文本片段
```

仍然坚持：

```
用户点击

+

用户确认
```

不要发展成 Playwright 式全自动。

---

# 34\. 快捷键

后续可以支持：

```
Alt + A
```

打开当前输入框的填充菜单。

例如：

```
点击输入框

Alt + A

↓

显示：

手机号
邮箱
姓名
学校
...
```

---

# 35\. 长文本模板

未来可以加入：

```
自我评价
项目经历
技能描述
论文信息
实习经历
```

例如：

```
常用文本
────────────────

自我评价

Java 技术栈

硕士研究方向

项目经历 A

项目经历 B
```

用户点击后直接填入 textarea。

这样插件最终可以发展成：

```
个人信息自动填充

+

招聘文本模板管理
```

---

# 36\. 核心模块接口建议

## collectFieldInfo

```
collectFieldInfo(element)
```

返回：

```
{
    element,
    type,
    name,
    id,
    placeholder,
    autocomplete,
    ariaLabel,
    title,
    label,
    nearbyText
}
```

---

## detectField

```
detectField(fieldInfo)
```

返回：

```
[
    {
        key,
        label,
        score
    }
]
```

---

## fillField

```
fillField(element, value)
```

负责：

```
设置 value

触发 input

触发 change

保持 focus
```

---

## showMenu

```
showMenu(element, candidates)
```

负责：

```
计算输入框位置

显示浮窗

显示候选字段
```

---

# 37\. CSS 隔离

浮动菜单 CSS 必须尽量避免被网页污染。

所有 class 使用统一前缀：

```
saf-
```

例如：

```
saf-menu
saf-menu-item
saf-title
saf-recommended
```

不要使用：

```
menu
button
item
container
```

这种通用 class。

推荐：

```
.saf-menu {
    all: initial;
}
```

然后重新定义样式。

如果后续遇到严重 CSS 冲突，可以考虑：

```
Shadow DOM
```

第一版可以先不用。

---

# 38\. z-index

浮层：

```
z-index: 2147483647;
```

避免被招聘网站弹窗遮挡。

---

# 39\. 输入框位置计算

使用：

```
element.getBoundingClientRect();
```

菜单定位：

```
left:
rect.left

top:
rect.bottom + 4
```

加：

```
window.scrollX
window.scrollY
```

处理滚动页面。

---

# 40\. 性能要求

禁止：

```
MutationObserver 监听整个 DOM

持续扫描全部 INPUT

定时器扫描页面
```

只监听：

```
focusin
click
keydown
```

因此插件几乎没有性能开销。

---

# 41\. 隐私要求

代码中不得：

```
console.log 用户身份证

console.log 手机号

console.log 邮箱

上传日志

远程统计
```

开发模式可以输出：

```
识别字段类型

识别分数

DOM 属性
```

但不要输出用户具体填写值。

---

# 42\. README 需要说明

README 至少包括：

```
项目介绍

安装方法

使用方式

功能说明

数据安全说明

开发说明
```

Chrome 本地安装方式：

```
Chrome

↓

扩展程序

↓

开发者模式

↓

加载已解压的扩展程序

↓

选择 smart-autofill 文件夹
```

Edge：

```
edge://extensions/

↓

开发人员模式

↓

加载解压缩的扩展
```

---

# 43\. 验收标准

## 基础功能

### 测试 1

页面：

```
<label>手机号</label>
<input type="text">
```

预期：

```
推荐手机号
```

---

### 测试 2

```
<input
    type="email"
    placeholder="请输入邮箱"
>
```

预期：

```
推荐邮箱
```

---

### 测试 3

```
<input
    name="graduateSchool"
>
```

预期：

```
推荐学校
```

---

### 测试 4

用户点击：

```
手机号
```

预期：

```
正确写入手机号
```

并触发：

```
input
change
```

---

### 测试 5

React 页面输入框。

预期：

```
React state 正确更新
```

---

### 测试 6

用户点击页面其他位置。

预期：

```
浮动菜单消失
```

---

### 测试 7

密码框。

```
<input type="password">
```

预期：

```
插件不显示
```

---

### 测试 8

刷新网页。

预期：

```
个人资料仍存在
```

---

### 测试 9

导出 JSON。

修改数据。

重新导入。

预期：

```
数据恢复成功
```

---

# 44\. MVP 最终验收条件

满足以下条件即认为第一版完成：

```
Chrome 正常运行

Edge 正常运行

无需服务器

无需登录

用户点击输入框才触发

能够识别至少 20 个常用字段

显示推荐字段

用户可以手动选择其他字段

普通 HTML 填写正常

React 输入框填写正常

Vue 输入框填写正常

个人资料本地保存

支持编辑个人资料

支持 JSON 导入导出

密码框不会触发

没有个人信息上传行为

页面刷新数据不丢失
```

---

# 45\. 最终产品定位

本项目不是：

```
自动投简历机器人
```

也不是：

```
网页自动化工具
```

而是：

```
个人表单填写助手
```

核心定位：

> 用户负责选择输入框，插件负责理解当前输入框并提供个人信息候选，用户确认后一键填写。

相比 Playwright / Selenium：

```
无需维护网站 DOM

无需适配每个招聘网站

网站改版影响较小

操作可控

不会误提交

维护成本低
```

最终交互尽量保持：

```
点击输入框
     ↓
推荐字段
     ↓
点击一次
     ↓
填写完成
```

这就是项目最核心的设计原则。