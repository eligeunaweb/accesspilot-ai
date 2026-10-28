# Revisión interna del servicio local / Internal local service review

Estado: revisión interna y endurecimiento del visor de consulta. **No es una revisión independiente ni habilita ejecución de auditorías web.** Sustituye únicamente los estados históricos equivalentes de SECURITY-BOUNDARY.md; los demás límites siguen abiertos.

## Alcance y amenazas / Scope and threats

Se revisaron viewer.js, las vistas/exportaciones de historial, lectura/validación de registros, transporte mediado y las interfaces de cola/propiedad/recursos que usaría un futuro servicio. Entradas hostiles consideradas: otra página del navegador, sitios auditados e informes guardados, clientes HTTP locales y clientes que desconectan o dejan de leer. Directorios, proyectos, imágenes Docker y configuración de arranque los selecciona un operador de confianza. No hay defensa frente a un administrador local, plugins instalados con permisos del usuario o un daemon comprometido.

El visor sigue escuchando solo en 127.0.0.1, con una ruta aleatoria de 256 bits por instancia, Host/Origin exactos, sin CORS abierto, CSP por nonce, no-store/no-referrer, nosniff, frame denial y proyectos permitidos. Una ruta secreta es una capacidad local de sesión: no equivale a cuentas multiusuario ni a aislamiento frente a otros procesos del usuario. No se registran rutas de sesión en el servidor. Los bloqueos operativos del historial pueden crear directorios; consulta no significa ausencia de toda escritura interna, sino que no ejecuta auditorías ni cambia sus registros.

## Hallazgo corregido: vida de respuesta / Corrected response lifetime

El límite anterior de cuatro peticiones terminaba en el finally del handler, inmediatamente después de res.end. Esa llamada puede dejar un cuerpo grande encolado para el transporte. Por ello el límite no representaba correctamente respuestas pendientes. Ahora el cupo se mantiene hasta cumplir **ambas** condiciones: trabajo finalizado y evento finish/close de la respuesta. Desconectar al cliente no libera el cupo de trabajo que aún está leyendo archivos. Las escrituras posteriores a una respuesta destruida se descartan sin intentar una segunda cabecera.

finish significa entrega al transporte de Node, no confirmación de lectura del cliente. El presupuesto no limita buffers del kernel, el total del heap JS ni todos los objetos que se crean al leer/renderizar un registro.

## Controles activos / Active controls

| Control | Valor predeterminado / Default |
|---|---|
| Trabajo/respuesta admitidos simultáneamente | 4 |
| Cuerpo de informe por respuesta | 40 MiB |
| Cuerpos de informes reservados/en tránsito en conjunto | 64 MiB |
| Duración absoluta desde admisión | 15 segundos; destruye respuesta al vencer |
| Frecuencia global por instancia | ráfaga 120, recarga 2 peticiones/segundo |
| Sockets | 32; keep-alive 1 segundo; hasta 100 peticiones/socket |
| Cabeceras / destino HTTP | parser 8192 bytes / destino 2048 caracteres |
| Cabeceras/cuerpo incompletos | timeout 10 segundos, revisión de conexiones cada segundo |

Los límites por cuerpo preservan los máximos ya existentes de las exportaciones. Se contabilizan bytes UTF-8, no longitud JS. Si no cabe un informe, se devuelve 503 genérico sin adjunto ni datos originales; las pequeñas respuestas de control no consumen el presupuesto de informes. La frecuencia produce 429 y Retry-After. Los cupos de trabajo impiden iniciar lecturas ilimitadas cerrando sockets prematuramente. Los límites internos de confianza solo pueden reducir los valores anteriores; no se aceptan por HTTP ni por configuración de proyecto.

El plazo de 15 segundos cierra la salida; no interrumpe de forma preventiva JavaScript síncrono ni garantiza abortar una operación nativa de filesystem. Las operaciones pendientes conservan su cupo hasta terminar. No se declara un límite duro del proceso Node. Mantener entradas validadas/bounded y aislar renderizado costoso sigue siendo relevante para un servicio futuro.

Solo se admite GET sin cuerpo. Se rechazan cabeceras Host/Origin/Fetch Metadata y de encuadre duplicadas, Fetch Metadata desconocido, cuerpos GET, transferencias chunked, Expect, CONNECT y Upgrade. OPTIONS/POST/PUT/DELETE/HEAD continúan rechazados. No hay negociación automática de túneles ni cambio de protocolo.

## Puertas abiertas antes de una API de ejecución / Open execution API gates

| Prioridad | Pendiente y criterio de aceptación |
|---|---|
| P1 | Revisión independiente del mediador, aislamiento, sesiones y protocolo; ensayos de escape/red más amplios en entornos soportados. Esta revisión interna no la satisface. |
| P1 | Contrato de API sobre proyectos permitidos: no aceptar rutas de archivo, imágenes, comandos, orígenes privados o scripts arbitrarios del cliente. Autorización de creación/cancelación, CSRF para mutaciones, cuerpos acotados y prueba negativa de cada acción. No hay estas rutas activas. |
| P1 | Presupuesto del proceso anfitrión y trabajo de validación/renderizado síncrono. Los límites de cuerpos/archivos y frecuencia no prueban una cota exacta de heap/CPU. Ensayos de entradas máximas y aislamiento del trabajo costoso antes de ampliar la superficie. |
| P1 | Servicio único y dominio de recursos obligatorio para los trabajadores que gestione; conservar reservas hasta limpieza comprobada. La opción CLI compartida no es un límite automático global de la máquina. |
| P2 | Privacidad/retención del historial privado y ACL verificadas en Windows. Exportaciones reducidas no redactan las fuentes ni garantizan anonimato. |
| P2 | Liveness/recuperación tras fallos de proceso/motor y pérdida eléctrica, sin robar bloqueos ni repetir trabajos. Hay recuperación conservadora probada, no durabilidad de apagado garantizada. |
| P2 | Instalación limpia, pruebas humanas de accesibilidad y aceptación actual de Apple Silicon/Docker Desktop, sin confundir CI Intel/Linux con otros entornos. |

## Verificación / Verification

Las pruebas nuevas separan el modelo determinista de cupos, reservas UTF-8, cierre, plazo y frecuencia, de HTTP real con cabeceras duplicadas, encuadre/cuerpos, túneles/Expect/Upgrade, presupuesto de salida, entradas excesivas y respuestas genéricas. Una respuesta HTTP real emitida a ritmo controlado verifica que se mantiene la reserva tras terminar el handler y se recupera al desconectar. Ese fixture hace explícito el ritmo: la prueba inicial asumía erróneamente que writableLength/finish reflejarían la lectura de un cliente pausado en todos los sistemas; el transporte puede aceptar el cuerpo antes de esa lectura. No se cuenta como garantía de memoria del kernel ni como benchmark del producto.

Los resultados por commit y sus límites deben verificarse en VALIDATION.md y en la evidencia de entrega. Editar este documento o el workflow no prueba que CI haya pasado.

## English

This is an **internal** review and hardening increment for the protected read-only loopback history viewer, not independent review or authorization for web audit execution. Untrusted websites, stored page evidence and local HTTP clients are considered; selected directories/projects/images and local OS administrators remain trusted boundaries.

Admission now spans both handler completion and response finish/close. Early disconnect cannot free unfinished filesystem work. Pending report body bytes are reserved before sending, bounded at 40 MiB per response and 64 MiB total; four admitted operations maximum. Absolute response lifetime is 15 seconds, with a 120-token burst / two-per-second refill. Existing socket, header and request-target limits remain, with one-second timeout checks. Generic overloads do not include original evidence or attachment headers. Trusted test/programmatic limits can only reduce defaults.

Response finish means handing data to Node's transport, not client acknowledgement. These controls are not a total heap, kernel-buffer or synchronous CPU bound; timers cannot preempt synchronous work. Native filesystem work may outlive a disconnected response, retaining its admission slot. Original private records and reduced-data sharing semantics are preserved.

Duplicate security/framing headers, unknown Fetch Metadata, GET bodies, chunked payloads, Expect, CONNECT and Upgrade are rejected. The viewer still exposes GET queries/downloads only. Future mutation routes require a separate allowlisted job contract, authorization, CSRF/body/rate limits and negative tests; no audit execution/cancellation API is enabled. Independent security review, stronger host resource isolation, privacy/ACL/retention, broader environment and human acceptance remain open gates. See the acceptance table above and per-head validation evidence.


Seguimiento / Follow-up: [REPORT-RENDERING.md](REPORT-RENDERING.md) describe separación de renderizado en procesos desechables. La lectura/validación inicial permanece en el anfitrión; la puerta P1 de recursos no se considera cerrada.


Actualización 2026-10-28 / Update: [HISTORY-SOURCE-ISOLATION.md](HISTORY-SOURCE-ISOLATION.md) sustituye el estado anterior de parse/validación inicial en el padre para detalles, comparaciones, tendencias y exportaciones del visor. La captura de fuentes queda bajo bloqueo en el padre y la validación pasa al hijo después de liberar el bloqueo; permanecen los límites de I/O, serialización, RSS y muerte abrupta del padre.
