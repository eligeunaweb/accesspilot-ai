# Interactive journeys / Recorridos interactivos

## Español

Los proyectos pueden definir puntos de auditoría de interfaz: un menú abierto, un diálogo o una pestaña activa. Cada punto reproduce sus propios pasos desde la URL inicial en un contexto de navegador nuevo; no hereda los cambios de otros puntos. Puede recibir una copia de la sesión privada y un viewport configurado. La auditoría axe se ejecuta después de los pasos y de comprobar la señal visible de llegada.

Plantilla: adapta la URL y los selectores a tu aplicación autorizada; este ejemplo no presupone que existan en example.org.

```json
{
  "schemaVersion": 1,
  "name": "Panel de cuenta",
  "urls": ["https://example.org/account"],
  "journeys": [
    {"name": "initial", "steps": [], "readySelector": "main"},
    {
      "name": "settings-open",
      "steps": [
        {"action": "click", "selector": "#open-settings"},
        {"action": "waitFor", "selector": "#settings-dialog", "state": "visible"}
      ],
      "readySelector": "#settings-dialog"
    },
    {
      "name": "settings-closed",
      "steps": [
        {"action": "click", "selector": "#open-settings"},
        {"action": "press", "selector": "#settings-dialog", "key": "Escape"},
        {"action": "waitFor", "selector": "#settings-dialog", "state": "hidden"}
      ],
      "readySelector": "main"
    }
  ]
}
```

```powershell
node src/cli.js --project project.json --history .accesspilot-history --format html --output journeys.html
# Para una sesión privada existente:
node src/cli.js --project project.json --session-state .accesspilot-auth/member.json --history .accesspilot-history --format json
```

Añade `authentication` siguiendo [Sesiones autenticadas](AUTHENTICATED-SESSIONS.md) para el segundo comando. Su señal de acceso debe seguir visible al terminar el recorrido y el análisis; si desaparece, la auditoría falla. El marcador del punto también se vuelve a comprobar después del análisis. Una señal visible es una condición definida por el operador, no una garantía de estabilidad del DOM ni de permisos del servidor.

Contrato:

- `journeys`: 1–10 puntos con nombres únicos de 1–32 letras minúsculas, números o guiones, empezando por letra.
- `steps`: 0–20 acciones en orden. Cero acciones permite auditar el estado inicial explícito.
- `click`: selector de Playwright; conserva las comprobaciones normales de visibilidad y recepción de eventos; no permite `force`.
- `press`: selector y una tecla de Enter, Space, Escape, Tab, Shift+Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home o End. Se aplica al elemento seleccionado; no demuestra que un usuario de teclado pueda alcanzarlo desde el inicio.
- `waitFor`: selector y estado `visible` o `hidden`. `hidden` también puede cumplirse si el elemento no existe; elige cuidadosamente la señal final.
- Cada selector admite hasta 500 caracteres. Cada acción y la señal final tienen un máximo de cinco segundos, siempre dentro del timeout total de la página. No hay pausas fijas ni reintentos de un recorrido completo.
- Hasta 100 combinaciones URL × viewport × punto. Todas comparten el límite de concurrencia 1–4; cada combinación tiene su presupuesto total de página. No hay un plazo global adicional para todo el lote explícito.
- Solo URLs explícitas: no se permite combinar `journeys` y `crawl`. Los mismos puntos se aplican a todas las URLs configuradas.
- Definir recorridos activa la red restringida incluso sin sesión: solo orígenes declarados, métodos GET/HEAD y controles existentes de DNS, redirecciones, bytes y peticiones. Un POST bloqueado invalida el resultado. En sesiones sigue siendo obligatorio un origen único HTTPS; HTTP loopback requiere autorización explícita de configuración.

Las acciones pueden cambiar datos mediante GET, JavaScript local o servicios del servidor: usa sitios autorizados, cuentas y datos de prueba. No se ejecutan scripts arbitrarios, formularios de login, cargas de archivos ni `fill`. No hay modo de permitir POST. Una aplicación que necesita POST o APIs fuera del alcance no es compatible con este flujo. Los cambios del servidor no se revierten automáticamente. Los popups y descargas no constituyen destinos soportados.

Identidad e informes: URL inicial + nombre de viewport + nombre del punto. Cambiar pasos o señal final con el mismo nombre produce `journey-changed`; añadir, renombrar o quitar un punto cambia el alcance. Los puntos fallidos/cancelados no se consideran mejoras. Las definiciones se guardan como evidencia pública en JSON/historial; los nombres aparecen en texto, HTML, CSV y visor, incluso para puntos sin incidencias. No pongas secretos ni datos personales en los selectores. Un recorrido sin nombre de punto no se equipara a un punto llamado `initial`. Cambios de datos o estado funcional no representados en la definición siguen siendo responsabilidad del operador.

Pruebas reales: abrir/cerrar un diálogo, Escape, incidencia visible solo en el estado abierto, fallo por marcador ausente, bloqueo de POST antes de llegar al servidor, sesión privada, pérdida de la señal de acceso, CLI, historial y visor. No equivalen a conformidad WCAG ni sustituyen pruebas manuales de foco, lector de pantalla, teclado, MFA o flujos externos. El sandbox nativo y la CI se documentan por revisión en VALIDATION.md.

## English

`journeys` adds named UI audit checkpoints to explicit project URLs. Each URL × viewport × checkpoint starts from a fresh browser context and replays the full declared action list, optionally using a fresh copy of saved authentication state. Axe runs after the final visible marker is reached. The marker and any authentication marker must still be visible after analysis.

Adapt the example above to an authorized application. `initial` has zero steps; `settings-open` opens a dialog; `settings-closed` replays opening then Escape. Run the project with the existing CLI/history/report flags. Add the public authentication configuration before using `--session-state`.

Limits: 1–10 unique lowercase checkpoint names, 0–20 ordered steps per checkpoint, selectors up to 500 characters, five seconds per action/marker within the overall page timeout. At most 100 URL × viewport × checkpoint combinations share configured concurrency; explicit batches have no separate global deadline. All checkpoints apply to every explicit URL. Crawling and journeys cannot be combined.

Allowed actions are `click` without force, `press` with the documented key allowlist, and `waitFor` with visible/hidden state. Locator key presses target the selected element and do not prove keyboard reachability. Hidden waits also succeed when the element is absent. There is no arbitrary JavaScript, fill, upload, login submission, fixed sleep or whole-journey retry.

Journeys force restricted networking: declared origins, GET/HEAD only, existing pinned-DNS/request/redirect/byte controls. Blocked POST invalidates the audit. Private sessions retain their one-origin HTTPS requirements (explicit HTTP loopback fixtures only). GETs and page JavaScript can still change server data; use authorized test accounts/data. Server mutations are not rolled back. Cross-origin APIs outside declared scope, POST-dependent apps, popups and downloads are unsupported.

History identity includes the initial URL, viewport name and checkpoint name. A changed action list or marker makes the point incomparable (`journey-changed`); renamed/added/removed points change scope. Failed/cancelled points cannot become resolved findings. Reports retain public definitions and checkpoint labels, including clean status rows. Never store secrets or personal data in selectors. Operator labels/definitions do not prove equivalent server data or account permissions.

Controlled real-browser acceptance covers dialog visibility, Escape, state-dependent findings, missing markers, blocked POST, saved sessions, lost access, CLI/history/viewer. Manual focus, keyboard reachability, screen readers, SSO/MFA, state redaction and OS containment remain separate acceptance work. See VALIDATION.md for revision-specific native CI and the local test-only sandbox adapter.

References: [Playwright actionability](https://playwright.dev/docs/actionability), [Locator API](https://playwright.dev/docs/api/class-locator).
