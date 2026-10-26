# Target architecture and acceptance gates / Arquitectura objetivo

Status: evolving implementation; this document does not mark planned features complete.

## Boundaries

CLI and future loopback UI -> application services -> audit engine adapters -> isolated browser contexts. Pure modules validate project configuration and serialize reports. Run records contain schema version, tool/engine versions, effective configuration, timestamps, per-target status and evidence. Exporters never execute scanned content. Persistent history will use atomic local records and migrations, not require a hosted service. Plugins will be trusted local code with a versioned API, not arbitrary downloadable scripts.

Threat model: scanned pages and imported files are untrusted; local operator and installed plugins are trusted. Future API callers are untrusted. Protect credentials, host network, local files, history and export consumers. Legacy CLI mode retains operator network access. Restricted crawling uses a pinned-address HTTP(S) egress proxy. Origin scoping or DNS preflight alone is not an SSRF boundary. Before a network-facing job API: independently reviewed egress proxy plus OS network isolation including DNS rebinding, redirects, subresources and WebSockets; deny private/link-local/metadata unless explicitly authorized; loopback binding, session token, Host/Origin validation, CSRF protection, queue/rate/body limits. No arbitrary filesystem paths from API requests. Block service workers and downloads in project runs.

## Delivery gates / Fases ejecutables

| Gate | Deliverable | Acceptance evidence | State |
|---|---|---|---|
| A | Stable legacy CLI | 27 tests on Windows including real Chromium; remote CI pending | Local checks passed; remote pending |
| B1 | Project JSON + explicit multi-site batches | Unknown keys/types/limits rejected; duplicate normalized URLs removed; bounded concurrency; deterministic order; partial failures; cancellation; real CLI fixture | 55 local tests passed (includes legacy); remote pending |
| B2 | Scoped crawler and network boundary | Page/depth/origin/redirect/resource limits, adversarial egress fixtures, DNS rebinding + timeout/cancellation tests | Local transport/crawl tests pass with documented outer-sandbox test adapter; strict platform CI and OS isolation gate pending |
| C | Reports and evidence | Versioned JSON, safe CSV, accessible interactive HTML, severity/WCAG indices, full incomplete evidence, ES/EN curated fixes; round-trip/security/browser tests | Implemented subset: eight curated rules; full rule translation/manual user testing pending |
| D | History/compare | Atomic writes, migrations, retention/redaction, baseline scope/engine mismatch detection, no false resolutions for failed pages | Rich historyVersion 2, additive legacy import/conversion, atomic storage, latest/file comparison and explicit count retention implemented. Full anonymization, scheduled/age/size retention and future schema conversions pending |
| E | Local UI/API | Accessible dashboard on loopback; auth/CSRF/SSRF fixtures; API schema and integrations | Allowlisted workspace dashboard, selected-run content/status/severity/review filters, bounded coverage-aware trends and JSON/offline HTML/CSV downloads; 208 passing local tests. Audit job API, OS egress gate, indexed whole-archive analytics and manual assistive-technology review pending |
| F | Workflow depth | Viewports/journeys, manual evidence, scheduler recovery, report plugins and regression gates; security review | Named CSS viewport profiles, independent responsive crawls and scope-safe history comparisons implemented. Isolated cookie/localStorage session import with visible access markers and role-safe comparisons implemented. Bounded declarative click/key/wait checkpoints, isolated replay and definition-safe history implemented. Login submission, renewal, manual evidence, scheduler recovery and plugins pending |
| G | Stable release preparation | Windows/Linux/macOS install/update/uninstall, CI green, resource benchmarks, user docs, manual accessibility, notices/SBOM and reproducible archives | Pending; publication needs user approval |

Priorities follow dependencies, not feature count. B1 is a subphase, not completion of phase B or the product. Scheduling must not duplicate jobs after restart. Histories must distinguish skipped/failed/untested from resolved. AI stays optional and must cite deterministic evidence; never auto-fix customer websites.

## Quality budgets

Configuration: at most 1 MiB, 100 explicit URLs, concurrency 1–4, per-page budget 1–120 seconds. Initial budgets are protective limits, not throughput claims. Batch output preserves input order. Each target has isolated state; independent targets continue after errors. Any failed/cancelled target makes CLI exit 2, taking precedence over violation exit 1. Run metadata measures wall time; resource benchmark separately includes browser children.

Documentation and portability: Node 22.12+, npm lockfile, no platform-specific shell assumptions in product code. Test Windows/Linux/macOS via Actions, never call an unexecuted matrix verified. No required SaaS or paid service. Preserve legacy single-URL output and exit semantics except previously documented HTTP error fix.

See NETWORK-CRAWLING.md for actual implemented controls and the Windows nested-sandbox validation limitation. Changed network policy/version invalidates baseline comparisons.
