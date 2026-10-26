# Local history viewer / Visor local del historial

```powershell
node src/cli.js --project examples/project.json --history .accesspilot-history --serve-history --lang es
```

## Español

Abra la URL que muestra la terminal y detenga el visor con Ctrl+C. El puerto es
aleatorio por defecto; `--port 8765` permite elegir uno. Se requiere el proyecto
JSON y su historial. Genere nuevas auditorías desde la CLI con `--history`.

El visor permite consultar ejecuciones, páginas, estados, motores y reglas/selectores,
comparar dos ejecuciones y descargar su evidencia JSON validada. La interfaz cambia
entre español e inglés sin servicios externos ni JavaScript, con controles HTML
nativos. Muestra 50 registros por página. El formulario compara registros de la
página actual; «Comparar con la última» funciona desde cualquier página.
Las fechas son UTC, con UUID abreviados; los enlaces conservan el ID completo.

La vista muestra hasta 50 incidencias por grupo y 512 caracteres por selector, con
aviso; la descarga JSON conserva toda la evidencia almacenada. El historial no
contiene gravedad, recomendaciones ni comprobaciones manuales: use los informes
originales de la CLI para esos datos. La comparación utiliza las reglas existentes
de cobertura, motor y política. Una ausencia de incidencias no certifica WCAG.

### Seguridad y límites

- Escucha exclusivamente en `127.0.0.1`, sin opción de exponerlo a la red.
- Genera una ruta aleatoria de sesión de 256 bits. **La URL es una credencial:**
  manténgala privada; queda en terminal e historial del navegador. Deja de funcionar
  al parar el servidor. No hay cuentas, cookies ni sesiones persistentes.
- Verifica Host exacto y Origin cuando existe; rechaza Fetch Metadata de otros
  sitios y otros orígenes del mismo sitio. No habilita CORS.
- Solo acepta GET. No inicia auditorías, modifica proyectos ni elimina registros.
  Las lecturas se coordinan con retención mediante el bloqueo del historial.
- CSP impide scripts, recursos externos, iframes y cambios de URL base; todos los
  textos del historial se escapan. Respuestas no-store y no-referrer.
- Máximo 32 conexiones y cuatro peticiones activas, cabeceras de 8 KiB, URL de
  2048 caracteres, límites de tiempo y 20 MiB por registro. El cierre corta
  conexiones abiertas, incluidas peticiones incompletas.
- Registros borrados devuelven 404; corruptos/bloqueados, 503 sin rutas locales ni
  errores internos. La retención puede cambiar el historial entre navegaciones.

El historial y el equipo local son de confianza. No protege frente a procesos que
lean la terminal, controlen el navegador o modifiquen archivos. No es un servicio
multiusuario: no lo exponga por túneles/proxies. No se incorpora una API de trabajos
ni se cierra la puerta de aislamiento de red pendiente para ejecutar auditorías
desde un servicio. El token no sustituye ese aislamiento.

Las pruebas HTTP y Chromium/axe cubren controles de acceso, métodos/parámetros,
exportación, errores, paginación, cierre, idiomas, teclado, formularios, expansión
de detalles, contenido malicioso escapado y viewport de 375 px. La revisión manual
con lectores de pantalla y usuarios sigue pendiente.

El panel de varios proyectos y los filtros por fecha/identificador están disponibles
mediante `--workspace`; véase [WORKSPACES.md](WORKSPACES.md).
Pendientes: búsqueda/filtros por contenido/estado/gravedad, tendencias,
historial enriquecido con informes completos y ejecución segura desde la web.

## English

Run the command above with `--lang en`, open the URL printed in the terminal and
stop with Ctrl+C. The port is random unless `--port 8765` is supplied. The viewer
reads one selected project and its history. Create new runs using the audit CLI.

Browse runs and page evidence, compare runs and download validated JSON evidence.
Native HTML links/forms/details work without JavaScript or external services.
Lists show 50 runs per page; the form selects within that page, while row links
compare any older run to the newest run in the entire history. Dates are UTC and
UUIDs abbreviated; links retain full IDs. Display is limited to 50 findings per
group and 512 characters per selector with a notice; JSON preserves all stored
evidence. History lacks severity, recommendations and manual checks: use original
CLI reports for those fields. Automated results do not certify WCAG conformance.

The server binds only to `127.0.0.1`, generates a fresh 256-bit session path and
checks exact Host, supplied Origin and cross-site/same-site Fetch Metadata.
Treat the URL as a credential: it appears in terminal and browser history and
expires on shutdown. There are no accounts, cookies or persistent sessions. GET
is the only accepted method; no audits, edits or deletion are exposed. Reads hold
the retention lock. Missing records return 404; corrupt/locked records return 503
without revealing paths or internal errors. Retention can change runs between views.

Responses use no-store, no-referrer, restrictive CSP, frame denial and escaped
text. No CORS or external resources are enabled. Limits: 32 connections, four
active requests, 8 KiB headers, 2048-character URLs, timeouts and 20 MiB snapshots.
Shutdown closes incomplete connections. This is a trusted local tool, not a
multiuser service: do not expose it through tunnels/proxies. Local processes that
inspect the terminal/browser or modify files are outside the security boundary.
No audit-job API or new OS egress containment is introduced; those gates remain open.

HTTP and real Chromium/axe tests cover access controls, pagination, export, errors,
shutdown, ES/EN, keyboard/form interactions, details, escaped malicious content
and a 375 px viewport. The multi-project dashboard and date/ID filters are now
available through `--workspace`; see WORKSPACES.md. Manual screen-reader/user
testing, content/status/severity filters, trends, enriched history and safely isolated
web audit execution remain pending.
