# Rule catalogue

What each onefile-lint check looks for, why, and the evidence behind it. Run `onefile-lint explain <rule>` to read any entry in the terminal.

## How to read the evidence grades

- **A**: measured on AI-generated pages or code, in a cited study or evaluation
- **B**: measured on the wider web, or named as a failure in a standard or official documentation
- **C**: reported by practitioners, not measured
- **D**: no public evidence found yet

Grades describe the evidence, not how bad a failure is. A frequency is quoted only where a source states it. "D" means no public measurement was found, and the entry says so rather than guessing.

## Sources

- [A11y LLM Eval report (Microsoft, GitHub Copilot SDK runs)](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30. 8 models, 32 prompt cases, 1280 control samples, run without accessibility instructions. [[CONFIRM: report generation date]].
- [Human or LLM? A Comparative Study on Accessible Code Generation Capability (Suh, Tafreshipour, Malek, Ahmed; arXiv, 20 Mar 2025)](https://arxiv.org/html/2503.15885v1), read 2026-09-30. GPT-4o and Qwen2.5-Coder against human-written pages, scored with AChecker and QualWeb.
- [A11yn: Aligning LLMs for Web Accessibility-Aware UI Generation (Yoon et al.; arXiv 2510.13914, submitted 15 Oct 2025)](https://arxiv.org/html/2510.13914v1), read 2026-09-30. baseline Qwen2.5-Coder-7B-Instruct on the RealUIReq-300 benchmark; counts are average violations per the paper's Table 2.
- [The WebAIM Million, February 2026](https://webaim.org/projects/million/), read 2026-09-30. 1,000,000 home pages; 95.9% had detected WCAG 2 failures. Human-made pages, not agent output.

## Seen in the first corpus run

The linter was run on 237 single-file pages from [simonw/tools](https://github.com/simonw/tools) at commit `83a5d43`, read 2026-09-30. The repo describes itself as "Assorted useful tools, almost entirely generated using LLMs" and is licensed Apache-2.0. That description is the repo's own claim; it was not checked page by page. The column below is how many of the 237 pages got a warning or failure for the rule, with default settings.

| Rule | Group | Level | Best evidence | Pages flagged |
| --- | --- | --- | :---: | ---: |
| [remote-dependency](#remote-dependency) | portability | error | C | 75 (32%) |
| [sibling-file](#sibling-file) | portability | error | D | 12 (5%) |
| [size](#size) | portability | warn | D | 1 (0%) |
| [offline](#offline) | portability | warn | B | 26 (11%) |
| [print-styles](#print-styles) | portability | warn | B | 187 (79%) |
| [document-basics](#document-basics) | portability | warn | B | 28 (12%) |
| [contrast](#contrast) | display | warn | A | 131 (55%) |
| [reduced-motion](#reduced-motion) | display | warn | B | 79 (33%) |
| [viewport-height](#viewport-height) | display | warn | B | 18 (8%) |
| [focus-outline](#focus-outline) | display | warn | B | 2 (1%) |
| [zoom-blocked](#zoom-blocked) | display | warn | B | 6 (3%) |
| [form-labels](#form-labels) | robustness | warn | A | 126 (53%) |
| [img-alt](#img-alt) | robustness | warn | A | 4 (2%) |
| [control-name](#control-name) | robustness | warn | A | 2 (1%) |
| [positive-tabindex](#positive-tabindex) | robustness | warn | B | 0 (0%) |
| [click-target](#click-target) | robustness | warn | B | 4 (2%) |
| [landmarks](#landmarks) | robustness | warn | A | 127 (54%) |

3 of 237 pages had no warning or failure on any rule. Per-page results are in `data/corpus-simonw-tools-2026-09-30.json`. Run `npm run corpus` to repeat it.

This is a count of what a static check can see in a sample from one author, not a measure of how agents behave in general. The contrast and form-label counts in particular include pages where the check is right but the impact is small.

## Rules

### remote-dependency

No remote dependencies. Group: portability. Reports as: error.

- **Checks:** Scripts, stylesheets, fonts, frames, imports, images, audio, video and icons that load from another host, including CSS url() and @import, JavaScript import and import(), and import maps.
- **Why:** A page that needs another host stops working offline, behind a firewall, or when that host changes or disappears. Scripts, stylesheets, fonts and frames are failures because the page breaks or changes; images, media and icons are warnings because it only degrades.
- **How:** Reads every URL in markup, inline CSS, style attributes and inline scripts. Anything starting with http(s):// or // counts. data:, blob: and #fragments do not. Use --allow-host to ignore hosts you accept.
- **Limits:** Sees only URLs written out as text. Scripts that build a URL at run time are not seen. Links (<a href>) are not dependencies and are ignored.
- **Corpus:** 75 of 237 pages flagged (32%).
- **Evidence:**
  - [C] Simon Willison, 10 Dec 2025, describes loading libraries from a CDN as a standard pattern for single-file tools built with LLMs, so remote dependencies are common by design, not by accident. ([source](https://simonwillison.net/2025/Dec/10/html-tools/), read 2026-09-30)
  - [C] Simon Willison, 9 Jul 2024: Claude Artifacts can load most code that is available via cdnjs, so pages made there usually carry CDN URLs. ([source](https://simonwillison.net/2024/Jul/9/claude-share-artifacts/), read 2026-09-30)

### sibling-file

No sibling files. Group: portability. Reports as: error.

- **Checks:** Relative references (style.css, ./app.js, images/logo.png, /favicon.ico) in the same places remote-dependency reads.
- **Why:** A page that points at files next to it is not one file. Email it, paste it into a chat or drop it into a gist and those references break.
- **How:** Same scan as remote-dependency. Any URL that is not remote, not data:/blob:/# is treated as a file next to the page.
- **Limits:** A page that is meant to be served from a site with its own /favicon.ico will warn. That is a choice; skip the rule with --skip sibling-file.
- **Corpus:** 12 of 237 pages flagged (5%).
- **Evidence:**
  - [D] No public measurement found of how often agent output leaves sibling-file references. [[CONFIRM: frequency in agent-made pages]] ([source](https://github.com/simonw/tools), read 2026-09-30)

### size

Size. Group: portability. Reports as: warn.

- **Checks:** File size in bytes and gzipped, the split between script, style and embedded data URIs, and a warning when base64 data takes over the file.
- **Why:** A single file has to be downloaded, pasted or attached whole. Base64 is about a third larger than the bytes it encodes.
- **How:** Warns above 1024 KB and fails above 5120 KB by default. Change with --warn-kb and --fail-kb. Those limits are this tool's defaults, not a standard.
- **Limits:** Size is reported for the decoded text of the file. The limits are a judgment call and depend on where the page will travel.
- **Corpus:** 1 of 237 pages flagged (0%).
- **Evidence:**
  - [D] No source found that sets a sensible size budget for a single-file page. The defaults are the author's choice. [[CONFIRM: a sourced budget]] ([source](https://news.ycombinator.com/item?id=49008211), read 2026-09-30)

### offline

Works offline. Group: portability. Reports as: warn.

- **Checks:** Network calls in the page's own code: fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, service worker registration, absolute form actions, and a linked web app manifest.
- **Why:** Commenters in the Bento discussion on Hacker News singled out offline use. A service worker cannot help a single file: it must be a separate script and runs only over HTTPS or on localhost.
- **How:** Reads inline scripts for calls whose URL is a string literal.
- **Limits:** Calls to a URL built at run time are not seen. A page that calls an API on purpose will warn; that is information, not a bug.
- **Corpus:** 26 of 237 pages flagged (11%).
- **Evidence:**
  - [C] Commenters on the Bento thread (1,033 points, 22 Jul 2026) singled out offline use as the standout feature of a one-file page. ([source](https://news.ycombinator.com/item?id=49008211), read 2026-09-30)
  - [B] MDN: service workers are restricted to HTTPS (localhost is allowed for development) and are registered from a separate script file. ([source](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), read 2026-09-30)

### print-styles

Print styles. Group: portability. Reports as: warn.

- **Checks:** Whether the page has any @media print or @page rules, and two cases where having none does damage: a dark background, and a page root with overflow hidden or height 100vh.
- **Why:** Pages made to be shared get printed or saved as PDF. MDN notes that browsers may leave backgrounds out of print, which can leave light text on white paper.
- **How:** Looks for @media print, @page and a print stylesheet link. Skips pages with almost no text.
- **Limits:** Pages whose content is drawn by script after load can look empty to a static check and are skipped. The check does not render the page.
- **Corpus:** 187 of 237 pages flagged (79%).
- **Evidence:**
  - [B] MDN, print-color-adjust: a browser may leave out background images and adjust text colours when printing to suit white paper. ([source](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust), read 2026-09-30)
  - [C] The Bento author said PDF printing works well in Chrome, which shows printing is part of how one-file decks are used. ([source](https://news.ycombinator.com/item?id=49008211), read 2026-09-30)

### document-basics

Document basics. Group: portability. Reports as: warn.

- **Checks:** A doctype, a <meta charset> in the first 1024 bytes, a viewport meta tag, a lang attribute on <html>, and a page title.
- **Why:** A page opened from disk has no server sending its encoding, so the charset tag has to do that job. Without it, non-ASCII text can show garbled. Without a viewport tag phones render at desktop width.
- **How:** Text checks on the start of the file and the parsed tags. A missing charset is a failure only when the file contains non-ASCII text.
- **Limits:** Checks presence, not whether the values are right.
- **Corpus:** 28 of 237 pages flagged (12%).
- **Evidence:**
  - [B] MDN: a <meta> that declares the character encoding must be entirely within the first 1024 bytes of the document. ([source](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta), read 2026-09-30)
  - [B] WebAIM Million 2026: 13.5% of home pages were missing a document language. ([source](https://webaim.org/projects/million/), read 2026-09-30)

### contrast

Text contrast. Group: display. Reports as: warn.

- **Checks:** Text and background colour pairs that fall under 4.5:1 (3:1 for large text), read from CSS in the same rule, for light and dark mode, with custom properties resolved.
- **Why:** Low contrast was the most common or second most common failure in all three agent-output sources read, and it is the most common failure on the wider web.
- **How:** Resolves var() from :root, parses hex, rgb, hsl, oklab, oklch and common colour names, and computes the WCAG 2 ratio. A colour with no background in its rule is checked against the page background and shown only as a note.
- **Limits:** Reads CSS text, not computed styles. Gradients, images, color-mix(), lab() and currentcolor are skipped, never guessed. Text on a card is not compared with the page behind the card. Tools that render the page will find more. Skip with --skip contrast.
- **Corpus:** 131 of 237 pages flagged (55%).
- **Evidence:**
  - [A] A11y LLM Eval: colour contrast was 89.1% of axe failures across all models and cases. ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)
  - [A] Suh et al. 2025: contrast issues were 80% of all violations when scored with AChecker. ([source](https://arxiv.org/html/2503.15885v1), read 2026-09-30)
  - [A] A11yn: colour contrast was the second most common violation for the baseline model, 702 on average. ([source](https://arxiv.org/html/2510.13914v1), read 2026-09-30)
  - [B] WebAIM Million 2026: low-contrast text on 83.9% of home pages. ([source](https://webaim.org/projects/million/), read 2026-09-30)

### reduced-motion

Reduced motion. Group: display. Reports as: warn.

- **Checks:** Animation (CSS animation, @keyframes, movement transitions, smooth scrolling, autoplay video, requestAnimationFrame, Web Animations) with no prefers-reduced-motion query or check anywhere in the page.
- **Why:** MDN names vestibular motion disorders as the reason people turn motion off.
- **How:** Counts motion sources and looks for the prefers-reduced-motion media query in CSS or a matchMedia check in script. Colour and opacity transitions are not counted.
- **Limits:** Does not judge whether the reduced-motion path is good, only that one exists. A requestAnimationFrame loop may be a game or a chart, where the right answer differs.
- **Corpus:** 79 of 237 pages flagged (33%).
- **Evidence:**
  - [B] MDN: prefers-reduced-motion exists so pages can remove, reduce or replace motion; scaling or panning large objects can trigger vestibular discomfort. ([source](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), read 2026-09-30)
  - [D] No public measurement found of how often agent output ignores reduced motion. [[CONFIRM: frequency in agent-made pages]] ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)

### viewport-height

Viewport height. Group: display. Reports as: warn.

- **Checks:** height: 100vh with no dvh or svh line in the same rule, overflow hidden on html or body, and a fixed pixel height on the page root.
- **Why:** On phones 100vh is the height with the browser bar hidden, so a full-height block spills below the visible area. Overflow hidden on the page root makes anything below the fold unreachable and cuts printouts to one page.
- **How:** Reads height and overflow declarations in CSS rules.
- **Limits:** Does not know whether a 100vh element is meant to overflow, such as a hero section. Treat as a prompt to look.
- **Corpus:** 18 of 237 pages flagged (8%).
- **Evidence:**
  - [B] web.dev, 29 Nov 2022: elements sized to 100vh bleed out of the viewport while browser toolbars are showing; svh, lvh and dvh units fix it. ([source](https://web.dev/blog/viewport-units), read 2026-09-30)
  - [D] No public measurement found of how often agent output uses 100vh. [[CONFIRM: frequency in agent-made pages]] ([source](https://web.dev/blog/viewport-units), read 2026-09-30)

### focus-outline

Focus outline. Group: display. Reports as: warn.

- **Checks:** outline: none or 0 on a rule when nothing else in the page draws a focus indicator.
- **Why:** Keyboard users lose track of where they are. W3C lists removing the focus indicator as a failure of success criterion 2.4.7.
- **How:** Finds outline removal, then looks for a :focus or :focus-visible style that draws something, or a replacement in the same rule.
- **Limits:** A replacement set in script or a parent rule can be missed. The check is on CSS text.
- **Corpus:** 2 of 237 pages flagged (1%).
- **Evidence:**
  - [B] WCAG 2.4.7 Understanding: styling outlines so the focus indicator becomes non-visible is a listed failure (F78). ([source](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), read 2026-09-30)
  - [D] No public measurement found of how often agent output removes the focus ring. [[CONFIRM: frequency in agent-made pages]] ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)

### zoom-blocked

Pinch zoom. Group: display. Reports as: warn.

- **Checks:** user-scalable=no or 0, or maximum-scale below 2, in the viewport meta tag.
- **Why:** People who need larger text cannot zoom. The W3C test rule treats user-scalable=no and maximum-scale under 2 as failures.
- **How:** Parses the viewport content attribute.
- **Limits:** Checks the tag only, not page-level scripts that intercept gestures.
- **Corpus:** 6 of 237 pages flagged (3%).
- **Evidence:**
  - [B] W3C ACT rule b4f0c3: fails if the viewport sets user-scalable to no or maximum-scale to less than 2; WCAG 1.4.4 asks for text resizing to 200%. ([source](https://www.w3.org/WAI/standards-guidelines/act/rules/b4f0c3/), read 2026-09-30)

### form-labels

Form labels. Group: robustness. Reports as: warn.

- **Checks:** Inputs, selects and textareas with no label for= link, wrapping label, aria-label, aria-labelledby or title. A placeholder alone is reported separately.
- **Why:** A field with no programmatic label has no name for a screen reader, and a placeholder disappears as soon as someone types.
- **How:** Matches label for= to ids, walks up to a wrapping <label>, and checks the naming attributes.
- **Limits:** A visible <label> that is not linked counts as unlabelled, which is correct but can surprise. Names set by script are not seen.
- **Corpus:** 126 of 237 pages flagged (53%).
- **Evidence:**
  - [A] A11y LLM Eval: form labels and required-field indicators failed in 5% to 70% of samples depending on the case; helper-text association failed in 50% to 100%. ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)
  - [B] WebAIM Million 2026: missing form input labels on 51% of home pages. ([source](https://webaim.org/projects/million/), read 2026-09-30)

### img-alt

Image alt text. Group: robustness. Reports as: warn.

- **Checks:** <img> elements with no alt attribute at all. alt="" for decoration passes.
- **Why:** Without alt, screen readers read the file name.
- **How:** Checks for the attribute, not its quality.
- **Limits:** Does not judge whether alt text is useful, or whether an image of text should be real text.
- **Corpus:** 4 of 237 pages flagged (2%).
- **Evidence:**
  - [B] WebAIM Million 2026: missing alternative text on 53.1% of home pages. ([source](https://webaim.org/projects/million/), read 2026-09-30)
  - [A] Suh et al. 2025 found GPT-4o improved alternative text handling by over 70% against human code. Models do better here than elsewhere, so expect few hits from agent output. ([source](https://arxiv.org/html/2503.15885v1), read 2026-09-30)

### control-name

Button and link names. Group: robustness. Reports as: warn.

- **Checks:** Buttons and links with no text, aria-label, title, image alt or svg title.
- **Why:** An icon-only button with no name is announced as just "button".
- **How:** Looks at text inside the element and the naming attributes of it and its children.
- **Limits:** Icon fonts drawn with CSS content are invisible to this check and read as empty.
- **Corpus:** 2 of 237 pages flagged (1%).
- **Evidence:**
  - [A] A11yn: link-name was the fourth most common baseline violation, 129 on average. ([source](https://arxiv.org/html/2510.13914v1), read 2026-09-30)
  - [B] WebAIM Million 2026: empty links on 46.3% and empty buttons on 30.6% of home pages. ([source](https://webaim.org/projects/million/), read 2026-09-30)

### positive-tabindex

Tab order. Group: robustness. Reports as: warn.

- **Checks:** tabindex with a value above 0.
- **Why:** Positive values pull an element ahead of the natural tab order and usually break the reading sequence. W3C failure F44 covers tab orders that do not preserve meaning; positive tabindex is a common way to cause it.
- **How:** Reads the attribute.
- **Limits:** A deliberate positive tabindex is rare but possible.
- **Corpus:** 0 of 237 pages flagged (0%).
- **Evidence:**
  - [B] WCAG 2.4.3 Understanding lists F44, using tabindex to create a tab order that does not preserve meaning and operability. The page does not name positive values specifically. ([source](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), read 2026-09-30)
  - [D] No public measurement found for agent output. [[CONFIRM: frequency in agent-made pages]] ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)

### click-target

Keyboard-reachable clicks. Group: robustness. Reports as: warn.

- **Checks:** An inline onclick on an element that a keyboard cannot reach: no role and no tabindex, and not a button, link or form control.
- **Why:** A div that acts as a button works with a mouse only. W3C lists emulating links this way as failure F42.
- **How:** Inline onclick attributes only.
- **Limits:** Listeners added with addEventListener cannot be matched to elements without running the page, so most modern code is not covered.
- **Corpus:** 4 of 237 pages flagged (2%).
- **Evidence:**
  - [B] WCAG 2.1.1 Understanding lists F42, a failure when static elements are made to act as links without keyboard support. ([source](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), read 2026-09-30)
  - [D] No public measurement found for agent output. [[CONFIRM: frequency in agent-made pages]] ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)

### landmarks

Main landmark. Group: robustness. Reports as: warn.

- **Checks:** A page with real text content and no <main> element or role="main".
- **Why:** Screen reader users jump between landmarks. Missing landmarks were the most common baseline violation in one agent-output study and a large share of best-practice failures in another.
- **How:** Looks for <main> or role=main when the page has at least 200 characters of text.
- **Limits:** Does not check the other landmarks (header, nav, footer) or that content sits inside them.
- **Corpus:** 127 of 237 pages flagged (54%).
- **Evidence:**
  - [A] A11yn: region (content outside landmarks) was the most common baseline violation, 894 on average, and landmark-one-main the third, 164. ([source](https://arxiv.org/html/2510.13914v1), read 2026-09-30)
  - [A] A11y LLM Eval: landmark structure was 37% to 44% of best-practice failures. ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)

## Known failures the linter does not check yet

### Modal dialog focus and keyboard behaviour

- [A] A11y LLM Eval: modal dialog behaviour (hiding background content, focus management, keyboard trapping) failed in 52% to 92% of samples. ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)
- **Why it is not checked:** Needs a browser that opens the dialog and presses Tab. A static check cannot tell.

### Skip navigation links

- [A] A11y LLM Eval: skip navigation links were missing in all Shopping Home Page samples. ([source](https://microsoft.github.io/a11y-llm-eval-report/index.html), read 2026-09-30)
- **Why it is not checked:** Only matters on pages with repeated navigation, which is rare in one-file pages. Could be added as a check for pages with a <nav> and no skip link.

### ARIA attributes that are present but wrong

- [A] Suh et al. 2025: models did worse than human developers on complex ARIA requirements, for example graphics labelling. ([source](https://arxiv.org/html/2503.15885v1), read 2026-09-30)
- **Why it is not checked:** Judging ARIA needs the accessibility tree, which needs a rendered page.
