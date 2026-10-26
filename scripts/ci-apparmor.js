import { readdir, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildProfile(binaries, cacheRoot) {
  if(!binaries.length) throw new Error('No installed Chromium executables found');
  return 'abi <abi/4.0>,\ninclude <tunables/global>\n\n'+binaries.map((file,index)=>{
    const relative=posix.relative(cacheRoot,file);
    if(!posix.isAbsolute(file)||!relative||relative.startsWith('..')||posix.isAbsolute(relative)||!/^[a-zA-Z0-9_/.-]+$/.test(file)) throw new Error('Unsafe Chromium profile path');
    if(!['chrome','chrome-headless-shell'].includes(posix.basename(file))) throw new Error('Unexpected Chromium executable');
    return `profile accesspilot-playwright-${index} "${file}" flags=(unconfined) {\n  userns,\n}\n`;
  }).join('\n');
}
async function findBinaries(directory, depth = 0) {
  const found=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=join(directory,entry.name);
    if(entry.isDirectory()&&depth<3) found.push(...await findBinaries(file,depth+1));
    else if(entry.isFile()&&['chrome','chrome-headless-shell'].includes(entry.name)) found.push(await realpath(file));
  }
  return found.sort();
}
async function main() {
  if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||!process.env.RUNNER_TEMP) throw new Error('This policy generator is for Linux GitHub-hosted CI only');
  const root=await realpath(join(homedir(),'.cache','ms-playwright'));
  const binaries=await findBinaries(root);
  const profile=buildProfile(binaries,root);
  await writeFile(join(process.env.RUNNER_TEMP,'accesspilot-playwright-userns'),profile,'utf8');
  console.log(`Generated exact-path user namespace policy for ${binaries.length} installed Chromium executables. No global AppArmor setting changed.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=2;});
}
