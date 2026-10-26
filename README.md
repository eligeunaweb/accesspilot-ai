# AccessPilot AI 🧭

Free, open-source **automated accessibility review CLI** built with Playwright and axe-core.

> **Scope:** v0.1.0 is an automated scanner, **not an autonomous AI agent**. It cannot certify WCAG conformance. Human testing with keyboard, assistive technologies and users is essential.

## Requirements

- Node.js 22.12+
- Internet access for the initial npm/browser installation (and to visit public sites)
- Permission to audit the target website

## Windows PowerShell quick start

```powershell
npm ci
npx playwright install chromium
npm link
accesspilot https://example.com --format html --output report.html
Start-Process .\report.html
```

Or without `npm link`:

```powershell
node .\src\cli.js https://example.com --format json --output report.json
```

Run tests: `npm test`.

## Usage

```
accesspilot <http(s) URL> [--format text|json|html] [--output filename] [--fail-on-violations]
```

Use `--fail-on-violations` in CI to return exit code 1 if axe reports any violations. Network/browser errors return 2. Reports include potentially sensitive page content and selectors; review them before sharing.

## Español

AccessPilot AI v0.1.0 analiza automáticamente páginas web mediante Playwright y axe-core y genera informes de texto, JSON o HTML. **No garantiza el cumplimiento de WCAG**: hay que complementar el análisis con pruebas manuales de teclado, lectores de pantalla y experiencia de uso. No introduce cambios en la web auditada.

## Limitations

- Checks only the loaded page state, not every route, breakpoint, interaction or authenticated workflow.
- `incomplete` checks require human review.
- Automated detection can produce false positives and false negatives.
- The browser visits the URL and executes page scripts; only audit websites you trust or have permission to inspect.
- No AI service, API keys, screenshots or auto-fixes in v0.1.0.

## License

MIT.

## Development / Desarrollo

See [audit and roadmap / auditoría y hoja de ruta](docs/AUDIT-ROADMAP.md).
Use Node.js 22.12 or newer. / Usa Node.js 22.12 o superior.

```powershell
npm ci
npx playwright install chromium
npm test
```

Tests include a real Chromium audit of a local HTTP fixture; no public target is required.
Las pruebas incluyen una auditoría real con Chromium de un servidor local.
HTTP errors return exit code 2. / Los errores HTTP devuelven código 2.
`--output` overwrites the selected file. / `--output` sobrescribe el archivo indicado.

## Projects and batches / Proyectos y lotes

```powershell
node .\src\cli.js --project .\examples\project.json --format json --output portfolio.json
```

Project JSON uses `schemaVersion: 1`, `name`, `urls` (1–100 HTTP(S) URLs), optional
`concurrency` (1–4; default 1) and `timeoutMs` (1000–120000; default 30000).
Unknown properties and credential-bearing URLs are rejected. URLs are normalized;
fragments are preserved for hash-routed applications and exact duplicates run once. JSON configuration is limited to 1 MiB.
Each URL has a fresh browser/context. No crawling or implicit config discovery.
A failed target does not hide successful targets. Failed/cancelled runs exit 2;
`--fail-on-violations` exits 1 only when every target succeeded. Ctrl+C cancels
active work and records queued targets as cancelled. Reports may contain private content.
Browser launch and cleanup may add time beyond the page budget.

El proyecto admite varios sitios y páginas explícitos, con límites de concurrencia y
presupuesto por página. Un fallo no oculta las páginas correctas. Ctrl+C cancela el
trabajo y conserva estados explícitos. No hay descubrimiento automático de páginas.
La configuración y las páginas ejecutan tráfico con los permisos de red del operador:
no ofrecer esta CLI como servicio para usuarios no confiables. Los controles de salida
contra SSRF y el crawler pertenecen a B2; aún no están implementados.

See [competitive comparison](docs/COMPETITIVE-ANALYSIS.md) and
[architecture and acceptance gates](docs/ARCHITECTURE.md). Product development is ongoing.

## Reports and language / Informes e idioma

```powershell
node .\src\cli.js https://example.com --lang es --format html --output informe.html
node .\src\cli.js --project .\examples\project.json --lang en --format csv --output findings.csv
```

Project configuration also accepts `language: "es"` or `"en"`; `--lang` overrides it.
JSON keeps the existing fields and adds schema/version metadata, engine version,
WCAG criterion mappings, recommendations and `incompleteDetails`. The `incomplete`
count remains compatible. WCAG mappings come only from the engine tags; no tag is
not a pass. HTML groups findings by severity and uses native keyboard-operable
expand/collapse controls, without scripts or external resources. CSV includes
violations, manual-review findings and failed/cancelled project targets; cells are
quoted and spreadsheet formula prefixes neutralized. A successful page with no
findings contributes no CSV finding row; JSON is the complete run record.

Spanish/English interface text and offline guidance are included. Eight common
rules have curated correction and verification advice. Other rules explicitly use
general guidance (`recommendation.kind: "general"`). Engine messages/evidence
remain in the engine's language, usually English; this is not a full translation
of axe. No LLM or paid service is needed. Confirm contextual advice manually.

La interfaz de los informes y las recomendaciones están disponibles en español
e inglés. Ocho reglas tienen orientación específica; las demás usan orientación
general identificada como tal. El texto original del motor se conserva sin
traducir. Los incompletos conservan ahora su evidencia para revisión humana.
CSV neutraliza prefijos de fórmulas, pero no sustituye la revisión de datos antes
de compartirlos. No se afirma certificación WCAG ni cobertura manual completa.

## Baselines / Comparación de auditorías

```powershell
node .\src\cli.js --project .\examples\project.json --format json --output before.json
# After changing your website / Tras corregir la web:
node .\src\cli.js --project .\examples\project.json --baseline before.json --format json --output after.json
```

The comparison tracks new, persistent and no-longer-observed automated findings
by requested URL, rule and exact selector. Changed engine/version, final URL,
failed/cancelled pages and added/removed scope are **incomparable**, never marked
resolved. Selector changes can still change issue identity; manual checks and
incomplete results are not resolved by this algorithm. JSON is the canonical
comparison; text/HTML include it, CSV exports current findings only. Baselines
are validated and limited to 20 MiB. Files are explicitly saved with `--output`;
there is no automatic historical database, retention or scheduling yet.

La comparación evita presentar páginas fallidas, retiradas o analizadas con otro
motor como mejoras. Un cambio de selector puede cambiar la identidad de una
incidencia. El historial automático y las revisiones manuales siguen pendientes.

Development diagnostic: `node scripts/benchmark.js benchmark.json`. Wall time
covers full audits; CPU/RSS measurements cover Node only, excluding Chromium.

## Restricted crawling / Rastreo con controles de red

```powershell
node .\src\cli.js --project .\examples\crawl.json --format html --output crawl.html
```

Add `crawl: {}` to project JSON to enable bounded breadth-first discovery. Seeds
and their HTTP(S) origins define navigation scope. Results retain depth and source
URL; coverage metadata distinguishes excluded/out-of-scope links, duplicates,
depth boundaries and truncated runs. Default depth is 2, page limit 20 (maximum
100), total run deadline 120 seconds. Page/link/transfer/deadline truncation returns
exit 2, even if completed pages have no violations. A configured depth boundary
means only that declared depth was covered, never that the entire site was audited.

Discovered fragments are stripped by default; set `crawl.followFragments: true`
for hash-routed applications. Explicit seed fragments are always preserved.
`crawl.excludePaths` contains case-insensitive decoded path prefixes; defaults
are `/logout`, `/signout`, `/delete`. These exclusions are not a guarantee that GET
requests cannot cause side effects. Audit authorized websites only. No forms are
submitted and restricted traffic permits only GET/HEAD.

`network.resourceOrigins` explicitly permits additional resource origins such as
CDNs (not additional crawl targets). An origin has no path/query/fragment.
Default ports are 80/443. Private/special IPv4/IPv6 addresses, including metadata,
loopback, mapped/NAT64/transition addresses and mixed public/private DNS answers,
are denied. An explicit `network.allowPrivateOrigins` exception must match a
declared target/resource origin exactly; its explicit port is permitted. Only
trusted local operators should add these exceptions. A new authenticated loopback
proxy validates DNS then connects to the numeric address, preventing a second DNS
lookup from redirecting that socket. Certificates are still verified by Chromium.

Restricted runs request Chromium's sandbox and do not retry without it. They
block service workers, downloads, WebSockets, dedicated workers and additional
page traffic. QUIC and non-proxied WebRTC UDP are disabled. Blocked resources make
the page audit fail rather than appear clean; list legitimate resource origins
explicitly. Continuously busy pages can time out because restricted runs require
network idle before accepting results. Legacy single-URL/project runs without
`crawl` or `network` retain their previous trusted-operator network behavior.

El rastreo limita páginas, profundidad, enlaces, peticiones, redirecciones, bytes
y tiempo. La red privada se bloquea salvo excepciones de origen explícitas.
Si se bloquean recursos o se agota un presupuesto, el informe indica el fallo o
la cobertura incompleta. El modo restringido exige el sandbox de Chromium; no hay
opción de producto para desactivarlo. Si el sistema no lo admite, falla.

These are application HTTP(S) controls, not an OS firewall, protection against a
browser/OS exploit, or approval to expose an audit service to untrusted callers.
See [network design and validation](docs/NETWORK-CRAWLING.md) for exact limits,
test environment exceptions and remaining deployment gates.
# Local history / Historial local

Use `--project config.json --history .accesspilot-history --baseline latest` to
save comparison evidence and compare the previous run automatically.
Use `--list-history` with the same project and history directory to list saved runs.
Open the local read-only web viewer with `--serve-history` and the same project
and history options. Open the session URL printed in the terminal; stop with Ctrl+C.
See [viewer guide / guía del visor](docs/HISTORY-VIEWER.md).
Preview count-based retention with `--prune-history --keep-runs 30`; add
`--apply-retention` to apply it. Maintenance never launches the browser.
See [history documentation / documentación del historial](docs/HISTORY.md) for
privacy, storage guarantees and remaining limitations.
