# Auditoría y hoja de ruta / Audit and roadmap

Base: 290e50c9007c381cca0c3c28be57239b4afa5de9. 2026-10-26.
Revisión de todos los 12 archivos versionados: código, pruebas, lockfile, licencia, documentos y workflow. No había AGENTS.md. / All tracked files reviewed.

## Hallazgos / Findings
- P1: Node >=20 anunciado, pero @axe-core/playwright 4.14.0 requiere >=22.12.0. Alinear instalación, documentación y CI.
- P1: context.close puede impedir browser.close y rechazar main fuera del control de errores. Garantizar ambos cierres y salida 2 ante fallos.
- P1: respuesta HTTP 404/500 se presenta como auditoría correcta. Rechazar respuestas fallidas; probar navegación real.
- P2: detección de ejecución directa construye URL file manualmente; falla con espacios, # y %. Usar pathToFileURL.
- P2: seis pruebas unitarias; sin navegador, integración, salida CLI ni verificación de Windows en las pruebas actuales. CI usa npm install, sin instalar Chromium.
- P2: análisis y presentación acoplados en CLI; separar servicio reutilizable antes de multipágina y UI.
- P2: incompletos reducidos a un contador, sin evidencia revisable. Etiquetas WCAG conservadas pero sin índice de criterios ni priorización explícita.
- P2: solo una página y estado; sin límites de proyecto, historial, comparación, idioma, CSV o UI.
- Seguridad: HTML escapa datos correctamente; no se detectaron secretos en archivos versionados. El navegador ejecuta código remoto y alcanza la red local. CLI de confianza no equivale a servicio seguro: bloquear redes privadas, redirecciones y subrecursos mediante control de salida antes de exponer una UI. No afirmar protección SSRF actual.
- Privacidad: JSON contiene fragmentos HTML y selectores; añadir redacción, retención y exclusiones antes del historial compartido. Escritura --output sobrescribe el archivo indicado; documentar.
- Rendimiento: navegador nuevo por invocación; multipágina necesitará concurrencia limitada, contextos aislados, timeout global y cancelación.

## Dependencias y licencias / Dependencies and licenses
MIT para el proyecto. Cuatro paquetes instalados: @axe-core/playwright 4.14.0 y axe-core 4.14.0 MPL-2.0; playwright y playwright-core 1.64.1 Apache-2.0. Conservar avisos al redistribuir; cambios a archivos MPL requieren revisión de sus obligaciones. Chromium tiene avisos propios. No se añaden dependencias. npm ci completó y npm audit devolvió 0 vulnerabilidades conocidas; esto no prueba ausencia de riesgos. Mantener lockfile, revisión de actualizaciones y escaneo periódico.

## Fases / Phases
1. P1 — Base estable: runtime Node 22.12+, servicio de auditoría separado, cierre robusto, errores HTTP, entrypoint Windows, pruebas unitarias/integración/E2E con fixture local, CI Windows/Linux reproducible. Aceptación: pruebas reales y fallos con salida 2.
2. P1 — Modelo versionado y proyectos: configuración JSON validada, lista de URLs y varios sitios, límites de páginas/tiempo/concurrencia; aislamiento, política de red y cancelación. Mantener URL única y formatos actuales. Aceptación: éxito parcial explícito y fixtures de redirecciones/timeout/seguridad.
3. P2 — Informes: gravedad y criterios WCAG derivados de tags axe, evidencia de incompletos; recomendaciones ES/EN verificadas por regla, JSON versionado, CSV protegido frente a fórmulas e HTML interactivo accesible sin recursos externos. Aceptación: escape de contenido y navegación por teclado.
4. P2 — Seguimiento: persistencia local con migraciones, identidad de incidencias por regla/URL/selector, nuevas/resueltas/persistentes, comparación de motores y configuración; no confundir cambio de versión con mejora. Aceptación: fixtures deterministas y retención/redacción.
5. P2 — UI local: servidor solo loopback, token de sesión, validación Origin/Host, sin CORS abierto, límites de trabajo y acceso a archivos. Reutilizar servicio CLI. Aceptación: E2E teclado, protección CSRF/SSRF y Windows.
6. P3 — Calidad de producto: instalación Windows limpia, accesibilidad manual con usuarios/lector de pantalla, rendimiento en sitios grandes y documentación ES/EN completa.

Diferenciación propuesta: acompañamiento bilingüe, proyectos e historial local privado, evidencia revisable y mejoras trazables. axe sigue siendo el motor: no afirmar más cobertura que Pa11y/Lighthouse ni certificación WCAG, ni atribuir IA inexistente.

English: Phase 1 stabilizes the existing CLI with real browser tests. Phase 2 adds bounded project audits and network controls. Phase 3 adds bilingual actionable reports. Phase 4 adds trustworthy comparisons. Phase 5 adds a secured loopback UI. Phase 6 validates installation, performance and human accessibility. Preserve the existing CLI and never treat automated checks as WCAG certification.

## Límites de validación / Validation limits
Pruebas locales en Windows con Node 24.11.1. GitHub Actions y matriz Linux/Node 22/24 requieren ejecución remota tras publicar la rama; editar YAML no demuestra CI verde. Pruebas de lectores de pantalla, sitios autenticados y carga real siguen pendientes. No releases ni despliegues.
