# Local project history / Historial local por proyecto

```powershell
node src/cli.js --project examples/project.json --history .accesspilot-history --baseline latest --format html --output report.html
node src/cli.js --project examples/project.json --history .accesspilot-history --list-history
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

Se conserva solo el esquema de comparación versión 1: configuración, URLs,
estados, motor, versión de política y reglas/selectores. Se omiten HTML, mensajes
de error, recomendaciones y resultados completos de comprobaciones manuales.
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

No se eliminan registros automáticamente: revise y borre los archivos de la
carpeta elegida según su política de retención. Los temporales abandonados se
pueden borrar con la aplicación detenida. La retención configurable, importación,
migraciones de futuros esquemas y visor web siguen pendientes.

## English

History is opt-in through `--history`. `--baseline latest` compares against the
latest saved run for the validated, case-sensitive project name. The first run
has no comparison. Failed/cancelled targets remain in history; a corrupt latest
record stops execution rather than silently falling back. `--list-history` emits
JSON IDs without launching a browser. Use distinct names for distinct projects;
renaming starts a different history. Scope and policy changes are evaluated by
the existing coverage-aware comparator. Complete reports remain available via
`--output`.

Only version-1 comparison evidence is stored, excluding HTML, error messages and
arbitrary report fields. **URLs including queries/fragments, project names and
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

There is no automatic deletion. Review and delete saved files under your own
retention policy; remove abandoned temporary files only while the app is stopped.
Configurable retention, import, future-schema migration and a web viewer remain
roadmap work.
