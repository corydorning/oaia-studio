import {spawn,execFileSync} from 'node:child_process';
import {openSync,closeSync,existsSync} from 'node:fs';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import {ROOT,DATA_DIR} from '../src/config.mjs';
import {studioId,loadStudio,readJson,privateDirectory} from '../src/instances.mjs';
import {resolvePython} from '../src/runtime.mjs';
import {acquireLaunchLock,processAlive,delay} from './launch-lock.mjs';

const visible=(studio,state=null)=>({id:studio.id,name:studio.name,dataDir:studio.dataDir,runtimeDir:studio.runtimeDir,running:!!state,port:state?.port??studio.port,url:state?`http://127.0.0.1:${state.port}`:null,pid:state?.pid??null,active:state?.active??null});
export class StudioManager{
 constructor({root=ROOT,runtimeRoot=join(root,'.runtime'),dataRoot=DATA_DIR,preferredPort=8787}={}){this.options={root:resolve(root),runtimeRoot:resolve(runtimeRoot),dataRoot:resolve(dataRoot),preferredPort};}
 async withLock(name,action){
  const id=studioId(name),dir=join(this.options.runtimeRoot,'studios',id);await privateDirectory(dir,this.options.runtimeRoot);
  const release=await acquireLaunchLock(join(dir,'launch.lock'),{timeoutMs:20000});
  try{const studio=await loadStudio(name,this.options);await this.rejectLegacy(studio);return await action(studio);}finally{await release();}
 }
 async rejectLegacy(studio){
  if(studio.id!=='default')return;
  let pid;try{pid=Number(await readFile(join(this.options.runtimeRoot,'server.pid'),'utf8'));}catch{return;}
  if(!processAlive(pid))return;
  let command='';try{command=execFileSync('/bin/ps',['-p',String(pid),'-o','command='],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}
  let legacy=command.includes(join(this.options.root,'src/server.mjs'));
  if(!legacy&&/(?:^|\s)(?:\.\/)?src\/server\.mjs(?:\s|$)/.test(command)){
   try{const details=execFileSync('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});const cwd=details.split('\n').find(line=>line.startsWith('n'))?.slice(1);legacy=!!cwd&&(await realpath(cwd))===(await realpath(this.options.root));}catch{}
  }
  if(legacy)throw Error('An older Default studio is still running. Finish its current image and close that previous version before opening the new Default studio. It was not stopped or duplicated.');
 }
 async running(studio){
  const state=await readJson(join(studio.runtimeDir,'running.json'));
  if(!state||!processAlive(state.pid))return null;
  if(state.id!==studio.id||state.instanceId!==studio.instanceId||state.workspaceId!==studio.workspaceId||!Number.isInteger(state.port)||state.port<1||state.port>65535||typeof state.controlToken!=='string')throw Error('The saved server identity does not match this studio. Nothing was opened or stopped.');
  let health;try{const response=await fetch(`http://127.0.0.1:${state.port}/health`,{signal:AbortSignal.timeout(1000),redirect:'error'});if(response.ok)health=await response.json();}catch{}
  if(!health)throw Error('This studio process is still running but is not responding. Nothing was stopped or duplicated. Check its runtime log.');
  if(health.app!=='local-image-studio'||['id','instanceId','workspaceId','runId'].some(key=>health.studio?.[key]!==state[key]))throw Error('The address belongs to a different server identity. Nothing was opened or stopped.');
  return {...state,active:health.active};
 }
 async ensure(name='default'){return this.withLock(name,studio=>this.start(studio));}
 async start(studio){
  const running=await this.running(studio);if(running)return visible(studio,running);
  const python=resolvePython(),log=openSync(join(studio.runtimeDir,'server.log'),'a',0o600);
  const child=spawn(process.execPath,[join(this.options.root,'scripts/serve.mjs')],{cwd:this.options.root,detached:true,env:{...process.env,LOCAL_IMAGE_STUDIO_PYTHON:python},stdio:['ignore',log,log,'ipc']});closeSync(log);
  const config={...studio,runId:randomUUID(),controlToken:randomBytes(32).toString('hex'),accountFile:studio.id==='default'?join(this.options.runtimeRoot,'account.json'):null};
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.send?.({type:'cancel'},()=>{});finish(Error('This studio could not start in time. Check its runtime log.'));},15000);
    const finish=error=>{clearTimeout(timer);child.off('error',failed);child.off('exit',exited);child.off('message',message);error?reject(error):resolve();};
    const failed=()=>finish(Error('This studio could not start. Check Node.js and the app folder.'));
    const exited=()=>finish(Error('This studio could not start. Check its runtime log.'));
    const message=value=>{if(value?.ready)finish();else if(value?.error)finish(Error(value.error));};
    child.once('error',failed);child.once('exit',exited);child.on('message',message);child.send({type:'start',config},error=>{if(error)failed();});
   });
  }finally{if(child.connected)child.disconnect();child.unref();}
  return visible(studio,await this.running(studio));
 }
 async status(name='default'){
  const studio=await loadStudio(name,this.options);await this.rejectLegacy(studio);return visible(studio,await this.running(studio));
 }
 async list(){
  let ids=[];try{ids=await readdir(join(this.options.runtimeRoot,'studios'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const rows=[];
  for(const id of ids.sort()){
   try{if(studioId(id)!==id)continue;const saved=await readJson(join(this.options.runtimeRoot,'studios',id,'studio.json'));if(!saved)continue;rows.push(await this.status(id));}
   catch(e){rows.push({id,name:id,running:false,error:e.message});}
  }
  return rows;
 }
 async stop(name='default'){return this.withLock(name,studio=>this.stopStudio(studio));}
 async stopStudio(studio){
  const state=await this.running(studio);if(!state)return visible(studio);
  const response=await fetch(`http://127.0.0.1:${state.port}/_studio/stop`,{method:'POST',headers:{'X-Studio-Control':state.controlToken},signal:AbortSignal.timeout(3000),redirect:'error'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'The studio could not stop safely.');
  for(let i=0;i<100;i++){const record=await readJson(join(studio.runtimeDir,'running.json'));if((!record||record.runId!==state.runId)&&!await readJson(join(studio.runtimeDir,'server.lock')))return visible(studio);await delay(50);}
  throw Error('The studio accepted the stop request but has not finished closing. Wait before reopening it.');
 }
 async restart(name='default'){return this.withLock(name,async studio=>{await this.stopStudio(studio);return this.start(studio);});}
}
export async function openBrowser(url){
 const brave=['/Applications/Brave Browser.app',join(homedir(),'Applications/Brave Browser.app')].find(existsSync);
 await new Promise((resolve,reject)=>{const child=spawn('/usr/bin/open',brave?['-a',brave,url]:[url],{stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('The browser could not open. Use the printed studio URL.')));});
}
