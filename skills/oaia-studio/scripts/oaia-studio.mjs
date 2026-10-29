import {readFile,writeFile,mkdir,rename,realpath} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {StudioManager} from '../../../scripts/studios.mjs';
import {validateRequest,imageDimensions,requestFingerprint} from '../../../src/generation.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
async function save(path,value){const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,path);}
async function payload(record){
 const references=[];
 for(const ref of record.references){
  const bytes=await readFile(ref.path);if(hash(bytes)!==ref.sha256)throw Error('A reference changed after preparation. Prepare a new record before submitting.');
  references.push({name:basename(ref.path),base64:bytes.toString('base64')});
 }
 const body={submissionId:record.submissionId,prompt:record.prompt,model:record.model,size:record.size,quality:record.quality,references};validateRequest(body);return body;
}
export async function prepare(input,directory){
 const allowed=new Set(['studio','prompt','model','size','quality','referencePaths']);
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!allowed.has(k)))throw Error('Use only studio, prompt, model, size, quality, and referencePaths. Credentials do not belong in requests.');
 if(input.referencePaths!==undefined&&!Array.isArray(input.referencePaths))throw Error('referencePaths must be an ordered list of local image paths.');
 const references=[];
 for(const path of input.referencePaths||[]){if(typeof path!=='string')throw Error('Reference paths must be strings.');const full=resolve(path),bytes=await readFile(full);references.push({path:full,sha256:hash(bytes)});}
 const record={version:1,studio:input.studio||'Default',submissionId:randomUUID(),prompt:input.prompt,model:input.model,size:input.size,quality:input.quality,references,createdAt:new Date().toISOString()};
 if(typeof record.studio!=='string'||!record.studio.trim())throw Error('Choose a studio name.');
 await payload(record);const dir=resolve(directory);await mkdir(dirname(dir),{recursive:true,mode:0o700});await mkdir(dir,{mode:0o700});
 await writeFile(join(dir,'request.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});return record;
}
async function json(fetchImpl,url,options={}){
 const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||`OAIA Studio returned HTTP ${response.status}.`);return result;
}
export async function submit(directory,{manager=new StudioManager(),fetchImpl=fetch}={}){
 const dir=resolve(directory),record=await readJson(join(dir,'request.json')),guard=join(dir,'dispatch.json');
 try{await readFile(guard);throw Error('This request already has an attempt. Use status; do not resubmit it.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const body=await payload(record),studio=await manager.ensure(record.studio),base=studio.url;
 const config=await json(fetchImpl,base+'/api/config');
 if(!config.credentialConfigured)throw Error('No saved API key. Use Configure OAIA API Key.command; no request was submitted.');
 const knownJobs=await json(fetchImpl,base+'/api/jobs'),health=await json(fetchImpl,base+'/health');
 if(health.active)throw Error('This studio is generating an image. Wait; no request was submitted.');
 const attempt={submissionId:record.submissionId,studio:record.studio,status:'submitting',attemptedAt:new Date().toISOString(),fingerprint:requestFingerprint(body),knownJobIds:knownJobs.map(j=>j.id)};
 // Claim the attempt before any POST: concurrent callers and uncertain responses cannot pay twice.
 try{await writeFile(guard,JSON.stringify(attempt,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code==='EEXIST')throw Error('This request already has an attempt. Use status.');throw e;}
 try{
  const job=await json(fetchImpl,base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json','Origin':base,'X-Studio-Token':config.csrfToken},body:JSON.stringify(body)});
  Object.assign(attempt,{status:'accepted',jobId:job.id,jobStatus:job.status});await save(guard,attempt);return attempt;
 }catch{
  attempt.status='uncertain';await save(guard,attempt);
  throw Error('Submission outcome is uncertain. Use status to reconcile; this helper will not submit this record again.');
 }
}
export async function status(directory,{manager=new StudioManager(),fetchImpl=fetch}={}){
 const dir=resolve(directory),record=await readJson(join(dir,'request.json'));
 let dispatch=null;try{dispatch=await readJson(join(dir,'dispatch.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const studio=await manager.status(record.studio);
 if(!studio.running)return {status:'studio-stopped',studio:record.studio,submissionId:record.submissionId,priorAttempt:dispatch?.status??null,note:dispatch?'A prior attempt may have been accepted. Open this studio with OAIA Studio and check status again; do not resubmit.':'Open this studio with OAIA Studio, then check status again. No submission has been attempted.'};
 const jobs=await json(fetchImpl,studio.url+'/api/jobs');
 let job=jobs.find(j=>j.id===(dispatch?.jobId||record.submissionId)),matchedBy='job-id';
 if(!job&&dispatch?.fingerprint&&Array.isArray(dispatch.knownJobIds)){
  const known=new Set(dispatch.knownJobIds),matches=jobs.filter(j=>j.fingerprint===dispatch.fingerprint&&!known.has(j.id));
  if(matches.length>1)return {status:'ambiguous-after-attempt',submissionId:record.submissionId,candidateIds:matches.map(j=>j.id),note:'Several new identical requests exist. Inspect history and OpenAI Usage; do not resubmit or assume which request was billed.'};
  if(matches.length===1){job=matches[0];matchedBy='new-identical-request';}
 }
 if(!job)return {status:dispatch?'not-found-after-attempt':'prepared',submissionId:record.submissionId,note:dispatch?'Do not infer failure or resubmit. Check OAIA Studio history and OpenAI Usage.':'No submission has been attempted.'};
 if(!/^[0-9a-f-]{36}$/i.test(job.id))throw Error('OAIA Studio returned an invalid image identity.');
 const result={status:job.status,studio:record.studio,jobId:job.id,matchedBy,submissionOutcome:matchedBy==='new-identical-request'?'uncertain':'found',requested:record.size,error:job.error??null,estimatedCost:job.estimatedCost??null};
 if(matchedBy==='new-identical-request')result.note='Found one new image request with identical settings and references. The original submission or billing outcome remains uncertain; do not resubmit.';
 if(job.status==='complete'){
  const folder=join(studio.dataDir,job.id),image=join(folder,'image.png'),bytes=await readFile(image),actual=imageDimensions(bytes);
  if(job.sha256&&hash(bytes)!==job.sha256)throw Error('Saved image hash does not match OAIA Studio history. Do not deliver it as verified.');
  Object.assign(result,{actual,matchesRequested:`${actual.width}x${actual.height}`===record.size,upscaled:false,sha256:hash(bytes),image,prompt:join(folder,'prompt.txt'),settings:join(folder,'settings.json'),downloadUrl:`${studio.url}/files/${job.id}/image.png?download=1`});
  await save(join(dir,'result.json'),result);
 }
 return result;
}
async function main(){
 process.umask(0o077);const [command,file,directory,...extra]=process.argv.slice(2);
 if(command==='--help'||!command){console.log('OAIA Studio skill helper (run on the hosting Mac)\n  prepare REQUEST.json RECORD_DIRECTORY  Offline validation; no API call\n  submit RECORD_DIRECTORY                One authorized generation attempt\n  status RECORD_DIRECTORY                Reconcile and verify; never submits\n\nRequest: {studio, prompt, model, size, quality, referencePaths: [absolute paths]}\nUse a fresh record directory for each authorized image. No key is accepted.');return;}
 if(extra.length||!file||!['prepare','submit','status'].includes(command)||(command==='prepare'?!directory:!!directory))throw Error('Invalid arguments. Run with --help.');
 if(command==='prepare'){
  const r=await prepare(await readJson(file),directory);console.log(JSON.stringify({status:'prepared',studio:r.studio,submissionId:r.submissionId,model:r.model,size:r.size,quality:r.quality,references:r.references.length,recordDirectory:resolve(directory),paidRequests:0},null,2));
 }else console.log(JSON.stringify(await (command==='submit'?submit(file):status(file)),null,2));
}
if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>resolve(process.argv[1]))===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
