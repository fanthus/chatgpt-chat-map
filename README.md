# ChatGPT Chat Map

Chrome 扩展 ChatGPT Chat Map：在 ChatGPT 等对话页右侧展示当前对话中「用户说的每句话」列表，点击某一项可滚动到该句在页面中的位置。

## 支持页面

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

## 安装

1. 打开 Chrome 地址栏输入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本仓库根目录（含 `manifest.json` 的目录）
4. 在 ChatGPT 对话页刷新，右侧会出现用户消息列表

## 使用

- 右侧栏自动列出当前对话里你的每条消息的简短预览
- 点击任意一条，页面会平滑滚动到该条消息在对话中的位置
- 无用户消息时侧栏不显示；有新消息或 DOM 变化时会自动刷新列表

## 技术说明

- 使用页面 DOM 属性 `div[data-message-author-role="user"]` 定位用户消息。若 OpenAI 改版导致失效，需相应调整选择器。
- 仅使用 content script，无 background、无 popup；权限仅声明上述 host。

## 本地开发

修改代码后到 `chrome://extensions/` 点击该扩展的「重新加载」，再刷新 ChatGPT 页面即可。

## 致谢

本扩展在实现思路上参考了 [ChatGPT Timestamp Extension](https://github.com/Hangzhi/chatgpt-timestamp-extension)（作者 [Hangzhi](https://github.com/Hangzhi)），特此致谢。
