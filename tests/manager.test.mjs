import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {StudioManager} from '../scripts/studios.mjs';

async function fixture(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'studio-manager-'));
 const manager=new StudioManager({runtimeRoot:join(dir,'runtime'),dataRoot:join(dir,'images'),preferredPort:0,...options});
 t.after(async()=>{for(const row of await manager.list())if(row.running)await manager.stop(row.id);await rm(dir,{recursive:true,force:true});});
 return {dir,manager};
}
test('simultaneous same-name launchers reopen one server and another studio gets its own server',async t=>{
 const {manager}=await fixture(t);
 const [one,again]=await Promise.all([manager.ensure('First'),manager.ensure('first')]);
 assert.equal(one.pid,again.pid);assert.equal(one.url,again.url);assert.equal((await manager.ensure('FIRST')).pid,one.pid);
 const two=await manager.ensure('Second');assert.notEqual(one.pid,two.pid);assert.notEqual(one.port,two.port);
 assert.equal((await manager.list()).filter(s=>s.running).length,2);
 await manager.stop('first');assert.equal((await manager.status('first')).running,false);
 assert.equal((await(await fetch(two.url+'/health')).json()).studio.id,'second');
 const restarted=await manager.restart('Second');assert.notEqual(restarted.pid,two.pid);assert.equal(restarted.port,two.port);
});
test('unrelated listener survives a preferred-port collision and is never adopted as a studio',async t=>{
 let posts=0;const other=http.createServer((req,res)=>{if(req.method==='POST')posts++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'local-image-studio',ok:true,studio:{id:'photos'}}));});
 await new Promise(r=>other.listen(0,'0.0.0.0',r));t.after(()=>new Promise(r=>other.close(r)));
 const occupied=other.address().port,{manager}=await fixture(t,{preferredPort:occupied});
 const studio=await manager.ensure('photos');assert.notEqual(studio.port,occupied);await manager.stop('photos');
 assert.equal((await fetch(`http://127.0.0.1:${occupied}/health`)).status,200);assert.equal(posts,0);
});
test('two different studios racing for the same port claim different sockets',async t=>{
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'0.0.0.0',r));const preferredPort=reserve.address().port;await new Promise(r=>reserve.close(r));
 const {manager}=await fixture(t,{preferredPort});const [a,b]=await Promise.all([manager.ensure('alpha'),manager.ensure('beta')]);
 assert.notEqual(a.port,b.port);assert.equal([a.port,b.port].filter(p=>p===preferredPort).length,1);
 for(const studio of [a,b])assert.equal((await(await fetch(studio.url+'/health')).json()).studio.id,studio.id);
});
test('a mismatched run descriptor cannot stop or adopt another server',async t=>{
 const {dir,manager}=await fixture(t);const a=await manager.ensure('one'),b=await manager.ensure('two');
 const path=join(dir,'runtime/studios/one/running.json'),original=await readFile(path,'utf8');
 try{
  const wrong=JSON.parse(original);wrong.port=b.port;await writeFile(path,JSON.stringify(wrong));
  await assert.rejects(manager.stop('one'),/identity|match/i);await assert.rejects(manager.ensure('one'),/identity|match/i);
  assert.equal((await fetch(a.url+'/health')).status,200);assert.equal((await fetch(b.url+'/health')).status,200);
 }finally{await writeFile(path,original);}
});
for(const relative of [false,true])test(`a live legacy Default process (${relative?'relative':'absolute'} command) blocks duplicate startup without being signaled`,async t=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-legacy-'));await mkdir(join(dir,'src'));await mkdir(join(dir,'runtime'));
 const script=join(dir,'src/server.mjs');await writeFile(script,'setInterval(()=>{},1000);');
 const child=spawn(process.execPath,[relative?'src/server.mjs':script],{cwd:dir,stdio:'ignore'});await new Promise((r,j)=>{child.once('spawn',r);child.once('error',j);});
 t.after(async()=>{child.kill();await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});});
 await writeFile(join(dir,'runtime/server.pid'),String(child.pid));
 const manager=new StudioManager({root:dir,runtimeRoot:join(dir,'runtime'),dataRoot:join(dir,'images'),preferredPort:0});
 await assert.rejects(manager.ensure(),/older|previous version/i);assert.doesNotThrow(()=>process.kill(child.pid,0));
 await assert.rejects(manager.stop(),/older|previous version/i);assert.doesNotThrow(()=>process.kill(child.pid,0));
});
test('failed child startup releases its launch lock and does not publish a false running server',async t=>{
 const root=await mkdtemp(join(tmpdir(),'studio-broken-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'scripts'));await writeFile(join(root,'scripts/serve.mjs'),'process.exit(1);');
 const {manager}=await fixture(t,{root});
 await assert.rejects(manager.ensure('broken'),/could not start/i);assert.equal((await manager.status('broken')).running,false);
 await assert.rejects(manager.ensure('broken'),/could not start/i);
});

test('separate app registries cannot open the same history or change its live job record',async t=>{
 const {dir,manager:first}=await fixture(t),owner=await first.ensure('shared');
 const {manager:second}=await fixture(t,{dataRoot:join(dir,'images')});
 const jobId=randomUUID(),jobDir=join(owner.dataDir,jobId);await mkdir(jobDir);
 const original=JSON.stringify({id:jobId,status:'running',prompt:'a pending image'});await writeFile(join(jobDir,'settings.json'),original);
 await assert.rejects(second.ensure('shared'),/image folder.*already|already.*image folder/i);
 assert.equal(await readFile(join(jobDir,'settings.json'),'utf8'),original);
 assert.equal((await(await fetch(owner.url+'/health')).json()).studio.id,'shared');
 assert.equal((await first.status('shared')).pid,owner.pid);
});
