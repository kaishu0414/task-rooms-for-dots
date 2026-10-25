# Dependency maintenance notes

The lockfile is part of the reviewed source. Install it with `npm ci
--ignore-scripts` after reviewing the repository. Do not replace it with an
unreviewed dependency tree or disable TLS verification to install packages.

This draft updates the framework and tooling to patched compatible releases:
Next.js 16.4.3, React/React DOM/React Server DOM 19.3.1, Vinext 1.3.0,
Vite 8.3.5, Cloudflare Vite plugin 1.65.0, Wrangler 4.152.0, and RSC plugin
0.5.38. The RSC plugin's bundled renderer was checked separately; package audits
do not necessarily inspect vendored code.

The `overrides` in `package.json` pin patched transitive packages. They are not
security bypasses. Review their need on each upgrade, re-run the full advisory
scan and the regression/build/schema checks, and avoid blindly removing them.
The esbuild override crosses older 0.x dependency ranges; schema generation was
explicitly tested and produced no new migration.

The full npm advisory scan reported zero findings on the verification date in
`TEST_REPORT.md`. This is not a permanent or comprehensive safety claim. Newly
reported vulnerabilities, changes to dependency code, runtime boundaries, and
unused-but-vendored modules still need review. The license inventory is in
`DEPENDENCY_LICENSES.json` and is metadata, not a legal assessment.
