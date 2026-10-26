# Project dashboard and history filters / Panel y filtros

```powershell
node src/cli.js --workspace examples/workspace.json --history .accesspilot-history --serve-history --lang es
```

## Español

El panel reúne entre 1 y 20 proyectos definidos explícitamente en un archivo JSON
de espacio de trabajo. [Ejemplo](../examples/workspace.json). Cada elemento de
`projects` es una configuración completa de proyecto, no una ruta de archivo.
El archivo admite `schemaVersion: 1`, `name`, `language` y `projects`; rechaza
campos desconocidos, proyectos inválidos y nombres duplicados tras recortar
espacios. Se aplica el límite de 1 MiB del lector de configuraciones compartido.
Los nombres distinguen mayúsculas, como el historial existente.

La carpeta `--history` es común. Use exactamente el mismo nombre que en las
configuraciones de auditoría para recuperar los historiales existentes. El panel
no audita las URLs, busca archivos de proyecto ni descubre historiales ajenos.
La lista queda fijada al arrancar: reinicie el visor después de cambiar el JSON.
`--workspace` solo se admite con `--serve-history`, y no se combina con `--project`,
URL, auditorías, informes ni operaciones de retención. El modo de un solo proyecto
continúa disponible sin cambios de comando.

Cada tarjeta muestra cuántos archivos de ejecución reconoce y el identificador
de la última ejecución. No son métricas de conformidad ni validación del contenido
de todos los registros: estos se validan al abrirlos o compararlos. Un historial
inaccesible muestra un error en su tarjeta sin ocultar los demás proyectos.
La búsqueda del panel coincide con nombres y URLs configuradas, sin distinguir
mayúsculas; no realiza peticiones a esas URLs.

En cada historial se puede buscar una fecha o parte de un identificador y filtrar
por fechas UTC inclusivas «Desde/Hasta». Se rechazan fechas inexistentes, rangos
invertidos, consultas de más de 100 caracteres y caracteres de control. Los
filtros se conservan al paginar; aplicar o limpiar filtros vuelve a la primera
página. Si no hay coincidencias se muestra un estado vacío y se pueden limpiar
los filtros. «Comparar con la última» sigue usando la última ejecución del
historial completo, aunque esté fuera del filtro. Los selectores del formulario
de comparación muestran únicamente la página filtrada actual.

Solo se autorizan las rutas de los proyectos declarados; indicar el ID de otro
proyecto o un registro de otro historial devuelve 404. Se mantienen los controles
del [visor local](HISTORY-VIEWER.md): loopback, URL de sesión privada, Host/Origin,
GET, CSP y límites. El mismo token permite acceder a todos los proyectos de ese
espacio; no existe control multiusuario por proyecto. El panel sigue usando
bloqueos y puede crear carpetas vacías para proyectos sin historial. No modifica
ni elimina registros. El equipo y la carpeta son de confianza.

Pendientes: búsqueda dentro de reglas/selectores, filtros por estado o gravedad,
gráficos de tendencias y métricas históricas enriquecidas, edición persistente de
proyectos y ejecución de trabajos con aislamiento. No se presentan estas funciones
como terminadas. La revisión manual con lectores de pantalla sigue pendiente.

## English

Use the command above with `--lang en`. A workspace declares 1–20 inline project
configurations (not file paths), a version-1 schema, name and optional language.
Unknown fields, invalid projects, duplicate trimmed names and configurations over
1 MiB are rejected. Names remain case-sensitive. Reuse exact audit project names
to open their existing histories from the common `--history` directory.

The dashboard does not discover other histories, scan directories for projects or
audit configured URLs. Restart to reload workspace changes. `--workspace` requires
`--serve-history` and is incompatible with project/URL targets, audit/report and
retention operations. Existing single-project viewer commands remain supported.

Cards show recognized run-file counts and latest IDs, not compliance scores or
validation of every file's contents; evidence is validated when opened/compared.
An inaccessible project history displays its own error while other cards remain
usable. Search matches configured project names/URLs case-insensitively without
fetching those URLs.

History search matches date/ID substrings. Inclusive UTC date filters reject
invalid calendar dates and reversed ranges. Search is limited to 100 printable
characters. Pagination preserves filters; applying/clearing resets to page one.
Empty matches display a clearable empty state. Compare-with-latest uses the newest
run in the entire project even if excluded by the filter. Comparison selects
contain the current filtered page only.

Only declared project routes are authorized. Unknown projects and cross-project
record lookups return 404. Existing loopback/session/Host/Origin/CSP/GET controls
remain in force. A session token authorizes the entire selected workspace; this
is not per-user/per-project access control. Local files and the computer are
trusted. Read locks and empty project directories may be created; run records
are not modified/deleted by the viewer.

Content/status/severity filters, trends, richer historical metrics, persistent
project editing and isolated audit-job execution remain roadmap work. Manual
screen-reader/user validation is still pending.
