import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateRequest, imageDimensions, generateOnce, JobStore} from '../src/generation.mjs';
import {png} from './png-fixture.mjs';

const input = (extra={}) => ({submissionId:randomUUID(),prompt:'A quiet lakeside scene',model:'gpt-image-2.5-flare',size:'3840x2160',quality:'low',...extra});
const ok = (bytes=png()) => new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens_details:{text_tokens:100,image_tokens:0},output_tokens:1000}}),{headers:{'x-request-id':'test-request'}});
const settle = async (store,id) => {for(let i=0;i<100;i++){const j=store.get(id);if(!['queued','running'].includes(j.status))return j;await new Promise(r=>setTimeout(r,5));}throw Error('job did not settle');};

test('4K in both orientations is accepted; malformed and oversized requests are rejected',()=>{
 assert.equal(validateRequest(input()).size,'3840x2160');
 assert.equal(validateRequest(input({size:'2160x3840'})).size,'2160x3840');
 for(const extra of [{size:'4096x2160'},{size:'1320x2868'},{model:'unknown'},{quality:'hd'},{prompt:''}])assert.throws(()=>validateRequest(input(extra)));
});
test('reads actual PNG dimensions and rejects non-PNG bytes',()=>{
 assert.deepEqual(imageDimensions(png(852,1846)),{width:852,height:1846});
 assert.throws(()=>imageDimensions(Buffer.from('not an image')));
});
test('one request preserves bytes and does not label a smaller output native 4K',async()=>{
 let calls=0;const bytes=png(852,1846);
 const result=await generateOnce(validateRequest(input()),'test-secret',async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).size,'3840x2160');assert.equal(JSON.parse(options.body).n,1);return ok(bytes);});
 assert.equal(calls,1);assert.deepEqual(result.bytes,bytes);assert.equal(result.matchesRequested,false);
});
test('network failure is never retried and does not disclose a secret',async()=>{
 let calls=0;await assert.rejects(generateOnce(validateRequest(input()),'test-secret',async()=>{calls++;throw Error('test-secret');}),e=>!e.message.includes('test-secret'));
 assert.equal(calls,1);
});
test('duplicate submissions share one durable job and cannot repeat a paid request after restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-test-'));let calls=0;
 const store=await JobStore.open({dataDir:dir,keyProvider:async()=> 'test-secret',fetchImpl:async()=>{calls++;return ok();}});
 const body=input();const a=await store.submit(body);const b=await store.submit(body);
 assert.equal(a.id,b.id);const done=await settle(store,a.id);assert.equal(done.status,'complete');assert.equal(calls,1);
 assert.deepEqual(await readFile(join(dir,a.id,'image.png')),png());
 const saved=JSON.parse(await readFile(join(dir,a.id,'settings.json'),'utf8'));assert.equal(saved.actual.width,3840);assert.equal(saved.upscaled,false);assert.equal(saved.prompt,body.prompt);
 assert.ok(!(JSON.stringify(saved)).includes('test-secret'));
 const reopened=await JobStore.open({dataDir:dir,keyProvider:async()=> 'test-secret',fetchImpl:async()=>{calls++;return ok();}});
 assert.equal((await reopened.submit(body)).id,a.id);assert.equal(calls,1);
});
test('reference upload uses edits and rejects disguised HTML',async()=>{
 const body=input({reference:{base64:png(1024,1024).toString('base64'),mime:'image/png'}});
 await generateOnce(validateRequest(body),'test-secret',async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/images/edits');assert.ok(JSON.parse(options.body).images[0].image_url.startsWith('data:image/png;base64,'));return ok();});
 assert.throws(()=>validateRequest(input({reference:{base64:Buffer.from('<html>').toString('base64'),mime:'image/png'}})));
});
test('a valid 5 MB base64 reference does not overflow the validator stack',()=>{
 const b=png(1024,1024,5*1024*1024);
 assert.doesNotThrow(()=>validateRequest(input({reference:{base64:b.toString('base64'),mime:'image/png'}})));
});
test('a truncated or corrupt PNG cannot be accepted as a completed image',()=>{
 assert.throws(()=>imageDimensions(png().subarray(0,33)));
 const broken=Buffer.from(png());broken[broken.length-1]^=1;assert.throws(()=>imageDimensions(broken));
});

test('custom native sizes pass through unchanged and unsupported dimensions fail before submission',()=>{
 for(const size of ['1328x2880','1600x2400','640x1024','3840x2160','2160x3840'])assert.equal(validateRequest(input({size})).size,size);
 for(const size of ['custom','1320x2868','3840x3840','512x512','1024x3840','3856x1024','0x1024','1e3x1024'])assert.throws(()=>validateRequest(input({size})),size);
});
test('all reference images reach one edit request in selection order and are saved individually',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-multiple-'));let calls=0,request;
 const first=png(128,128),second=png(256,128);
 const references=[{name:'scene.png',base64:first.toString('base64'),mime:'image/png'},{name:'tee.png',base64:second.toString('base64'),mime:'image/png'}];
 const store=await JobStore.open({dataDir:dir,keyProvider:async()=> 'test-secret',fetchImpl:async(url,options)=>{calls++;request={url,...JSON.parse(options.body)};return ok();}});
 const job=await store.submit(input({references,size:'1600x2400'}));await settle(store,job.id);
 assert.equal(calls,1);assert.equal(request.url,'https://api.openai.com/v1/images/edits');assert.equal(request.size,'1600x2400');
 assert.deepEqual(request.images.map(i=>i.image_url),references.map(r=>'data:image/png;base64,'+r.base64));
 const saved=JSON.parse(await readFile(join(dir,job.id,'settings.json'),'utf8'));
 assert.equal(saved.referenceFiles.length,2);assert.deepEqual(saved.referenceFiles.map(r=>r.name),['scene.png','tee.png']);
 assert.deepEqual(await readFile(join(dir,job.id,saved.referenceFiles[0].file)),first);
 assert.deepEqual(await readFile(join(dir,job.id,saved.referenceFiles[1].file)),second);
 assert.ok(saved.referenceFiles.every(r=>/^[a-f0-9]{64}$/.test(r.sha256)));
 assert.ok(!JSON.stringify(saved).includes('test-secret'));
});
test('invalid later references and excess file counts are rejected rather than silently ignored',()=>{
 const ref={base64:png(64,64).toString('base64'),mime:'image/png'};
 assert.throws(()=>validateRequest(input({references:[ref,{base64:'PGh0bWw+',mime:'image/png'}]})));
 assert.throws(()=>validateRequest(input({references:Array(17).fill(ref)})));
 assert.throws(()=>validateRequest(input({references:'not-an-array'})));
 assert.throws(()=>validateRequest(input({references:[ref],reference:ref})));
});
test('a changed second reference cannot reuse a saved submission ID',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-reference-id-'));let calls=0;
 const ref=n=>({base64:png(n,64).toString('base64'),mime:'image/png'});
 const store=await JobStore.open({dataDir:dir,keyProvider:async()=> 'test-secret',fetchImpl:async()=>{calls++;return ok();}});
 const body=input({references:[ref(64),ref(128)]});const job=await store.submit(body);await settle(store,job.id);
 await assert.rejects(store.submit({...body,references:[ref(64),ref(256)]}),/another image/);assert.equal(calls,1);
});
