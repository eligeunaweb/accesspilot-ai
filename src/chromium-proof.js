// Only the browser-owned chrome://sandbox page is accepted, before audit traffic.
export function requireChromiumSandbox(text) {
  if(typeof text!=='string'||text.length>8000)throw new Error('Invalid Chromium sandbox status');
  const rows=new Map();
  for(const line of text.split(/\r?\n/)) {
    const pair=line.split('\t');if(pair.length!==2)continue;
    const key=pair[0].trim(),value=pair[1].trim();if(rows.has(key))throw new Error('Duplicate Chromium sandbox status');rows.set(key,value);
  }
  const required={'Layer 1 Sandbox':'Namespace','PID namespaces':'Yes','Network namespaces':'Yes','Seccomp-BPF sandbox':'Yes','Seccomp-BPF sandbox supports TSYNC':'Yes'};
  for(const [key,value] of Object.entries(required))if(rows.get(key)!==value)throw new Error('Required Chromium sandbox status missing: '+key);
  return {namespace:true,pidNamespace:true,networkNamespace:true,seccomp:true,tsync:true};
}
