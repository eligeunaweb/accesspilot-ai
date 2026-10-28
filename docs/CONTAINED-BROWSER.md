# Chromium contenido / Contained Chromium

## Español

Backend **experimental y opcional** seleccionado con `--isolation-image sha256:...` en auditorías de proyecto. La CLI normal conserva su transporte previo y el visor sigue siendo de consulta. No habilita trabajos web ni acredita preparación para producción o una revisión independiente de seguridad.

### Preparación

Necesita Docker en modo Linux, cgroup v2 y soporte para el perfil solicitado. El daemon es un componente de confianza con permisos amplios sobre el equipo. Construye solo este Dockerfile revisado y usa su ID local inmutable; no uses imágenes arbitrarias recibidas de terceros. El worker no instala ni descarga imágenes durante una auditoría.

Desde la raíz del repositorio, PowerShell:

```powershell
docker build --file worker/Dockerfile --tag accesspilot-worker:local .
$workerImageId = docker image inspect accesspilot-worker:local --format '{{.Id}}'
node scripts/contained-acceptance.js --image $workerImageId --output contained-desktop.json
node src/cli.js --project project.json --isolation-image $workerImageId --history history --format json --output audit.json
```

La aceptación usa exclusivamente fixtures sintéticos locales. El JSON de aceptación no se sobrescribe. En Linux con AppArmor, un administrador debe revisar y cargar el perfil **específico** antes de ejecutar: `sudo apparmor_parser -r worker/apparmor.profile`. No se desactiva AppArmor globalmente. En Docker Desktop sin AppArmor no se solicita ese perfil; seccomp, UID, límites y sandbox siguen siendo obligatorios. Si el entorno no soporta lo exigido, falla sin reintentar con root, SYS_ADMIN, seccomp desactivado o --no-sandbox.

La imagen base de desarrollo es Playwright 1.64.1 noble y debe coincidir con el lockfile. La construcción requiere acceso a Microsoft Container Registry y npm. La base está versionada por etiqueta, no es aún una política completa de digest/SBOM/build reproducible. El archivo `.dockerignore` permite solo package/lockfile, src y los dos scripts del worker y sus avisos de licencia: no entran Git, sesiones, informes, pruebas ni secretos del operador. Hay avisos de terceros en worker/THIRD-PARTY.md; la redistribución final del navegador/SO requiere revisión de licencias y avisos.

### Contrato de ejecución

- Contenedor nuevo por página: usuario 65534, network=none, raíz de solo lectura, capacidades eliminadas, no-new-privileges, seccomp versionado (incluye chroot para el namespace del sandbox, sin añadir capacidades del contenedor), init, cgroup privado, IPC privado y shm 256 MiB. Límites: RAM 1 GiB sin swap, 1 CPU, 256 PIDs y tmpfs noexec/nosuid/nodev de 512 MiB. Sin montajes del host, socket Docker ni puertos publicados.
- El anfitrión inspecciona configuración antes del arranque y verifica salida/OOM al finalizar. El guard del worker comprueba interfaces/kernel, denegación TCP/UDP, raíz, tmpfs y chroot denegado al proceso principal. Chromium exige sandbox de namespaces y seccomp-BPF, consultados en chrome://sandbox, y una petición directa de prueba a metadatos debe fallar por error de red.
- La interceptación CDP Fetch media también cada salto de redirección; la caché del navegador se desactiva. Los cuerpos comprimidos se decodifican dentro del worker con un máximo agregado de 16 MiB (o el presupuesto configurado menor) y se eliminan las cabeceras de codificación al cumplir la respuesta. gzip/deflate/br y, si el runtime lo soporta, zstd; codificaciones desconocidas o expansiones excesivas fallan.
- HTTP(S) se realiza en el anfitrión a través del mediador con límites, DNS y TLS; no hay CONNECT ni acceso TCP arbitrario desde el worker. Solo GET/HEAD; descargas, workers dedicados, WebSocket, métodos de escritura y navegación fuera de alcance fallan. Ver [MEDIATED-TRANSPORT.md](MEDIATED-TRANSPORT.md).
- Protocolo NDJSON limitado por stdio: ready/start/sandbox/request/response/result; IDs secuenciales y límites de mensajes/concurrencia. Opciones y sesión se validan antes de crear el contenedor y también en el worker. Sesiones/respuestas viajan por stdin, nunca por argumentos ni archivos montados. El driver Docker de logs es none; se vacían NODE_OPTIONS/NODE_PATH y las variables de proxy que Docker pudiera inyectar desde la configuración del operador. stderr se descarta con límite de tamaño; diagnósticos públicos genéricos. Solo antes de admitir tráfico de la auditoría, los fallos de lanzamiento/prueba del sandbox pueden conservar un diagnóstico de arranque acotado (sin páginas ni sesiones cargadas); los errores de páginas no se reflejan.
- Plazo de supervisión: timeout de página más 30 s para arranque; cada comando administrativo Docker tiene 30 s adicionales como máximo y limpieza separada. Cancelación o error cierra mediador y fuerza eliminación del contenedor tras verificar etiqueta aleatoria e ID. La interrupción abrupta del anfitrión/daemon todavía requiere recuperación administrativa; no es un servicio persistente con recolección automática de huérfanos.
- Evidencia de red con policyVersion=3 y backend/perfil/ID de imagen/sandbox conservados en históricos. Imagen/perfil cambiado impide considerar resueltas incidencias por comparación. Se mantienen las representaciones canónicas previas sin añadir campos nulos a registros antiguos. El anfitrión normaliza el informe recibido con el validador de históricos; no conserva HTML de nodos ni URLs de ayuda arbitrarias del worker. El JSON sí conserva selectores y URLs, que pueden ser sensibles.

Límites actuales: transferencia máxima del worker 16 MiB por página; configura maxBytesPerPage dentro de ese límite. Los iframes del mismo origen se admiten; los de origen distinto no están soportados y deben producir fallo, incluso si el origen está en el alcance. No se promete equivalencia completa de caché, streaming/SSE, CORS, orígenes complejos, service workers o sitios interactivos de escritura. El backend permite sesiones/recorridos/perfiles bajo las restricciones existentes, pero cada combinación necesita aceptación real específica. Los límites son por página; las cuatro ejecuciones concurrentes de un proyecto no equivalen a presupuestos globales de un servicio.

### Verificación

Las pruebas con Docker simulado verifican argumentos, inspección, protocolo y limpieza, **no aislamiento real**. La suite de host prueba mediación y axe con Chromium. El trabajo CI `contained-browser` construye la imagen y ejecuta `scripts/contained-acceptance.js`: axe real, redirección/gzip, sesión+viewport+recorrido+histórico y crawling, rechazo de origen/POST/WebSocket/metadatos, HTTPS/certificado no confiable, cancelación pendiente, CLI y limpieza. Solo un resultado satisfactorio del trabajo e imagen exactos constituye esa aceptación. El requisito Node anterior y la aceptación de Docker Desktop aportada anteriormente no sustituyen una prueba del nuevo navegador.

Pendiente: validar Chromium contenido en Docker Desktop y otras configuraciones del kernel, pruebas de evasión y recuperación más amplias, recursos/rendimiento reales bajo carga y revisión independiente. La documentación oficial de Playwright describe su imagen como destinada a pruebas/desarrollo; este contenedor experimental no elimina esa limitación por declaración. No usar como servicio público para webs no confiables ni habilitar la API de trabajos antes de completar las puertas de seguridad.

## English

This is an experimental opt-in project backend (`--isolation-image sha256:...`), not a production service or independent security review. Build the reviewed worker image, resolve its immutable local ID, run the controlled acceptance script, then use the project CLI. Runtime never pulls an image. Linux AppArmor hosts require the reviewed, specifically named profile; no global restriction is disabled. Docker Desktop browser acceptance must be run separately by an operator where Codex cannot access the engine pipe.

Every page runs in a fresh network-disabled, non-root, read-only container with mandatory Chromium namespace/seccomp sandbox, no capabilities/new privileges, private IPC/shm and cgroup v2 limits. No host mounts, Docker socket or published ports are supplied. Host inspection, guest kernel/direct-network probes and browser sandbox/direct-network assertions are required. There is no root/SYS_ADMIN/no-sandbox/unconfined fallback.

CDP Fetch mediates redirect hops and disables browser caching. Compressed bodies are decoded inside the worker with a strict aggregate output cap before CDP fulfillment; unknown encodings and excessive expansion fail. Same-origin frames are supported; cross-origin frames are unsupported and fail closed.

The host performs bounded GET/HEAD HTTP(S) through the mediator after DNS/IP/TLS validation. Request/response messages and secrets use bounded strict stdio framing, never arguments or mounted files. Docker logging is disabled; stderr is size-limited and discarded. Before audit traffic is admitted, bounded browser launch/built-in-sandbox diagnostics may be retained; page diagnostics are not echoed. Cancellation/errors abort mediation and remove only ownership-verified containers; abrupt host/daemon death still needs orphan recovery. Each administrative command and cleanup have separate bounded deadlines. Per-page limits are not a global service budget.

Policy version 3 and immutable image/profile/sandbox provenance survive history normalization; changed isolation provenance makes comparisons incompatible. Existing canonical records stay unchanged. Host normalization excludes node HTML/arbitrary worker help URLs; saved URLs/selectors may remain sensitive. Maximum response budget is 16 MiB/page. Streaming/SSE, WebSockets, downloads, write methods, service workers and general cache/CORS equivalence are outside current acceptance.

Mock tests are not Docker evidence. The `contained-browser` CI job builds the image and runs real axe, redirect/gzip, saved-session/viewport/journey/history and crawling, blocked-origin/POST/WebSocket/metadata, HTTPS/untrusted certificate, pending cancellation, CLI and owned-cleanup fixtures. Only the exact successful image/run validates those fixtures, not every kernel or Docker Desktop. Further adversarial recovery/resource/load checks and independent review precede any web job API. Version tags are not a completed digest/SBOM/reproducible-release policy; preserve upstream browser/OS/package notices before redistribution.

References: [Playwright Docker requirements and limitations](https://playwright.dev/docs/docker), [Docker resource controls](https://docs.docker.com/engine/containers/resource_constraints/), [Docker security options](https://docs.docker.com/reference/cli/docker/container/run/).


### Controlled TLS and recovery / TLS controlado y recuperación

The acceptance harness may inject the repository's public synthetic CA into the trusted host mediator factory for its local TLS fixture. Certificate and original-hostname verification remain enabled. A separate default-trust attempt must fail. This is test dependency injection in trusted Node code, not a job/config/CLI option, and it never changes system trust stores or worker trust settings.

For an unverified cleanup or abrupt host/daemon death, inspect without deleting other resources: `docker ps -a --filter label=org.accesspilot.worker --format "{{.ID}} {{.Names}} {{.Status}}"`. Verify ownership before any manual removal. The normal supervisor removes only its own random-label/ID container. Global orphan recovery remains a service gate.

Español: la CA pública de fixture se inyecta únicamente desde el harness Node confiable, manteniendo verificación de certificado/hostname. No hay una opción de proyecto/CLI para desactivar TLS ni se modifica el almacén de confianza del sistema. Si una limpieza no puede verificarse, usa el inventario de lectura anterior y comprueba propiedad antes de eliminar nada; la recuperación global de huérfanos sigue pendiente.
