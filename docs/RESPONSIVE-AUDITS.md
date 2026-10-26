# Responsive audits / Auditorías con tamaños de pantalla

```powershell
node src/cli.js --project examples/responsive.json --history .accesspilot-history --format json --output responsive-audit.json
node src/cli.js --project examples/responsive.json --history .accesspilot-history --baseline latest --format html --output responsive-report.html
node src/cli.js --project examples/responsive.json --history .accesspilot-history --serve-history
```

## Español

La configuración de proyecto admite `viewports`, una lista opcional de uno a
cuatro perfiles `{name, width, height}`. [Ejemplo completo](../examples/responsive.json).
Los nombres son únicos, de 1–32 letras minúsculas, dígitos o guiones, empezando por
una letra. Las dimensiones deben ser distintas: ancho de 240–3840 y alto de
240–2160 píxeles CSS enteros. Se rechazan propiedades desconocidas y conversiones
implícitas. Sin `viewports` se conserva el modo anterior y su formato de resultados.

Cada URL se audita en cada perfil con su propio navegador/contexto y evidencia.
La configuración del perfil se aplica antes de navegar; el resultado identifica
las dimensiones utilizadas. `concurrency` es un límite compartido de 1–4 trabajos,
no un multiplicador por perfil. El orden de resultados es perfil/URL; la
cancelación conserva también las combinaciones que no llegaron a ejecutarse.

El proyecto admite hasta 100 combinaciones de página/perfil. En lotes explícitos
se limita `urls × viewports`. En rastreo se limita `crawl.maxPages × viewports`;
`maxPages` se aplica a cada perfil, mientras que `maxDurationMs` es un plazo global
compartido. Los rastreos se ejecutan por perfil en el orden configurado, con BFS,
deduplicación y alcance independientes: menús o enlaces visibles pueden variar.
Los límites de peticiones, bytes y red siguen aplicándose a cada página auditada.
La cobertura es incompleta si cualquier perfil falla, se cancela o se trunca.

### Identidad y comparación

Una página histórica se identifica por URL solicitada y nombre de perfil. Las
dimensiones forman parte de las condiciones de comparación: cambiar el ancho o
alto del mismo perfil produce `viewport-changed`, sin atribuir correcciones. Un
perfil añadido, eliminado o renombrado cambia el alcance de sus páginas; los
perfiles que siguen siendo equivalentes se pueden comparar por separado.

Los registros antiguos sin perfil siguen siendo legibles, pero no se equiparan
automáticamente a un perfil con dimensiones explícitas, aunque coincidan con un
valor predeterminado de Playwright. No se inventan dimensiones históricas.
Los lectores rechazan duplicados, perfiles no configurados o discrepancias entre
el perfil de la página y su informe. Los archivos nuevos guardan el perfil en
JSON/historial, conservando los esquemas de auditoría e historial vigentes.

Los informes de texto, HTML, CSV y el visor muestran nombres y dimensiones. El
CSV de proyectos con perfiles añade `viewport`, `viewport_width` y `viewport_height`
y una fila de estado por combinación, incluso cuando no se detectan incidencias.
El CSV del modo anterior mantiene sus columnas. Los CSV históricos incorporan las
columnas de perfil, vacías para registros antiguos. Las métricas cuentan
instancias de página/elemento por perfil, no URLs o elementos únicos de todo el sitio.
El texto del detalle puede buscar el nombre del perfil junto a URL/regla/selector.

### Alcance de la validación

Los perfiles cambian el viewport CSS de Chromium. Los nombres `mobile/tablet`
son etiquetas del operador: no emulan iOS/Android, agente de usuario, tacto,
densidad, zoom, orientación de dispositivo o lectores de pantalla móviles.
Tampoco prueban automáticamente cada punto de ruptura o toda condición de reflujo.

La prueba real controlada usa una regla CSS que muestra un botón sin nombre solo
en tamaño móvil: axe lo detecta en 375×812 y no en 1280×800. También se comprueban
las dimensiones reales de Playwright, las rutas de red restringidas, la CLI,
historial, comparación, exportaciones y accesibilidad del visor de perfiles.
Las sesiones autenticadas, recorridos/estados de interacción, zoom/reflujo y
pruebas manuales en dispositivos reales siguen pendientes.

## English

Projects accept an optional `viewports` array of 1–4 `{name,width,height}` profiles.
Names are unique, 1–32 lowercase letters/digits/hyphens starting with a letter.
Distinct dimensions must be integer CSS pixels: width 240–3840, height 240–2160.
Unknown fields/coercions are rejected. Omitting the field preserves legacy mode.

Each URL/profile has independent browser/context evidence. Viewports are applied
before navigation and recorded in results. Global concurrency remains 1–4 rather
than multiplying per profile; queued/cancelled combinations remain explicit.
Total budget is 100 page/profile combinations: URL count × profiles for batches,
or maxPages × profiles for crawling. maxPages applies per profile; crawl deadline
is shared across profiles. Crawls run in configured profile order with independent
BFS/deduplication and scope, since discovered links may differ by layout. Existing
request/byte/network limits still apply per page. Any failed/cancelled/truncated
profile makes coverage incomplete.

Finding identity uses requested URL plus profile name. Changed dimensions make
that profile incomparable (`viewport-changed`), never resolved. Added/removed/
renamed profiles change scope; unchanged profiles remain separately comparable.
Legacy records are readable but are never silently equated with explicit viewport
dimensions. Duplicate/unknown profiles or page/report mismatches fail validation.

Text/HTML/CSV/history/viewer identify profiles. Profile project CSV adds viewport
name/width/height columns and status rows even for clean views; legacy project CSV
is unchanged. Historical CSV adds the same columns, empty for older records.
Metrics count page/element instances per profile, not unique website URLs/elements.
Selected-run text search also matches profile names.

This changes Chromium CSS viewport size only. Labels such as mobile/tablet do not
emulate operating systems, user agents, touch, density, zoom, physical orientation
or mobile screen readers. It does not test every breakpoint or full reflow.
Real controlled tests verify actual viewport dimensions, a mobile-only unnamed
button detected by axe at 375×812 but hidden at 1280×800, restricted networking,
CLI, history/compare/export and accessible profile views. Authenticated sessions,
interaction journeys, zoom/reflow and real-device manual testing remain pending.
