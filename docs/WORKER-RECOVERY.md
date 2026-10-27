# Recuperación de trabajadores / Worker recovery

## Español

Las auditorías Docker con `--job-store` registran una intención de propiedad sincronizada **antes** de crear cada contenedor. El archivo `workers/UUID.json` contiene únicamente versión, UUID de trabajo, nombre aleatorio, etiqueta aleatoria de propietario, ID inmutable de imagen e identidad del motor Docker. No incluye URL, sesión ni contenido. El adaptador retira la intención después de confirmar la limpieza. Sin `--job-store`, las auditorías siguen funcionando pero no tienen recuperación persistente.

Si quedan intenciones, una auditoría nueva falla antes de abrir el navegador. No se repiten trabajos: los registros incompletos pasan a interrupted al reabrir el supervisor. Las intenciones son independientes del registro de 1000 estados, para que su retención no olvide contenedores. Hasta 1000 intenciones, 4096 bytes cada una; archivos extraños, corruptos, enlaces y cambios de motor bloquean la operación.

### Procedimiento

1. Detén la instancia anterior y comprueba que ha terminado. No retires un bloqueo de un proceso activo. Los bloqueos abandonados nunca se roban automáticamente. Si quedó `.queue-lock`, retira solo ese directorio vacío después de confirmar la parada. No borres `workers` ni `jobs.json`.
2. Desde la carpeta del repositorio, ejecuta la vista previa:
   `node scripts/recover-workers.js --job-store .accesspilot-jobs`
3. Revisa los UUID, nombres, IDs completos y estados del plan. Si corresponde, aplica:
   `node scripts/recover-workers.js --job-store .accesspilot-jobs --apply`
4. Conserva la salida y vuelve a ejecutar la auditoría deliberadamente. La recuperación no reanuda ni inventa resultados de auditoría.

La herramienta adquiere el mismo bloqueo exclusivo que la cola y no admite auditorías. La vista previa no modifica Docker ni las intenciones; abrir el supervisor sí registra como interrupted los trabajos incompletos. El modo apply valida primero el plan completo: motor Linux/ID de motor, nombre exacto, ID completo, etiqueta de propietario e imagen. Reinspecciona al aplicar y elimina solo por ID completo. No usa borrado por prefijo, imagen o etiqueta global. Una ausencia solo se acepta tras una consulta Docker satisfactoria; un error del daemon nunca equivale a ausencia. Confirma la retirada antes de retirar la intención.

Un cambio de identidad o un fallo durante apply conserva la evidencia y el bloqueo para investigación. Puede haber progreso parcial si el daemon falla después de retirar algún trabajador; no se declara éxito global ni se repiten auditorías. El operador puede repetir el procedimiento después de comprobar la parada y recuperar el acceso al mismo motor. La herramienta tiene 30 segundos por comando y 120 segundos globales; Ctrl+C solicita cancelación. Nunca cambia permisos del daemon ni expone TCP.

### Límites

El almacén es local y de confianza, protegido con permisos/ACL: no es una firma criptográfica ni una defensa contra administradores locales o un daemon comprometido. No importar intenciones de terceros. No se garantiza persistencia ante pérdida eléctrica: sync del archivo y rename no equivalen a fsync portable del directorio. Una intención parcial/corrupta exige investigación manual y bloquea el borrado automatizado. Los contenedores de versiones anteriores sin intención no se adoptan por nombre/imagen.

El proceso anterior debe estar detenido antes de retirar manualmente un bloqueo; no hay detección distribuida de propietarios ni reservas entre procesos. OOMKilled aparece en el plan de recuperación y un OOM del adaptador no produce auditoría correcta. La aceptación de OOM usa un proceso sintético con 128 MiB, no demuestra comportamiento de todas las páginas Chromium bajo presión. La UI sigue siendo de consulta; revisión independiente y pruebas de carga/privacidad siguen pendientes.

## English

Contained CLI audits with `--job-store` sync an immutable ownership intent before Docker create. Only opaque job/name/owner identifiers, immutable image and Docker engine identity are stored. Normal verified cleanup removes the intent. Unresolved intents block new audits; unfinished lifecycle records become interrupted and never replay automatically.

After confirming the old supervisor has stopped, remove only an abandoned empty `.queue-lock` if present. Preview with `node scripts/recover-workers.js --job-store DIRECTORY`; inspect the plan, then explicitly use `--apply`. Both modes acquire the same exclusive queue lock and cannot run audit tasks. Opening a recovery supervisor marks unfinished lifecycle states interrupted; preview does not mutate containers or intents.

All planned candidates must match engine, exact random name, full container ID, owner label and image. Apply rechecks and removes by immutable ID only, confirms absence, then releases the intent. Daemon failure is never treated as absence. Unrelated containers are not adopted or removed. Failed apply retains the lock and unresolved evidence; partial progress is possible. Commands have 30-second bounds and a 120-second aggregate recovery deadline, with cancellation.

This is trusted local state, not a cryptographic signature or defense against a local administrator/compromised daemon. Protect OS permissions; never import third-party ledgers. Corrupt/partial records fail closed, and power-loss durability is not guaranteed. Previous workers without intents require manual investigation. No automatic lock stealing, job replay, cross-process reservations or execution UI is enabled. Controlled real supervisor-kill and synthetic 128 MiB process OOM acceptance is separate from browser OOM, load and independent security review.
