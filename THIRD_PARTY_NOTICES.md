# Third-party components

## Project license

Project-authored source is licensed under the **MIT License**; see `LICENSE`. Modification and commercial use are permitted subject to its notice conditions. Third-party components retain their own licenses and notices.

## Vendored build integration

- File: `scripts/vite/sites-vite-plugin.ts`
- Accompanying license: `scripts/vite/sites-vite-plugin.LICENSE` (MIT, OpenAI copyright notice retained).
- Source attribution recorded in the supplied Sites starter: `@openai/sites-vite-plugin` 0.2.0, `openai/sites#9`.
- Local modification: tolerate an absent `.openai/hosting.json` during local-only builds. Mock authentication is disabled by `vite.config.ts`.
- Verification: compared byte-for-byte with the installed official Sites plugin 1.1.2 starter; the only source change is the absent-manifest guard above, and the MIT license text matches. The upstream GitHub tag/repository was not separately fetched.

## Package dependencies

`DEPENDENCY_LICENSES.json` inventories 337 package entries from the lockfile with versions and license metadata. 0 entries have no license metadata in the lockfile and require review before distribution. The inventory is separate from the vendored build integration above. Install packages through the lockfile; their original licenses and notices remain applicable. The package inventory is not a warranty that every transitive obligation has been resolved.

## Assets

`public/taskrooms.svg` is newly authored generic SVG geometry. Three PNG install icons are rasterized only from that new SVG. No private avatar, photo, or original icon bitmap is distributed. Test image bytes are synthetic format-validation fixtures.
