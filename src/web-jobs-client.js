// Served as a fixed same-origin asset. Credentials and receipts live only in this closure.
(() => {
  'use strict';
  const language=document.documentElement.lang;
  const strings={
    es:{connected:'Sesión conectada',disconnected:'Sin conexión',error:'No se pudo completar la solicitud. Comprueba la conexión y vuelve a intentarlo.',pairError:'No se pudo conectar. Solicita un código nuevo al operador.',expired:'La sesión ya no está disponible. Solicita un código nuevo.',start:'Iniciar auditoría',retry:'Reintentar creación',cancel:'Cancelar auditoría',refresh:'Actualizar estado',created:'Trabajo admitido. Su estado se actualizará automáticamente.',cancelled:'Cancelación solicitada; se espera la limpieza del trabajo.',states:{requested:'Pendiente',running:'En ejecución',cancelling:'Cancelando: limpieza pendiente',succeeded:'Completada',failed:'Fallida',cancelled:'Cancelada',interrupted:'Interrumpida: requiere revisión del operador'}},
    en:{connected:'Session connected',disconnected:'Disconnected',error:'The request could not be completed. Check the connection and try again.',pairError:'Could not connect. Ask the operator for a new code.',expired:'This session is no longer available. Ask for a new code.',start:'Start audit',retry:'Retry creation',cancel:'Cancel audit',refresh:'Refresh status',created:'Job admitted. Its state will update automatically.',cancelled:'Cancellation requested; waiting for job cleanup.',states:{requested:'Queued',running:'Running',cancelling:'Cancelling: cleanup pending',succeeded:'Completed',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted: operator review required'}}
  };
  const c=strings[language],byId=id=>document.getElementById(id),jobs=new Map(),terminal=new Set(['succeeded','failed','cancelled','interrupted']);
  let credentials=null,projects=new Map(),pendingCommand=null,busy=false,epoch=0,pollTimer,cursor=0;
  const message=text=>byId('message').textContent=text;
  function controls(){byId('start').disabled=busy;byId('project').disabled=busy||Boolean(pendingCommand);byId('disconnect').disabled=busy;byId('start').textContent=pendingCommand?c.retry:c.start;}
  function reset(text) {
    epoch++;clearTimeout(pollTimer);credentials=null;projects.clear();jobs.clear();pendingCommand=null;
    byId('jobs').replaceChildren();byId('project').replaceChildren();byId('audit-controls').hidden=true;
    byId('connect-form').hidden=false;byId('disconnect').hidden=true;byId('connection').textContent=c.disconnected;message(text);controls();
  }
  async function api(path,body,session=credentials) {
    const headers=body===undefined?{}:{'Content-Type':'application/json'};
    if(session){headers.Authorization='Bearer '+session.token;if(body!==undefined)headers['X-AccessPilot-CSRF']=session.csrf;}
    const response=await fetch(path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',mode:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Object.assign(new Error('Request rejected'),{status:response.status});
    return response.json();
  }
  function failed(error,version){if(version!==epoch)return;if(error.status===403)reset(c.expired);else message(c.error);}
  function receive(receipt,expectedId) {
    if(!receipt||!projects.has(receipt.projectId)||!Object.hasOwn(c.states,receipt.state)||typeof receipt.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(receipt.id)||expectedId&&receipt.id!==expectedId)throw new Error('Invalid receipt');
    let item=jobs.get(receipt.id);
    if(item&&(terminal.has(item.receipt.state)||item.receipt.state==='cancelling'&&['requested','running'].includes(receipt.state)||item.receipt.state==='running'&&receipt.state==='requested'))return;
    if(!item) {
      const node=document.createElement('li'),title=document.createElement('h3'),id=document.createElement('p'),state=document.createElement('p'),cancel=document.createElement('button'),refresh=document.createElement('button');
      title.textContent=projects.get(receipt.projectId);id.textContent=receipt.id;state.setAttribute('role','status');
      cancel.type=refresh.type='button';cancel.textContent=c.cancel;refresh.textContent=c.refresh;refresh.className='secondary';
      cancel.setAttribute('aria-label',c.cancel+' '+receipt.id);refresh.setAttribute('aria-label',c.refresh+' '+receipt.id);
      node.append(title,id,state,cancel,refresh);byId('jobs').prepend(node);item={receipt,state,cancel,refresh};jobs.set(receipt.id,item);
      cancel.addEventListener('click',async()=>{
        const version=epoch;cancel.disabled=true;
        try{const result=await api('/api/v1/cancellations',{schemaVersion:1,jobId:receipt.id});if(version===epoch){receive(result,receipt.id);message(c.cancelled);}}
        catch(error){failed(error,version);}finally{if(version===epoch)cancel.disabled=terminal.has(item.receipt.state)||item.receipt.state==='cancelling';}
      });
      refresh.addEventListener('click',()=>refreshJob(item));
    }
    item.receipt=receipt;item.state.textContent=c.states[receipt.state];item.cancel.disabled=terminal.has(receipt.state)||receipt.state==='cancelling';
    byId('empty').hidden=true;
  }
  async function refreshJob(item) {
    if(item.refresh.disabled||!credentials)return;const version=epoch;item.refresh.disabled=true;
    try{const receipt=await api('/api/v1/jobs/'+item.receipt.id);if(version===epoch)receive(receipt,item.receipt.id);}
    catch(error){failed(error,version);}finally{item.refresh.disabled=false;}
  }
  async function poll() {
    const version=epoch;
    if(!credentials)return;
    const active=[...jobs.values()].filter(item=>!terminal.has(item.receipt.state));
    if(active.length&&!busy)await refreshJob(active[cursor++%active.length]);
    if(version===epoch&&credentials)pollTimer=setTimeout(poll,2000);
  }
  byId('connect-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;const pairingCode=byId('pairing-code').value;byId('pairing-code').value='';
    try {
      const session=await api('/api/v1/session',{schemaVersion:1,pairingCode},null);
      if(!/^[a-f0-9]{64}$/.test(session.token)||!/^[a-f0-9]{64}$/.test(session.csrf)||!Array.isArray(session.projects)||!session.projects.length||session.projects.length>20)throw new Error('Invalid session');
      epoch++;credentials={token:session.token,csrf:session.csrf};projects=new Map(session.projects.map(project=>[project.id,project.name]));
      for(const [id,name] of projects){const option=document.createElement('option');option.value=id;option.textContent=name;byId('project').append(option);}
      byId('connect-form').hidden=true;byId('disconnect').hidden=false;byId('audit-controls').hidden=false;byId('empty').hidden=false;
      byId('connection').textContent=c.connected;message('');controls();pollTimer=setTimeout(poll,2000);byId('project').focus();
    } catch{reset(c.pairError);}finally{button.disabled=false;}
  });
  byId('audit-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!credentials)return;const version=epoch;busy=true;
    pendingCommand??={schemaVersion:1,projectId:byId('project').value,requestId:crypto.randomUUID()};controls();
    try{const receipt=await api('/api/v1/jobs',pendingCommand);if(version===epoch){receive(receipt);pendingCommand=null;message(c.created);}}
    catch(error){failed(error,version);}finally{busy=false;controls();}
  });
  byId('disconnect').addEventListener('click',async()=>{
    if(busy||!credentials)return;busy=true;controls();const version=epoch;
    try{await api('/api/v1/session/revoke',{schemaVersion:1});if(version===epoch)reset('');}
    catch(error){failed(error,version);}finally{busy=false;controls();}
  });
})();
