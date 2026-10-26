# AccessPilot AI ðŸ§­

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

## EspaÃ±ol

AccessPilot AI v0.1.0 analiza automÃ¡ticamente pÃ¡ginas web mediante Playwright y axe-core y genera informes de texto, JSON o HTML. **No garantiza el cumplimiento de WCAG**: hay que complementar el anÃ¡lisis con pruebas manuales de teclado, lectores de pantalla y experiencia de uso. No introduce cambios en la web auditada.

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
