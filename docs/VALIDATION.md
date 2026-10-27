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


## Transport v2 and isolation prerequisites / Transporte v2 y requisitos de aislamiento — 2026-10-27

- Full local suite: 227 passed, zero failures/cancellations/skips; 35.377 seconds on Windows / Node 24.11.1. Transcript: tests-egress-v2-full.txt in task outputs.
- Eleven new tests cover bounded DNS sets/families/timeouts/cancellation/late answers; permanent request/transfer/deadline exhaustion; shared HTTP/CONNECT admission; active slow-response deadlines; invalid budgets; containment profile rejection and cleanup/exit failure handling. Transport fixtures make actual local requests and verify forbidden later requests never reach the target.
- Real restricted-browser tests now require network.policyVersion 2. Existing history comparison logic rejects policy 1/2 mismatch. Native sandbox startup on this local Codex host remains unverified: local browser tests use the documented test-only outer-sandbox adapter.
- npm audit --json: zero known vulnerabilities. No dependencies added. git diff --check passed.
- The preceding manual-review head 88db3f9 passed all six native Windows/Linux/macOS x Node 22/24 jobs: https://github.com/eligeunaweb/accesspilot-ai/actions/runs/40483478814 . New per-head CI results must be checked independently; this phase adds a seventh Linux Docker isolation-prerequisite job.
- Docker Desktop client exists. Initially the Linux engine pipe was missing; after the operator started Docker, the Codex execution host received named-pipe permission denied. The permission tool cannot represent that Windows channel. No Docker Desktop acceptance pass is claimed; no daemon TCP exposure or host permission/configuration changes were attempted.
- The real Docker probe is separate from npm test: unit tests mock the Docker adapter to verify fail-closed orchestration, and CI executes the fixed Node payload in a real container. Inspect the workflow artifact for actual kernel/network/cgroup assertions and image ID; mocks are not containment evidence.
- Still required before web audit jobs: contained Chromium with mediated egress, adversarial browser/host/LAN/DNS/UDP tests, trusted image policy, independent security review, service-level resource/job recovery controls and protected API. TLS CONNECT does not inspect encrypted HTTP methods; the browser still supplies that defense. The current viewer remains read-only.

227 pruebas locales aprobadas. El aislamiento Node sin red es una prueba previa, no una implementación del navegador aislado ni una certificación de seguridad. No se han realizado fusiones, releases ni despliegues.


## 2026-10-27 — HTTP mediator and bounded worker framing

- Local full suite: **260 passed, 0 failed, 0 skipped**, 34.912 s. Exact command: `node --import ./tests/helpers/outer-sandbox.js --test`, with the previously documented `ACCESSPILOT_TEST_OUTER_SANDBOX=1`, local Playwright browser path and writable test TEMP/TMP. The adapter is test-only and does not establish native local Chromium sandbox support.
- New coverage: 22 host mediator HTTP/TLS tests, 10 NDJSON framing tests and 1 real host Chromium compatibility test. Fixtures verify TLS authentication, numeric DNS pinning, scope and methods, redirects, compressed bodies, multiple HttpOnly cookies, header stripping, transfer/request/queue/concurrency/deadline limits, permanent failure, cancellation/late DNS, truncated response and strict UTF-8/frame budgets.
- `npm audit --json`: **0 known vulnerabilities** across 4 reported dependency entries. No dependencies changed or added; no claim of independent security review.
- Operator-supplied Docker Desktop prerequisite: passed, cleanup removed; retained separately as `isolation-desktop.json` and copied to delivery outputs. This trusted Node probe does **not** run Chromium. Codex's named-pipe restriction remains.
- Chromium compatibility uses `route.fulfill` in a host browser. No Docker browser backend, no web job API and no claim that direct browser egress is now contained. The new internal transport is not selected by existing CLI operations. See [MEDIATED-TRANSPORT.md](MEDIATED-TRANSPORT.md).
- CI results for the new commit must be recorded separately after completion; the previously passing run cannot validate these additions.

Español: 260 pruebas locales aprobadas sin fallos ni omisiones; auditoría npm sin vulnerabilidades conocidas. Las 33 pruebas nuevas verifican transporte, protocolo y compatibilidad con Chromium real en el anfitrión. No acreditan Chromium aislado en Docker ni habilitan trabajos web. El requisito Node de Docker Desktop aportado por el operador sí aprobó, incluida su limpieza.


## 2026-10-27 — Contained Chromium implementation (CI acceptance pending)

- Full local suite: **270 passed, 0 failed/skipped**, 31.892 s. Command: `node --import ./tests/helpers/outer-sandbox.js --test`, with documented test-only adapter, local browser path and writable TEMP/TMP. Includes real host Chromium/axe through the mediator and mocked Docker supervisor inspection/protocol/cleanup; mocks are not containment evidence.
- Initial development runs found a misplaced shebang in the CLI; it was fixed before this successful full run. Other initial fixture attempts lacked network permission/local browser/TEMP settings; those attempts are not counted as successful validation. Local named-pipe access remains unavailable.
- `npm audit --json`: 0 known vulnerabilities after granting network permission; an earlier attempt failed DNS and was not an audit pass. No dependencies added.
- New eighth CI job builds the Playwright-version-matched worker and runs real controlled Docker browser acceptance. Its result must be checked on the published head; the previous seven-job pass does not validate this backend.
- Experimental CLI option is project-only, image-ID-only and incompatible with offline/viewer operations. Old CLI paths and old manual evidence fingerprints remain tested. Network policy 3 requires isolation provenance; changed images are incomparable.
- See [CONTAINED-BROWSER.md](CONTAINED-BROWSER.md) for commands, kernel controls, third-party notices and remaining security/production/Docker Desktop gates. No release, merge or deployment.


### Worker hardening and first real attempt

The next local full run passed 271 tests, zero failed/skipped, 36.058 s, after adding strict null rejection and ownership-mismatch cleanup coverage. The real Docker job in run 40499072757 built image sha256:c92303f88e339fe63a9e2686efb3251f027fb422e92dfdaa868845e4a598308c but failed at sandbox acceptance before the first audit. This is a failed acceptance, not validation of a working backend. A bounded pre-audit startup diagnostic was added to investigate without disabling protections. Controlled coverage now also requests journeys, crawling and redirect cookies. Further CI result must be checked on the new head.


### Redirect/decompression regression found by real containment

The real container attempts exposed a Playwright route limitation: only the initial redirect request used the mediator. Earlier host compatibility fixtures could follow the next request on the host network and did not prove complete redirect/gzip mediation. Those claims are superseded by an offline browser regression checking every URL, HttpOnly cookies, gzip and JavaScript, now using CDP Fetch request-stage interception. CDP needs decoded response bodies; worker-side gzip/deflate/br decoding now has a strict aggregate output cap and tests for excessive expansion, malformed bodies and encoding stacks. Browser caching is disabled. The sandbox table parser also has positive and disabled/missing-layer regression tests. Latest real acceptance remains pending until the exact new-head Docker job passes; no earlier failed run is treated as a pass.


### First successful real contained browser acceptance

Commit c5de84c6ab8789e5efcf897e47eb9129842a4cae, contained-browser job 122182003403, run https://github.com/eligeunaweb/accesspilot-ai/actions/runs/40501907480 : passed=true, stage=complete, image sha256:f67cdc8a2ca2bf9a96b330f4fcf2e65e8c81c1f90b55b4f626bab6383e609c83. The real Linux container audited axe violations with redirect/gzip/cookies, authenticated viewport/journey/history, two-page crawl, blocked foreign origin/POST, pending cancellation, CLI and owned cleanup. Host inspection, kernel guards and Chromium namespace/PID/network/seccomp/TSYNC checks were required before auditing. This records that job, not an overall pass of every pending matrix job or Docker Desktop.

The preceding failed attempts are preserved in Actions; fixes addressed namespace-local chroot with zero container capabilities, GNU chroot denial exit status, current sandbox status labels, redirect-hop interception and bounded CDP body decoding. No unsafe fallback was added.

Latest local full suite after proxy/startup-environment hardening: **286 passed, 0 failed/skipped**, 39.072 s, using the documented local test-only adapter and writable browser/TEMP settings. The new test rejects injected proxy credentials and Node hooks. Additional controlled TLS, WebSocket and metadata acceptance extends the next CI attempt; until that exact new-head job passes, those new container cases remain unvalidated. Native matrix CI never enables the local adapter. No dependencies added, merge, release or deployment.

## 2026-10-27 — Shared audit supervisor

Added 14 queue tests, including two projects sharing one reservation pool, bounded concurrent admissions, cancellation that holds slots through cleanup, immediate/idempotent shutdown, private errors/journal, exclusive directory ownership, corrupted/oversized/write-failing journals, real child-process termination and manual-lock recovery without replay, and 1000-entry retention. Targeted Windows workspace execution: 14/14 passed. Initial default sandbox TEMP rename failed EPERM; the documented workspace TEMP resolved it. One integration fixture initially omitted project schemaVersion; corrected before passing. Earlier full local suite after the first 12 tests: 298 passed, zero failed/skipped, 33983.7382 ms, with the existing test-only outer-sandbox adapter. Final full-suite results are recorded in the delivery evidence.

Existing Docker Desktop browser acceptance supplied by the operator was read and all nine checks passed for image sha256:a084adc87c372912144cc9db685895b8fa12886b38b6892ddc57b3b596d2c428. This predates the supervisor increment. Updated contained CI harness now checks the real CLI job-store journal; execution must be verified separately. No claim of new Docker execution on this restricted host, machine-wide budgets, automatic orphan removal, or independent security review.

## 2026-10-27 — Durable worker ownership and offline recovery

Contained CLI audits with --job-store now sync an immutable ownership intent before Docker create and release it only after verified cleanup. Unresolved intents block audit startup. Offline preview/apply recovery shares the exclusive queue lock, pins engine/name/owner/image/full ID, revalidates the plan and confirms removal before releasing evidence. Old records remain readable; no replay or automatic abandoned-lock takeover. No dependencies added.

Targeted recovery/queue/adapter checks passed. First full local attempt: 320 tests, 319 passed, one existing history-retention concurrency test failed mkdir EPERM in workspace TEMP. All nine history tests passed in isolation afterward. A second full attempt passed 322/322, zero failed/skipped, 36861.162 ms, using the documented test-only outer-sandbox adapter. One CLI subprocess regression was then added and a final full run is recorded in delivery evidence. The earlier failure remains preserved, not omitted or counted as success; native CI must verify this head.

CI now includes a real CLI supervisor SIGKILL while a contained page request is pending, refusal of abandoned lock, manual fixture-owned lock release after observed process exit, preview/no-deletion, exact-ID recovery without replay, preservation of an unrelated same-image container, and a controlled 128 MiB synthetic process OOM with recovery. These are not locally claimed executed: this restricted host cannot access the Docker named pipe. Actual CI results must be inspected. The OOM fixture is not browser workload coverage, power-loss durability or independent security review. See WORKER-RECOVERY.md.

### Windows history lock contention correction

The subsequent 323-test delivery attempt reproduced mkdir EPERM in a different existing parallel-history test. This was treated as a reproducible contention defect, not dismissed as a clean run. History lock acquisition now retries EPERM only on Windows within the existing five-second bound, alongside EEXIST; it never removes/steals the lock. Other permission errors fail immediately, and persistent denial keeps its cause. Four deterministic regression tests cover transient/repeated permission denial, existing ownership and platform-specific immediate failure. The history/lock/recovery targeted run passed 31/31. The two failed full-run transcripts are preserved in delivery outputs. Final results supersede the earlier interim counts.

## 2026-10-27 — Reduced-data sharing exports

Added positive field projection for offline CLI and protected viewer sharing in JSON/HTML/CSV/text. URLs and arbitrary free text are omitted, non-curated rule IDs become report-local aliases, shipped ES/EN guidance is regenerated, unknown/failed coverage remains explicit and shared artifacts cannot be imported as original audit evidence. Source files/history/fingerprints are unchanged; new output files use exclusive creation. No dependencies added.

Eleven targeted tests passed: canaries in URLs/names/selectors/HTML/errors/imported advice/engine metadata, unknown IDs, legacy unknown data, failed coverage, manual-note omission, unchanged canonical fingerprints, responsive aliases, offline flag restrictions, real CLI without installed browsers, overwrite refusal, bilingual real Chromium/axe/keyboard HTML without external requests, protected viewer downloads, row budget, authentication/journey definition omission. The first browser test used browser.newPage, which axe rejects; it was corrected to an explicit context before passing. Full suite before the final authentication/journey test: 337/337 passed, zero failed/skipped, 40109.6667 ms, with the existing documented test-only adapter. Final exact-head results are recorded in delivery outputs and native CI must be checked separately.

The prior recovery-head CI run 40526277216 finished six successful jobs and two macOS jobs cancelled without test steps. It is not recorded as 8/8 or a macOS pass. Windows/Linux Node 22/24 each ran 327 tests; real Docker browser, SIGKILL recovery and synthetic OOM acceptance passed.

Privacy limits: a reduced-data summary is not guaranteed anonymous; retained counts/criteria/dimensions may remain sensitive. Private history and original downloads are not automatically redacted. Manual declarations/comparison deltas are omitted rather than treated as successes. Cross-process reservations and independent service security review remain pending before enabling audit execution in the web viewer. See SHARING-REPORTS.md.

### macOS runner capacity diagnosis

Public check-run annotations for prior job 122266632042 state: "The job was not acquired by Runner of type hosted even after multiple attempts" and report arm64 runner capacity constraints; runner_name was empty and steps absent. This is not counted as a test pass. Current GitHub documentation lists macos-15-intel as a standard Intel runner and macos-15 as arm64: https://docs.github.com/en/actions/reference/runners/github-hosted-runners . The required three-OS Node 22/24 matrix now uses macos-15-intel. A separate workflow_dispatch-only Apple Silicon acceptance retains full tests/audit without continue-on-error; it has not been executed and arm64 acceptance remains pending. No paid/larger runners were selected. Final application code passed 338/338 local tests, zero failures/skips, 39106.2307 ms; this final increment changes workflows/documentation only. Native execution of the new matrix must still be verified.

## 2026-10-27 — Explicit shared resource-domain admission

Added optional --resource-store with --job-store/--isolation-image. One supervisor exclusively owns each canonical shared domain, clamped to a fixed two-worker / 2048 MiB / two CPU / 512 PID container reservation. Competing processes fail before task admission; cleanup uncertainty preserves the gate and lease. Offline recovery validates store/domain/owner association, cleans exact recorded workers first and releases the reservation afterward. No PID/age-based stealing, fairness across supervisors, host memory limit or automatic machine-wide budget is claimed.

Nine new tests passed, including actual child process ownership and SIGKILL, competing-process refusal before/after crash, explicit offline recovery without replay, foreign/corrupt ownership rejection, domain independence, CLI restrictions and cleanup-held reservations. Full local suite: 347/347 passed, zero failures/skips, 36429.2518 ms, with the existing test-only adapter required by this restricted host. No dependencies added. Controlled Docker browser and crash/OOM harnesses were extended to verify shared-domain release and retention; their new real execution requires CI and is not claimed from mocked/local filesystem tests. See SHARED-RESOURCES.md.

### macOS browser-test contention follow-up

Run 40541018067 passed Windows/Linux Node 22/24, isolation prerequisite and both expanded real Docker acceptances (11 browser/CLI checks and 8 recovery checks). Both macOS Intel jobs failed because the existing multi-scenario E2E parent exceeded its unchanged 120-second deadline, cancelling/not starting later child scenarios. New resource-domain checks passed there. Failure logs are preserved in delivery outputs, not counted as success. To reduce competing browser processes, npm test now caps file concurrency at two across platforms, including manual Apple Silicon acceptance. No tests are skipped and the E2E deadline is not increased. Contention is the working diagnosis; actual corrected macOS reruns must validate it.


## Internal local-service hardening — 2026-10-27

The read-only viewer now keeps admission through handler completion and response finish/close, reserves UTF-8 report output, and rejects duplicate security/framing headers, unknown Fetch Metadata, GET payloads, Expect, CONNECT and Upgrade. No web execution API is enabled. See LOCAL-SERVICE-REVIEW.md for explicit budgets, threat model and open independent-review gates. No dependencies added.

Local verification: 13 new tests plus the existing suite, **360/360 passed**, zero failed/cancelled/skipped, 54424.225 ms. Command: `node --import ./tests/helpers/outer-sandbox.js --test --test-timeout=120000 --test-concurrency=2`, with workspace TEMP and the existing test-only outer-sandbox adapter. The timeout is a diagnostic ceiling, not a changed production/test-script deadline. Separate viewer/sharing tests: 24/24; sessions: 6/6. Diff whitespace check passed.

An initial full invocation stalled after runner tests and was interrupted; no failure was emitted and its cause remains unconfirmed. Isolated viewer/sharing/session runs and the bounded full repeat passed. Preserve that stall as unresolved evidence rather than claim it was fixed. Initial paused-client fixture assumptions about writableLength were corrected to a controlled throttled HTTP fixture; finish is not client acknowledgement. Current changes have not yet passed remote native CI or fresh Docker Desktop acceptance. Internal review does not satisfy independent security review, host heap/CPU isolation, Apple Silicon or human acceptance.

Verificación local: **360 pruebas satisfactorias**, ninguna fallida/omitida; primera ejecución detenida e interrumpida, causa sin confirmar. No se declara validación remota ni revisión independiente.


### Native CI contention follow-up

Run 40551305202 at 334c748 passed seven jobs: Windows/Linux Node 22/24, macOS Intel Node 22, isolation prerequisite and controlled Docker browser/recovery. macOS Intel Node 24 cancelled the last E2E child at the unchanged parent 120-second deadline; all new service guard cases passed. Sequential scenario durations accumulated under concurrent browser-file load; contention remains the working diagnosis. npm test now uses one test file at a time, preserving every test and the E2E deadline. Full local serial repeat: 360/360 passed, no failures/cancellations/skips, 103435.2076 ms using the same restricted-host adapter and a diagnostic per-file ceiling of 120 seconds. Remote validation of this adjustment remains required.
