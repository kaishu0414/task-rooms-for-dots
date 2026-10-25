# Verification status

**Public source repository:** [Task Rooms for Dots](https://github.com/kaishu0414/task-rooms-for-dots).
The repository and installation entry documents were confirmed publicly readable
on 2026-10-25. This confirms public access to source, not installation in a new
owner's account. The test results below were recorded during pre-publication
preparation and retain their original scope and limitations.

Project-authored code uses the MIT License.
Each new owner must verify their own setup and devices before calling the
installation complete. Results below are point-in-time checks, not a guarantee
that the software is free of vulnerabilities.

## Task Rooms for Dots branding revision — 2026-10-25

The formal application name is now **Task Rooms for Dots** in the page and Apple
web-app titles, visible header, accessible image text, PWA manifest, notification
titles, MCP event description, installation instructions, and private launch
draft. The PWA `short_name` remains `Task Rooms` for compact device labels.
The visible header splits the formal name across two lines without shrinking
the action group. The existing independent SVG and three PNG icons are unchanged.
No official dot character image was added.

Authorization logic, storage schemas, internal tool/event/package identifiers,
launch paths, resource paths, and dependency versions are unchanged. Backend
edits are restricted to the notification title and descriptive event text.
Existing copyright attribution and internal benchmark labels remain intact.

| Check | Result |
| --- | --- |
| Dependency installation | `npm ci --ignore-scripts` passed |
| Unit/security regression suite | 245 passed, 0 failed, 0 skipped; includes a full-name/header-layout source regression |
| TypeScript and production compilation | Both passed; the existing route-classification warning remains |
| Dependency advisory scan | Full lockfile `npm audit` reported 0 advisories |
| Missing-owner setup check | Exited 1 with `NOT READY`, as expected for the source-only template |
| Static UI inspection | Server-rendered the real component and compiled styles locally; checked two-line markup, full accessible name, bounded brand flex sizing, and non-shrinking actions |
| Browser viewport validation | Not completed in this revision: the local headless browser could not start in the execution environment, and the normal cloud browser disallowed the local file URL |

The source regression and static rendering do **not** establish that the header
fits at 320 px or that mobile installation works. Desktop/compact real-browser
review is still required on an authorized private QA Site, including checks for
name clipping, overlapping actions, and readability. No new hosted deployment,
real-device PWA installation, event delivery, or push delivery was performed for
this branding revision. The earlier hosted checks below are historical results,
not verification of this renamed header.

## Onboarding documentation revision — 2026-10-25

The preceding onboarding v3 revision changed documentation and its release
inventory only. At that revision, application code, authorization logic,
configuration examples, schemas, tests, package versions, and the lockfile were
byte-for-byte unchanged from the original prepared source. The progress protocol is an instruction to the installing dot, not a
new app timer or a guarantee of continuous execution.

Repeated on Linux x64 with Node.js 24.22.1:

| Check | Result |
| --- | --- |
| Dependency installation | `npm ci --ignore-scripts` completed from the official npm registry; the preceding offline attempt stopped because one package was absent from cache |
| Unit/security regression suite | 244 passed, 0 failed, 0 skipped |
| TypeScript and production compilation | Both passed; the same route-classification warning remains |
| Dependency advisory scan | Full lockfile `npm audit` reported 0 advisories, including development dependencies |
| Missing-owner setup check | Exited 1 with `NOT READY`, as expected for a source-only template; no credentials were configured |
| Documentation consistency | Relative file and heading links checked; seven core milestones separated from optional settings; promotional draft excluded from distribution |

PWA instructions were checked against the linked Apple, Google, Microsoft, and
WebKit guidance on 2026-10-25. Documentation research is not device testing.
The [first-run checklist](docs/FIRST_RUN_TEST.md) is an unexecuted test plan.
No different owner's installation, new hosted deployment, PWA installation,
automatic event delivery, or push notification was performed for this revision.
The historical hosted results below still describe only the separate QA Site
in the original authorized account.

## Passed locally

Verified on 2026-10-25 with Node.js 24.22.1, Linux x64:

| Check | Result |
| --- | --- |
| Fresh dependency installation | `npm ci --ignore-scripts` completed from the official npm registry, with no package lifecycle scripts executed |
| Unit/security regression suite | 244 tests passed, 0 failed, 0 skipped |
| TypeScript | `npm run typecheck` passed |
| Production compilation | `npm run build` passed |
| Bounded synthetic performance checks | Seven local in-memory scenarios completed; all 1,000-message histories traversed without gaps or duplicates. See [measurement conditions and limits](docs/PERFORMANCE.md) |
| Schema consistency | `npm run db:generate` reported no schema changes |
| Empty database | New schema creates 10 empty tables; no tasks, messages, owner accounts, or subscriptions are seeded |
| Dependency advisory scan | Full lockfile `npm audit` reported 0 advisories, including development dependencies |
| Vendored RSC version | `@vitejs/plugin-rsc` 0.5.38 bundles React Server DOM 19.3.1; direct React Server DOM is also 19.3.1 |
| Configuration defaults | Missing owner configuration is rejected; the setup checker exits with `NOT READY` rather than creating anything |
| Generic install icons | New SVG and 3 PNG sizes inspected; PNGs have no text/EXIF metadata or embedded private images |

The build reports that route static/dynamic classification is incomplete in the
framework's static analysis. Compilation still completed; this is not evidence
of successful hosted authentication or delivery.

## Covered security cases

- Missing, partial, or wrong owner identity is rejected before MCP discovery,
  tools, images, or event subscription operations access storage.
- Initial identity lookup is a narrow exception: configured owner email plus
  trusted Sites sign-in are required, and only that caller's Site-scoped ID is
  returned. An existing configured ID must also match. It never reads tasks or
  writes storage.
- Display names cannot grant access and are bounded separately from identity.
- Browser writes require same origin; private attachment reads require owner
  authentication and return no-store/nosniff response headers.
- Selected history requires a preview and explicit confirmation of unchanged
  text. Unknown provenance/attachment fields, excessive input, changed hashes,
  conflicting keys, and concurrent conflicting imports are rejected. Imported
  text remains untrusted historical context, never a pending request or event.
- Bounded thread pages reject malformed, cross-task and stale cursors. Partial pages never automatically acknowledge hidden replies. Explicit owner acknowledgement uses only the captured page time, rejects stale room/page confirmation, leaves later replies unread, and does not alter pending user delivery.
- Board previews retain at most 400 Unicode codepoints; original text remains in paged history.
- Message/attachment retries, upload limits, reaction ownership, event callback
  validation, push endpoints, and text/image undo regressions are tested.

## Passed in a separate owner-private validation Site

Verified on 2026-10-25 using a new, separate Site and fictional test data only:

| Check | Result |
| --- | --- |
| Fresh hosted setup | Empty task board loaded after schema deployment; no existing database or bucket was copied |
| Fail-closed configuration | Before owner setup, the application refused task access |
| Two-phase owner setup | Email-only bootstrap returned the signed-in owner's Site-scoped ID; normal operation began only after both owner fields were configured server-side |
| Private MCP provisioning | The platform provisioned the new Site's own plugin without relaxing owner checks |
| Real MCP tool calls | `list_tasks` and `list_pending_messages` returned only the fictional QA room; browser posts had verified user provenance |
| Manual request/reply round trip | Two browser posts received replies through `reply_to_message`; messages appeared in the same room and the pending list became empty |
| Idempotent reply retry | Retrying the identical reply/key returned the same reply without duplication |
| Private image path | A newly created generic icon was uploaded in the browser, displayed in the thread and preview, and read through authenticated `get_attachment` |
| Desktop visual review | Rendered empty board, new-room view, conversation, image preview, and fictional display names inspected at approximately 1180 px content width |
| Compact visual review | Rendered task list and conversation inspected at 500 px content width, using ordinary window resizing; task titles and display labels remained bounded |
| Revised bounded-read deployment | Revised source and migration deployed successfully; real MCP returns explicit page metadata for a five-record fictional thread |
| Revised small-thread visual review | The new page-status/navigation controls were inspected after loading at approximately 1180 px and 500 px desktop widths; unavailable page buttons were disabled. Full small-thread automatic receipt cleared its four unread replies |
| Completion state | Dummy task marked complete through its own plugin and moved to the completed section |

The validation used the existing authorized account with a **new Site**, not a
different person's account. Identity configuration and all test records stayed
outside this distributed source. No screenshots, runtime URLs, project IDs,
owner identifiers, or server secrets are included in this report or package.
The original application and its data were not changed or used as QA fixtures.

This was a manual MCP round trip, not an automatic event-delivery test. An owner
editing toolbar initially overlapped a send control; hiding that toolbar with
its normal UI allowed the test to proceed. The application's authorization was
not weakened for browser or MCP testing.

## Not yet verified

- Hosted multi-page navigation and the new explicit acknowledgement confirmation.
  The bounded fictional fixture setup stopped on a native tool error after four
  assistant replies plus one historical context record; no further fixture
  writes or workaround were attempted. Local cursor traversal, unread receipt,
  navigation-race and captured-time tests passed, but are not browser end-to-end proof.

- Installation by a different owner/account and behavior of an actual second,
  unauthorized account (negative authorization cases are covered by local tests).
- Real event subscription and signed callback delivery; no event keys or
  subscriptions were configured for this validation.
- Web Push delivery, OS notifications, or device badges; no push keys were
  configured for this validation.
- Desktop/mobile PWA installation, real iOS/Android behavior, narrower phone
  widths, and maximum-length display names. Compact desktop rendering is not a
  substitute for testing a real phone. Device emulation was unavailable.
- Non-Linux/older supported Node runtimes and end-to-end hosted history import.

The 500 px and desktop screenshots were reviewed directly, not distributed.
A generic icon review alone was not treated as full application visual QA.
