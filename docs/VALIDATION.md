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

- 83 tests passed locally on Windows / Node 24.11.1; zero failures and skips in the final run.
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
