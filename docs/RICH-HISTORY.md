# Enriched history, import and trends / Historial enriquecido

```powershell
# Audit and store enriched evidence / Auditar y guardar evidencia enriquecida
node src/cli.js --project examples/project.json --history .accesspilot-history --format json --output audit.json
# Import an existing project report / Importar un informe de proyecto existente
node src/cli.js --project examples/project.json --history .accesspilot-history --import-history audit.json
# Open evidence, filters, downloads and trends / Abrir el visor
node src/cli.js --project examples/project.json --history .accesspilot-history --serve-history --lang es
# Controlled performance diagnostic / Diagnóstico sintético
node scripts/benchmark-history.js
```

## Español

Los registros nuevos añaden `historyVersion: 2` al formato `project-audit` cuyo
`schemaVersion` sigue siendo 1. Conservan, cuando están disponibles: fecha original,
herramienta/versión, configuración, URLs, estados, motor y política, gravedad,
criterios WCAG, títulos/descripciones de reglas, recomendaciones y su idioma/origen,
contadores y reglas/selectores pendientes de revisión humana. La cobertura refleja
el alcance configurado, no todas las páginas o requisitos de un sitio.

Los lectores siguen admitiendo registros antiguos sin `historyVersion`. La
conversión es aditiva: los datos ausentes quedan nulos, desconocidos o sin criterios;
no se reconstruyen recomendaciones históricas ni revisiones. Se rechazan versiones
desconocidas y contadores, fechas o tipos contradictorios. Los campos HTML de nodos
y mensajes diagnósticos/error se siguen omitiendo. **Nombres, URLs, selectores y
textos importados pueden contener información sensible:** no es anonimización.

La importación acepta un informe JSON `project-audit` o una descarga JSON del
historial de hasta 20 MiB. Valida y minimiza sus campos, exige el mismo nombre de
proyecto y guarda un archivo nuevo con el formato enriquecido. El archivo original
no se modifica. No acepta informes sueltos `page-audit`, CSV ni HTML. No ejecuta
auditorías. Reimportar crea otra copia: no hay deduplicación ni autenticación del
contenido del informe. Los archivos importados son afirmaciones de su origen,
no auditorías verificadas de nuevo por AccessPilot.

Los IDs y filtros del historial usan la fecha UTC de guardado/importación; la
fecha original de auditoría se conserva aparte cuando existe. Importar un informe
antiguo puede convertirlo en el último registro guardado y, por tanto, la base de
`--baseline latest`. Revise la base elegida o use un archivo explícito.

### Detalle y exportaciones

Cada ejecución permite filtrar por estado de página, gravedad, incidencias/revisión
pendiente y texto en URL, regla, criterio WCAG o selector. La búsqueda está limitada
a 100 caracteres. Los filtros actúan sobre esa ejecución, no sobre todo el archivo
histórico. El resumen mantiene los totales originales de la ejecución y lo indica.
La gravedad cuenta instancias de elementos señalados en incidencias; las reglas
pendientes de revisión se contabilizan aparte y no se consideran correcciones.
Los datos de revisión ausentes o las páginas fallidas no se presentan como cero
revisiones pendientes de todo el proyecto.

Las recomendaciones guardadas se muestran en su idioma. Si se elige otro idioma,
se distingue la orientación actual de AccessPilot de la recomendación histórica.
La biblioteca sigue teniendo ocho reglas con recomendaciones específicas y una
alternativa general para el resto; no es traducción completa del motor axe.

Las descargas incluyen toda la ejecución, aunque la vista esté filtrada:

- JSON: representación canónica de la evidencia conservada; admite reimportación.
- HTML: informe independiente sin URL/token de sesión, con CSP y texto escapado.
- CSV: filas de cobertura, páginas, incidencias y revisión, con protección frente
  a fórmulas. Incluye el origen `stored/current` de las recomendaciones.

HTML/CSV son representaciones del historial, no el informe original completo ni
formatos de reimportación. Para limitar recursos aceptan hasta 5 MiB de evidencia
de entrada y 40 MiB de salida; si se excede el límite, use JSON. El CSV se construye
con límite incremental. La vista limita 50 elementos por grupo, 512 caracteres por
selector y 2000 por recomendación. Los límites visuales no alteran JSON ni el
historial; las descargas HTML/CSV no aplican esos recortes visuales.

### Tendencias y límites

«Ver tendencias» muestra las últimas 10 ejecuciones guardadas, con presupuesto
agregado de lectura de 40 MiB. Los errores y registros que exceden el presupuesto
son huecos explícitos. No se cruzan huecos para calcular cambios. Los deltas solo
se muestran entre registros adyacentes con fecha original conocida y no invertida,
alcance configurado completo y páginas/motores/destinos/políticas comparables.
Si falta alguna condición, aparece «No comparable», sin atribuir una mejora.

Los recuentos observados no son una puntuación WCAG ni una medición de toda la
accesibilidad. La identidad sigue siendo URL, regla y selector exacto: cambios en
el DOM pueden cambiarla. El historial se muestra por orden de guardado, no se
reordena por fechas originales suministradas por un archivo importado.

El diagnóstico sintético guarda 30 registros de cinco páginas, diez reglas por
página y veinte nodos por regla; lee y compara una ventana de diez. Solo mide el
proceso Node y un ejemplo local, sin Chromium, escaneo real ni comparación con
competidores. No establece un SLA para grandes historiales.

Pendientes: redacción/anonimización configurable, retención programada/por edad o
espacio, comprobaciones humanas guiadas, ventanas analíticas más amplias con índices,
gráficos avanzados y ejecución segura desde la web. No se añade API de trabajos.

## English

New records use `historyVersion: 2` alongside the unchanged `project-audit`
`schemaVersion: 1`. Available timestamps/tool versions, severity, WCAG criteria,
rule descriptions, saved guidance/language, counts and incomplete review evidence
are retained. Original node HTML and diagnostic/error messages are excluded.
URLs, names, selectors and imported text may still contain sensitive data.

Legacy records remain readable. Additive import/conversion leaves absent metadata
unknown; it never reconstructs historical review data. Unknown versions, invalid
types, calendar dates and contradictory counts fail closed. `--import-history`
accepts project-audit JSON/history JSON up to 20 MiB for the same project name,
validates/minimizes it and saves a new record without editing the original. It does
not audit again, deduplicate, authenticate source claims or accept page-audit/CSV/HTML.
Import/save dates determine history ordering and `--baseline latest`; original audit
timestamps are preserved separately. Use an explicit baseline if that matters.

Run-detail filters cover page status, severity, violations/review category and text
in URL/rule/WCAG/selector, limited to 100 characters. They apply only to the selected
run. Summary totals always describe the whole run. Severity counts violation-node
instances; review-rule counts are separate and remain unknown when unavailable.
Saved-language guidance is retained; another UI language uses explicitly labelled
current AccessPilot guidance. Only eight rules have curated fixes; axe messages
are not comprehensively translated.

JSON downloads are canonical and reimportable. Offline HTML contains no session
URL/token, uses CSP and escapes evidence. CSV includes coverage/page/review rows,
formula defenses and `stored/current` guidance provenance. Downloads cover the
whole run, ignoring display filters. HTML/CSV are historical representations, not
the original full report or import formats; input is limited to 5 MiB and output
to 40 MiB (CSV enforces output incrementally). Use JSON for larger records. Display
limits of 50 findings/group, 512 selector characters and 2000 guidance characters
do not truncate stored JSON or the HTML/CSV download.

Trends read at most ten latest saved records and 40 MiB combined input. Corruption
and budget errors remain gaps. Deltas require adjacent records, known original
timestamps in chronological order, complete configured coverage and matching
scope/engine/destination/policy; otherwise they are incomparable. Gaps are never
bridged. Counts are not conformance scores. Finding identity is still exact URL,
rule and selector; DOM changes affect it. Ordering is save time, not supplied
original audit time.

The reproducible synthetic benchmark saves 30 runs (5 pages × 10 rules × 20 nodes)
and reads/compares ten, measuring Node only. It performs no website audit and
provides no Chromium/large-history SLA or competitor claim. Configurable redaction,
scheduled/age/size retention, guided manual checks, larger indexed analytical
windows, advanced charts and isolated web audit-job execution remain pending.
