# Recursos entre procesos / Cross-process resources

## Español

Las auditorías contenidas pueden usar `--resource-store DIRECTORIO_COMPARTIDO`, junto con `--job-store` y `--isolation-image`. Todos los supervisores que elijan el mismo directorio canónico comparten un dominio de recursos. La primera versión concede el dominio completo a **un supervisor cada vez**, que mantiene su cola FIFO y hasta dos contenedores activos. Una segunda instancia falla antes de iniciar trabajos, sin esperas indefinidas ni ejecución paralela oculta.

```sh
node src/cli.js --project project.json --isolation-image sha256:ID_COMPLETO --job-store jobs/project-a --resource-store resources/shared
```

El dominio reserva un máximo fijo de dos trabajadores, 2048 MiB, dos CPU y 512 PID de contenedores en conjunto; cada trabajador mantiene los límites reales Docker de 1024 MiB/una CPU/256 PID. Una configuración interna mayor de concurrencia se reduce a dos. No mide ni limita los procesos Node/Docker Desktop del host. Distintos directorios constituyen dominios independientes: **no es un límite automático de toda la máquina**. Todos los procesos que deban coordinarse deben elegir la misma ruta física; sin esta opción se mantiene la cola existente por instancia.

La exclusión usa creación atómica del directorio `.resource-lock`, identidad aleatoria de propietario y registros sincronizados en el dominio y en el almacén de trabajos (`resource-lease.json`). Solo se guardan UUID, hashes de rutas canónicas y presupuesto; no URLs, rutas completas, credenciales ni datos de páginas. Los archivos locales y ACL deben ser de confianza. La reserva se adquiere antes de admitir tareas y dura hasta terminar limpieza y cierre. Si quedan intenciones de trabajadores, falla el cierre y se conserva la reserva. Ningún PID, antigüedad ni timeout autoriza apropiarse de ella.

### Recuperación

Detén y confirma la terminación del supervisor anterior. Si dejó `.queue-lock`, retira solo ese directorio vacío del almacén de trabajos después de comprobar la parada, siguiendo WORKER-RECOVERY.md. **No borres `.resource-lock` ni sus archivos.**

```sh
node scripts/recover-workers.js --job-store jobs/project-a --resource-store resources/shared
node scripts/recover-workers.js --job-store jobs/project-a --resource-store resources/shared --apply
```

La vista previa comprueba la asociación exacta almacén/dominio/propietario sin liberar la reserva. Apply verifica esa asociación antes de actuar, recupera primero los contenedores mediante su propiedad exacta y libera después la reserva. Un error conserva bloqueo/evidencia; otro supervisor no puede liberar la reserva. Omitir el directorio, cambiarlo o usar otro almacén no permite adoptar el propietario anterior. Si la puerta ya no existe pero quedó el registro del mismo almacén tras una caída durante el cierre, se puede retirar ese registro después de comprobar su asociación. Una puerta reutilizada por otro propietario se rechaza.

Los archivos corruptos/parciales, permisos fallidos o identidades cambiadas requieren investigación: no se fuerza la limpieza ni se considera un error de Docker como ausencia. Una caída durante el alta antes de completar ambos registros puede necesitar reparación manual; no se garantiza durabilidad ante pérdida eléctrica. La recuperación no repite auditorías ni acredita conformidad WCAG.

La serialización de supervisores es intencionadamente conservadora. Reparto justo de plazas entre procesos, cola persistente con reanudación deliberada, reserva automática por máquina y revisión independiente del servicio siguen pendientes. No se ha habilitado ejecución web.

## English

Add `--resource-store SHARED_DIRECTORY` to contained project audits with `--job-store` and `--isolation-image`. Processes choosing the same canonical directory share a fixed resource domain. One supervisor owns the whole domain at a time and runs its existing FIFO queue with at most two Docker workers; competing supervisors fail before launching tasks. This is conservative admission, not fair concurrent scheduling across supervisors.

The fixed container budget is two workers / 2048 MiB / two CPU / 512 PID. Docker continues to enforce each worker's own limits. Host Node/daemon resources are not included; separate domains are independent, and there is no automatic machine-wide limit. Unconfigured CLI behavior is preserved.

Exclusive directory ownership and synced private records bind a random owner to hashes of the canonical domain/job-store identities. No full paths, URLs or credentials are persisted. Reservations remain held through cleanup and uncertain shutdown. No age/PID check steals a lock. Protect local filesystem permissions; power-loss durability and hostile local-administrator resistance are not claimed.

After confirming the old process has stopped, handle only its abandoned empty job-store `.queue-lock` as documented in WORKER-RECOVERY.md. Never manually erase the resource gate to bypass ownership. Preview/apply recovery with both --job-store and --resource-store verifies the association, cleans exact owned workers first and releases the domain afterward. Mismatched/corrupt ownership or failed cleanup retains evidence/reservation. Jobs never replay. Partial initialization may need manual investigation. Independent service review and finer inter-process scheduling remain pending before audit execution through the web viewer.
