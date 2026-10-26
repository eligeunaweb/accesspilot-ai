import { viewportLabel } from './viewport.js';

const copy = {
  es: {title:'Historial de accesibilidad',intro:'Evidencia local para seguir las mejoras de tu proyecto.',history:'Ejecuciones guardadas',open:'Ver ejecución',compare:'Comparar',before:'Antes',after:'Después',empty:'Todavía no hay ejecuciones guardadas. Ejecuta una auditoría con --history desde la CLI.',
    note:'Los detalles disponibles dependen de la versión del historial. Las comprobaciones pendientes necesitan revisión humana. Los resultados automáticos no certifican conformidad WCAG.',
    run:'Detalle de ejecución',url:'Página',status:'Estado',findings:'Incidencias observadas',rule:'Regla',selector:'Selector',back:'Volver al historial',previous:'Anterior',next:'Siguiente',date:'Fecha UTC e identificador',
    succeeded:'Auditada',failed:'Fallida',cancelled:'Cancelada',added:'Nuevas',resolved:'No observadas de nuevo',persistent:'Persistentes',incomparable:'Páginas no comparables',comparable:'Páginas comparables',
    result:'Comparación de ejecuciones',review:'La ausencia de una incidencia en el mismo selector no demuestra su corrección: cambios en el DOM pueden cambiar su identidad. Revisa los resultados manualmente.',
    reason:'Motivo',none:'Sin incidencias automáticas observadas en esta evidencia.',unavailable:'No hay evidencia de una auditoría completada para esta página.',error:'No se puede abrir esta vista. Comprueba los registros y los permisos desde la CLI.',notfound:'Vista o registro no encontrado.',summary:'Resumen',identified:'Las incidencias se identifican por página, regla y selector.',
    reasons:{'viewport-changed':'Cambió el tamaño de pantalla','scope-changed':'Cambió el alcance','policy-changed':'Cambió la política','page-not-audited':'Página sin auditoría completada','destination-changed':'Cambió el destino','engine-unknown':'Motor desconocido','engine-changed':'Cambió el motor','network-policy-unknown':'Política de red desconocida','network-policy-changed':'Cambió la versión de política de red'}},
  en: {title:'Accessibility history',intro:'Local evidence to track improvements in your project.',history:'Saved runs',open:'View run',compare:'Compare',before:'Before',after:'After',empty:'No saved runs yet. Run an audit with --history from the CLI.',
    note:'Available details depend on the history version. Pending checks need human review. Automated results do not certify WCAG conformance.',
    run:'Run details',url:'Page',status:'Status',findings:'Observed findings',rule:'Rule',selector:'Selector',back:'Back to history',previous:'Previous',next:'Next',date:'UTC date and identifier',
    succeeded:'Audited',failed:'Failed',cancelled:'Cancelled',added:'Added',resolved:'Not observed again',persistent:'Persistent',incomparable:'Incomparable pages',comparable:'Comparable pages',
    result:'Run comparison',review:'Not observing a finding at the same selector does not prove it was fixed: DOM changes can change its identity. Review results manually.',
    reason:'Reason',none:'No automated findings observed in this evidence.',unavailable:'No completed audit evidence is available for this page.',error:'Unable to open this view. Check records and permissions from the CLI.',notfound:'View or record not found.',summary:'Summary',identified:'Findings are identified by page, rule and selector.',
    reasons:{'viewport-changed':'Viewport changed','scope-changed':'Scope changed','policy-changed':'Policy changed','page-not-audited':'Page was not fully audited','destination-changed':'Destination changed','engine-unknown':'Unknown engine','engine-changed':'Engine changed','network-policy-unknown':'Unknown network policy','network-policy-changed':'Network policy version changed'}}
};
function escape(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
const css = `:root{font-family:system-ui,sans-serif;color:#172638;background:#f2f5f9;color-scheme:light}*{box-sizing:border-box}body{margin:0}header{background:#132b43;color:white;padding:2rem max(1rem,calc((100% - 1120px)/2))}header p{color:#d7e4ef}main{max-width:1120px;margin:auto;padding:1.5rem 1rem 3rem}a{color:#0757a6}header a{color:#fff}a:hover{text-decoration-thickness:3px}:focus-visible{outline:3px solid #b74700;outline-offset:4px}.skip{position:absolute;left:1rem;top:-100px;background:white;color:#172638;padding:1rem}.skip:focus{top:1rem}.panel,details{background:white;border:1px solid #b8c7d6;border-radius:12px;padding:1rem;margin:1rem 0}.notice{border-left:5px solid #0757a6;background:#e6eff8;padding:1rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem}.metric{background:white;border:1px solid #b8c7d6;border-radius:12px;padding:1rem}.metric strong{display:block;font-size:2rem}h1{font-size:clamp(1.8rem,5vw,2.6rem);margin:.5rem 0}.grid>*{min-width:0}h1,h2,h3{overflow-wrap:anywhere}h2{font-size:1.4rem}h3{font-size:1.1rem}.scroll{overflow-x:auto}.trend-table{min-width:700px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{text-align:left;border-bottom:1px solid #c6d1dc;padding:.8rem;overflow-wrap:anywhere;vertical-align:top}caption{text-align:left;font-weight:bold;padding:.6rem}code{white-space:pre-wrap;overflow-wrap:anywhere}p,li,summary{overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}label{display:block;font-weight:600;margin:.5rem 0}input:not([type=hidden]),select,button{font:inherit;padding:.7rem;border:1px solid #63788b;border-radius:6px;max-width:100%;min-width:0}input:not([type=hidden]),select{width:100%}button{background:#0757a6;color:white;cursor:pointer;margin-top:1rem}nav{display:flex;gap:1.2rem;flex-wrap:wrap;margin:1rem 0}.muted{color:#45596b}.run-id{font-size:.85rem}ul{padding-left:1.4rem}@media(max-width:550px){.projects-grid{grid-template-columns:1fr}th,td{padding:.5rem;font-size:.9rem}main{padding:1rem}.panel,details{padding:.75rem}}`;

function shell(project, t, lang, base, title, body, nonce) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · AccessPilot AI</title><style nonce="${nonce}">${css}</style></head><body><a class="skip" href="#main">${escape(t.summary)}</a><header><p>AccessPilot AI</p><h1>${escape(title)}</h1><p>${escape(project.name)} · ${escape(t.intro)}</p><nav aria-label="Language"><a href="${base}?lang=es" lang="es">Español</a><a href="${base}?lang=en" lang="en">English</a></nav></header><main id="main" tabindex="-1"><p class="notice">${escape(t.note)}</p>${body}</main></body></html>`;
}
function findingList(findings, t) {
  const truncated = t===copy.es ? 'Vista limitada a 50 incidencias por grupo y 512 caracteres por selector. Descarga la evidencia JSON para consultar todos los datos.' : 'View limited to 50 findings per group and 512 characters per selector. Download JSON evidence for complete data.';
  return findings.length ? `<p>${escape(truncated)}</p><ul>${findings.slice(0,50).map(f=>`<li><strong>${escape(f.rule)}</strong> · <code>${escape(JSON.stringify(f.target).slice(0,512))}</code></li>`).join('')}</ul>` : `<p>${escape(t.none)}</p>`;
}
function query(base, lang, values={}) { return `${base}?${new URLSearchParams({lang,...values})}`; }
function comparisonView(result,t) {
  return `<p>${escape(t.review)}</p><h2>${escape(t.summary)}</h2><div class="grid">${Object.entries(result.totals).map(([key,n])=>`<div class="metric"><strong>${n}</strong>${escape(t[{comparablePages:'comparable',incomparablePages:'incomparable'}[key]??key])}</div>`).join('')}</div>${result.pages.map(page=>`<details><summary>${escape(page.url)} ${escape(viewportLabel(page.viewport))}</summary>${page.status==='incomparable' ? `<p>${escape(t.reason)}: ${escape(t.reasons[page.reason]??page.reason)}</p>` : ['added','resolved','persistent'].map(key=>`<h3>${escape(t[key])}</h3>${findingList(page[key],t)}`).join('')}</details>`).join('')}`;
}


export { copy, escape, shell, query, comparisonView };

function recordLabel(id) {
  return `${id.slice(0,10)} ${id.slice(11,19).replaceAll('-',':')} UTC · ${id.slice(25,33)}`;
}
export function historyView(ids, offset, page, t, base, lang, {filters={},total=ids.length,latest=ids[0]}={}) {
  const form=filterForm(base,lang,filters,true);
  if(!ids.length) return form+`<p class="panel">${escape(total===0?t.empty:(lang==='es'?'No hay ejecuciones que coincidan con los filtros.':'No runs match these filters.'))}</p>`;
  const params=Object.fromEntries(Object.entries(filters).filter(([,value])=>value));
  const visible=ids.slice(offset,offset+50);
  const compareLatest=lang==='es'?'Comparar con la última':'Compare with latest';
  const rows=visible.map(id=>`<tr>
    <td class="run-id">${escape(recordLabel(id))}</td>
    <td><a href="${escape(query(base,lang,{run:id}))}">${escape(t.open)}</a></td>
    <td><a href="${escape(query(base,lang,{before:id,after:latest}))}">${escape(compareLatest)}</a></td>
  </tr>`).join('');
  const options=selected=>visible.map((id,i)=>`<option value="${id}"${i===selected?' selected':''}>${escape(recordLabel(id))}</option>`).join('');
  return `${form}<p>${ids.length} / ${total} · ${escape(t.history)}</p>
    <section class="panel"><table><caption>${escape(t.history)}</caption>
      <thead><tr><th scope="col">${escape(t.date)}</th><th scope="col">${escape(t.open)}</th><th scope="col">${escape(t.compare)}</th></tr></thead>
      <tbody>${rows}</tbody></table></section>
    <nav aria-label="${escape(t.history)}">
      ${offset>0?`<a href="${escape(query(base,lang,{...params,page:String(Number(page)-1)}))}">${escape(t.previous)}</a>`:''}
      ${offset+50<ids.length?`<a href="${escape(query(base,lang,{...params,page:String(Number(page??1)+1)}))}">${escape(t.next)}</a>`:''}
    </nav>
    <section class="panel"><h2>${escape(t.compare)}</h2><p>${escape(t.identified)}</p>
      <form method="get" action="${base}"><input type="hidden" name="lang" value="${lang}">
        <label for="before">${escape(t.before)}</label><select id="before" name="before">${options(1)}</select>
        <label for="after">${escape(t.after)}</label><select id="after" name="after">${options(0)}</select>
        <button type="submit">${escape(t.compare)}</button>
      </form>
    </section>`;
}

function filterForm(base, lang, {q='',from='',to=''}, history) {
  const es=lang==='es';
  return `<section class="panel"><h2>${es?'Buscar y filtrar':'Search and filter'}</h2>
    <form action="${base}" method="get"><input type="hidden" name="lang" value="${lang}">
      <label for="q">${history?(es?'Fecha o identificador de ejecución':'Run date or identifier'):(es?'Nombre o URL del proyecto':'Project name or URL')}</label>
      <input type="search" id="q" name="q" maxlength="100" value="${escape(q)}">
      ${history?`<div class="grid"><div><label for="from">${es?'Desde (UTC)':'From (UTC)'}</label><input type="date" id="from" name="from" value="${escape(from)}"></div>
      <div><label for="to">${es?'Hasta (UTC)':'To (UTC)'}</label><input type="date" id="to" name="to" value="${escape(to)}"></div></div>`:''}
      <button type="submit">${es?'Aplicar filtros':'Apply filters'}</button>
      <a href="${escape(query(base,lang))}">${es?'Limpiar filtros':'Clear filters'}</a>
    </form></section>`;
}

export function dashboardView(cards, search, lang, base) {
  const es=lang==='es';
  const panels=cards.map(({project,key,ids,error})=>`<section class="panel">
    <h2>${escape(project.name)}</h2><p class="muted">${es?'URLs configuradas':'Configured URLs'}: ${project.urls.length}</p>
    ${error?`<p>${es?'Historial no disponible. Revísalo desde la CLI.':'History unavailable. Check it using the CLI.'}</p>`:
      `<p>${ids.length} ${es?'ejecuciones guardadas':'saved runs'}</p><p>${es?'Última ejecución':'Latest run'}: ${ids[0]?escape(recordLabel(ids[0])):(es?'Sin ejecuciones':'No runs yet')}</p>`}
    <a href="${escape(query(base+key+'/',lang))}">${es?'Abrir historial':'Open history'}</a>
  </section>`).join('');
  return `${filterForm(base,lang,{q:search},false)}<p>${cards.length} ${es?'proyectos':'projects'}</p><div class="grid projects-grid">${panels||`<p>${es?'No hay proyectos que coincidan.':'No projects match.'}</p>`}</div>`;
}

