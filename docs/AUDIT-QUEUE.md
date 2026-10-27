# Cola de auditorías / Audit queue

## Español

Las auditorías CLI con `--isolation-image` usan un supervisor FIFO: por defecto dos trabajos activos, una reserva total de 2048 MiB y dos CPU para contenedores, y hasta 100 admisiones en espera. Cada trabajo Docker conserva sus límites de 1024 MiB, una CPU y 256 PID. El supervisor mantiene el puesto hasta que la promesa del adaptador termina, incluida su limpieza. Son reservas para contenedores: no miden ni limitan la memoria del proceso Node, Docker Desktop o del sistema completo.

Para registrar el ciclo de vida, añade `--job-store .accesspilot-jobs` a una auditoría de proyecto con imagen. Sin esa opción la cola reside en memoria. La CLI conserva informes, orden y códigos de salida; los fallos del supervisor producen fallos explícitos, nunca resultados limpios. SIGINT y SIGTERM solicitan cancelación y esperan la limpieza del adaptador.

`createAuditQueue` permite compartir una instancia entre varios proyectos. Opciones internas de confianza: `maxWorkers` 1–4, `memoryMiB` 1024–4096, `cpu` 1–4, `maxQueued` 1–100. La capacidad efectiva es el mínimo entre trabajadores, CPU y memoria dividida por 1024. El límite es global a esa instancia, no entre procesos o directorios independientes. No hay API HTTP de ejecución todavía.

El registro versionado contiene exclusivamente UUID y estado: queued, running, succeeded, failed, cancelled o interrupted. No guarda URLs, configuración, sesiones, resultados ni errores de páginas. Hasta 1000 entradas; las terminales más antiguas se retiran al admitir nuevas. Es un registro operativo, no el historial de evidencias. Escritura temporal exclusiva, sync de archivo y rename; no se garantiza durabilidad ante pérdida eléctrica ni fsync portable del directorio. Los permisos POSIX no sustituyen ACL de Windows; el operador debe proteger la carpeta.

Una sola instancia posee `.queue-lock`. Una segunda instancia falla. El bloqueo abandonado **no se roba automáticamente**: primero detén al propietario anterior y comprueba sus contenedores; después retira únicamente el directorio vacío `.queue-lock` del almacén elegido. No borres el registro. Al reabrir, queued/running pasan a interrupted; nunca se reejecutan. Una caída abrupta puede dejar contenedores: este registro no autoriza eliminarlos y todavía no contiene una asociación verificable de propiedad para recuperarlos automáticamente. No borrar por imagen o prefijo.

Un fallo del registro detiene admisiones y solicita cancelación de los trabajos activos. El cierre espera al adaptador: tareas arbitrarias que ignoren AbortSignal no tienen garantía de terminación. El adaptador Docker existente dispone de sus propios tiempos máximos y limpieza. El apagado forzoso del sistema sigue siendo una recuperación manual.

## English

Contained project CLI audits now use a shared FIFO supervisor: two active container reservations by default, 2048 MiB / two CPU total, up to 100 waiting admissions. Existing per-container limits remain enforced by Docker. Capacity is held until adapter cleanup settles. This is not a machine-wide or host-process resource limit.

Add `--job-store .accesspilot-jobs` for a private lifecycle journal; otherwise scheduling is in memory. The trusted application API `createAuditQueue` can be shared by several projects. Separate instances/processes do not share global reservations. No audit-execution HTTP API is exposed.

The bounded journal stores only opaque UUIDs and lifecycle states, never credentials, URLs, payloads, results or page errors. Exclusive directory ownership fails closed. After confirming the old process and its containers have stopped, an operator may remove an abandoned empty `.queue-lock`. Reopening marks unfinished jobs interrupted without replay. Automatic orphan-container recovery, independent security review, cross-process reservations and host resource measurements remain pending. File sync plus atomic rename does not guarantee recovery after power loss. Protect the directory with OS permissions.

Cancellation and shutdown preserve slots until cleanup finishes. Tasks must honor AbortSignal; the Docker adapter has its own bounded operations. The journal is operational metadata, separate from audit evidence/history.
