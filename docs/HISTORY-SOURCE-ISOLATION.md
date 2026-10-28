# Historial: lectura y validación separadas / Separated history reading and validation

## Contrato del visor

El visor captura fuentes binarias acotadas bajo el bloqueo existente de retención. Solo admite uno o dos IDs presentes en el listado de archivos regulares del proyecto permitido; no acepta rutas del cliente. Cada descriptor abierto comprueba archivo regular y lee como máximo 20 MiB + un byte de detección. Siempre cierra el descriptor y libera el bloqueo antes de iniciar validación en otro proceso. No se envían rutas ni permisos de lectura de historial al trabajador.

La fuente **todavía no está validada**. Las nuevas funciones readHistorySource/historySourceWindow son transporte interno, no evidencia canónica ni descargas HTTP. Base64 evita la expansión de escapes de JSON de las fuentes; dos archivos de 20 MiB o la ventana de 40 MiB caben en el sobre IPC de 64 MiB junto con metadatos acotados. Base64 no cifra ni anonimiza los datos.

El proceso desechable decodifica, analiza JSON y aplica el mismo validateSnapshot y comprobación de projectKey que el lector canónico. Solo después construye detalles, comparaciones o exportaciones. Los originales corruptos, esquemas desconocidos y registros de otro proyecto no salen como descargas: producen el error 503 genérico. Las tendencias conservan esas entradas como huecos invalid, nunca como mejoras o conformidad. Sigue admitiéndose BOM igual que en loadSnapshot.

La ventana de tendencias conserva diez registros y un máximo de 40 MiB de fuentes. Comprueba tamaño estimado antes de leer y bytes realmente capturados después; así un crecimiento del archivo no salta el presupuesto agregado. Los errores de lectura se conservan como huecos invalid y los excesos agregados como budget.

El lector CLI/canónico loadSnapshot conserva su comportamiento; comparte readSnapshotBytes/parseSnapshotBytes pero continúa validando antes de devolver evidencia. No se cambian formatos ni archivos guardados.

## Aislamiento y límites

Se mantienen los procesos desechables, dos por visor, plazo de 10 segundos y SIGKILL con cupo retenido hasta close. Un hijo terminado durante JSON.parse o validación no conserva el bloqueo de historial: nunca lo adquirió. La cancelación durante lectura nativa no aborta esa lectura; el padre mantiene el cupo de petición hasta terminar y no lanza un hijo si el cliente ya desconectó.

El padre sigue realizando I/O, listado/ordenación, codificación base64, JSON.stringify del sobre, recepción IPC y shell/listas HTML. Estas operaciones y las copias de buffers consumen memoria/CPU. La lectura acotada no es un límite duro de RSS y los límites V8 no incluyen todos los buffers externos. No hay sandbox OS para el hijo ni garantía OS de limpieza tras muerte abrupta del padre. Los directorios y configuración elegidos por el operador siguen siendo de confianza. No se declara resistencia frente a modificaciones simultáneas de un administrador local o permisos del daemon.

Esta fase mueve el análisis y validación del contenido del historial del visor; no cierra toda la puerta P1 de recursos del anfitrión, ni habilita una API de auditoría o sustituye revisión independiente. La selección y listado de proyectos mantiene su flujo anterior.

## Verificación

Las pruebas verifican liberación del bloqueo antes de validar, equivalencia de exportaciones en ambos idiomas y tres formatos, captura inmutable aunque cambie después el archivo, rechazo de JSON corrupto/esquema desconocido/proyecto ajeno sin filtrar contenido, traversal/IDs ausentes/tamaño excesivo y compatibilidad de BOM/huecos de tendencias. La batería previa comprueba plazos y aborto de procesos reales y el visor con HTTP real, teclado y axe. Consultar VALIDATION.md y evidencia de entrega para resultados y entornos efectivamente ejecutados.

## English

The viewer captures bounded record bytes under the existing retention lock, then releases it before child JSON parsing, schema/project validation and rendering. Child processes receive base64 source plus trusted project identity, never client-selected filesystem paths. Raw source helpers are private transport, not validated canonical evidence or HTTP downloads. Canonical CLI readers keep their validation contract and saved formats remain unchanged.

Each source is at most 20 MiB; the ten-record trend window caps actual captured bytes at 40 MiB. Malformed/unsupported/foreign records fail closed for downloads and remain explicit invalid trend gaps. BOM compatibility is preserved. Base64 is transport encoding, not encryption or anonymization.

Parent I/O, enumeration/sorting, source encoding, envelope serialization and output reception still consume resources. Native reads are not preempted on client disconnect. This is not total host RSS/CPU enforcement, an OS sandbox, guaranteed cleanup after abrupt parent death or independent review. No audit execution API is enabled. Check per-head evidence for native acceptance.
