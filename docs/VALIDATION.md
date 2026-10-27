# Validation / Validación — 2026-10-26

Windows, Node v24.11.1, npm 11.6.2. Base commit 290e50c9007c381cca0c3c28be57239b4afa5de9.

- Baseline: npm test: 6 passed, 0 failed.
- npm ci: successful, four installed packages.
- Final npm test: 27 passed, 0 failed, 0 skipped; 11.17 seconds. Includes one parent test and eight browser/CLI subtests.
- npm audit --json: zero known vulnerabilities (five dependency metadata entries including root).
- git diff --check: passed.
- Real Chromium + axe found image-alt and button-name on a loopback fixture.
- Child CLI processes verified text, JSON, HTML file creation, exits 0/1/2, HTTP 404, missing output directory and Windows paths containing spaces, percent and hash.
- Six unit cases inject failures during context/page creation, navigation, analysis and both cleanup operations.

First browser run: 15 passed and 6 failed (parent included) because the execution sandbox changed the default browser cache path between commands. Installed Chromium into a persistent workspace path and reran successfully. The output-write test was strengthened to require ENOENT so a missing browser cannot falsely pass that assertion.

Reproduction in this workspace / Reproducción:
```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '..\browsers'
npm ci
npx playwright install chromium
npm test
npm audit --json
```
Normal installations can omit PLAYWRIGHT_BROWSERS_PATH. No browser download or node_modules are committed.

Pending / Pendiente: remote Actions Windows/Linux Node 22/24; clean Windows user installation and npm link; manual screen reader/keyboard review; authenticated sites; performance and adversarial network fixtures. No claim that these passed. No release, deployment or remote branch publication performed.

La fase 1 conserva la CLI y sus informes; multipágina, CSV, traducciones de recomendaciones, historial y UI pertenecen a las fases siguientes. El servicio actual ejecuta páginas con acceso a la red local: no usarlo como servicio expuesto ni afirmar protección SSRF.


## Professional development continuation / Continuación profesional

2026-10-26. Nine alternatives reviewed using official sources; no commercial accounts or comparative detection benchmarks used.

- 84 tests passed locally on Windows / Node 24.11.1; zero failures and skips in the final run.
- Project batches: two loopback sites, a failed 404 target, deterministic order, 1–4 workers, strict config and bounded file reading, cancellation and actual navigation timeout.
- Reports: HTML keyboard expand/collapse checked in real Chromium; report fixture passed axe with no automated violations. This does not replace manual assistive-technology review. CSV formula-prefix neutralization and quoting tested; ES offline guidance checked through the CLI.
- Baselines: real CLI snapshot comparison, plus new/persistent/resolved identities; failed/cancelled pages, engine changes, redirect changes and added/removed scope do not produce false resolutions. DOM selector changes remain a documented limitation.
- Hash-route regression: preserve URL fragments in single audits, project scopes and baselines; real browser assertion covers the final URL.
- npm audit: zero known vulnerabilities. No new dependencies.
- Benchmark: two runs per concurrency level, three local pages. Serial 4674/3645 ms; concurrency 2: 2420/3606 ms. Sampled Node RSS 164323328–173744128 bytes; Node CPU 358–610 ms per run. Browser process resources excluded. Not a statistical benchmark, throughput promise or competitor comparison.
- CIM process-tree inspection was unavailable in the execution sandbox. Full Chromium process-tree memory/CPU measurement remains pending.
- First continuation browser run failed with ERR_NETWORK_ACCESS_DENIED. Network permission was granted for the fixture and the suite reran successfully. A separate report-test setup error (browser.newPage instead of an explicit context) was corrected and rerun.
- git diff --check passed before delivery.

Remote branch: develop/phase-1-foundation. The Git credential helper could not run in the sandbox; the connected GitHub API reproduced each commit tree exactly, preserving the commit boundaries and messages. Author/timestamps change commit IDs; local original history remains preserved in separate local branches. No force push, main modification, merge, release or deployment.

Initial remote Actions run: https://github.com/eligeunaweb/accesspilot-ai/actions/runs/40340593548 . macOS Node 22/24 passed when first inspected; other jobs were still running. Final branch status must be checked separately after the hash-route correction; local passing tests do not imply remote completion.

Remaining product work is explicit in ARCHITECTURE.md: secured egress/crawling, full rule guidance/localization, historical storage/redaction, local UI/API, journeys/manual evidence, scheduling/plugins, full platform installation and release acceptance. The project is not finished or ready for a stable release.

Final report regression: unknown severity uses its own translated label; 84 local tests passed after this correction. Remote checks for that exact commit remain independent.


## Restricted crawl/egress phase / Rastreo y red — 2026-10-26

- Final local suite: **145 passed, 0 failed, 0 skipped**, 28.72 seconds. Windows,
  Node 24.11.1, Chromium 1.64.1 package browser. Real HTTP, TLS CONNECT, Chromium,
  axe and child CLI processes were executed against controlled loopback fixtures.
- This suite used ACCESSPILOT_TEST_OUTER_SANDBOX=1 through a **test-only** loader.
  Chromium sandbox startup itself failed in this nested Windows execution host
  (exit 2147483651). Product restricted mode still requires its sandbox and has
  no fallback. Native strict-mode validation remains a distinct CI/platform gate.
- Verified: deterministic BFS/depth/source tracking; deduplication/exclusions;
  page/link/deadline truncation; CSV coverage warnings; private/special IPv4/IPv6
  classification; mixed DNS answers/rebinding rejection; numeric destination
  pinning; exact-origin private exceptions; proxy authentication and credential
  stripping; HTTP/TLS tunnel operation; HTTP/HTTPS redirect budgets; POST,
  WebSocket and subresource blocks; blob-worker rejection; transfer/connection
  exhaustion; cancellation while DNS resolution is pending; policy-version-aware
  baseline comparisons. The forbidden local fixture received zero requests in
  the browser bypass tests.
- The real crawler CLI visited four fixture pages in BFS order and successfully
  compared a second snapshot; /logout and out-of-origin links were not crawled.
- Early test failures were investigated, not skipped: nested browser sandbox
  unavailable; route-only redirect checks missed subsequent hops; a Windows
  --import helper needed a file URL. Each issue was addressed and tests rerun.
- npm audit: zero known vulnerabilities; no added dependencies or lockfile changes.
- Three-page restricted crawl diagnostic, two repetitions: concurrency 1 took
  3475/3453 ms; concurrency 2 took 2347/2293 ms. Node CPU 328–406 ms; sampled Node
  RSS 128462848–172146688 bytes. The same test launcher adapter was used. These
  numbers exclude Chromium CPU/RSS and are not throughput or superiority claims.
- Previous head 70d3c5a remote run 40341411865 had five successful matrix jobs and
  one cancelled job, so it was not a fully passing six-job run. New phase checks
  must be read from their own commit. CI now cancels obsolete branch/PR duplicate
  runs to reduce redundant work.

Exact source and detailed boundaries: NETWORK-CRAWLING.md. OS firewall/process
isolation, shared-worker/iframe adversarial review, manual assistive technology,
large-site resources and a public/local job API remain outside the completed
validation. This phase does not mark B2's future service-isolation gate closed.


Native Ubuntu 22-node job 121657895139 on bc3146d failed (132 pass / 13 fail)
because AppArmor denied Chromium user namespaces. macOS/Node 22 on the same run
passed the strict tests. The subsequent CI-only fix grants namespaces to exact
installed Chromium paths; generator path/injection checks were executed locally.
Native matrix results after that setup change must be checked on the new commit.
# Local history validation / Validación del historial — 2026-10-26

- 153 tests passed, 0 failed, 0 skipped, 23.72 seconds, Windows / Node 24.11.1.
- Real Chromium + axe CLI processes saved two runs, compared the latest evidence
  and listed both records. Unit tests covered concurrent writes, incomplete-file
  exclusion, project separation, evidence minimization, corruption and schema errors.
- Command: `node --import ./tests/helpers/outer-sandbox.js --test` with
  `ACCESSPILOT_TEST_OUTER_SANDBOX=1`, `PLAYWRIGHT_BROWSERS_PATH` set to the installed
  workspace browser cache, and TEMP/TMP set to a writable workspace test directory.
- Initial executions failed due to sandbox temporary-file rename restrictions,
  missing browser-cache configuration and denied loopback access. After granting
  network permission and configuring the test paths, the entire suite passed.
  No product network/sandbox controls were disabled by the implementation.
- The existing test-only browser launcher adapter remains necessary in this host.
  This result does not verify Chromium's nested sandbox, native macOS/Linux,
  power-loss recovery, network-filesystem atomicity or Windows ACL isolation.
  Native CI for this new history commit must be checked separately.
- Manual screen-reader/user tests, configurable retention, full anonymization,
  future-schema migrations and the history web viewer remain unimplemented or
  unvalidated. See HISTORY.md for storage/privacy guarantees.

# Count-based retention validation / Retención por número — 2026-10-26

- Full suite: 159 passed, 0 failed, 0 skipped, 28.75 seconds, Windows / Node 24.11.1.
- Real CLI E2E saved two browser/axe runs, previewed keeping one without deletion,
  applied retention and verified only one record remained.
- Unit tests exercised concurrent writes/pruning, idempotence, preservation of
  unrelated files and other projects, invalid limits, corruption/foreign-record
  refusal before deletion and fail-closed abandoned-lock handling.
- Same host-specific command and test-only browser adapter as the local-history
  validation below; writable workspace TEMP/TMP, installed browser cache and
  network permission for controlled local fixtures were required.
- No new dependencies. No native CI result is claimed for this new change yet.
- Lock crash recovery is manual; all cooperating processes must use this version.
  I/O failure midway through unlinking can leave partial retention progress.
  Power-loss, network filesystem semantics and hostile local writers are outside
  these guarantees. Automatic scheduled/age/size retention is not implemented.

# Read-only history viewer / Visor del historial — 2026-10-26

- Full local suite: **168 passed, 0 failed, 0 skipped**, 26.58 seconds,
  Windows / Node 24.11.1. No new dependencies.
- Command: `node --import ./tests/helpers/outer-sandbox.js --test` with installed
  workspace PLAYWRIGHT_BROWSERS_PATH, writable workspace TEMP/TMP and
  ACCESSPILOT_TEST_OUTER_SANDBOX=1. Network permission enabled local HTTP fixtures.
  This host still needs the documented test-only Chromium launch adapter;
  production sandbox startup and the new commit's native CI remain separate checks.
- HTTP tests: secret session path, exact Host, Origin, Fetch Metadata, GET-only,
  strict parameters including prototype-name language inputs, traversal/foreign
  record refusal, validated JSON attachments, corruption errors without local
  paths, empty history, pagination, complete export despite display truncation,
  independent tokens, and shutdown with an incomplete HTTP connection.
- Real Chromium/axe: ES/EN history views, run details, comparison, keyboard
  navigation and details expansion, comparison form submission, escaped malicious
  project/selector text and no horizontal overflow at a 375 px comparison viewport.
  The CLI subprocess started the viewer with an unreachable configured audit URL
  without auditing it. Fixture screenshot contains deliberate escaped XSS text.
- Found and corrected during testing: axe required an explicit browser context;
  comparison headings skipped a level; a forcefully closed incomplete socket can
  report expected ECONNRESET on Windows. None were skipped or suppressed in product.
- Not validated: manual screen-reader/user workflows, large-history resource
  benchmarks, hostile local processes, independent security review or a job API.
  Audit execution from the web is intentionally outside this phase and still needs
  OS/network service isolation. See HISTORY-VIEWER.md for boundaries and UI limits.

# Multi-project dashboard and filters / Panel multiproyecto — 2026-10-26

CI follow-up on workspace head 0043ff2: macOS Node 22/24, Windows Node 22/24
and Ubuntu Node 24 passed. Ubuntu Node 22 was cancelled before suite completion.
Logs from job 121695885272 show installation from 16:20:11 to 16:34:56 UTC,
including repeated Azure Ubuntu mirror retries. Tests started at 16:34:56 and
passed the displayed CLI fixtures until cancellation at 16:35:20, around the
15-minute job budget. No complete green matrix is claimed. The CI-only follow-up
provides a 30-minute job budget, 20-minute install step and a separate 5-minute
test limit. Its native run must validate those revised budgets; product source
and the 175-test local result are unchanged.

- Full local suite: **175 passed, 0 failed, 0 skipped**, 26.48 seconds,
  Windows / Node 24.11.1. No dependencies added.
- Same documented host command: `node --import ./tests/helpers/outer-sandbox.js --test`,
  ACCESSPILOT_TEST_OUTER_SANDBOX=1, workspace browser cache and writable TEMP/TMP.
  Local network permission was granted. Native CI of this new head remains pending;
  the test-only adapter does not establish production sandbox support in this host.
- Validated 1–20 inline projects, normalized unique names, unknown fields, BOM,
  1 MiB loading and strict CLI workspace/viewer mode. Shared configuration reader
  preserves existing single-project validation and legacy CLI behavior.
- HTTP/CLI fixtures: explicit workspace startup, unknown-project exclusion,
  cross-project run/comparison rejection, isolated unavailable history cards,
  project name/URL search, real leap-day validation, inclusive UTC ranges,
  filtered pagination, empty matches and global latest-run baseline links.
- Real Chromium/axe: dashboard ES/EN, mobile single-column cards without overflow,
  keyboard project navigation, native filter submission/reset and empty-state
  accessibility, in addition to existing single-project viewer browser checks.
- Visual QA: desktop and 375 px mobile screenshots generated from explicitly
  synthetic local histories, without scanning websites. Mobile card readability
  was improved after inspecting screenshots, then the full suite was rerun.
- Initial test-fixture scope/URL errors were corrected; the product validator
  correctly rejected them. Long-name mobile overflow was fixed, not skipped.
- Not validated: manual screen readers/users, large-history resource benchmarks,
  content/status/severity filters, trend analytics, isolated job execution or
  multiuser authorization. Counts represent recognized filenames, not validated
  compliance results. See WORKSPACES.md for configuration and security boundaries.

# Enriched history/import/analytics/exports — 2026-10-26

- Full local suite: **188 passed, 0 failed, 0 skipped**, 25.96 seconds,
  Windows / Node 24.11.1. Exact source has no dependency additions.
- Command and host limits remain: `node --import ./tests/helpers/outer-sandbox.js --test`,
  ACCESSPILOT_TEST_OUTER_SANDBOX=1, installed workspace browser cache, writable
  TEMP/TMP and local network permission. Production never reads the test-only
  adapter flag; native sandbox and current matrix require their own evidence.
- Verified enriched round trips, preserved timestamps/tool/severity/WCAG/guidance/
  pending review, idempotent validation, additive legacy conversion without source
  modification, unknown fields/counts, future-version rejection, no node HTML or
  diagnostic retention, and strict import project identity/type checks.
- Metrics/trends tests cover failed pages, unknown review, incompatible engines,
  partial coverage, out-of-order original timestamps, corruption gaps, ten-record
  windows and a 40 MiB analytical input budget. No compliance score is generated.
- Real HTTP/CLI/Chromium/axe cover import/export, ES/EN evidence forms, severity/
  review/WCAG filtering, mobile layouts, trend tables, whole-record downloads,
  standalone HTML without session credentials and accessibility checks. CSV
  formula defenses and 5 MiB input/40 MiB output export caps were exercised.
- Found and fixed during testing: a new navigation landmark needed a distinct
  accessible name. Existing layout/keyboard/security regression tests stayed enabled.
- Reproducible synthetic benchmark, current source: 30 runs × 5 pages × 10 rules ×
  20 nodes; loaded ten records / 365940 input bytes. Save 186 ms, read+compare 67 ms;
  Node RSS before 51400704 bytes / after 83345408 bytes. One small local sample,
  no Chromium, real website throughput, large-history SLA or competitor claim.
- Previous CI head 9dcb9eb had three successful jobs and three cancelled during
  dependency installation after roughly 2–3 minutes. Those logs did not show test
  failures or establish a cancellation cause. A new source-head matrix is required;
  no six-job success is claimed based on partial or cancelled runs.
- Pending: independent security/OS egress review, native current-head matrix,
  manual screen-reader/user testing, configurable sensitive-data redaction,
  authenticated/responsive journeys, scheduler/API jobs and release/install gates.
  See RICH-HISTORY.md for persisted fields, migration and export limitations.


## Responsive profiles / Perfiles responsive — 2026-10-26

197 tests passed, zero failures, cancellations or skips; 27.486 seconds on Windows / Node 24.11.1. Full transcript: tests-responsive-verified.txt in the task outputs. Real Chromium fixtures verify CSS breakpoint-dependent axe findings, independent mobile/desktop link discovery, CLI CSV, history identity and accessible viewer rendering. Tests cover strict configuration, total budgets, shared concurrency/deadline, cancellation, profile mismatches and prevention of false resolutions when dimensions change.

The preceding run exposed a fractional-timer boundary: a second profile could start after the first deadline callback. Deadline exhaustion is now explicitly carried to subsequent profiles; the complete suite passed after this correction. An earlier negative fixture was corrected to avoid shared object aliases.

Local execution uses the documented test-only outer-sandbox adapter, workspace browser cache and temporary directory. This does not validate native Chromium sandbox behavior. Native Windows/Linux/macOS CI for this new revision remains pending; six jobs passed for the preceding 9585be0 revision. No device, touch, zoom or screen-reader emulation is claimed. No dependencies added. No merge, release or deployment performed.

197 pruebas aprobadas, sin fallos ni omisiones. Los perfiles cambian el viewport CSS; no sustituyen la revisión manual con tecnologías de asistencia. La validación nativa multiplataforma de esta revisión sigue pendiente.


## Authenticated sessions / Sesiones autenticadas — 2026-10-26

- Full suite: 203 passed, zero failures, cancellations or skips; 28.353 seconds, Windows / Node 24.11.1. Transcript: tests-sessions-verified.txt in task outputs.
- Six additional tests cover strict single-origin HTTPS configuration, runtime state limits/scope/expiry, CLI audit-only flags, generic file diagnostics, per-target copies, public metadata, safe history comparisons and exports.
- Real Chromium fixture checks cookies plus localStorage, fresh state across two pages despite mutations, missing access after invalid credentials, blocked foreign-origin fetch, CLI JSON/history and an unchanged source session file.
- A full run exposed missing context in clean authenticated CSV rows (header only); status rows now preserve the public profile. The full suite passed after correction.
- npm audit --json: zero known vulnerabilities; no dependencies added. git diff --check passed.
- The preceding responsive head a53fae0 passed all six native Windows/Linux/macOS x Node 22/24 jobs: https://github.com/eligeunaweb/accesspilot-ai/actions/runs/40381926112 . This result is specific to that head. Native CI for the new session revision remains pending.
- Local browser execution still uses the documented test-only outer-sandbox adapter and workspace cache/temp settings. It does not verify the native Chromium sandbox.
- Not tested or claimed: production accounts, external SSO/MFA, renewal, IndexedDB/sessionStorage, click journeys, full secret redaction, OS network containment or manual assistive-technology review. Page content/URLs/selectors can contain sensitive data even though runtime state is not persisted as configuration.

203 pruebas aprobadas. La importación de sesiones no completa la fase de recorridos interactivos. Los perfiles públicos son contratos del operador, no pruebas criptográficas de identidad. No se han realizado fusiones, releases ni despliegues.


## Interactive checkpoints / Puntos de recorrido — 2026-10-26

- Final full suite: 208 passed, zero failures, cancellations or skips, 29.630 seconds on Windows / Node 24.11.1. Transcript: tests-journeys-verified.txt in task outputs.
- Five new tests cover strict bounded steps/keys/markers, cancellation, sanitized step diagnostics, stable order/shared concurrency, mismatched evidence, URL/viewport/checkpoint identity, changed definitions, imports/exports and bilingual detail rendering.
- Controlled real Chromium verifies initial/open/Escape-closed dialog states: button-name is detected only while open. Checks include missing markers, rejected POST before server receipt, saved authenticated state, loss of access during a journey, CLI CSV, history comparison and viewer labels. Existing keyboard/mobile/ES/EN viewer axe checks remain passing.
- Repeated complete suite after adding the access-loss case; both complete executions passed. No dependencies added. git diff --check passed.
- Six native CI jobs passed for preceding session head ea07554 (Windows/Linux/macOS x Node 22/24): https://github.com/eligeunaweb/accesspilot-ai/actions/runs/40386134723 . New journey-head native CI remains pending and must not inherit that result.
- Local Chromium runs use the documented test-only outer-sandbox adapter and workspace browser/temp paths. They do not validate the native Chromium sandbox.
- External acceptance not executed: real customer sites/accounts, SSO/MFA/login submission, POST-dependent flows, renewal, manual keyboard reachability/focus/screen-reader review, independent security and OS network containment. Explicit journey batches have per-page timeouts and shared concurrency, not a separate global deadline. Server-side mutations are not rolled back.

208 pruebas aprobadas. Los puntos reproducen sus pasos desde un contexto nuevo y no comparten mutaciones entre puntos; las sesiones son opcionales. Las teclas dirigidas a un selector no prueban accesibilidad completa por teclado. No se han fusionado cambios ni publicado releases o despliegues.

Current npm audit --json: zero known vulnerabilities; transcript npm-audit-journeys.json in task outputs.


## Manual evidence / Evidencia manual — 2026-10-27

- Final full suite: 216 passed, zero failures/cancellations/skips; 31.680 seconds, Windows / Node 24.11.1. Transcript: tests-manual-release-check.txt in task outputs.
- Eight new tests validate canonical fingerprints, v3 evidence round trips and legacy reading, strict schemas, scope/chronology/status/method/reference limits, no false automated resolutions, append-only declarations, HTML escaping and CSV formula defenses.
- Real CLI subprocesses generate templates, refuse overwrites, append a history record and reject cross-project imports with the browser path deliberately unavailable, demonstrating that these offline operations do not launch Chromium. Source files and older records remain unchanged.
- Real protected viewer checks manual content, bilingual axe and JSON/HTML/CSV downloads. Test declarations are synthetic software fixtures, not human accessibility assessments. Local tests use the documented test-only outer-sandbox adapter and workspace cache/temp paths.
- Initial viewer attempt was blocked by the execution environment's loopback network policy; network permission was granted. A subsequent test-harness issue used Playwright browser.newPage(), incompatible with axe's extra-page requirements; changed to explicit browser.newContext(). The complete suite then passed. No application fallback or network weakening was introduced.
- The preceding journey head 2dd7fbb passed all six native Windows/Linux/macOS x Node 22/24 jobs: https://github.com/eligeunaweb/accesspilot-ai/actions/runs/40390653867 . Native CI for the new manual-evidence head remains pending; the previous result does not validate it.
- No dependencies added. External/manual acceptance remains unexecuted: real human reviews, assistive-technology/user testing, graphical evidence editing, secure attachments, digital signatures, cross-audit manual comparison, independent security review and OS containment. A fingerprint is not an identity proof or signature.

216 pruebas aprobadas. Las declaraciones manuales no modifican resultados automáticos ni certifican conformidad. No se han realizado fusiones, releases ni despliegues.

Final manual-evidence checks include expanded bilingual details passing axe, a bounded 5-batch/20-check/500-character viewer and full exports retaining all declarations. npm audit --json returned zero known vulnerabilities; no dependencies added. git diff --check passed.
