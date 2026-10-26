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

