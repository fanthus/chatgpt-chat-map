# ChatGPT Chat Map — Privacy Policy

**Last updated: February 2025**

This privacy policy applies to the Chrome extension "ChatGPT Chat Map" (the "Extension").

---

## 1. Overview

The Extension runs when you visit ChatGPT conversation pages (`chat.openai.com`, `chatgpt.com`) and shows a list of messages you sent in the current conversation on the right side of the page, with click-to-scroll, timestamps, and copy. All functionality runs inside your browser on the page; **there is no background script and no popup**.

---

## 2. Data We Access

The Extension runs only when you have one of the above ChatGPT pages open and may access the following data **that exists only on your device or in the current page**:

| Data | Purpose | Leaves your device? |
|------|---------|----------------------|
| Page DOM (e.g. user message elements) | List message previews in the sidebar, scroll and highlight on click | No |
| Same-origin conversation API (`/backend-api/conversation/...`) | Fetch message metadata (e.g. timestamps) for display | No (requests go to ChatGPT same origin, same as normal ChatGPT use) |
| Local storage key `chatgpt-timestamps-24h-format` | If present, used for 12/24-hour time format preference | No |

All of the above access happens inside your current browser tab. **Your conversation content, account information, or any personal data is not sent to the Extension developer or any third-party server**.

---

## 3. What We Do Not Do

- **No collection**: We do not collect your conversations, account details, device identifiers, or any personal data.
- **No external storage**: We do not store your data on the Extension developer’s or any third party’s servers.
- **No upload**: We do not upload content from your page or data read by the Extension to the internet.
- **No analytics or tracking**: We do not use analytics, tracking, or advertising SDKs.

---

## 4. Permissions

The Extension declares **no permissions** in `manifest.json` (`permissions` is empty).  
Scripts are injected only via Chrome’s content script mechanism on these sites:

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

The Extension can run only when you visit these domains and cannot access other websites, your browsing history, bookmarks, or similar.

---

## 5. Data Retention and Scope

- The Extension **does not operate** any servers, so your data is **not retained** anywhere by us.
- All data read by the Extension is used only for the sidebar and interactions in the current tab and is **processed only locally on your device**.

---

## 6. Changes to This Policy

If we update this privacy policy, we will update the "Last updated" date on this page. We recommend checking this page from time to time. Continued use of the Extension after changes constitutes acceptance of the updated policy.

---

## 7. Contact

If you have questions or feedback about the Extension’s privacy practices, you can contact us through the Extension’s listing (Chrome Web Store) or the project repository (if public).

---

*The Extension does not collect, store, or upload your conversations or any personal data; all processing is done locally in your browser.*
