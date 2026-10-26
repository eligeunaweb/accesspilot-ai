const keys=['Enter','Space','Escape','Tab','Shift+Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'];
function object(value,allowed) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))) throw new Error('Invalid journey definition');
}
function selector(value) {
  if(typeof value!=='string'||!value.trim()||value.length>500||/[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid journey selector');
  return value;
}
export function validateJourney(input) {
  object(input,['name','steps','readySelector']);
  if(typeof input.name!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(input.name)) throw new Error('Invalid journey name');
  if(!Array.isArray(input.steps)||input.steps.length>20) throw new Error('Journey steps must contain 0–20 actions');
  const steps=input.steps.map(step=>{
    object(step,step?.action==='press'?['action','selector','key']:step?.action==='waitFor'?['action','selector','state']:['action','selector']);
    if(!['click','press','waitFor'].includes(step.action)) throw new Error('Unsupported journey action');
    const result={action:step.action,selector:selector(step.selector)};
    if(step.action==='press') {if(!keys.includes(step.key)) throw new Error('Unsupported journey key');result.key=step.key;}
    if(step.action==='waitFor') {if(!['visible','hidden'].includes(step.state)) throw new Error('Unsupported journey wait state');result.state=step.state;}
    return result;
  });
  return {name:input.name,steps,readySelector:selector(input.readySelector)};
}
export function validateJourneys(input) {
  if(!Array.isArray(input)||input.length<1||input.length>10) throw new Error('journeys must contain 1–10 checkpoints');
  const result=input.map(validateJourney);
  if(new Set(result.map(journey=>journey.name)).size!==result.length) throw new Error('Journey names must be unique');
  return result;
}
export const sameJourney=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export const journeyLabel=journey=>journey?.name??'';

export async function runJourney(page,journey,{signal,timeoutMs=5000}={}) {
  for(let index=0;index<journey.steps.length;index++) {
    signal?.throwIfAborted();
    const step=journey.steps[index],locator=page.locator(step.selector);
    try {
      if(step.action==='click') await locator.click({timeout:Math.min(timeoutMs,5000)});
      else if(step.action==='press') await locator.press(step.key==='Space'?' ':step.key,{timeout:Math.min(timeoutMs,5000)});
      else await locator.waitFor({state:step.state,timeout:Math.min(timeoutMs,5000)});
    } catch {throw new Error(`Journey step ${index+1} failed`);}
  }
  signal?.throwIfAborted();
  try {await page.locator(journey.readySelector).waitFor({state:'visible',timeout:Math.min(timeoutMs,5000)});}
  catch {throw new Error('Journey checkpoint marker missing');}
}
