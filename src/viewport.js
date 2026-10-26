export function validateViewport(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('Viewport must be an object');
  for(const key of Object.keys(input)) if(!['name','width','height'].includes(key)) throw new Error(`Unknown viewport property: ${key}`);
  if(typeof input.name!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(input.name)) throw new Error('Viewport name must be 1–32 lowercase letters, digits or hyphens, starting with a letter');
  if(!Number.isInteger(input.width)||input.width<240||input.width>3840||!Number.isInteger(input.height)||input.height<240||input.height>2160) throw new Error('Viewport width must be 240–3840 and height 240–2160 integer CSS pixels');
  return {name:input.name,width:input.width,height:input.height};
}
export function validateViewports(input) {
  if(!Array.isArray(input)||input.length<1||input.length>4) throw new Error('viewports must contain 1–4 profiles');
  const profiles=input.map(validateViewport);
  if(new Set(profiles.map(p=>p.name)).size!==profiles.length) throw new Error('Viewport names must be unique');
  if(new Set(profiles.map(p=>`${p.width}x${p.height}`)).size!==profiles.length) throw new Error('Viewport dimensions must be distinct');
  return profiles;
}
export const pageKey=page=>JSON.stringify([page.url,page.viewport?.name??null]);
export const viewportLabel=viewport=>viewport?`${viewport.name} (${viewport.width} × ${viewport.height})`:'';
export const sameViewport=(a,b)=>a?.name===b?.name&&a?.width===b?.width&&a?.height===b?.height;
