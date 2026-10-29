import {open,readFile,stat,unlink,mkdir,rmdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function processAlive(pid){
 if(!Number.isSafeInteger(pid)||pid<2)return false;
 try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}
}
async function recoverStale(path){
 // Serialize stale-file removal, so two launchers cannot unlink each other's new lock.
 const guard=path+'.recovery';try{await mkdir(guard,{mode:0o700});}catch(e){if(e.code==='EEXIST')return;throw e;}
 try{
  let owner;try{owner=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return;}
  if(owner&&processAlive(owner.pid))return;
  const info=await stat(path).catch(()=>null);if(!info)return;
  if(!owner&&Date.now()-info.mtimeMs<10000)return;
  await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }finally{await rmdir(guard).catch(()=>{});}
}
export async function acquireLaunchLock(path,{timeoutMs=0,identity={}}={}){
 const deadline=Date.now()+timeoutMs,token=randomUUID();
 for(;;){
  let handle;
  try{
   handle=await open(path,'wx',0o600);await handle.writeFile(JSON.stringify({...identity,pid:process.pid,token}));await handle.close();
   return async()=>{let owner;try{owner=JSON.parse(await readFile(path,'utf8'));}catch{return;}if(owner.pid===process.pid&&owner.token===token)await unlink(path).catch(()=>{});};
  }catch(e){if(handle)await handle.close().catch(()=>{});if(e.code!=='EEXIST')throw e;}
  await recoverStale(path);
  // One immediate retry allows a dead owner's lock to recover without waiting.
  try{await stat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(Date.now()>=deadline)throw Error('This studio is already starting or running. Wait a moment and reopen it. If this persists, check its runtime log and lock files.');
  await delay(40);
 }
}
