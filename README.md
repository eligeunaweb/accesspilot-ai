# AccessPilot AI Ã°Å¸Â§Â­

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

## EspaÃƒÂ±ol

AccessPilot AI v0.1.0 analiza automÃƒÂ¡ticamente pÃƒÂ¡ginas web mediante Playwright y axe-core y genera informes de texto, JSON o HTML. **No garantiza el cumplimiento de WCAG**: hay que complementar el anÃƒÂ¡lisis con pruebas manuales de teclado, lectores de pantalla y experiencia de uso. No introduce cambios en la web auditada.

## Limitations

- Checks only the loaded page state, not every route, breakpoint, interaction or authenticated workflow.
- `incomplete` checks require human review.
- Automated detection can produce false positives and false negatives.
- The browser visits the URL and executes page scripts; only audit websites you trust or have permission to inspect.
- No AI service, API keys, screenshots or auto-fixes in v0.1.0.

## License

MIT.

## Development / Desarrollo

See [audit and roadmap / auditorÃ­a y hoja de ruta](docs/AUDIT-ROADMAP.md).
Use Node.js 22.12 or newer. / Usa Node.js 22.12 o superior.

```powershell
npm ci
npx playwright install chromium
npm test
```

Tests include a real Chromium audit of a local HTTP fixture; no public target is required.
Las pruebas incluyen una auditorÃ­a real con Chromium de un servidor local.
HTTP errors return exit code 2. / Los errores HTTP devuelven cÃ³digo 2.
`--output` overwrites the selected file. / `--output` sobrescribe el archivo indicado.

## Projects and batches / Proyectos y lotes

```powershell
node .\src\cli.js --project .\examples\project.json --format json --output portfolio.json
```

Project JSON uses `schemaVersion: 1`, `name`, `urls` (1–100 HTTP(S) URLs), optional
`concurrency` (1–4; default 1) and `timeoutMs` (1000–120000; default 30000).
Unknown properties and credential-bearing URLs are rejected. URLs are normalized;
fragments are removed and duplicates run once. JSON configuration is limited to 1 MiB.
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
