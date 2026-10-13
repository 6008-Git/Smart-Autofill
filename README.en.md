<div align="center">

<img src="doc/assets/hero.svg" alt="Smart Autofill — Maintain once. Reuse across applications. Click, choose, confirm." width="100%">

# Smart Autofill

**Maintain your profile once. Reuse it across job applications.**

A local Chrome / Edge extension for application forms. Click an input, choose saved information, and fill that field.

[![Version](https://img.shields.io/badge/version-0.3.3-2563eb)](https://github.com/6008-Git/Smart-Autofill/releases)
[![Tests](https://github.com/6008-Git/Smart-Autofill/actions/workflows/ci.yml/badge.svg)](https://github.com/6008-Git/Smart-Autofill/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-0f766e)](LICENSE)

[中文](README.md) · [Download](https://github.com/6008-Git/Smart-Autofill/releases/latest) · [Report an issue](https://github.com/6008-Git/Smart-Autofill/issues/new/choose)

</div>

## The problem

Job applications repeatedly ask for the same education, internship and project details, while changing field names, layout and record order. Smart Autofill turns repeated typing into selecting information from one maintained profile.

<img src="doc/assets/demo-records.png" alt="Actual extension displaying employer, position and date summaries, using fictional data" width="900">

*Actual extension UI. All screenshots use fictional data. The current interface uses Chinese labels and supports searching English field keys.*

## Features

- 140 field definitions in 13 categories, with seven repeatable record collections.
- Find education, employment and projects by content summaries instead of record numbers.
- Rule-based suggestions, a searchable cascader and manual field selection when suggestions are inaccurate.
- **Alt+Z** opens the menu for the currently focused supported input.
- JSON import preview, explicit replacement confirmation and backup export.
- Browser-local storage; no account, backend, remote model calls or runtime dependencies.
- Fill one field at a time after selection. Dropdowns and form submission remain manual.

## Install

1. Download `smart-autofill-VERSION.zip` from [Releases](https://github.com/6008-Git/Smart-Autofill/releases/latest), then extract it.
2. Open `chrome://extensions/` or `edge://extensions/` and enable Developer mode.
3. Choose **Load unpacked**, then select the extracted **`smart-autofill` folder**.
4. Open the extension's profile manager and save your information, or import your own JSON.
5. Refresh the application webpage. Click a supported input, select a suggestion or a field from the cascader, and confirm.

Alternatively, clone the repository and load `smart-autofill/` directly. No build or server is required.

After updating the extension, reload it and refresh already-open form pages. Existing saved profiles do not need to be imported again.

## Why field-by-field confirmation?

Some LLM-powered autofill tools struggle to identify controls or map information accurately on unfamiliar forms. Understanding a résumé also requires access to usable page information, reliable control targeting and correct record association.

Here, the user identifies the target by clicking it. Rules recommend saved fields; manual selection remains available for supported inputs if a suggestion is wrong. This reduces reliance on whole-page interpretation and autonomous navigation.

LLMs can be valuable for open-ended responses and semantic reasoning. This extension focuses on reusing established profile values without generating new content. There are no published comparative speed or accuracy benchmarks, and compatibility with every website is not guaranteed.

## Data and scope

- Profiles start empty and are stored in `chrome.storage.local`. The extension does not send your résumé to a server or model.
- Short record summaries are displayed in the webpage menu. Filled values become visible to the website and subject to its own data handling.
- The manifest declares only `storage`; content scripts run on authorized HTTP/HTTPS pages and matching frames.
- Supported controls: text, tel, email and number inputs, plus textarea. Same-origin HTTP/srcdoc iframes and native controls in open Shadow DOM were tested.
- Selects, datalists and recognized custom dropdowns are excluded, including when using the shortcut.
- Passwords, readonly/disabled controls, date widgets, contenteditable, closed Shadow DOM and browser-restricted pages are outside the current scope.
- No whole-page autofill, automatic submission, login, pagination or CAPTCHA handling.

Explore the [fictional sample](examples/profile.demo.json) and [English-key / Chinese-label mapping](doc/profile-field-mapping.json). Importing confirms replacement of the entire profile; export a backup first when needed.

Explicit source annotations are moved into maintenance notes rather than filled into forms. Notes, sources and pending items are not fill candidates. Conflicting annotated single-value fields require confirmation. Secondary-school records can be maintained separately without inventing a degree or major.

## Development

Runtime: Manifest V3, vanilla HTML/CSS/JavaScript. Tests use Node.js 24; packaging uses Python 3's standard library.

```bash
node --test tests/core.test.mjs tests/profile-schema.test.mjs tests/field-tree.test.mjs tests/content-lifecycle.test.mjs
node scripts/verify-public.mjs
python scripts/package-extension.py
```

Local validation: **35 unit tests and 48 browser checks each in Chrome and Edge**. Browser checks use isolated profiles and fictional data, with dependency-free DevTools Protocol orchestration. CI runs unit tests, public-file verification and packaging. See [validation notes](doc/acceptance.md) for scope and reproduction details.

Contributions are welcome: [guide](CONTRIBUTING.md), [security notes](SECURITY.md), [changelog](CHANGELOG.md). Please report issues using fictional data and remove personal or session information.

## License

[MIT](LICENSE) © 2026 6008
