# Resúmenes para compartir / Sharing summaries

## Español

Los informes normales contienen evidencia útil y potencialmente sensible: URLs, selectores, perfiles y notas. El nuevo resumen de datos reducidos genera un artefacto separado mediante una lista positiva de campos. No edita el informe fuente, el historial, sus huellas ni las comparaciones.

```sh
node src/cli.js --share-report audit.json --format html --lang es --output shared.html
node src/cli.js --share-report audit.json --format json --output shared.json
node src/cli.js --share-report audit.json --format csv --output shared.csv
```

Es una operación offline sobre un informe de proyecto guardado o un registro del historial; no abre navegadores, no se conecta al sitio ni requiere Docker. También admite texto. `--output` debe ser un archivo nuevo: no sobrescribe la entrada ni una salida existente. Sin `--output` imprime en stdout. No se combina con auditoría, sesión, mantenimiento ni historial. En el visor local, abre un registro y usa los enlaces **Resumen para compartir JSON / HTML / CSV**; las descargas originales siguen disponibles y conservan su evidencia completa. Los filtros visuales no restringen estas descargas: el resumen abarca el registro completo.

Conserva estados de páginas, recuentos, gravedad, criterios WCAG y dimensiones numéricas de viewport. Cada destino tiene un alias target-N; las URLs repetidas comparten un alias page-N. Estos alias valen solo dentro de cada resumen y no permiten comparar auditorías automáticamente. No se incluyen URLs/orígenes/rutas/parámetros/fragmentos, nombres de proyecto, selectores, HTML, texto de página, mensajes de error, metadatos del motor/imagen, marcas temporales, perfiles de autenticación, nombres/definiciones de recorridos ni declaraciones manuales. Las reglas con guía curada incluida en AccessPilot conservan su ID; los IDs restantes se sustituyen por rule-N. La orientación se regenera desde el catálogo ES/EN incluido; no se copia orientación arbitraria del archivo importado.

Los estados desconocidos se mantienen como null/desconocido, y las páginas fallidas no cuentan como cobertura completa. El formato tiene `kind: shared-audit-summary` y `privacyProfile: reduced-data-v1`; no puede importarse como historial original ni usarse como evidencia de comparación. Mantén el informe privado para investigar y corregir los problemas concretos. Se omiten por completo las declaraciones manuales y las comparaciones, no se convierten en aprobaciones ni mejoras.

**No es una garantía de anonimato.** Recuentos, criterios, dimensiones y su combinación pueden seguir siendo confidenciales o identificar un caso. Revisa cada artefacto antes de compartirlo. El historial privado y las descargas originales no se redactan automáticamente. El resumen no certifica conformidad WCAG. El HTML no usa scripts ni recursos externos; entrada CLI limitada a 20 MiB, proyección limitada a 10000 filas de hallazgos y salida a 20 MiB.

## English

Use `--share-report SAVED_PROJECT_AUDIT --format html|json|csv|text [--lang en|es] [--output NEW_FILE]` for an offline reduced-data artifact. Existing output files are never overwritten. No browser, Docker or target network connection is needed. The protected local viewer also offers shared JSON/HTML/CSV downloads for a selected history record, covering the whole record independently of visible filters. Original evidence downloads remain available.

The positive field projection retains status, counts, severity, WCAG criteria and numeric viewport dimensions. URLs become report-local page aliases; each target has its own numbered ID. Shipped curated rule IDs/guidance may be retained; other rule IDs become report-local aliases and guidance comes only from the shipped bilingual catalog. Source URLs, free text, selectors, HTML, diagnostics, project/profile/journey names and definitions, engine/image metadata, timestamps, comparisons and manual declarations are omitted. The source, canonical history and fingerprints remain unchanged.

Unknown data remains unknown and failed pages never imply full coverage. The distinct `shared-audit-summary` kind cannot be imported as original audit evidence. These summaries are not guaranteed anonymous: counts, criteria and combinations can still reveal sensitive information. Review before sharing and keep original private evidence for remediation. No WCAG conformance or cross-run alias stability is claimed. CLI input/output are bounded at 20 MiB and projection at 10000 finding rows; offline HTML is script-free with no external resources.
