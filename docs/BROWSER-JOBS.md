# Auditorías desde el navegador / Browser job controls

## Español

El servicio de ejecución local dispone de una página en español (`/connect`) y otra en inglés (`/connect/en`). Permite conectar una sesión, seleccionar un proyecto del workspace autorizado, iniciar auditorías, consultar su estado y cancelar trabajos. El arranque sigue siendo explícito mediante `startWebJobTransport`: no se inicia al abrir el visor de historial ni se añade todavía una opción CLI. El backend predeterminado exige la imagen Docker inmutable y los directorios de cola, recursos e historial del operador.

### Conectar y ejecutar

1. El operador inicia el servicio y obtiene `service.connectionUrl`, una dirección local sin secretos. Debe seleccionar la configuración del workspace y los estados de autenticación de los sitios fuera del navegador.
2. El operador llama a `service.createPairingCode()` y entrega privadamente su propiedad `code`. Son 256 bits aleatorios, válidos durante dos minutos, para un único intercambio. Como máximo hay ocho códigos pendientes. No publicar el código en enlaces, capturas, archivos compartidos o registros.
3. El usuario abre la dirección local, elige idioma antes de conectar y pega el código. Un POST de mismo origen lo intercambia por Bearer/CSRF independientes y la lista de proyectos permitidos. La página pública no contiene proyectos ni credenciales. No existe una ruta HTTP que emita códigos.
4. «Iniciar auditoría» admite el proyecto seleccionado. Cada petición recibe un requestId estable. Si se pierde la respuesta, «Reintentar creación» conserva ese ID y el proyecto hasta obtener el recibo; no duplica la auditoría en la misma sesión.
5. Los estados se actualizan por turnos: como máximo una consulta automática cada dos segundos. También se puede actualizar manualmente. «Cancelar» solicita aborto; `cancelling` sigue visible mientras se limpia el trabajador. «Completada» significa que terminó la ejecución, no que el sitio cumpla WCAG ni que esté libre de incidencias.
6. «Desconectar y cancelar mis trabajos» revoca la sesión y solicita la cancelación de sus trabajos. La respuesta no afirma que su limpieza haya terminado; el supervisor conserva sus reservas hasta verificarla.

Las credenciales, los recibos y la clave del reintento viven exclusivamente en la memoria de esta pestaña. No se usan cookies, localStorage o sessionStorage. El campo del código se vacía antes del intercambio. Recargar, cerrar o cambiar idioma pierde el acceso de esta pestaña, **no cancela por sí mismo trabajos activos ni restaura su identidad**. Desconectar primero permite revocar explícitamente; si se perdió la pestaña, el operador puede cerrar el servicio esperando su promesa de limpieza. Una sesión nueva no recupera recibos anteriores. Los resultados canónicos siguen guardándose en el historial; esta pantalla muestra estados, no informes ni porcentaje de avance. La integración de resultados y la recuperación de sesión siguen pendientes.

Ejemplo de integración de operador (fragmento de un módulo local de confianza, no código para pegar en la consola del navegador):

```js
import {startWebJobTransport} from './src/web-job-transport.js';

const service = await startWebJobTransport({
  workspace,               // workspace validado de la configuración local
  directory: jobsDirectory,
  resourceDirectory: sharedResourceDirectory,
  historyRoot: historyDirectory,
  imageId,                 // sha256 inmutable de la imagen local revisada
  sessionStates            // opcional; estados validados por ID de proyecto
});
const address = service.connectionUrl;
const pairing = service.createPairingCode();
// Entregar address y pairing.code al operador mediante un canal local privado.
// No incluir pairing.code en address ni en registros persistentes.
// Al detener el proceso:
await service.close();
```

### Controles y límites

`POST /api/v1/session` acepta exclusivamente `{schemaVersion:1,pairingCode}` en JSON UTF-8 plano, sin propiedades extra ni claves duplicadas. Usa los límites de cuerpo/cabeceras/sockets/frecuencia/plazos del [transporte](WEB-JOB-TRANSPORT.md), Host/Origin exactos y Fetch Metadata. El código se consume antes de asignar sesión; si el intercambio falla o se pierde la respuesta, hay que obtener otro código. Fallar no concede acceso ni devuelve secretos en el error. La capacidad de sesiones del contrato sigue siendo dieciséis; los códigos no aumentan ese límite.

`POST /api/v1/session/revoke` requiere Bearer y CSRF y solo acepta `{schemaVersion:1}`. Consume un permiso opaco de acción `revoke`; vuelve a comprobar que la sesión sigue vigente después de leer el cuerpo. Un permiso de cancelación no sirve para revocar. Las reglas de expiración del contrato se evalúan en sus operaciones; no se afirma un temporizador que detenga procesos exactamente al cumplir una hora.

Las páginas y sus assets son fijos y tienen no-store, no-referrer, nosniff, CORP y CSP sin scripts inline/eval, con recursos y conexiones del mismo origen, sin formularios nativos, bases externas ni iframes. Nombres y recibos se insertan como texto. No hay código ni configuraciones de auditoría provenientes de la URL. El cliente ignora regresiones de estado por respuestas atrasadas. Los mensajes de error son genéricos y no muestran errores internos del motor. El cierre de servicio invalida códigos pendientes y espera la limpieza existente.

El alcance es local y de un operador de confianza. No es un sistema multiusuario/RBAC ni una defensa frente a quien controle el proceso, el navegador o el sistema operativo. No se ha hecho revisión de seguridad independiente. Los límites globales del anfitrión, identidad durable, archivo de recibos, un lanzador de operador integrado, gestión de resultados y aceptación manual siguen en la hoja de ruta.

## English

The explicitly started local execution service now has Spanish and English pages at `/connect` and `/connect/en`. A trusted operator supplies the workspace, immutable Docker image, queue/shared-resource/history directories and optional site authentication states. The existing history viewer does not start this service; no CLI launcher is added yet.

The operator obtains a secret-free `connectionUrl` and calls `createPairingCode()` out of band. The random 256-bit code expires after two minutes, is single-use, and is one of at most eight pending codes. Only a same-origin JSON exchange can redeem it for independent Bearer/CSRF credentials and the allowed project list. No HTTP endpoint issues codes, and the public page contains neither projects nor secrets. Lost exchanges require a fresh code; session capacity remains bounded at sixteen.

Users can start allowed projects, refresh states, cancel and disconnect. A lost admission response keeps the same requestId/project for explicit retry. Automatic polling rotates active jobs at no more than one request every two seconds. Cancellation remains pending until cleanup; a completed audit is not a WCAG conformance claim. Disconnect revokes the session and requests cancellation, without claiming cleanup is already finished.

Credentials, receipts and pending retries are kept only in tab memory, never cookies or Web Storage. The code input is cleared before exchange. Reloading/closing/changing language loses access and does not automatically cancel jobs or restore identity. Disconnect first; after losing the tab, the operator can await service close to cancel and clean up. New sessions cannot recover old receipts. Canonical results are saved in history; this page currently shows states, not reports or percentage progress.

Both session commands reject unknown/duplicate fields and malformed UTF-8. Revocation uses its own one-use action-bound authorization permit and rechecks session validity after upload. Existing envelope/body/rate/socket/deadline guards remain in effect. Static pages/assets use strict CSP, no-referrer, no-store, nosniff and CORP; native form submission is blocked, including when JavaScript is unavailable. User-controlled names are text, not HTML. Delayed responses cannot regress terminal/cancelling states. No inline scripts, eval, CORS, URL secrets or generic RPC are introduced.

Browser E2E uses real Chromium with simulated audited pages and real queue/history. The separate contained harness redeems a pairing code over HTTP and executes the real Docker backend, then verifies revocation. These are complementary tests, not a single end-to-end browser-UI-to-Docker acceptance or independent security review. Consult current-head evidence for platform results. Operator launcher, result integration, durable identity, host-wide resources, independent review and wider manual acceptance remain pending.
