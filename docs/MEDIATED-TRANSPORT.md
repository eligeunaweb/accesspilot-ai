# Transporte HTTP mediado / Mediated HTTP transport

## Español

Estado actualizado: componente interno utilizado por el backend Docker experimental y opcional `--isolation-image`. La CLI predeterminada sigue utilizando el proxy autenticado y el visor sigue siendo de consulta. Véase [CONTAINED-BROWSER.md](CONTAINED-BROWSER.md) para la integración CDP, comandos, aceptación real por imagen/commit y límites. No hay API de trabajos ni dependencias nuevas. Las pruebas de compatibilidad del anfitrión descritas abajo por sí solas no acreditan aislamiento.

`src/request-mediator.js` prepara el transporte del futuro worker: el anfitrión recibe una descripción de petición HTTP, valida su alcance y realiza HTTP(S) con Node. No ofrece CONNECT ni un túnel TCP arbitrario al worker. Es distinto del proxy existente: incluso para HTTPS, el anfitrión conoce y comprueba el método HTTP. El diseño del worker deberá obligar mediante el sistema operativo a usar este canal; este módulo por sí solo no impide conexiones directas desde Chromium.

### Controles implementados

- Solo GET/HEAD, sin cuerpo de petición. Orígenes de navegación y recursos separados. Excepciones privadas exactas, explícitas y confiadas al operador.
- DNS resuelto y validado antes de conectar a una dirección numérica. Se rechaza todo el resultado si contiene una dirección privada no autorizada. La autoridad Host y la comprobación del certificado/SNI conservan el hostname original.
- Verificación TLS obligatoria; la CA inyectable es una opción interna de prueba, no una opción del usuario ni un campo del protocolo. No existe reintento con TLS desactivado.
- Lista permitida de cabeceras de petición: Accept, Accept-Language, User-Agent, Cookie, Authorization, Range, If-Range. Se eliminan Host suministrado, credenciales de proxy y cabeceras ajenas. Las cookies y Authorization autorizadas son secretos: el futuro supervisor no debe registrar el canal ni pasarlo por argumentos.
- Cabeceras de respuesta sin campos hop-by-hop, incluidos los nominados por Connection; Content-Length eliminado para que el consumidor calcule el tamaño. Se preservan las cookies múltiples y el cuerpo comprimido original.
- Valores predeterminados por instancia: 200 peticiones, 16 MiB agregados de cuerpos, 5 redirecciones, 4 conexiones activas, 64 solicitudes en espera, 10 segundos por fase DNS/respuesta y 30 segundos de vida total. Los límites configurables son estrictos; 100 cabeceras/16 KiB y URL de 8192 caracteres. La conexión/redirección denegada, agotamiento o respuesta incompleta cierra permanentemente la instancia y cancela trabajo pendiente.
- La cancelación del llamante interrumpe conexiones y espera de DNS. `getaddrinfo` del sistema puede seguir ejecutándose, pero su resultado tardío no abre conexiones.
- Los mensajes NDJSON de `src/worker-protocol.js` tienen límites de línea (24 MiB), canal (64 MiB), 1024 tramas y 8192 fragmentos por línea; UTF-8 estricto. Una trama inválida o truncada invalida el lector permanentemente. El escritor espera la finalización de escritura.

Los presupuestos de bytes cuentan cuerpos recibidos comprimidos, no memoria DOM/descomprimida ni todo el tráfico TLS. El supervisor deberá imponer CPU/RAM/PIDs, plazo de trabajo y limpieza independientemente del canal. No están soportados streaming/SSE, WebSocket, descargas ni métodos con efectos de escritura. El cumplimiento de estas restricciones no convierte una auditoría en una certificación WCAG.

### Pruebas y aceptación restante

`node --test tests/request-mediator.test.js tests/worker-protocol.test.js` prueba servidores HTTP/TLS reales y el enmarcado: certificado incorrecto/no confiado, DNS privado, cancelación y resultado tardío, límites de cola/concurrencia/bytes/plazos, redirecciones, cabeceras y respuesta truncada. `tests/mediated-browser.test.js` usa Chromium real y verifica navegación redirigida, gzip, JavaScript externo y cookies HttpOnly múltiples mediante `route.fulfill`.

Esta prueba de navegador se ejecuta en el host con su sandbox normal en CI. En la sesión local restringida usa el adaptador de pruebas documentado; **no prueba Docker ni ausencia de salida directa**. Tampoco establece equivalencia de caché, streaming, navegación compleja o rendimiento con una red normal.

Pendiente antes de habilitar el backend: imagen de worker versionada, Chromium no root con sandbox obligatorio, `network=none`, protocolo con estados/IDs y validación de respuestas, supervisor con inspección/propiedad/limpieza, secretos solo en stdin sin logs, recursos del kernel, prueba adversarial real de Chromium en Docker y compatibilidad con sesiones/recorridos/históricos. Después quedan límites globales del servicio y revisión independiente antes de permitir trabajos desde el visor.

La prueba `isolation-desktop.json` aportada por el operador en esta sesión aprobó el requisito Node de Docker Desktop y limpieza; no contenía Chromium. Codex sigue sin acceso al named pipe del motor. El resultado original se conserva fuera de Git y su copia de entrega está en `outputs/ISOLATION-DESKTOP-ACCEPTANCE.json`.

## English

Updated status: internal transport used by the experimental opt-in Docker project backend. The default CLI still uses its authenticated proxy and the viewer remains read-only. See [CONTAINED-BROWSER.md](CONTAINED-BROWSER.md) for CDP integration, exact image/run acceptance and remaining gates. No dependencies or web job API are added. Host-only compatibility tests alone do not establish OS containment.

The future host mediator accepts HTTP request descriptions, enforces exact navigation/resource origins, GET/HEAD, DNS validation and numeric-IP pinning, and performs HTTP(S) itself. HTTPS checks certificates and the original hostname/SNI; there is no CONNECT or arbitrary socket tunnel. Private origins require explicit operator exceptions. The injectable CA is an internal fixture facility, never a worker/user-supplied setting.

Default per-instance limits: 200 requests, 16 MiB aggregate response bodies, 5 redirects, 4 active requests, 64 queued requests, 10 seconds per DNS/response phase and 30 seconds total lifetime. URLs and headers are bounded. Request headers are allowlisted; proxy credentials and caller Host are stripped. Response hop-by-hop headers, including Connection-nominated fields, and Content-Length are stripped; multiple cookies and raw compressed bodies are preserved. Invalid input, denial, exhaustion, truncated response or deadline permanently cancels the instance. Late DNS results cannot connect after cancellation; OS DNS work itself may continue.

The NDJSON reader limits frames, bytes and fragmentation, rejects invalid UTF-8 and stays failed after malformed/truncated input. The writer waits for write completion. Sensitive Cookie/Authorization values remain in memory and must never be placed in supervisor arguments or protocol logs.

Real HTTP/TLS tests exercise rejection, deadlines, cancellation, concurrency and budgets. A real Chromium compatibility test verifies redirects, gzip, assets and multiple HttpOnly cookies using route fulfillment. It runs on the host, not in a network-disabled container. Local restricted execution uses the documented test-only adapter; native CI uses the normal browser sandbox. These tests do not establish containment, general network-semantic equivalence or browser resource bounds.

Still required: versioned worker image, non-root sandboxed Chromium with OS-enforced network=none, strict protocol states/IDs/responses, ownership-checked supervisor cleanup, kernel limits, secret-safe stdio, adversarial real Docker browser tests and session/journey/history integration. Streaming/SSE, WebSockets, downloads and write methods are outside this transport's scope. Global job supervision and independent security review precede web job execution. Existing history data is not migrated.

The operator's Docker Desktop Node prerequisite passed, including cleanup; it was not a Chromium test. Codex cannot access that engine's Windows named pipe. The supplied acceptance file is retained outside Git and copied to the delivery outputs.


## CDP integration update / Actualización de integración CDP

The early Playwright route fixture did not prove mediation of redirected destinations: the browser could follow a redirect on the host network. The current offline regression verifies every redirect URL and asset. The experimental worker now uses CDP Fetch request-stage interception, disables cache, decodes compressed bodies inside its cgroup with a strict aggregate decoded-byte limit and removes wire encoding before fulfillment. The host mediator itself still preserves/computes compressed transfer bytes. Same-origin frames are tested; cross-origin frames fail closed. Source and real-container acceptance are in CONTAINED-BROWSER.md/VALIDATION.md. Earlier future-work descriptions in this transport design are historical; the optional worker is implemented, while broader security/Desktop/service gates remain open.
