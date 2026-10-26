# Authenticated sessions / Sesiones autenticadas

## Español

Esta fase permite auditar páginas privadas con una sesión existente. No ejecuta formularios de login ni recorridos con clics. Cada página y viewport recibe una copia nueva de cookies y localStorage; los cambios no se guardan ni se comparten entre páginas. No se añaden dependencias.

Configuración pública:

```json
{
  "schemaVersion": 1,
  "name": "Área de socios",
  "urls": ["https://example.org/account"],
  "authentication": {
    "profile": "member",
    "readySelector": "[data-access='member']"
  }
}
```

`profile` es una etiqueta pública de 1–32 caracteres: letra minúscula inicial, letras, números o guiones. No uses un nombre personal ni un secreto. `readySelector` es un selector de Playwright, de hasta 500 caracteres, que debe identificar una señal visible y exclusiva del acceso esperado en todas las páginas. No pongas credenciales en el selector. Si no aparece en un máximo de cinco segundos (o antes si vence el presupuesto), la página falla y no cuenta como mejora. Esta señal depende de la aplicación; no prueba por sí sola la identidad o los permisos del servidor.

Crear una sesión con el Playwright instalado (cuenta de pruebas y sitio autorizado):

```powershell
New-Item -ItemType Directory -Force .accesspilot-auth
npx playwright codegen --save-storage=.accesspilot-auth/member.json https://example.org/login
# Completa el login en el navegador y ciérralo para guardar el estado.
node src/cli.js --project project.json --session-state .accesspilot-auth/member.json --history .accesspilot-history --format html --output private-report.html
```

No pases contraseñas ni tokens como argumentos. El archivo de sesión puede permitir suplantar a la cuenta: guárdalo con acceso limitado al usuario del sistema, fuera de carpetas compartidas y copias públicas. `.accesspilot-auth/` y `playwright/.auth/` están ignorados por Git. No se modifican ACL de Windows automáticamente. AccessPilot no captura, renueva ni cifra sesiones y no escribe de nuevo el archivo. Bórralo y revoca la sesión cuando deje de ser necesario.

Se acepta un subconjunto estricto de `storageState` de Playwright, con límite de 1 MiB: hasta 100 cookies y un origen con hasta 100 elementos localStorage. Solo cookies del host exacto, sin dominio con punto inicial ni cookies particionadas; cookies de sesión o no caducadas y Secure para HTTPS. El estado de codegen puede contener dominios SSO, dominios amplios o almacenamiento adicional: esos archivos se rechazan; usa una sesión de pruebas exportada con alcance específico. No amplíes el alcance para eludir la validación. IndexedDB, sessionStorage, HTTP Basic y autenticación cliente TLS no están soportados.

La autenticación activa obligatoriamente la política de red restringida: un único origen exacto, HTTPS y sin recursos externos. Solo se permite HTTP en localhost/loopback expresamente autorizado en `network.allowPrivateOrigins`, para pruebas controladas. Redirecciones, scripts o peticiones hacia otros orígenes producen auditoría incompleta. No se permite POST ni enviar formularios. Esto limita aplicaciones con API externa o carga de datos mediante POST; esas aplicaciones aún no son compatibles. Las peticiones GET pueden tener efectos en un servidor mal diseñado: utiliza cuentas y datos de prueba. El navegador sigue sin estar contenido por un firewall del sistema operativo.

Los informes y el historial conservan la etiqueta pública y el selector de acceso, nunca el archivo de estado ni sus cookies/localStorage como configuración. Los errores de sesión son genéricos. **El contenido auditado puede incluir datos personales o secretos reflejados por el propio sitio**: HTML de incidencias, selectores, texto y URL no se anonimizan automáticamente. Trata los informes y el historial de páginas privadas como información sensible.

Cambiar de perfil o selector invalida comparaciones. Un perfil representa un contrato mantenido por el operador, no un hash de los secretos: cambiar de cuenta, permisos, conjunto de datos o estado funcional requiere cambiar la etiqueta. Comparar dos sesiones con la misma etiqueta no demuestra que sean equivalentes.

Validación real disponible: fixture local con cookies y localStorage, aislamiento entre páginas, pérdida de acceso, bloqueo de salida a otro origen y CLI/historial. Pendientes: cuentas reales, SSO/MFA, renovación, flujos con clics, redacción avanzada, revisión de seguridad independiente y tecnologías de asistencia.

## English

Audit private pages using existing session state:

```sh
npx playwright codegen --save-storage=.accesspilot-auth/member.json https://example.org/login
node src/cli.js --project project.json --session-state .accesspilot-auth/member.json --history .accesspilot-history --format json
```

Create the ignored `.accesspilot-auth` directory first. Sign in with an authorized test account and close the codegen browser to save state. Protect this file with OS user permissions; never commit it or share it. Windows ACLs are not changed automatically. Capture, encryption, renewal and interactive login journeys are not implemented.

Use the public project configuration above. `authentication.profile` is a public lowercase identifier (1–32 characters); `readySelector` must uniquely identify visible authorized content on every target, within five seconds or the remaining audit deadline. Neither field may contain credentials or personal identifiers. A missing marker fails the page rather than auditing a login screen. The marker is operator-specified evidence, not server-side identity verification.

Sessions accept a strict, bounded Playwright storageState subset: 1 MiB, up to 100 exact-host cookies and one exact origin with up to 100 localStorage entries. Expired, broad-domain, partitioned and foreign-origin cookies/state are rejected. HTTPS cookies must be Secure. IndexedDB, sessionStorage, HTTP Basic and client TLS credentials are unsupported. Codegen may export extra SSO/domain state that must be scoped specifically for the test application before import.

Each page/viewport uses a fresh copy; cookie/localStorage mutations do not affect later pages or the input file. Authentication requires a single HTTPS origin and restricted GET/HEAD egress without external resources. Explicitly trusted HTTP loopback fixtures are allowed. Cross-origin dependencies, POST-based application APIs and form submission are unsupported. GET requests can still change badly designed applications; use test data. This is not OS firewall containment.

Public labels/markers are retained in reports and history; runtime cookie/localStorage configuration and session filenames are not. Session diagnostics are generic. Scanned HTML, text, selectors and URLs can still contain sensitive page data, including secrets echoed by the application. Reports are not automatically anonymized and require appropriate access controls.

Changing the profile or marker makes baselines incomparable. Labels are operator-maintained contracts: change them when accounts, permissions, data or workflow state change. Reusing a label does not establish equivalent identities.

Implemented acceptance fixtures cover authenticated cookies/localStorage, fresh-state isolation, expired access, blocked foreign egress, CLI and history. Real accounts, SSO/MFA, renewal, click journeys, advanced redaction, independent security review and assistive-technology testing remain pending.

References: [Playwright authentication](https://playwright.dev/docs/auth), [BrowserContext storageState](https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state).
