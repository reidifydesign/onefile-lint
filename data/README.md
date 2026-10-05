# Data note

`corpus-simonw-tools-2026-09-30.json` is a summary of one onefile-lint run over the single-file pages in
[simonw/tools](https://github.com/simonw/tools), Simon Willison's public repo of tools, which describes
itself as "Assorted useful tools, almost entirely generated using LLMs". The repo is licensed Apache-2.0.
It is used here with thanks: a large public corpus of single-file pages is what made the measurement possible.

- Read on 2026-09-30, at commit `83a5d432c662a71e50ac87872b69dec5015d454d`, 237 top-level `.html` files.
- The file holds each page's name, size and per-rule result. It does not hold the pages. They are fetched
  from the repo at that commit by `npm run corpus` and are not stored here.
- The results say what a static check can see. They are not a verdict on the pages or on their author:
  loading a library from a CDN is often a deliberate choice, and the rules only ask whether a page is
  still one file.
- Run `npm run corpus` to repeat it. A later commit of the repo will give different counts.
