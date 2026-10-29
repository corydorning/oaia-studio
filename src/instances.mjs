import {mkdir,lstat,readFile,writeFile,rename,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {ROOT,DATA_DIR} from './config.mjs';

export function studioId(name='default'){
 if(typeof name!=='string'||!name.trim()||name.length>48||!/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(name))throw Error('Use a studio name of 1–48 letters, numbers, spaces or hyphens, starting with a letter or number.');
 return name.trim().toLowerCase().replace(/[ -]+/g,'-').replace(/-$/,'');
}
export async function privateDirectory(path,boundary=path){
 await mkdir(path,{recursive:true,mode:0o700});
 // Never let a studio-specific path redirect writes into another folder.
 let current=resolve(path);
 while(true){const info=await lstat(current);if(info.isSymbolicLink())throw Error('Studio folders cannot use a symbolic link.');if(current===resolve(boundary))break;const parent=resolve(current,'..');if(parent===current)break;current=parent;}
}
export async function readJson(path){try{const info=await lstat(path);if(info.isSymbolicLink())throw Error('Studio state cannot use a symbolic link.');return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function writeJson(path,value){
 const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);
}
export async function loadStudio(name='default',{root=ROOT,runtimeRoot=join(ROOT,'.runtime'),dataRoot=DATA_DIR,preferredPort=8787}={}){
 const id=studioId(name),runtimeDir=join(resolve(runtimeRoot),'studios',id),dataDir=id==='default'?resolve(dataRoot):join(resolve(dataRoot),'Studios',id);
 await privateDirectory(runtimeDir,runtimeRoot);await privateDirectory(dataDir,dataRoot);
 const path=join(runtimeDir,'studio.json');
 let saved=await readJson(path);
 if(!saved){
  const initial={id,name:id==='default'?'Default':name.trim(),instanceId:randomUUID(),port:preferredPort};
  try{await writeFile(path,JSON.stringify(initial,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  saved=await readJson(path);
 }
 if(saved?.id!==id||typeof saved.instanceId!=='string'||!/^[a-f0-9-]{36}$/.test(saved.instanceId)||typeof saved.name!=='string'||studioId(saved.name)!==id||!Number.isInteger(saved.port)||saved.port<0||saved.port>65535)throw Error(`Saved settings for ${id} are invalid. Keep the image folder; repair its local studio registry before reopening.`);
 const workspaceId=createHash('sha256').update(await realpath(root)).update('\0').update(await realpath(runtimeRoot)).digest('hex');
 return {...saved,workspaceId,runtimeDir,dataDir};
}
export async function savePort(studio,port){await writeJson(join(studio.runtimeDir,'studio.json'),{id:studio.id,name:studio.name,instanceId:studio.instanceId,port});}
export async function listenAvailable(server,preferredPort,{host='0.0.0.0',attempts=100}={}){
 if(!Number.isInteger(preferredPort)||preferredPort<0||preferredPort>65535||(preferredPort>0&&preferredPort<1024))throw Error('Invalid preferred port.');
 for(let attempt=0;attempt<=attempts;attempt++){
  const port=attempt===attempts?0:preferredPort===0?0:((preferredPort+attempt-1024)%64512)+1024;
  try{
   await new Promise((resolve,reject)=>{const failed=e=>{server.off('listening',ready);reject(e);};const ready=()=>{server.off('error',failed);resolve();};server.once('error',failed);server.once('listening',ready);server.listen(port,host);});
   return server.address().port;
  }catch(e){if(e.code!=='EADDRINUSE')throw e;}
 }
 throw Error('No available port could be claimed.');
}
