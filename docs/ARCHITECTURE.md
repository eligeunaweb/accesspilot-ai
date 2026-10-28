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
| B2 | Scoped crawler and network boundary | Page/depth/origin/redirect/resource limits, adversarial egress fixtures, DNS rebinding + timeout/cancellation tests | Transport policy v2 has permanent budget exhaustion, independent proxy admission and bounded/cancellable DNS; adversarial local tests pass. A separate Docker OS prerequisite probe is implemented; experimental contained Chromium has a separate real Linux fixture acceptance; Desktop, independent review and service security gates remain pending (see CONTAINED-BROWSER.md) |
| C | Reports and evidence | Versioned JSON, safe CSV, accessible interactive HTML, severity/WCAG indices, full incomplete evidence, ES/EN curated fixes; round-trip/security/browser tests | Implemented subset: eight curated rules; full rule translation/manual user testing pending |
| D | History/compare | Atomic writes, migrations, retention/redaction, baseline scope/engine mismatch detection, no false resolutions for failed pages | Rich historyVersion 2 plus optional version 3 manual declarations, additive legacy import/conversion, atomic storage, latest/file comparison and explicit count retention implemented. Full anonymization, scheduled/age/size retention and future schema conversions pending |
| E | Local UI/API | Accessible dashboard on loopback; auth/CSRF/SSRF fixtures; API schema and integrations | Allowlisted workspace dashboard, selected-run content/status/severity/review filters, bounded coverage-aware trends and JSON/offline HTML/CSV downloads; 227 passing local tests. Audit job API, OS egress gate, indexed whole-archive analytics and manual assistive-technology review pending |
| F | Workflow depth | Viewports/journeys, manual evidence, scheduler recovery, report plugins and regression gates; security review | Named CSS viewport profiles, independent responsive crawls and scope-safe history comparisons implemented. Isolated cookie/localStorage session import with visible access markers and role-safe comparisons implemented. Bounded declarative click/key/wait checkpoints, isolated replay and definition-safe history implemented. Offline manual review templates/import, append-only derived records and separate bilingual evidence exports implemented. Login submission, renewal, graphical manual editing, scheduler recovery and plugins pending |
| G | Stable release preparation | Windows/Linux/macOS install/update/uninstall, CI green, resource benchmarks, user docs, manual accessibility, notices/SBOM and reproducible archives | Pending; publication needs user approval |

Priorities follow dependencies, not feature count. B1 is a subphase, not completion of phase B or the product. Scheduling must not duplicate jobs after restart. Histories must distinguish skipped/failed/untested from resolved. AI stays optional and must cite deterministic evidence; never auto-fix customer websites.

## Quality budgets

Configuration: at most 1 MiB, 100 explicit URLs, concurrency 1–4, per-page budget 1–120 seconds. Initial budgets are protective limits, not throughput claims. Batch output preserves input order. Each target has isolated state; independent targets continue after errors. Any failed/cancelled target makes CLI exit 2, taking precedence over violation exit 1. Run metadata measures wall time; resource benchmark separately includes browser children.

Documentation and portability: Node 22.12+, npm lockfile, no platform-specific shell assumptions in product code. Test Windows/Linux/macOS via Actions, never call an unexecuted matrix verified. No required SaaS or paid service. Preserve legacy single-URL output and exit semantics except previously documented HTTP error fix.

See NETWORK-CRAWLING.md for actual implemented controls and the Windows nested-sandbox validation limitation. Changed network policy/version invalidates baseline comparisons.

## Shared supervisor increment

Contained CLI runs now use the FIFO supervisor documented in AUDIT-QUEUE.md. Optional private lifecycle journal, bounded admissions/reservations, cancellation through cleanup, exclusive ownership and interrupted-on-reopen semantics are implemented. This is a per-instance foundation; cross-process budgets, automatic orphan recovery and independent security review remain gates before an audit-execution UI.

## Ownership recovery increment

WORKER-RECOVERY.md describes immutable pre-create ownership intents, exact Docker engine/name/label/image/ID validation and offline recovery under the queue lock. Pending intents block auditing; preview is separate from apply, failed apply retains the lock, and jobs never replay. Automatic abandoned-lock takeover, cross-process scheduling, power-loss durability and independent security review remain pending.

## Reduced-data export increment

SHARING-REPORTS.md documents an offline positive projection for sharing, exposed by CLI and protected read-only viewer. It omits source identifiers/free text, preserves unknown/failed coverage, and cannot be imported as canonical audit evidence. This does not redact private history or guarantee anonymity. Cross-process resource reservations, service security review and audit-execution UI remain pending.

## Explicit cross-process domain admission

SHARED-RESOURCES.md adds optional shared-domain exclusion across CLI supervisors. One owner holds a fixed two-worker container budget through cleanup; uncertain shutdown retains the reservation for ownership-checked offline recovery. This supersedes the earlier missing cross-process coordination statement only for processes selecting the same explicit domain. Fair per-slot inter-process scheduling, automatic machine-wide limits and independent service review remain pending.

## Local response admission and internal security review

LOCAL-SERVICE-REVIEW.md records the internal review, existing boundaries and unresolved execution-service gates. The read-only viewer holds admission until handler and response completion, reserves pending report-body bytes and enforces frequency/absolute output deadlines plus strict HTTP framing/security headers. These are not total host heap/CPU guarantees or independent security approval. No web execution API is enabled.


Seguimiento / Follow-up: [REPORT-RENDERING.md](REPORT-RENDERING.md) describe separación de renderizado en procesos desechables. La lectura/validación inicial permanece en el anfitrión; la puerta P1 de recursos no se considera cerrada.


Actualización 2026-10-28 / Update: [HISTORY-SOURCE-ISOLATION.md](HISTORY-SOURCE-ISOLATION.md) sustituye el estado anterior de parse/validación inicial en el padre para detalles, comparaciones, tendencias y exportaciones del visor. La captura de fuentes queda bajo bloqueo en el padre y la validación pasa al hijo después de liberar el bloqueo; permanecen los límites de I/O, serialización, RSS y muerte abrupta del padre.


Contrato interno / Internal contract: [WEB-JOB-CONTRACT.md](WEB-JOB-CONTRACT.md) describe solicitudes permitidas, credenciales, permisos de un uso y cancelación con limpieza confirmada. Es un modelo sin ejecución ni rutas HTTP de producto; las puertas de transporte, cola durable, recursos y revisión independiente siguen abiertas.

## Explicit internal job HTTP transport

[WEB-JOB-TRANSPORT.md](WEB-JOB-TRANSPORT.md) now joins the persistent supervisor to a separately started IPv4 loopback service with three closed routes, Bearer/CSRF ownership, bounded incremental bodies, sockets, handlers, global rate and response/body deadlines. This supersedes the earlier missing internal transport statement. It adds no CLI activation or browser bootstrap; the existing viewer remains read-only. Operator credentials stay out of URLs. Awaited close holds cleanup ownership; expired responses do not release pending durable admission slots. Host-wide limits, browser execution UI and independent security review remain gates.


Adaptador interno / Internal adapter: [WEB-JOB-SUPERVISOR.md](WEB-JOB-SUPERVISOR.md) conecta admisión persistente, cola de páginas, dominio obligatorio e historial. No añade listener ni recupera sesiones de navegador; los recibos interrumpidos nunca se repiten automáticamente y siguen pendientes el transporte de producto y la revisión independiente.


## Browser pairing and execution controls

[BROWSER-JOBS.md](BROWSER-JOBS.md) adds operator-issued, bounded, two-minute single-use pairing capabilities and closed session exchange/revocation routes. Static ES/EN browser controls keep credentials in memory, select allowlisted projects, preserve request IDs on lost replies, poll boundedly, cancel and disconnect. Revocation consumes an action-bound permit after the body is read. This supersedes the earlier missing bootstrap/UI statement only for explicitly started internal services. The existing viewer is read-only; operator CLI launch, report integration, durable client recovery, independent review and OS host limits remain open.
