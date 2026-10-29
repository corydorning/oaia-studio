import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStudio} from '../src/server.mjs';
import {png} from './png-fixture.mjs';
const identity={id:'photos',name:'Product Photos',instanceId:'instance-a',workspaceId:'workspace-a',runId:'run-a'};
async function fixture(t,overrides={}){
 const dataDir=await mkdtemp(join(tmpdir(),'studio-lifecycle-'));
 const server=await createStudio({dataDir,studio:identity,controlToken:'test-control',accountFile:null,keyProvider:async()=> 'mock-key',statusProvider:async()=>false,...overrides});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dataDir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`,config=await(await fetch(base+'/api/config')).json();
 return {server,base,config,post:(path,body={},extra={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':config.csrfToken,...extra},body:JSON.stringify(body)})};
}
const request=()=>({submissionId:randomUUID(),prompt:'A test image',model:'gpt-image-2.5-flare',quality:'low',size:'1024x1024'});
test('health identifies the exact studio/workspace/run without exposing the management token',async t=>{
 const {base,config}=await fixture(t),health=await(await fetch(base+'/health')).json();
 assert.deepEqual(health.studio,identity);assert.equal(config.studio.name,'Product Photos');
 assert.ok(!JSON.stringify(config).includes('test-control'));assert.ok(!JSON.stringify(health).includes('test-control'));
});
test('stop refuses a submission awaiting its key and an active generation, then closes when idle',async t=>{
 let allowKey,allowImage;const keyWait=new Promise(r=>allowKey=r),imageWait=new Promise(r=>allowImage=r);
 const {base,post}=await fixture(t,{keyProvider:()=>keyWait,fetchImpl:()=>imageWait});
 const submission=post('/api/jobs',request());
 for(let i=0;i<100;i++){if((await(await fetch(base+'/health')).json()).active)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal((await post('/_studio/stop',{}, {'X-Studio-Control':'test-control'})).status,409);
 allowKey('mock-key');assert.equal((await submission).status,202);
 assert.equal((await post('/_studio/stop',{}, {'X-Studio-Control':'test-control'})).status,409);
 allowImage(new Response(JSON.stringify({data:[{b64_json:png(1024,1024).toString('base64')}]})));
 for(let i=0;i<100;i++){if(!(await(await fetch(base+'/health')).json()).active)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal((await post('/_studio/stop')).status,403);
 assert.equal((await post('/_studio/stop',{}, {'X-Studio-Control':'test-control'})).status,200);
});
test('two studios have independent histories and one-job generation queues',async t=>{
 let finish;const waiting=new Promise(r=>finish=r),a=await fixture(t,{fetchImpl:()=>waiting}),b=await fixture(t,{studio:{...identity,id:'second',instanceId:'instance-b'},fetchImpl:async()=>new Response(JSON.stringify({data:[{b64_json:png(1024,1024).toString('base64')}]}))});
 assert.equal((await a.post('/api/jobs',request())).status,202);
 const second=request();second.prompt='A different image';assert.equal((await a.post('/api/jobs',second)).status,409);
 assert.deepEqual(await(await fetch(b.base+'/api/jobs')).json(),[]);assert.equal((await b.post('/api/jobs',request())).status,202);
 finish(new Response(JSON.stringify({data:[{b64_json:png(1024,1024).toString('base64')}]})));
 for(const f of [a,b])for(let i=0;i<100;i++){if(!(await(await fetch(f.base+'/health')).json()).active)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal((await(await fetch(a.base+'/api/jobs')).json()).length,1);assert.equal((await(await fetch(b.base+'/api/jobs')).json()).length,1);
});
