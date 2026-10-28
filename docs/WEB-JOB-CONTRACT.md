# Contrato interno de trabajos web / Internal web job contract

**Estado: modelo de admisión probado, sin listener ni rutas de auditoría activas.** No es un servicio desplegado, un planificador durable ni una revisión independiente. El visor existente continúa siendo de consulta. El adaptador HTTP de tests no se distribuye como servidor de producto y nunca llama al motor de auditoría ni a Docker.

## Confianza y autorización

El operador valida un workspace de hasta veinte proyectos al construir el contrato. Los clientes seleccionan únicamente su projectId; no envían URLs, rutas, imágenes, credenciales de sitios, políticas de red ni scripts. El proyecto seleccionado se clona desde la configuración del operador al entregarlo al futuro adaptador; modificaciones posteriores del objeto de entrada o de otra entrega no cambian la configuración guardada. Las sesiones tienen acceso a los proyectos del workspace completo: no son cuentas multiusuario ni RBAC.

La creación de sesiones es una llamada local de confianza, no una ruta pública. Cada sesión genera dos secretos independientes de 256 bits: Bearer y CSRF, comparados en tiempo constante. No van en URLs, recibos ni snapshot de métricas. El bootstrap seguro y almacenamiento en navegador aún no están implementados; una futura ruta no puede entregar tokens a peticiones sin autorización del operador. Nunca exponer openSession/take/settle/revokeSession mediante un despachador RPC genérico.

Toda acción exige Host exacto del origen HTTP 127.0.0.1 configurado y Bearer. Crear/cancelar exigen POST, Origin exacto y cabecera X-AccessPilot-CSRF. Consultar estado exige GET; permite Origin ausente (navegadores pueden omitirlo en GET del mismo origen), pero si está presente debe coincidir. Fetch Metadata, si existe, admite solo same-origin/none. No se habilita CORS. El futuro transporte debe seleccionar acciones por un enrutador cerrado; este módulo no valida rutas ni abre puertos.

El permiso que devuelve authorize es opaco, de un solo uso, ligado a sesión/acción y tamaño declarado. No se puede reconstruir desde JSON. Cambiar de acción, reutilizarlo o consumirlo tras expiración/revocación falla. Caducidad absoluta por defecto una hora y máximo dieciséis sesiones; no hay renovación automática. Revocar/caducar/cerrar cancela solicitudes pendientes y señala aborto de las activas sin fingir limpieza.

## Comandos v1

Crear: `{"schemaVersion":1,"projectId":"<64 hex>","requestId":"<UUID v4>"}`.

Cancelar: `{"schemaVersion":1,"jobId":"<UUID v4>"}`.

Recibo/estado: solo id, projectId, state. Sin URL, configuración, errores del motor, resultados o secretos. Un trabajo ajeno o ausente devuelve el mismo rechazo 404. RequestId es idempotente dentro de una sesión; repetirlo con otro proyecto devuelve 409. Otra sesión no puede usarlo para descubrir trabajos anteriores.

JSON plano de claves exactas; UTF-8 estricto, sin BOM, claves desconocidas/duplicadas (también escapadas) ni coerciones. Máximo 4096 bytes. POST exige Content-Type application/json (charset=utf-8 opcional), Content-Length canónico y tamaño recibido idéntico. No hay compresión ni Transfer-Encoding, Expect o Upgrade. GET no admite cuerpo. Cabeceras de seguridad/encuadre duplicadas se rechazan. El futuro listener debe rechazar CONNECT/Upgrade/checkContinue antes del handler, limitar cabeceras a 8192 bytes, rechazar cookies como autenticación alternativa y aplicar plazo/rate limit/lectura de cuerpo con contador incremental; esos controles de transporte no se implementan abriendo el servidor aquí.

## Ciclo y capacidad

Estados: requested → running → succeeded/failed. Cancelar requested produce cancelled y prohíbe take. Cancelar running produce cancelling y AbortSignal abortado; el trabajo sigue contando como activo hasta settle de confianza con cleanupVerified=true. Incluso un resultado succeeded pasa a cancelled si hubo aborto. Limpieza sin verificar produce interrupted, conserva el cupo y detiene admisión; no hay reseteo automático.

Máximo ocho trabajos no terminales y 128 recibos totales por instancia. No se expulsan recibos para saltarse idempotencia; al llenar el registro se rechaza admisión hasta cerrar y recuperar mediante un futuro servicio supervisado. No hay persistencia, TTL de recibos, fairness, progreso, resultados ni reanudación después de reinicio. Los límites internos solo se pueden reducir. El fallo de limpieza revoca sesiones y señala aborto de otros trabajos activos; el modelo no declara que haya eliminado recursos externos.

## Puertas antes de conectar ejecución

1. Adaptador explícito a createAuditQueue con diario, propiedad de workers y dominio de recursos obligatorio. No conectar take directamente a comandos o a auditorías legacy sin contención. El recibo requested no prueba que la cola durable haya aceptado un trabajo.
2. Arranque solo con proyectos del operador, imagen inmutable verificada y contención/mediación requeridas. El cliente nunca controla imágenes, directorios, políticas, sesiones ni workerLifecycle.
3. Bootstrap de sesión, router cerrado, límites de cuerpo/tiempo/frecuencia, estado/progreso y cancelación hasta limpieza confirmada, con pruebas negativas de cada ruta real. Prohibir payloads/resultados secretos en diario, recibos y logs.
4. Recuperación tras muerte del supervisor, idempotencia durable y propiedad verificable antes de habilitar ejecución. No robar bloqueos ni repetir tareas automáticamente.
5. Revisión independiente y límites pendientes del anfitrión; las pruebas internas no los sustituyen. UX accesible y pruebas humanas del flujo completo.

## Evidencia

Pruebas deterministas: allowlist, clones, propiedad, permisos de un uso, idempotencia/conflictos, cancelación retenida, limpieza incierta, caducidad/revocación, capacidades, UTF-8/JSON y cabeceras/encuadre. Tests con HTTP real ejercitan crear/reintentar/consultar/cancelar solo en el modelo, incluyendo GET sin Origin, CSRF, propiedad, exceso de cuerpo y Authorization duplicada. La primera prueba de duplicados se corrigió para incluir realmente la cabecera original; no era un fallo del contrato. Consultar VALIDATION.md para recuentos y CI del commit exacto.

## English

This is an internal admission model, not an enabled audit execution API or durable scheduler. Operator-configured projects are selected by ID only. Separate 256-bit Bearer/CSRF credentials, exact Host/Origin, one-use session/action/body-bound permits, strict bounded flat UTF-8 JSON and per-session idempotency protect model requests. Status GET permits absent Origin for normal browser behavior but rejects foreign Origin. Ownership hides foreign jobs with the same 404 as missing jobs.

Running cancellation retains admission until trusted cleanup acknowledgement; uncertainty stops admission and retains interrupted work. Defaults: eight outstanding jobs, 128 total receipts, sixteen sessions and one-hour absolute lifetime. Internal limits can only decrease. No actual audits, containers, history writes or filesystem paths are accepted. The test-only HTTP server does not execute work.

Production transport/bootstrap, durable queue/resource integration, crash recovery/idempotency, request rate/deadline limits, independent review and OS resource guarantees remain gates before connecting execution. Session access is workspace-wide, not multiuser RBAC. See per-head validation rather than treating this design as production acceptance.
