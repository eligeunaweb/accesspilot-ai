# Transporte HTTP local / Local HTTP job transport

## Español

`startWebJobTransport(options)` es un punto de entrada interno explícito, separado del visor de historial. Escucha únicamente en `127.0.0.1` y un puerto aleatorio. Inicializa el supervisor contenido con ese origen; las opciones del operador fijan workspace, directorios de cola/recursos/historial, imagen inmutable y sesiones de los sitios. No añade una opción CLI ni habilita ejecución al abrir el visor. No es todavía la interfaz de ejecución para usuarios finales.

El objeto devuelto ofrece `origin`, `projects()`, `openSession()`, `revokeSession(credentials)` y `close()`. Son llamadas del proceso operador de confianza. No se publican como rutas HTTP. El operador obtiene Bearer y CSRF por `openSession()` y debe mantenerlos privados: nunca se incluyen en URL, HTML, diario o mensajes de error. **Todavía no hay bootstrap de navegador**, cookies de autenticación, almacenamiento de credenciales en el frontend ni recuperación de identidad tras reiniciar. No distribuir secretos mediante enlaces.

Solo existen estas rutas, sin query ni variantes codificadas:

| Método y ruta | Cuerpo / respuesta |
| --- | --- |
| `POST /api/v1/jobs` | JSON `{schemaVersion:1, projectId, requestId}`; recibo `202` tras admisión persistida |
| `GET /api/v1/jobs/<UUIDv4>` | Sin cuerpo; recibo propio `200`, ajeno o inexistente `404` |
| `POST /api/v1/cancellations` | JSON `{schemaVersion:1, jobId}`; recibo `200`, puede seguir `cancelling` hasta verificar limpieza |

Un recibo contiene exclusivamente `id`, `projectId`, `state`. `requestId` es UUIDv4 canónico y sirve para reintentos de la misma sesión; `projectId` debe pertenecer al workspace del operador. No se aceptan rutas de archivos, URLs a auditar, imágenes, perfiles ni secretos en el comando. Autenticación y permisos usan el [contrato existente](WEB-JOB-CONTRACT.md); ejecución, persistencia y recuperación siguen el [supervisor](WEB-JOB-SUPERVISOR.md).

Cada petición requiere Bearer; las mutaciones requieren además Origin exacto y CSRF independiente. Host exacto, Fetch Metadata y cabeceras de framing se validan antes de leer el cuerpo. GET admite Origin ausente, pero rechaza un Origin distinto si se presenta. No hay CORS, RPC genérico, negociación de compresión, túneles ni WebSocket. Expect se rechaza con 417; Upgrade y CONNECT cierran la conexión. Errores solo devuelven un mensaje genérico y código HTTP, sin stack, rutas o mensajes del motor.

Límites por instancia: 32 sockets, cuatro manejadores activos, cubo global de 120 peticiones con reposición de dos por segundo, cabeceras de 8192 bytes/64 pares y URL de 512 caracteres. No existe un mapa sin límite por IP. Un cuerpo JSON plano debe declarar Content-Length canónico y medir como máximo 4096 bytes; la lectura incremental comprueba tamaño y longitud real. Plazo absoluto de cuerpo de 10 segundos y respuesta de 15 segundos. Node aplica plazo de cabeceras/petición de 10 segundos con revisión cada segundo y timeout de inactividad de socket de 10 segundos. Son límites distintos: no se afirma precisión de tiempo real para el vencimiento de cabeceras. Una sola petición por socket y `Connection: close`; sin keep-alive de aplicación. Las opciones internas de límites solo permiten reducirlos.

El plazo de respuesta no interrumpe una escritura de admisión en curso: puede perderse la respuesta de un trabajo admitido y el cliente deberá reutilizar su requestId. La desconexión antes de completar el cuerpo no crea trabajo. Después de entrar en submit, el trabajo puede persistirse aunque el cliente desaparezca. El slot HTTP permanece ocupado hasta que terminan tanto el manejador como la respuesta; cerrar un socket no evade el límite. Los plazos HTTP **no son un límite de tiempo para fsync, Docker o ejecución del proyecto**, y no garantizan consumo global del anfitrión ni protección frente a un usuario local hostil con control del sistema.

`await close()` deja de aceptar conexiones, destruye sockets, espera manejadores y cierra el supervisor, que cancela trabajos y espera limpieza. Si esta no se verifica, se conservan las puertas de recuperación y se propaga el error. No instala manejadores globales de señales. Un integrador debe esperar close antes de terminar; no hay garantía automática frente a caída del proceso. Véase [recuperación](WORKER-RECOVERY.md).

## English

The explicit internal `startWebJobTransport(options)` entry point binds a random IPv4 loopback port and creates the existing contained supervisor with that origin. It is separate from the read-only viewer and is not activated by the CLI. Operator-only `projects/openSession/revokeSession/close` methods are not HTTP endpoints. Browser credential bootstrap, frontend execution controls and durable client identity are still pending. Never put Bearer or CSRF secrets in URLs.

Only POST jobs, GET an owned UUID job and POST cancellations are routed, as shown above. Commands accept opaque allowlisted project/request/job IDs only. Bearer is mandatory; mutations also require exact Origin and independent CSRF. Host, Fetch Metadata, singleton headers, strict framing and flat UTF-8 JSON are checked. No CORS, generic RPC, compression, WebSocket or CONNECT tunnels. Responses contain only minimal receipts or generic errors, with no-store and restrictive browser headers.

Per-instance bounds are 32 sockets, four active handlers, a global 120-token bucket refilling at two requests/second, 8 KiB headers/64 pairs, 512-character URLs and 4 KiB incremental bodies. Body and response absolute deadlines are 10/15 seconds. Node header/request expiry checks and socket inactivity are distinct from these body deadlines. Connections close after one request. Trusted limit overrides can only reduce defaults; no unbounded client/IP state is retained.

Disconnecting before body completion never admits work. Once submit begins, admission may commit despite a lost response; retry with the same requestId/session. Response expiry does not release a handler slot while its durable operation remains pending. HTTP deadlines are not filesystem/Docker/project deadlines or OS host resource guarantees. Awaiting close destroys connections, waits handlers and delegates cleanup-held cancellation to the supervisor; uncertainty preserves recovery ownership and rejects close. Independent security review, browser bootstrap/UI, host-wide resource controls and wider platform/operator acceptance remain open. Consult current-head validation evidence; fake engine tests do not validate Docker containment.
