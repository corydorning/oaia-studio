import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {createStudio} from '../src/server.mjs';
import {png} from './png-fixture.mjs';
async function fixture(t,overrides={}){
 const dataDir=await mkdtemp(join(tmpdir(),'studio-http-'));
 const server=await createStudio({dataDir,keyProvider:async()=>{throw Error('missing secret');},statusProvider:async()=>false,...overrides});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const config=await (await fetch(base+'/api/config')).json();
 return {base,config,post:(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':config.csrfToken,Origin:base,...headers},body:JSON.stringify(body)})};
}
test('local form renders without credentials, and config never contains a key',async t=>{
 const {base,config}=await fixture(t);
 assert.equal(config.credentialConfigured,false);assert.equal(config.sizes[0].id,'3840x2160');
 const html=await (await fetch(base)).text();assert.ok(html.includes('Generate image'));assert.ok(html.includes('reference'));
 assert.ok(!JSON.stringify(config).includes('sk-'));
});
test('rejects cross-origin posts and hostile host headers',async t=>{
 const {base,post}=await fixture(t);
 assert.equal((await post('/api/check',{}, {Origin:'https://malicious.example'})).status,403);
 const hostileStatus=await new Promise((resolve,reject)=>{http.get(base+'/api/config',{headers:{Host:'malicious.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
 assert.equal(hostileStatus,403);
 assert.equal((await fetch(base+'/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
});
test('missing key and invalid requests cannot call OpenAI',async t=>{
 let calls=0;const {post}=await fixture(t,{fetchImpl:async()=>{calls++;throw Error();}});
 assert.equal((await post('/api/jobs',{})).status,400);
 const response=await post('/api/jobs',{submissionId:randomUUID(),prompt:'lake',model:'gpt-image-2.5-flare',quality:'low',size:'3840x2160'});
 assert.equal(response.status,503);assert.equal(calls,0);assert.ok(!(await response.text()).includes('missing secret'));
});
test('free connection check lists supported models without generating an image',async t=>{
 const {post}=await fixture(t,{keyProvider:async()=> 'mock-key',statusProvider:async()=>true,fetchImpl:async url=>{assert.equal(url,'https://api.openai.com/v1/models');return new Response(JSON.stringify({data:[{id:'gpt-image-2.5-flare'}]}));}});
 const response=await post('/api/check',{});assert.equal(response.status,200);assert.deepEqual((await response.json()).models,['gpt-image-2.5-flare']);
});
test('arbitrary local files and traversal paths are never served',async t=>{
 const {base}=await fixture(t);
 for(const path of ['/files/anything/settings.json','/scripts/keychain.py','/.env','/api/key'])assert.equal((await fetch(base+path)).status,404);
});
test('serves the approved LAN Host without a password',async t=>{
 const {base}=await fixture(t,{interfacesProvider:()=>({en0:[{family:'IPv4',internal:false,address:'192.168.1.20',netmask:'255.255.255.0'}]})});
 const port=new URL(base).port,host=`192.168.1.20:${port}`;
 const response=await new Promise((resolve,reject)=>{http.get(base+'/api/config',{headers:{Host:host}},res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);});
 assert.equal(response.status,200);assert.ok(JSON.parse(response.body).csrfToken);
});
test('named selected files keep original bytes, download under their name, and never generate again',async t=>{
 let calls=0;const original=png(1328,2880),prepared=png(1320,2868);
 const {base,post}=await fixture(t,{keyProvider:async()=> 'mock-key',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({data:[{b64_json:original.toString('base64')}]}));}});
 const id=randomUUID();await post('/api/jobs',{submissionId:id,prompt:'hole',model:'gpt-image-2.5-sunburst',quality:'high',size:'1328x2880'});
 for(let i=0;i<100;i++){const jobs=await(await fetch(base+'/api/jobs')).json();if(jobs[0]?.status==='complete')break;await new Promise(r=>setTimeout(r,5));}
 const response=await post(`/api/jobs/${id}/publish`,{name:'hole2-lakeside.png',title:'Hole 2 — Lakeside',reviewStatus:'review',image:{base64:prepared.toString('base64')}});
 assert.equal(response.status,200);const job=await response.json();assert.equal(job.selectedImage.name,'hole2-lakeside.png');assert.equal(job.selectedImage.title,'Hole 2 — Lakeside');assert.deepEqual(job.selectedImage.actual,{width:1320,height:2868});
 const download=await fetch(base+`/files/${id}/selected.png?download=1`);assert.match(download.headers.get('content-disposition'),/hole2-lakeside\.png/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),prepared);
 assert.deepEqual(Buffer.from(await(await fetch(base+`/files/${id}/image.png`)).arrayBuffer()),original);
 assert.equal((await post(`/api/jobs/${id}/publish`,{name:'hole2-lakeside.png',reviewStatus:'approved'})).status,200);
 assert.equal(calls,1);
 for(const name of ['../bad.png','bad\r\nname.png','bad.jpg'])assert.equal((await post(`/api/jobs/${id}/publish`,{name,reviewStatus:'review'})).status,400);
 assert.equal((await post(`/api/jobs/${id}/publish`,{name:'hole2-lakeside.png',reviewStatus:'review',image:{base64:Buffer.from('not a PNG').toString('base64')}})).status,400);
 assert.equal((await post(`/api/jobs/${id}/publish`,{name:'hole2-lakeside.png',reviewStatus:'review'},{Origin:'https://malicious.example'})).status,403);
 assert.equal(calls,1);
});
