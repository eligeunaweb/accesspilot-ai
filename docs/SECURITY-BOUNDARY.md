# Security boundary acceptance / Aceptación de la frontera de seguridad

## Español

Estado actualizado: el transporte v2 y la prueba Node descritos aquí siguen disponibles. Se añade un backend Chromium **experimental y opcional** de proyecto con network=none y mediación stdio; véase [CONTAINED-BROWSER.md](CONTAINED-BROWSER.md). La primera aceptación real Linux aprobó con el commit/imagen registrados en VALIDATION.md. Docker Desktop para Chromium, revisión independiente, supervisión global y API de trabajos continúan pendientes; el visor sigue siendo de consulta.

### Transporte restringido, versión de política 2

- El proxy aplica su propio presupuesto de peticiones autenticadas HTTP/CONNECT (200 por defecto, máximo 1000), además del contador de solicitudes del navegador. CONNECT cuenta conexiones de túnel; no inspecciona las solicitudes HTTP cifradas dentro de TLS.
- Agotar peticiones, transferencia o plazo absoluto bloquea definitivamente esa instancia. Se cierran sus sockets, se cancelan las esperas DNS de la aplicación y las peticiones posteriores no pueden abrir destinos nuevos.
- Cada resolución DNS tiene plazo y cancelación, valida hasta 64 respuestas y comprueba la familia real de todas las direcciones. Una respuesta privada o inválida invalida el conjunto. La conexión sigue dirigida a la IP numérica comprobada.
- Cancelar una espera no garantiza cancelar el trabajo getaddrinfo del sistema operativo. Sí evita que una respuesta tardía abra conexiones. Resolver, CPU y memoria del proceso anfitrión no quedan contenidos por estos cambios.
- Hay un plazo absoluto propio del proxy, además de los timeouts de inactividad y del presupuesto total de la página. El contenido recibido continuamente no puede mantener viva la instancia indefinidamente.
- Los límites se validan antes de crear sockets. Se conservan las comprobaciones de origen, DNS, cabeceras de salto, GET/HEAD, redirecciones y presupuesto de transferencia.

Los informes restringidos nuevos registran network.policyVersion 2. Comparar con política 1 devuelve incompatibilidad; no se infieren mejoras entre fronteras distintas. La versión 1 sigue siendo legible.

**Límite importante:** un túnel TLS autorizado no constituye inspección de su contenido. El bloqueo de POST/WebSockets dentro de HTTPS depende de las defensas del navegador controlado. El proxy por sí solo no contiene un navegador comprometido ni sustituye al firewall del sistema. Los límites de bytes no acotan la expansión de contenido comprimido ni el DOM. La CLI explícita heredada sigue siendo de operador de confianza, con su comportamiento de red documentado.

### Prueba de requisitos del sistema operativo

`scripts/isolation-probe.js` ejecuta un proceso Node de prueba en un motor Docker **Linux**. No procesa webs ni ejecuta Chromium. La imagen debe estar descargada y seleccionarse mediante su ID inmutable sha256. El script no descarga imágenes, no publica puertos y no monta repositorios, directorios de usuario ni el socket de Docker.

El proceso usa network=none, usuario 65534, raíz de solo lectura, capacidades eliminadas, no-new-privileges, seccomp activo, IPC separado, tmpfs noexec/nosuid/nodev de 16 MiB y límites de 128 MiB RAM sin swap, 0.5 CPU y 64 procesos. Se comprueban tanto la inspección del motor desde el anfitrión como los límites cgroup v2 y el estado del proceso dentro del contenedor.

La carga verifica: solo interfaz loopback; denegación inmediata de TCP hacia metadatos, IP privada, IP pública e IPv6; denegación UDP; loopback interno funcional; escritura de raíz rechazada; ausencia de Docker socket; ejecución desde tmpfs rechazada. Los intentos hacia direcciones externas solo se realizan después de verificar network=none desde el motor y ausencia de interfaces no locales dentro del proceso. La prueba no necesita que esos destinos respondan.

La salida es JSON de aceptación, no una declaración de seguridad completa. Incluye imagen, estado de ejecución y limpieza. Cada comando Docker tiene límite de 30 segundos y salida de 128 KiB. El contenedor tiene nombre/etiqueta aleatorios y solo se elimina después de verificar su propiedad e ID. Un fallo de ejecución o de limpieza impide aprobar. Si la limpieza falla, conserva el nombre del resultado para inspección por el operador; no elimines recursos ajenos.

Reproducir desde **PowerShell del usuario**, con Docker Desktop en modo Linux:

```powershell
docker pull node:22-alpine
$probeImageId = docker image inspect node:22-alpine --format '{{.Id}}'
node scripts/isolation-probe.js --image $probeImageId --output isolation-desktop.json
```

El archivo de resultado no se sobrescribe. Usa un nombre nuevo al repetir. El motor debe soportar cgroup v2, seccomp y los controles solicitados; si no, la prueba falla. No cambies globalmente el firewall ni expongas el daemon Docker por TCP para hacerla pasar.

La CI añade un trabajo Linux `isolation-prerequisite`. Descarga la imagen oficial node:22-alpine y fija el ID local antes de ejecutar. La etiqueta puede cambiar entre ejecuciones; el resultado conserva el ID exacto. Esto no sustituye una política de imagen/SBOM/digest de release revisada. El pull requiere acceso al registro y está sujeto a disponibilidad/límites externos. Docker es una herramienta opcional de aceptación; no se introduce como requisito de la CLI existente.

En el entorno Codex de esta sesión, el motor inicialmente no estaba arrancado. El operador lo arrancó; los comandos posteriores quedaron bloqueados por acceso al named pipe de Windows. La herramienta de permisos no puede representar ese canal. No se ejecutó aquí la prueba real de Docker Desktop y no se modificaron sus permisos/configuración. Las pruebas reales en CI, cuando se completen, solo acreditan el runner Linux de esa ejecución.

### Puertas pendientes antes de ejecutar auditorías desde la web

| Requisito | Situación |
|---|---|
| Proxy con presupuestos propios, DNS y cierre permanente | Implementado; pruebas locales de transporte |
| Perfil de proceso sin salida directa y con límites | Script de aceptación y trabajo CI; comprobar resultado por commit |
| Navegador real dentro del entorno aislado con salida solo por mediador | Backend experimental con aceptación Linux; verificar commit/imagen exactos en VALIDATION.md. Desktop y revisión más amplia pendientes |
| Bloqueo de acceso al host, LAN, metadatos, DNS/UDP y escapes desde Chromium | Pendiente con el backend real y varios entornos |
| Cola, límites globales de CPU/RAM/procesos y recuperación de trabajos | Pendiente para el servicio; concurrencia CLI y límites por página existentes no equivalen a esto |
| Revisión independiente de seguridad y tratamiento de sesiones/archivos | Pendiente |
| API loopback con permisos, CSRF, validación y cancelación | No habilitada; el visor sigue siendo de consulta |

## English

This phase hardens restricted transport and adds an OS prerequisite probe. It does not implement isolated browser jobs or enable the web audit API.

Network policy version 2 adds independent authenticated HTTP/CONNECT admission limits, a permanent exhaustion latch for request/byte/absolute-time budgets, bounded cancellable DNS waits, a 64-answer cap and actual-family validation. Late DNS results cannot create connections after cancellation. System getaddrinfo work itself may continue. CONNECT counts tunnels, not encrypted HTTP requests; browser routing still enforces HTTPS methods/WebSocket restrictions. This is not containment of a compromised browser or a DOM/decompression memory limit. Policy 1/2 baseline mismatches are incomparable.

The Docker Linux probe runs trusted Node test code with network=none, a non-root UID, no capabilities, no-new-privileges, active seccomp, read-only root, private IPC, a bounded noexec tmpfs and cgroup v2 CPU/memory/swap/PID limits. The host verifies Docker settings and exit/OOM state; the guest verifies kernel limits, only loopback interfaces, denied direct TCP/UDP, functional internal loopback, blocked root writes and tmpfs execution, and no Docker socket. No repository/user mounts or published ports are supplied. It is a prerequisite test, not the browser backend or an independent review.

Use the PowerShell commands above with a running Linux Docker engine. Images are pulled explicitly; the runner uses an immutable local sha256 ID and never auto-pulls. Output refuses overwrites. The CI job resolves the official node:22-alpine tag to its exact local image ID per run and uploads acceptance JSON. Tag changes and registry availability remain external inputs; this is not a finalized reproducible-release image policy. Docker is optional for the existing CLI.

Commands have bounded time/output. Owned containers are inspected before removal; execution/cleanup failures cannot pass. This session's Codex host cannot access the Windows Docker named pipe even after the operator started Docker, and its permission tool cannot grant that channel. No local Docker Desktop containment result is claimed; CI results apply to the tested Linux runner only.

Before web execution: integrate a real Chromium worker with OS-enforced egress through a mediator, validate host/LAN/metadata/DNS/UDP/escape denial and sessions/files, enforce global job resources/cancellation/recovery, obtain independent security review, then implement a protected loopback job API. The existing history viewer remains read-only.

References: [Node DNS](https://nodejs.org/api/dns.html), [Docker network modes](https://docs.docker.com/engine/network/drivers/), [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/), [Docker run security options](https://docs.docker.com/reference/cli/docker/container/run/), [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/), [IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/).

## Actualización: transporte mediado / Update: mediated transport

El operador ha aportado una aceptación satisfactoria del requisito Node en Docker Desktop, incluida la limpieza. Esto actualiza la falta de evidencia local descrita anteriormente; Codex sigue sin acceso al named pipe y no se ha probado Chromium dentro del contenedor. Se incorpora el componente HTTP(S)/NDJSON y una prueba de compatibilidad con Chromium en el host. El backend y la API de trabajos continúan pendientes. Véanse controles, límites y pruebas en [MEDIATED-TRANSPORT.md](MEDIATED-TRANSPORT.md).

The operator supplied a passing Docker Desktop Node prerequisite, including cleanup. This updates the earlier absence of local operator evidence; Codex still cannot access the named pipe and Chromium has not been tested inside that container. The new HTTP(S)/NDJSON component and host-browser compatibility fixture are described in [MEDIATED-TRANSPORT.md](MEDIATED-TRANSPORT.md). Browser containment and web jobs remain pending.


## Current experimental browser backend / Backend experimental actual

The historical prerequisite-only status above is superseded for the opt-in project backend: see [CONTAINED-BROWSER.md](CONTAINED-BROWSER.md). Default proxy audits remain policy 2. Docker audits use policy 3, mandatory namespace/PID/network/seccomp/TSYNC checks, zero container capabilities, network=none and bounded CDP/stdio HTTP mediation. The first successful Linux image/run is recorded in VALIDATION.md. This does not approve independent security, Docker Desktop Chromium, global job supervision or web execution. Retained old acceptance paragraphs describe their original Node/host-test scope.
