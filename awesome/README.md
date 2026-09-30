# Single-file web apps, checked by script

Checked 2026-09-30 with onefile-lint 0.1.0 (`npm run list:refresh`). A page is listed when its file has no remote dependency and no sibling file, so it still works if you save it and open it offline. "Offline" is **yes** when the page also makes no network calls of its own, and **partly** when it does.

This list is checked, not endorsed. Licences are read from the GitHub repo and can lag; see the repo before reusing anything. Sizes are the file as served.

| App | What the page says | Size | Offline | Licence | Checked |
| --- | --- | ---: | --- | --- | --- |
| [Bento](https://bento.page/slides/) | The office suite that fits in a file (the repo's own description) | 678 KB | yes | MIT | 2026-09-30 |
| [Date calculator (simonw/tools)](https://tools.simonwillison.net/date-calculator) | Date Calculator | 13 KB | yes | Apache-2.0 | 2026-09-30 |
| [Encrypt (simonw/tools)](https://tools.simonwillison.net/encrypt) | Encrypt / decrypt message | 12 KB | yes | Apache-2.0 | 2026-09-30 |
| [Flexbox playground (simonw/tools)](https://tools.simonwillison.net/flexbox-playground) | Interactive CSS Flexbox Playground | 25 KB | yes | Apache-2.0 | 2026-09-30 |
| [HyperVault](https://hypervault.github.io/) | Hypervault | 178 KB | yes | none stated | 2026-09-30 |
| [Image to JPEG (simonw/tools)](https://tools.simonwillison.net/image-to-jpeg) | Drag and Drop Image Optimizer | 15 KB | yes | Apache-2.0 | 2026-09-30 |
| [JSON diff (simonw/tools)](https://tools.simonwillison.net/json-diff) | JSON Diff Tool | 28 KB | yes | Apache-2.0 | 2026-09-30 |
| [Linear Text](https://lineartext.com) | Linear Text | 8 KB | yes | AGPL-3.0 | 2026-09-30 |
| [Minesweeper (simonw/tools)](https://tools.simonwillison.net/minesweeper) | Minesweeper | 16 KB | yes | Apache-2.0 | 2026-09-30 |
| [NoteMode](https://vinarat0r.github.io/NoteMode/) | NoteMode | 154 KB | yes | none stated | 2026-09-30 |
| [Photo scrubber (simonw/tools)](https://tools.simonwillison.net/photo-scrubber) | Photo Scrubber - local face blur & metadata removal | 64 KB | yes | Apache-2.0 | 2026-09-30 |
| [Pomodoro (simonw/tools)](https://tools.simonwillison.net/pomodoro) | Pomodoro Timer | 12 KB | yes | Apache-2.0 | 2026-09-30 |
| [SVG render (simonw/tools)](https://tools.simonwillison.net/svg-render) | SVG to JPEG/PNG | 15 KB | yes | Apache-2.0 | 2026-09-30 |
| [TiddlyWiki](https://tiddlywiki.com/) | a non-linear personal web notebook | 2.4 MB | yes | not detected by GitHub | 2026-09-30 |

## Checked and left out

These were checked and do not meet the rule today. The reason is what the linter reported; the app itself may be fine, because the page tested is often its website, not the app file.

- Feather Wiki (https://feather.wiki/): sibling-file: 2 relative references
- FuzzyGraph (https://fuzzygraph.com/): remote-dependency: 1 remote reference: static.cloudflareinsights.com
- Offline Notepad (https://offlinenotepad.com): remote-dependency: 1 remote reference: umami.schollz.com; sibling-file: 5 relative references
- Slingcode (https://slingcode.net/): remote-dependency: 2 remote references: www.youtube.com, mccormick.cx; sibling-file: 5 relative references

## Add one

Add an entry to `apps.json` (name, `url`, optional `file` if the single file differs from the page, `repo` for the licence, and a `source`) and run `npm run list:refresh -- --only <id>`. If the check passes, the entry appears in the table. Only pages that pass are listed, so there is nothing to argue about.

The monthly refresh workflow is disabled until the repo launches. It opens a pull request with the new numbers rather than pushing.
