# Renderizado desechable / Disposable report rendering

El visor de consulta separa en procesos Node desechables el detalle de una ejecución, comparaciones, tendencias y exportaciones originales/reducidas. El proceso HTTP mantiene las comprobaciones de sesión, rutas permitidas y cupos; el hijo recibe datos ya cargados, nunca rutas elegidas por HTTP. No hay ejecución de auditorías web, evaluación de HTML/JavaScript del sitio, comandos del cliente ni carga dinámica de plugins.

## Ciclo y presupuestos

- Máximo dos hijos por instancia del visor, sin cola adicional; la saturación devuelve el error genérico 503 existente.
- Un proceso nuevo por renderizado; plazo absoluto de 10 segundos desde su creación. Cancelación por desconexión, cierre del visor, error/protocolo inválido o exceso de salida.
- Terminación SIGKILL (TerminateProcess en Windows). No se libera el cupo ni se resuelve el trabajo hasta observar close del hijo. El cierre espera esa terminación. No hay lecturas/escrituras de historial ni bloqueos de directorio en estos hijos.
- V8 old-space 192 MiB y stack 1024 KiB por hijo; **no son límites del RSS, de todos los buffers ni un presupuesto global de máquina**. Dos hijos pueden consumir más de 384 MiB de RSS en conjunto. No hay cgroup/job-object del anfitrión.
- Entrada JSON UTF-8 hasta 64 MiB, salida hasta 40 MiB antes de IPC; el proceso padre vuelve a comprobar el tipo/tamaño. La salida mantiene los cupos agregados del servicio local.
- Entorno mínimo SystemRoot/TEMP/TMP cuando existen; sin heredar NODE_OPTIONS, NODE_PATH, tokens ni proxy. execArgv fijo; stdin/stdout/stderr ignorados, canal IPC interno. Diagnósticos del hijo no se muestran al cliente.

El hijo ejecuta código de confianza de la aplicación con los permisos del usuario. **No es un sandbox de seguridad ni protege ante código local comprometido**. La estructura IPC no es una API pública y no se expone por HTTP. Las opciones internas solo reducen límites; el factory de procesos de pruebas no se configura mediante CLI, proyecto ni petición web.

## Límites pendientes

Lectura, JSON.parse y validación inicial de registros siguen en el proceso HTTP bajo sus límites previos de historial. JSON.stringify de entrada, serialización IPC, recepción de salida, shell HTML y listas/paneles también realizan trabajo acotado allí. No se afirma que ninguna entrada pueda bloquear el event loop ni se declara cota dura de heap/CPU del padre. Tendencias aún cargan y validan su ventana en el padre. La terminación del padre por fallo abrupto no ofrece una garantía de eliminación del hijo por el sistema operativo; el hijo normalmente termina al desconectar IPC cuando puede procesarlo, y no ejecuta trabajo externo, pero el caso CPU bloqueado requiere supervisión OS para una garantía completa.

La selección de proyectos y el acceso a archivos conservan su contrato y bloqueos actuales; no se mueve lectura con bloqueos a un proceso que puede matarse en cualquier momento. Esta fase reduce el impacto de renderizados síncronos y permite terminar ese trabajo, sin cerrar toda la puerta P1 de recursos del anfitrión ni sustituir revisión independiente.

## Pruebas y coste

Pruebas con procesos reales comparan byte a byte las exportaciones HTML/JSON/CSV originales y reducidas en español/inglés. Un fixture entra en un bucle CPU síncrono y confirma que el padre sigue atendiendo timers, que el cupo permanece ocupado, que el plazo mata al hijo y que vuelve a admitirse trabajo. Otros casos comprueban aborto, cierre, salida excesiva, crash, protocolo incorrecto, entrada excesiva y entorno/argumentos fijos. La señal de inicio del fixture usa stdout solo en el factory de prueba; el hijo de producción no abre ese canal. Los resultados del primer fixture, que enviaba una señal por el protocolo incorrecto y era rechazado antes del bucle, no prueban terminación por plazo; se corrigió antes de la aceptación final.

Crear procesos tiene un coste por solicitud; no se mantienen datos privados en un pool persistente. Las mediciones de CI son verificación funcional, no un benchmark de carga ni comparación de rendimiento con competidores. Véase VALIDATION.md y evidencia de entrega para resultados efectivamente ejecutados.

## English

The read-only viewer renders run details, comparisons, trends and original/reduced exports in fresh trusted Node child processes. Two children per viewer, no extra queue, a ten-second lifetime, 64 MiB JSON input and 40 MiB output bounds. Fixed V8 old-space/stack limits are not RSS or total host memory limits. Parent abort/shutdown/timeout/protocol errors terminate the child and retain admission until close. The worker performs no history I/O or directory locking. Minimal environment and fixed execArgv avoid inherited Node hooks/secrets; no audit execution API is enabled.

This is process separation, not an OS security sandbox. Initial history read/parse/validation, input serialization, IPC reception and outer HTML/list rendering still run in the HTTP process. Sudden parent death does not provide an OS-enforced child lifetime guarantee. Independent review and stronger host resource isolation remain open. Real-process tests include byte-equivalent bilingual exports, synchronous CPU deadline, cancellation, crash, protocol and budget rejection; check per-head evidence before claiming native compatibility.


Actualización 2026-10-28 / Update: [HISTORY-SOURCE-ISOLATION.md](HISTORY-SOURCE-ISOLATION.md) sustituye el estado anterior de parse/validación inicial en el padre para detalles, comparaciones, tendencias y exportaciones del visor. La captura de fuentes queda bajo bloqueo en el padre y la validación pasa al hijo después de liberar el bloqueo; permanecen los límites de I/O, serialización, RSS y muerte abrupta del padre.
