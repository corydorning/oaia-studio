import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {studioId,loadStudio,listenAvailable} from '../src/instances.mjs';

async function folders(t){const dir=await mkdtemp(join(tmpdir(),'studio-instances-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {root:dir,runtimeRoot:join(dir,'runtime'),dataRoot:join(dir,'images'),preferredPort:0};}
test('studio names are reusable folder-safe identities and reject traversal',()=>{
 assert.equal(studioId('Product Photos'),'product-photos');assert.equal(studioId('default'),'default');
 for(const name of ['','../outside','one/two','one\\two','..','x\nname','a'.repeat(49)])assert.throws(()=>studioId(name),/name/i);
});
test('Default preserves its image folder and named studios have stable isolated paths',async t=>{
 const opts=await folders(t),a=await loadStudio('default',opts),b=await loadStudio('Product Photos',opts),again=await loadStudio('product-photos',opts);
 assert.equal(a.dataDir,opts.dataRoot);assert.equal(b.dataDir,join(opts.dataRoot,'Studios','product-photos'));
 assert.equal(again.instanceId,b.instanceId);assert.notEqual(a.instanceId,b.instanceId);assert.notEqual(a.runtimeDir,b.runtimeDir);
 assert.equal(JSON.parse(await readFile(join(b.runtimeDir,'studio.json'),'utf8')).name,'Product Photos');
});
test('a symlink cannot redirect a studio runtime or image folder',async t=>{
 const opts=await folders(t),outside=join(opts.root,'outside');await mkdir(outside);
 await mkdir(join(opts.runtimeRoot,'studios'),{recursive:true});await symlink(outside,join(opts.runtimeRoot,'studios','redirect'));
 await assert.rejects(loadStudio('redirect',opts),/symbolic|symlink/i);
 await mkdir(join(opts.dataRoot,'Studios'),{recursive:true});await symlink(outside,join(opts.dataRoot,'Studios','photos'));
 await assert.rejects(loadStudio('photos',opts),/symbolic|symlink/i);
});
test('occupied ports are excluded by actual bind without contacting or stopping the listener',async t=>{
 let requests=0;const other=http.createServer((req,res)=>{requests++;res.end('other service');});await new Promise(r=>other.listen(0,'0.0.0.0',r));t.after(()=>new Promise(r=>other.close(r)));
 const studio=http.createServer((req,res)=>res.end('studio'));t.after(()=>new Promise(r=>studio.close(r)));
 const occupied=other.address().port,actual=await listenAvailable(studio,occupied);
 assert.notEqual(actual,occupied);assert.equal(requests,0);assert.equal(await(await fetch(`http://127.0.0.1:${occupied}`)).text(),'other service');
});
test('port fallback wraps above the reserved low ports',async t=>{
 const blocker=http.createServer();let listening=false;
 try{await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(65535,'0.0.0.0',resolve);});listening=true;}catch(e){if(e.code!=='EADDRINUSE')throw e;}
 t.after(()=>listening?new Promise(r=>blocker.close(r)):undefined);
 const server=http.createServer();t.after(()=>new Promise(r=>server.close(r)));
 const port=await listenAvailable(server,65535);assert.ok(port>=1024);assert.notEqual(port,65535);
});
