import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {png} from './png-fixture.mjs';
import {prepare,submit,status} from '../skills/oaia-studio/scripts/oaia-studio.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'oaia-studio-skill-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const refs=[join(root,'a.png'),join(root,'b.png')];await writeFile(refs[0],png(32,32));await writeFile(refs[1],png(48,48));
 const request={studio:'Packaging',prompt:'Two references, in the supplied order.',model:'gpt-image-2.5-sunburst',size:'2160x3840',quality:'high',referencePaths:refs};
 const dir=join(root,'request'),instance={url:'http://127.0.0.1:45678',dataDir:join(root,'images'),running:true};
 const manager={ensure:async name=>{assert.equal(name,'Packaging');return instance;},status:async()=>instance};
 return {root,refs,request,dir,instance,manager};
}
test('offline preparation freezes settings and ordered reference hashes; invalid sizes create no record',async t=>{
 const f=await fixture(t);await assert.rejects(prepare({...f.request,size:'1320x2868'},f.dir),/16/);
 const p=await prepare(f.request,f.dir);assert.equal(p.references.length,2);assert.equal(p.references[0].path,f.refs[0]);
 assert.equal(p.references[1].sha256,createHash('sha256').update(await readFile(f.refs[1])).digest('hex'));
 await assert.rejects(prepare(f.request,f.dir),/exist/i);
});
test('installed symlink entrypoint executes the helper instead of silently doing nothing',async t=>{
 const f=await fixture(t),alias=join(f.root,'installed-oaia-studio');
 await symlink(fileURLToPath(new URL('../skills/oaia-studio',import.meta.url)),alias,'dir');
 const {stdout}=await promisify(execFile)(process.execPath,[join(alias,'scripts/oaia-studio.mjs'),'--help']);
 assert.match(stdout,/Offline validation/);
});
test('changed reference bytes are rejected before starting a studio or submitting',async t=>{
 const f=await fixture(t);await prepare(f.request,f.dir);await writeFile(f.refs[0],png(64,64));
 let starts=0;await assert.rejects(submit(f.dir,{manager:{ensure:async()=>{starts++;}},fetchImpl:()=>assert.fail('network call')}),/changed/);
 assert.equal(starts,0);
});
test('simultaneous submission and later attempts cannot create a second paid request',async t=>{
 const f=await fixture(t),p=await prepare(f.request,f.dir);let posts=0;
 const fetchImpl=async(url,options={})=>{
  if(url.endsWith('/api/config'))return Response.json({csrfToken:'local-token',credentialConfigured:true});
  if(url.endsWith('/health'))return Response.json({active:null});
  if(url.endsWith('/api/jobs')&&!options.method)return Response.json([]);
  assert.equal(url,f.instance.url+'/api/jobs');assert.equal(options.headers['X-Studio-Token'],'local-token');
  const body=JSON.parse(options.body);assert.equal(body.submissionId,p.submissionId);assert.deepEqual(body.references.map(r=>r.name),['a.png','b.png']);posts++;
  return Response.json({id:p.submissionId,status:'running'},{status:202});
 };
 const results=await Promise.allSettled([submit(f.dir,{manager:f.manager,fetchImpl}),submit(f.dir,{manager:f.manager,fetchImpl})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(posts,1);
 await assert.rejects(submit(f.dir,{manager:f.manager,fetchImpl}),/attempt|status/i);assert.equal(posts,1);
});
test('timeout keeps the attempt and status reconciles without posting or silently resizing',async t=>{
 const f=await fixture(t),p=await prepare(f.request,f.dir);let posts=0;
 const first=async (url,options={})=>{
  if(url.endsWith('/api/config'))return Response.json({csrfToken:'local-token',credentialConfigured:true});
  if(url.endsWith('/api/jobs')&&!options.method)return Response.json([]);
  if(url.endsWith('/health'))return Response.json({active:null});posts++;throw Error('timeout');
 };
 await assert.rejects(submit(f.dir,{manager:f.manager,fetchImpl:first}),/uncertain/i);
 const saved=JSON.parse(await readFile(join(f.dir,'dispatch.json'),'utf8'));assert.equal(saved.status,'uncertain');
 await assert.rejects(submit(f.dir,{manager:f.manager,fetchImpl:first}),/attempt|status/i);assert.equal(posts,1);
 const folder=join(f.instance.dataDir,p.submissionId);await mkdir(folder,{recursive:true});const bytes=png(1024,1536);await writeFile(join(folder,'image.png'),bytes);
 const job={id:p.submissionId,status:'complete',size:p.size,sha256:createHash('sha256').update(bytes).digest('hex')};
 const result=await status(f.dir,{manager:f.manager,fetchImpl:async(url,options={})=>{assert.equal(options.method,undefined);return Response.json([job]);}});
 assert.deepEqual(result.actual,{width:1024,height:1536});assert.equal(result.matchesRequested,false);assert.equal(result.upscaled,false);
 assert.equal(result.image,join(folder,'image.png'));assert.deepEqual(await readFile(result.image),bytes);
});
test('stopped studio preserves the fact that a prior submission may have been accepted',async t=>{
 const f=await fixture(t);await prepare(f.request,f.dir);
 await writeFile(join(f.dir,'dispatch.json'),JSON.stringify({status:'uncertain'}));
 const result=await status(f.dir,{manager:{status:async()=>({running:false})}});
 assert.equal(result.priorAttempt,'uncertain');assert.doesNotMatch(result.note,/No image was submitted/);
 assert.match(result.note,/may have|prior attempt/i);
});
test('uncertain duplicate reuse is reconciled by a unique new exact fingerprint; old and ambiguous matches are not selected',async t=>{
 const f=await fixture(t);await prepare(f.request,f.dir);
 const oldId='10000000-0000-4000-8000-000000000000',newId='20000000-0000-4000-8000-000000000000';
 let posts=0;
 const fetchImpl=async(url,options={})=>{
  if(url.endsWith('/api/config'))return Response.json({csrfToken:'local-token',credentialConfigured:true});
  if(url.endsWith('/health'))return Response.json({active:null});
  if(!options.method)return Response.json([{id:oldId}]);
  posts++;throw Error('lost response after OAIA Studio reused a concurrent request');
 };
 await assert.rejects(submit(f.dir,{manager:f.manager,fetchImpl}),/uncertain/);
 const d=JSON.parse(await readFile(join(f.dir,'dispatch.json'),'utf8'));assert.match(d.fingerprint,/^[a-f0-9]{64}$/);
 const matching=id=>({id,fingerprint:d.fingerprint,status:'running'});
 const check=jobs=>status(f.dir,{manager:f.manager,fetchImpl:async()=>Response.json(jobs)});
 assert.equal((await check([matching(oldId)])).status,'not-found-after-attempt');
 const unique=await check([matching(oldId),matching(newId)]);
 assert.equal(unique.jobId,newId);assert.equal(unique.matchedBy,'new-identical-request');assert.equal(unique.submissionOutcome,'uncertain');
 const ambiguous=await check([matching(newId),matching('30000000-0000-4000-8000-000000000000')]);
 assert.equal(ambiguous.status,'ambiguous-after-attempt');assert.equal(ambiguous.candidateIds.length,2);
 assert.equal(posts,1);
});
