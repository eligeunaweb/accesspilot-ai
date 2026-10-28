# Supervisor persistente de proyectos / Persistent project supervisor

Estado: adaptador interno sin listener ni rutas nuevas en la aplicación. Conecta el contrato de solicitudes a la cola de páginas, al dominio compartido de recursos y al historial. No se habilita ejecución desde el visor. El backend predeterminado es auditPageInDocker; no hay fallback legacy o sin contención. La inyección de auditoría de los tests es una dependencia local de confianza, no una opción de petición, CLI o entorno.

## Admisión y ejecución

El operador proporciona workspace, directorios distintos de cola/recursos/historial, imagen local sha256 inmutable y, para proyectos autenticados, estados de sesión validados en memoria por projectId. La solicitud del cliente sigue conteniendo solo projectId/requestId. Los perfiles, orígenes privados, imágenes, rutas y secretos nunca son controlados por el cuerpo HTTP.

El supervisor adquiere la cola exclusiva y su dominio de recursos obligatorio antes de abrir web-admissions.json. Ese bloqueo se mantiene durante toda su vida. El nuevo diario guarda ID, hash de propietario, hash de requestId, ID de proyecto, fingerprint de configuración y estado; no guarda URLs, cookies, resultados, errores del motor ni instrucciones ejecutables. Usa creación exclusiva temporal, sync de archivo y rename, con lectura real acotada a 128 KiB y máximo 128 recibos. No se afirma durabilidad de directorio frente a pérdida eléctrica ni ACL Windows verificadas.

La admisión se escribe antes de iniciar el proyecto y el estado running se escribe antes de su primera página. La respuesta inicial espera la escritura de admisión; el estado consultable se toma del diario ya publicado. Los reintentos simultáneos de la misma solicitud/sesión comparten ticket y no crean otro proyecto. El diario conserva claves de idempotencia y detecta conflictos de configuración; no se expulsa un recibo para admitir otro. Al llenarse se rechaza admisión, sin borrado automático del registro.

Máximo dos proyectos activos y ocho solicitudes no terminales; cada página pasa por createAuditQueue y su máximo compartido de dos trabajadores contenidos. No se envuelve el proyecto entero en un slot de página: hacerlo bloquearía el fan-out o mezclaría varios contenedores bajo una única intención de propiedad. Cada página conserva su workerLifecycle independiente y los límites/limpieza del backend revisado. No hay fair scheduling entre distintos supervisores: un dominio explícito pertenece a uno solo.

Al terminar se guarda el resultado canónico en historial, con las reglas existentes de cobertura y secretos. Una auditoría con incidencias puede completarse correctamente; fallos/cancelaciones de páginas no se convierten en una mejora. Los recibos no incluyen resultados ni detalles de sesión. No hay todavía un endpoint de progreso o descarga asociado a estos trabajos.

## Cancelación y fallos

Cancelar una solicitud aún pendiente impide arrancar páginas. Cancelar un proyecto activo señala aborto a auditProject y a las tareas de página. El ticket y el estado cancelling permanecen hasta que las tareas salen y la cola confirma sus estados. Una respuesta tardía de cancelación no sobrescribe un estado terminal que ya se haya publicado durante la escritura.

Si la cola indica limpieza no verificada, el proyecto queda interrupted, se revocan sesiones, se aborta el resto y se detiene la admisión. queue.close conserva las reservas/bloqueos según su contrato de recuperación. Un fallo de escritura del diario también detiene admisión; si no se creó ningún trabajador, el cierre puede liberar el dominio después de verificar la cola. Un error genérico no promete que se haya liberado un recurso desconocido.

close cancela y espera admisiones/proyectos y cierra la cola. Debe esperarse esta promesa: el objeto no instala señales globales ni un servidor. Los métodos describe/failAdmission/take/settle/inspect/wait son internos, nunca deben exponerse por un despachador RPC genérico. El futuro transporte seguirá necesitando límites de cuerpo/cabeceras/frecuencia/plazos, bootstrap y router cerrado.

## Reinicio e idempotencia: alcance exacto

No se roba un .queue-lock abandonado ni se liberan dominios por PID/edad. Primero un operador debe confirmar que terminó el supervisor anterior y usar la recuperación offline existente para limpiar sus intenciones y reservas. El harness de prueba elimina solo el bloqueo de su propio hijo tras observar exit; no es una receta de takeover automático.

Tras abrir de nuevo de forma segura, los recibos admitted/running/cancelling pasan a interrupted antes de permitir solicitudes. Nunca se reconstruye un trabajo a partir del diario ni se repite automáticamente: no contiene payload ejecutable. Las claves de solicitud persisten dentro de su namespace de propietario. Un conflicto no permite lanzar trabajo con el mismo identificador.

Las sesiones web son efímeras y **no se restauran**: credenciales viejas no autentican al nuevo contrato. Recuperar el diario no concede acceso de navegador a recibos anteriores ni permite repetirlos tras renovar sesión. El operador puede inspeccionar recibos recuperados; la reautenticación/identidad durable y una UI de recuperación son puertas pendientes. Una sesión nueva representa otro namespace. No se declara idempotencia global entre sesiones, reanudación transparente de cliente ni scheduler durable completo.

## Verificación y límites

Tests reales de archivos/cola/dominio y un hijo supervisor terminado por SIGKILL comprueban admisión antes de página, reintentos, historial, cancelación con limpieza demorada, limpieza incierta, errores/corrupción de diario y recuperación sin replay. Las páginas de esos tests son simuladas; no prueban contención Docker.

El harness contained-acceptance añade un proyecto autenticado con viewport/checkpoint usando el supervisor predeterminado y Chromium real en Docker, comprueba una sola tarea de página tras dos solicitudes equivalentes, historial con imagen/journey y liberación del dominio. Ese harness requiere Docker; su ejecución real se acredita solo con el resultado CI/operador, no editando el script. El test de SIGKILL local no mata un proyecto Docker; la recuperación de contenedores con muerte/OOM conserva su harness separado. No afirmar cobertura de todas las combinaciones de fallos.

Los límites OS del anfitrión, limpieza de procesos de renderizado tras muerte abrupta, acceso a estado tras renovar sesión, archivo/rotación segura de recibos, fairness, UI/HTTP y revisión independiente siguen abiertos. Las credenciales de sesión y projectStates viven en memoria; no hay redacción retroactiva del historial privado ni garantía de anonimato de hashes.

## English

This internal supervisor joins allowlisted web admission to a persistent project receipt journal, the existing per-page queue, a mandatory explicit shared resource domain and canonical history. It opens no HTTP listener. Trusted operator configuration supplies immutable image/directories and optional validated site session states; clients cannot override them. Default page execution is contained Docker with a distinct ownership lifecycle for every page.

Admission and running states are synced before project/page work. Duplicate requests share one ticket. Cancelling active work waits for page cleanup; uncertain cleanup stops admission and retains recovery ownership. Published status follows committed journal state. The bounded 128-record/128 KiB journal contains only opaque IDs/hashes/state, not runnable payloads or secrets.

After verified offline recovery, nonterminal project receipts become interrupted without replay. Browser sessions are not restored; durable receipts do not imply cross-session idempotency, client reconnection or a complete durable scheduler. No lock stealing, automatic domain takeover, power-loss durability, OS host resource guarantee or independent review is claimed. Model tests use fake pages; real Docker supervisor acceptance has a separate controlled harness. Check per-head evidence before declaring native/platform acceptance.
