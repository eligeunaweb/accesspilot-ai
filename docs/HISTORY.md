# Local project history / Historial local por proyecto

```powershell
node src/cli.js --project examples/project.json --history .accesspilot-history --baseline latest --format html --output report.html
node src/cli.js --project examples/project.json --history .accesspilot-history --list-history
# Preview / Simular: keep the newest 30 / conservar las 30 últimas
node src/cli.js --project examples/project.json --history .accesspilot-history --prune-history --keep-runs 30
# Apply the same policy / Aplicar la misma política
node src/cli.js --project examples/project.json --history .accesspilot-history --prune-history --keep-runs 30 --apply-retention
```

## Español

El historial es opcional. Sin `--history` no se guarda ningún registro adicional.
La primera ejecución con `--baseline latest` no tiene comparación; las siguientes
comparan con el último registro guardado, incluso si contiene páginas fallidas.
Un registro corrupto produce un error antes de lanzar el navegador; no se oculta
comparando con un registro anterior. `--list-history` devuelve identificadores JSON
sin lanzar el navegador. Los informes completos siguen disponibles con `--output`.

La identidad del proyecto es el hash SHA-256 de su nombre validado (sensible a
mayúsculas). Use nombres distintos para proyectos distintos; cambiar el nombre
inicia otro historial. Los cambios de URLs permanecen en el mismo historial y el
comparador marca las páginas o políticas incompatibles. Los nombres no se usan
como rutas. Cada registro tiene fecha UTC y UUID; empates de milisegundos se ordenan
por UUID, no por orden de finalización. El reloj local debe ser correcto.

Los registros nuevos usan `historyVersion: 2` y conservan también gravedad, WCAG,
recomendaciones y evidencia pendiente de revisión, cuando existe. El esquema de
auditoría sigue en versión 1. Los registros antiguos se leen sin inventar datos.
Se omiten HTML de nodos y mensajes diagnósticos/error. Véase [RICH-HISTORY.md](RICH-HISTORY.md).
**URLs (incluidas consultas y fragmentos), nombres y selectores pueden contener
datos sensibles.** Esta minimización no garantiza anonimización. Elija un
directorio privado y no guarde tokens en URLs ni identificadores del DOM.
No hay cifrado ni sincronización. El directorio es de confianza del usuario;
no protege frente a otro proceso local que pueda modificar sus archivos.
Los permisos POSIX solicitados son 0700/0600; en Windows rigen las ACL heredadas.

Cada archivo se escribe y sincroniza en un temporal exclusivo dentro de la misma
carpeta y después se renombra. El lector ignora temporales y enlaces simbólicos
de registros. No hay índice compartido que pueda perder actualizaciones entre
procesos. Se rechazan instantáneas mayores de 20 MiB y versiones desconocidas.
No se promete durabilidad ante fallos eléctricos o en sistemas de archivos de red.
Si falla el guardado, la CLI devuelve 2; no declara un historial guardado.

La retención por número de ejecuciones es explícita: `--prune-history --keep-runs N`
devuelve un plan JSON sin borrar. Añada `--apply-retention` para aplicarlo. N debe
estar entre 1 y 10000; nunca se solicita conservar cero registros. Se conservan los
N registros más recientes según sus nombres UTC/UUID, incluidos fallidos y
cancelados; no se seleccionan solo resultados favorables. No se lanza el navegador.
La limpieza no puede combinarse con opciones de auditoría/informes.

Antes de borrar se validan todos los registros reconocidos y su pertenencia al
proyecto; cualquier corrupción detiene la operación sin borrados. Archivos ajenos,
temporales, carpetas y enlaces simbólicos quedan fuera del plan. Un fallo de E/S
durante el borrado puede dejar una aplicación parcial; la CLI devuelve 2 y una
nueva simulación muestra el estado restante. No hay papelera ni recuperación.
La simulación no reserva el plan: al aplicar se calcula de nuevo bajo bloqueo.

Lecturas, guardados y retención usan un bloqueo por proyecto entre procesos de la
versión actual. Se espera hasta 5 segundos si está ocupado y después se devuelve
un error. Una interrupción abrupta puede dejar `.history-lock`: detenga todos los
procesos que usan ese historial antes de quitar únicamente esa carpeta vacía.
No se rompen bloqueos automáticamente. Los clientes de versiones antiguas no
participan en este protocolo: no los ejecute contra el mismo historial a la vez.
Los temporales abandonados se pueden borrar con la aplicación detenida.
La retención no se ejecuta al guardar; programación automática, retención por edad
o espacio y migraciones de futuros esquemas siguen pendientes. La importación y
conversión aditiva ya están disponibles con `--import-history`.
El visor web local de solo lectura está documentado en HISTORY-VIEWER.md.

## English

History is opt-in through `--history`. `--baseline latest` compares against the
latest saved run for the validated, case-sensitive project name. The first run
has no comparison. Failed/cancelled targets remain in history; a corrupt latest
record stops execution rather than silently falling back. `--list-history` emits
JSON IDs without launching a browser. Use distinct names for distinct projects;
renaming starts a different history. Scope and policy changes are evaluated by
the existing coverage-aware comparator. Complete reports remain available via
`--output`.

New records carry `historyVersion: 2` with severity, WCAG, guidance and incomplete
review evidence; legacy records remain readable with unknown fields. Node HTML,
diagnostic/error messages and arbitrary report fields are excluded. See RICH-HISTORY.md.
**URLs including queries/fragments, project names and
selectors can still contain sensitive information.** This is data minimization,
not anonymization. Choose a private, trusted local directory. There is no
encryption or synchronization. Windows uses inherited ACLs; POSIX creation modes
are 0700/0600. Other local processes with write access are outside this boundary.

Exclusive temporary files are flushed and renamed on the same filesystem. Readers
ignore incomplete temporary files and record symlinks. Concurrent saves use UUIDs
without a shared index; timestamp ties use UUID ordering. An accurate local clock
is required. Reads/writes are bounded to 20 MiB. Unknown schema versions fail
closed. Power-loss durability and network filesystem semantics are not guaranteed.
Storage failures return exit code 2.

Count-based retention is explicit: `--prune-history --keep-runs N` returns a JSON
preview; add `--apply-retention` to delete. N is an integer from 1 through 10000.
The newest N UTC/UUID filenames are kept, including failed and cancelled runs.
Maintenance does not launch a browser or accept audit/report options. Before any
deletion, every recognized record is validated, including its project identity.
Corruption fails closed. Unrelated files, temporary files, directories and symlinks
are excluded. Deletion has no trash/undo. An I/O failure midway may leave partial
progress and returns exit 2; preview again to inspect the remaining state.
Applying recomputes the policy under lock; a previous preview is not reserved.

Current-version readers, writers and pruning serialize through a project lock,
waiting up to five seconds before returning a busy error. Abrupt termination can
leave `.history-lock`. Stop all processes accessing that history before removing
only that empty directory. Locks are never broken automatically; old clients do
not honor this protocol and must not share the store concurrently. Remove abandoned
temporary files only while the app is stopped.

Retention does not run automatically on save. Scheduled/age/size-based retention,
future-schema migration remain roadmap work. Additive import/conversion is available
through `--import-history`. The read-only local web
viewer is documented in HISTORY-VIEWER.md.
