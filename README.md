# ChatGPT Markdown Copy

Tampermonkey userscript for <https://chatgpt.com> and
<https://chat.openai.com> that copies ChatGPT conversations and research reports
as Markdown while preserving links and citations.

## Why This Script Is Needed

In early May 2025, ChatGPT updated its interface and appears to have broken some
built-in Markdown copying behavior. ChatGPT can still copy content, but links may
be stripped from copied Markdown, reducing the usefulness of research reports and
conversations with citations.

This script:

1. Restores Markdown export with links and formatting intact.
2. Adds a compact clipboard button for full conversations.
3. Adds small clipboard buttons for individual research reports.
4. Keeps everything local by copying directly to your clipboard.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click its toolbar icon, choose *Create a new script*, paste the contents of
   `tampermonkey_script.js`, and save.
3. Refresh any open ChatGPT tab. Copy buttons will appear in the chat interface.

## Usage

### Conversation Copy Button

The script adds one compact clipboard button to the ChatGPT composer controls.

1. Chat as usual on ChatGPT.
2. Press the clipboard button.
3. A status banner appears while Markdown is prepared.
4. The formatted conversation Markdown is copied to your clipboard.

### Research Report Copy Buttons

When ChatGPT generates a deep research report, the script adds small clipboard
buttons at the top and bottom of the report.

1. Hover over a research report section.
2. Press a clipboard button.
3. The report Markdown is copied without the rest of the conversation.

The Markdown format for full conversations mirrors:

```md
# ChatGPT Conversation

## 🧑 User
...
---

## 🤖 Assistant
...
---
```

For research reports, the format is:

```md
# ChatGPT Research Report

[Content of the research report with formatting and links preserved]
```

## FAQ

### Does this leak my chat to any third party?

No. The script copies Markdown directly to your browser clipboard. It does not
send conversation or research report content to any external API.

### Where is the code that extracts messages?

See `scrapeConversation()` in the userscript for full conversations and
`scrapeResearchReport()` for individual research reports. The script identifies
messages using data attributes in the ChatGPT DOM and handles special formatting
like citation links.

### Why is the conversation button icon-only?

The ChatGPT composer has a tight action row. Keeping the button compact prevents
it from covering native controls such as model selection, voice input, and send.

## Uninstall

Disable the userscript from Tampermonkey or delete it.
