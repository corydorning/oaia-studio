import {join} from 'node:path';
import {writeFile,unlink,realpath} from 'node:fs/promises';
import {createStudio} from '../src/server.mjs';
import {listenAvailable,writeJson,readJson,savePort} from '../src/instances.mjs';
import {acquireLaunchLock} from './launch-lock.mjs';

process.umask(0o077);
let server,release,releaseData,record,ready=false,canceled=false;
let failureMessage='This studio could not start. Check its runtime log, folder permissions, and any existing server lock.';
async function cleanup(){
 if(record){const file=join(record.runtimeDir,'running.json'),current=await readJson(file).catch(()=>null);if(current?.runId===record.runId){await unlink(file).catch(()=>{});await unlink(join(record.runtimeDir,'server.pid')).catch(()=>{});}}
 if(releaseData){const unlock=releaseData;releaseData=null;await unlock();}
 if(release){const unlock=release;release=null;await unlock();}
}
async function start(config){
 try{
  record=config;
  release=await acquireLaunchLock(join(config.runtimeDir,'server.lock'));
  if(canceled){await cleanup();return;}
  failureMessage='This image folder is already open in another studio. Stop it from its original app folder before opening this copy.';
  releaseData=await acquireLaunchLock(join(await realpath(config.dataDir),'.studio-server.lock'),{identity:{instanceId:config.instanceId,workspaceId:config.workspaceId,studioId:config.id}});
  failureMessage='This studio could not start. Check its runtime log, folder permissions, and available ports.';
  const studio={id:config.id,name:config.name,instanceId:config.instanceId,workspaceId:config.workspaceId,runId:config.runId};
  server=await createStudio({dataDir:config.dataDir,studio,controlToken:config.controlToken,accountFile:config.accountFile});
  server.once('close',cleanup);
  if(canceled){await cleanup();return;}
  const port=await listenAvailable(server,config.port);
  if(canceled){server.close();return;}
  const running={...studio,pid:process.pid,port,controlToken:config.controlToken};
  await writeJson(join(config.runtimeDir,'running.json'),running);
  await writeFile(join(config.runtimeDir,'server.pid'),String(process.pid),{mode:0o600});
  await savePort(config,port);
  ready=true;console.log(`${config.name} is ready at http://127.0.0.1:${port}`);
  process.send?.({ready:true});if(process.connected)process.disconnect();
 }catch{
  console.error(failureMessage);
  process.send?.({error:failureMessage});
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  await cleanup();if(process.connected)process.disconnect();process.exitCode=1;
 }
}
process.on('message',message=>{
 if(message?.type==='start'&&!record)void start(message.config);
 else if(message?.type==='cancel'&&!ready){canceled=true;if(server?.listening)server.close();}
});
process.on('disconnect',()=>{if(!ready){canceled=true;if(server?.listening)server.close();}});
// This entrypoint is private to the manager; don't leave a standalone idle process.
if(!process.connected){console.error('Open a studio with Open OAIA Studio.command or Manage OAIA Studios.command.');process.exitCode=1;}
