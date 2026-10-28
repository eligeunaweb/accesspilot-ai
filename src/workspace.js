import { validateProject, readConfiguration } from './project.js';
import { languageCode } from './i18n.js';

export function validateWorkspace(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Workspace must be an object');
  for(const key of Object.keys(input)) if(!['schemaVersion','name','language','projects'].includes(key)) throw new Error(`Unknown workspace property: ${key}`);
  if(input.schemaVersion!==1) throw new Error('Workspace schemaVersion must be 1');
  if(typeof input.name!=='string' || !input.name.trim() || input.name.length>120 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('Workspace name must contain 1–120 printable characters');
  if(!Array.isArray(input.projects) || input.projects.length<1 || input.projects.length>20) throw new Error('Workspace must contain 1–20 inline projects');
  const projects=input.projects.map(validateProject);
  if(new Set(projects.map(project=>project.name)).size!==projects.length) throw new Error('Workspace project names must be unique');
  return {schemaVersion:1,name:input.name.trim(),language:languageCode(input.language),projects};
}
export async function loadWorkspace(path) {
  return validateWorkspace(await readConfiguration(path,'Workspace'));
}
