# Manual review evidence / Evidencias de revisión manual

## Español

AccessPilot permite conservar declaraciones humanas sobre una auditoría guardada: teclado, lector de pantalla, inspección visual, zoom u otro método. Las declaraciones son aportadas por el operador; la aplicación valida su estructura y vínculo con la evidencia, **no verifica que una persona haya realizado la prueba ni certifica conformidad WCAG**.

Flujo local sin abrir ni auditar páginas:

```powershell
# audit.json es un informe de proyecto guardado o descargado del historial.
node src/cli.js --project project.json --review-template audit.json --output review.json
# Edita review.json con las observaciones reales; todos los controles empiezan como not-tested.
node src/cli.js --project project.json --review-audit audit.json --manual-review review.json --history .accesspilot-history
node src/cli.js --project project.json --history .accesspilot-history --serve-history
```

La plantilla no sobrescribe archivos existentes. El alta crea un nuevo registro del historial mediante la escritura atómica y bloqueo existentes. No modifica audit.json ni los registros anteriores. El proyecto seleccionado debe tener el mismo nombre que el proyecto de la auditoría original. Las operaciones manuales no aceptan sesión, opciones de auditoría ni combinación con otras operaciones del historial.

Campos de la declaración (schemaVersion 1, kind manual-review):

- `id`: identificador único del lote, 1–64 caracteres, empezando por letra minúscula; letras minúsculas, números o guiones.
- `auditFingerprint`: huella SHA-256 generada por la plantilla. No la cambies ni la copies a otra auditoría.
- `reviewedAt`: fecha ISO UTC con milisegundos. Actualízala al realizar la revisión; no puede preceder a la fecha de auditoría conocida ni a los lotes anteriores.
- `reviewer`: alias público de quien aporta la declaración; hasta 120 caracteres.
- `checks`: 1–100 comprobaciones. Cada una tiene `id` único en ese lote, URL inicial exacta y nombres de `viewport` y `journey` (o null explícito). Solo se admiten combinaciones presentes en la auditoría guardada.
- `criteria`: 1–20 referencias distintas a criterios WCAG 2.x reconocidos. Se conserva 4.1.1 para revisiones históricas, aunque está eliminado en WCAG 2.2. La versión/nivel objetivo y la correcta aplicabilidad del criterio corresponden al revisor; referenciar un criterio no demuestra su cumplimiento.
- `status`: passed (satisfactorio), failed (problema observado), not-applicable (no aplicable) o not-tested (no probado). Un destino con auditoría fallida/cancelada solo admite not-tested en este flujo.
- `method`: keyboard, screen-reader, visual, zoom u other. `environment`: navegador, sistema, tecnología de asistencia y versiones, hasta 500 caracteres. `evidence`: pasos y observaciones, hasta 2000 caracteres. Explica también por qué un control no aplica o no se ha probado.

La plantilla genera una comprobación de teclado 2.1.1 por destino, como punto de partida pendiente; **no es una lista completa de criterios ni una evaluación realizada**. Añade comprobaciones según el alcance y la metodología que adoptes. Los valores de muestra son instrucciones para el revisor, no evidencias reales. No cambies a passed sin haber realizado y descrito la prueba.

Cada auditoría admite hasta 20 lotes ordenados cronológicamente. Para registrar un seguimiento, descarga el JSON del último registro con declaraciones, crea una nueva plantilla y añade otro lote. Puedes repetir el identificador de una comprobación en un lote nuevo; el anterior permanece visible. No existe sustitución silenciosa ni cálculo de una conformidad final: los recuentos incluyen todas las declaraciones, también repeticiones. No hay comparación automática de resultados manuales entre auditorías distintas.

Las declaraciones se conservan en **historyVersion 3**. Los registros sin ellas siguen en versión 2 y los históricos anteriores siguen siendo legibles. Las versiones antiguas de AccessPilot que no admitan versión 3 deben rechazarla, en lugar de descartar la evidencia. El JSON conserva datos estructurados; HTML y el visor ES/EN muestran una sección separada; CSV utiliza filas `manual-declaration` y columnas propias. El visor limita esta sección a los 5 últimos lotes, 20 controles por lote y 500 caracteres por texto, con aviso explícito; no aplica los filtros automáticos a las declaraciones. Las descargas conservan el detalle completo. No se alteran las incidencias, gravedad, revisión automática pendiente, cobertura ni comparaciones automáticas. El registro derivado conserva la fecha original de auditoría; es una ampliación de evidencia, no una nueva ejecución.

La huella se calcula sobre la evidencia canónica que conserva AccessPilot (proyecto, destinos, versiones, fecha disponible, resultados y metadatos), excluyendo los propios lotes manuales y el HTML/mensajes descartados del informe original. Cambiar esa evidencia invalida la declaración. No es una firma digital, identidad comprobada ni protección frente a un operador que modifique todos los archivos. Registros heredados sin fecha ni suficiente metadato pueden ser indistinguibles si su evidencia disponible es idéntica. No se demuestra que la web actual coincida con la instantánea registrada.

Seguridad y límites: importación JSON manual limitada a 1 MiB, registros hasta 20 MiB y límites existentes de exportación HTML/CSV (5 MiB de entrada, 40 MiB de salida). El texto se escapa en HTML y CSV conserva defensa contra fórmulas. No se cargan adjuntos, rutas locales, HTML activo ni recursos remotos de las declaraciones. Los alias, URL, entorno y observaciones pueden contener datos sensibles: usa alias de prueba, evita credenciales/datos personales y protege archivos/historial. No hay anonimización automática ni firmas. La retención explícita puede eliminar registros conforme a la política elegida.

Pendientes: editor gráfico de revisión, adjuntos seguros, comparación manual entre auditorías, firma/procedencia verificable y estudios reales con tecnologías de asistencia y usuarios. Las pruebas automatizadas de software emplean **declaraciones sintéticas**, no simulan una evaluación humana real.

## English

Store human-supplied observations against a saved project audit using the CLI above. Generate a template, perform the selected checks, record actual environment/steps/outcomes, then append the batch to history. Template checks default to `not-tested`; the starting keyboard/2.1.1 item per target is not a complete WCAG checklist. This is an evidence register, not verified human execution or certification.

Batches contain a public reviewer alias, UTC timestamp, unique lowercase ID and canonical audit fingerprint. Checks identify exact saved initial URL + viewport name/null + journey name/null; declare WCAG 2.x references, status, method, environment and evidence. Statuses: passed, failed, not-applicable, not-tested. Methods: keyboard, screen-reader, visual, zoom, other. Failed/cancelled audit targets support not-tested only. Criterion IDs are checked, including legacy 4.1.1; the reviewer remains responsible for target WCAG version/level and applicability. 4.1.1 was removed from WCAG 2.2.

Limits: 20 chronological batches per snapshot, 100 checks per batch, reviewer 120 characters, environment 500 and evidence 2000. Batch JSON input is bounded to 1 MiB. Template writes refuse overwriting existing files. Adding evidence creates a new atomic history record; the input audit and prior records stay unchanged. Subsequent review batches may repeat check IDs while preserving earlier declarations. Counts include all declarations, including repeats; there is no inferred final compliance status or automatic cross-audit manual comparison.

Records with manual evidence use historyVersion 3; versions 1/2 remain readable and ordinary records continue using version 2. Older application versions must reject unknown version 3 rather than discard evidence. Manual records appear separately in bilingual HTML/viewer, canonical JSON and CSV manual-declaration rows. The viewer bounds this section to the latest 5 batches, 20 checks per batch and 500 characters per text, with an explicit notice; automated filters do not apply to declarations. Downloads retain full evidence. Automated findings, incomplete checks, severity, coverage and comparisons are unchanged. The derived record retains the original audit timestamp and is not a new browser run.

SHA-256 binds declarations to canonical retained evidence, excluding manual batches and discarded original HTML/diagnostics. It is not a digital signature, identity proof or tamper protection against an operator rewriting all files. Identical legacy evidence with unknown timestamps can have the same fingerprint. Neither a fingerprint nor a declaration proves the live website still matches the snapshot. Chronology uses declared timestamps and does not verify actual execution time.

HTML is escaped and CSV formula defenses retained. No attachments, local-file links or remote resources are opened. Human text/aliases/URLs may still contain sensitive information; protect storage and avoid credentials or personal data. Existing history size/export/retention limits apply. Offline manual commands do not launch browsers or use session credentials.

Graphical editing, safe attachments, cross-audit manual comparisons, verifiable signing/provenance and real assistive-technology/user evaluation remain pending. Software tests use synthetic declarations, not actual human accessibility evaluations.

References: [W3C evaluation methodology](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/), [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
