export const messages = {
  en: { title:'Accessibility report', findings:'Findings', review:'Needs human review', rules:'Violated rules', passed:'Passed checks',
    severity:'Severity', criterion:'WCAG criteria', element:'Element', details:'Evidence', fix:'Recommended correction', verify:'How to verify',
    none:'No automated violations detected. Manual review is still required.', unknown:'No criterion mapped by the engine',
    disclaimer:'Automated checks do not establish WCAG conformance. Keyboard, screen-reader and human testing remain necessary.',
    succeeded:'succeeded', failed:'failed', cancelled:'cancelled', duration:'Duration', pages:'Pages',
    critical:'Critical', serious:'Serious', moderate:'Moderate', minor:'Minor', other:'Unknown',
    fallback:'Review the affected element and the engine evidence. Follow the linked rule documentation and verify the intended behavior with assistive technology.',
    fallbackVerify:'Re-run the rule after the change and complete the relevant manual checks. An automated pass does not prove accessibility.' },
  es: { title:'Informe de accesibilidad', findings:'Incidencias', review:'Requiere revisión humana', rules:'Reglas incumplidas', passed:'Comprobaciones superadas',
    severity:'Gravedad', criterion:'Criterios WCAG', element:'Elemento', details:'Evidencia', fix:'Corrección recomendada', verify:'Cómo verificar',
    none:'No se detectaron incumplimientos automáticos. Sigue siendo necesaria la revisión manual.', unknown:'El motor no ha asociado un criterio',
    disclaimer:'Las comprobaciones automáticas no demuestran conformidad WCAG. Son necesarias pruebas humanas con teclado y lector de pantalla.',
    succeeded:'correctas', failed:'fallidas', cancelled:'canceladas', duration:'Duración', pages:'Páginas',
    critical:'Crítica', serious:'Grave', moderate:'Moderada', minor:'Leve', other:'Desconocida',
    fallback:'Revisa el elemento afectado y la evidencia del motor. Consulta la documentación de la regla y verifica el comportamiento esperado con tecnología de apoyo.',
    fallbackVerify:'Repite la regla tras el cambio y completa las pruebas manuales pertinentes. Superar el análisis automático no demuestra accesibilidad.' }
};
export function languageCode(value = 'en') {
  if (typeof value !== 'string' || !Object.hasOwn(messages, value)) throw new Error('Language must be en or es');
  return value;
}
// Original, curated guidance. Never infer an automatic fix from a selector alone.
const guidance = {
  'image-alt': {
    en:['Give informative images a concise alternative describing their purpose. Use alt="" only for decorative images; label linked images by their action.', 'Inspect the accessible name in context and test it with a screen reader; then re-run image-alt.'],
    es:['Añade a las imágenes informativas un texto alternativo que describa su propósito. Usa alt="" solo en imágenes decorativas; en imágenes enlazadas describe la acción.', 'Comprueba el nombre accesible en contexto y con un lector de pantalla; repite image-alt.'] },
  'button-name': {
    en:['Give the button a visible text label or a meaningful accessible name. Keep the visible label in its accessible name.', 'Navigate to the button with the keyboard and confirm that a screen reader announces its action.'],
    es:['Añade texto visible al botón o un nombre accesible significativo. Incluye la etiqueta visible dentro del nombre accesible.', 'Llega al botón con el teclado y confirma que el lector de pantalla anuncia su acción.'] },
  'link-name': {
    en:['Provide link text that describes its destination or action, including icon-only links.', 'Review links out of context with a screen reader and verify each destination.'],
    es:['Proporciona texto que describa el destino o la acción del enlace, también en enlaces que solo contienen iconos.', 'Revisa la lista de enlaces con un lector de pantalla y comprueba sus destinos.'] },
  label: {
    en:['Associate each form control with a visible label using label/for or an appropriate accessible naming mechanism.', 'Focus every control, confirm its label is announced and check that instructions and errors are associated.'],
    es:['Asocia cada control del formulario con una etiqueta visible mediante label/for o un mecanismo de nombre accesible adecuado.', 'Enfoca cada control, confirma que se anuncia su etiqueta y comprueba la asociación de instrucciones y errores.'] },
  'color-contrast': {
    en:['Adjust foreground/background colors for the actual rendered states. Normal text generally needs 4.5:1; large text 3:1. Check applicable exceptions in WCAG.', 'Measure contrast on the rendered background, including hover, focus, disabled exceptions and image/gradient backgrounds.'],
    es:['Ajusta los colores del texto y su fondo real. El texto normal necesita generalmente 4,5:1 y el grande 3:1. Revisa las excepciones aplicables en WCAG.', 'Mide el contraste sobre el fondo real, incluidos hover, foco, excepciones de controles deshabilitados e imágenes o degradados.'] },
  'html-has-lang': {
    en:['Set the document language on html using a valid language tag matching the content.', 'Check screen-reader pronunciation and mark language changes within the page.'],
    es:['Declara en html un idioma válido que coincida con el contenido.', 'Comprueba la pronunciación del lector de pantalla y marca los cambios de idioma dentro de la página.'] },
  'document-title': {
    en:['Provide a descriptive, non-empty title that identifies this page and its purpose.', 'Check the browser tab and screen-reader page announcement, including after SPA navigation.'],
    es:['Proporciona un título descriptivo que identifique la página y su propósito.', 'Comprueba la pestaña y el anuncio del lector de pantalla, también tras navegar en una SPA.'] },
  'aria-hidden-focus': {
    en:['Remove focusable descendants from hidden content or correct the hiding logic. Do not hide an active focused element from assistive technology.', 'Traverse the page using Tab and Shift+Tab, including open and closed dialogs.'],
    es:['Evita descendientes enfocables en contenido oculto o corrige su lógica de ocultación. No ocultes a la tecnología de apoyo un elemento con foco activo.', 'Recorre la página con Tab y Mayús+Tab, incluidos los diálogos abiertos y cerrados.'] }
};
export function recommendation(id, language = 'en') {
  const lang = languageCode(language);
  const entry = guidance[id]?.[lang];
  return {kind:entry ? 'curated' : 'general', language:lang,
    correction:entry?.[0] ?? messages[lang].fallback, verification:entry?.[1] ?? messages[lang].fallbackVerify};
}
