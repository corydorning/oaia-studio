import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {crc32,inflateSync} from 'node:zlib';
import {MODELS,SIZES,QUALITIES,PRICING} from './config.mjs';
import {sizeError,MAX_REFERENCES,MAX_REFERENCE_BYTES,MAX_REFERENCE_TOTAL_BYTES} from '../public/image-options.js';

export class StudioError extends Error {constructor(message,status=400,uncertain=false){super(message);this.status=status;this.uncertain=uncertain;}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function imageDimensions(b){
 if(b.length<33 || !b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || b.toString('ascii',12,16)!=='IHDR')throw new StudioError('The API did not return a readable PNG. No image was resized.',502,true);
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
 if(!width || !height || width>20000 || height>20000)throw new StudioError('The returned PNG dimensions are invalid.',502,true);
 let offset=8,ended=false;const data=[];
 while(offset+12<=b.length){
  const length=b.readUInt32BE(offset),end=offset+12+length;
  if(end>b.length||crc32(b.subarray(offset+4,end-4))!==b.readUInt32BE(end-4))throw new StudioError('The PNG is truncated or corrupt. No retry was made.',502,true);
  const type=b.toString('ascii',offset+4,offset+8);
  if(type==='IDAT')data.push(b.subarray(offset+8,end-4));
  offset=end;if(type==='IEND'){ended=length===0&&offset===b.length;break;}
 }
 if(!ended||!data.length)throw new StudioError('The PNG is incomplete. No retry was made.',502,true);
 try{if(!inflateSync(Buffer.concat(data),{maxOutputLength:256*1024*1024}).length)throw Error();}catch{throw new StudioError('The PNG image data could not be decoded. No retry was made.',502,true);}
 return {width,height};
}
function referenceImage(ref){
 if(!ref||typeof ref!=='object')throw new StudioError('Choose a valid reference image.');
 if(typeof ref.base64!=='string'||ref.base64.length+50>20*1024*1024||ref.base64.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(ref.base64))throw new StudioError('Choose a PNG, JPEG, or WebP under 15 MB.');
 const bytes=Buffer.from(ref.base64,'base64');
 if(bytes.length>MAX_REFERENCE_BYTES)throw new StudioError('Each reference must be under 15 MB.');
 let mime,extension;
 if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){mime='image/png';extension='png';imageDimensions(bytes);}
 else if(bytes.length>12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime='image/jpeg';extension='jpg';}
 else if(bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){mime='image/webp';extension='webp';}
 else throw new StudioError('The reference is not a PNG, JPEG, or WebP image.');
 return {bytes,mime,extension,name:typeof ref.name==='string'?ref.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,200):''};
}
export function validateRequest(body){
 if(!body||!UUID.test(body.submissionId||''))throw new StudioError('Invalid submission. Reload the page and try again.');
 if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>32000)throw new StudioError('Enter a prompt of 1–32,000 characters.');
 if(!MODELS.some(m=>m.id===body.model))throw new StudioError('Choose a supported image model.');
 const dimensionError=sizeError(body.size);if(dimensionError)throw new StudioError(dimensionError);
 if(!QUALITIES.includes(body.quality))throw new StudioError('Choose a supported quality setting.');
 if(body.references!==undefined&&!Array.isArray(body.references))throw new StudioError('References must be a list of images.');
 if(body.references!==undefined&&body.reference)throw new StudioError('Supply one reference list.');
 const raw=body.references??(body.reference?[body.reference]:[]);
 if(raw.length>MAX_REFERENCES)throw new StudioError('Choose up to 16 reference images.');
 if(raw.reduce((sum,r)=>sum+(typeof r?.base64==='string'?r.base64.length:0),0)>Math.ceil(MAX_REFERENCE_TOTAL_BYTES/3)*4+MAX_REFERENCES*4)throw new StudioError('Reference images must total 50 MB or less.');
 const references=raw.map(referenceImage);
 if(references.reduce((sum,r)=>sum+r.bytes.length,0)>MAX_REFERENCE_TOTAL_BYTES)throw new StudioError('Reference images must total 50 MB or less.');
 return {submissionId:body.submissionId,prompt:body.prompt.trim(),model:body.model,size:body.size,quality:body.quality,references};
}
export function requestFingerprint(body,s=validateRequest(body)){
 const references=body.references===undefined?{reference:s.references[0]?.bytes.toString('base64')??null}:{references:s.references.map(r=>r.bytes.toString('base64'))};
 return createHash('sha256').update(JSON.stringify({prompt:s.prompt,model:s.model,size:s.size,quality:s.quality,...references})).digest('hex');
}
function apiFailure(status,code,message){
 const explanations={
  credit_balance_exhausted:'Your API credits are exhausted. Check the linked organization and next Pro grant in OpenAI Billing.',
  insufficient_quota:'OpenAI reports insufficient API quota. Check the linked organization and active grant in Billing.',
  invalid_api_key:'This API key is invalid or expired. Save a replacement using Configure API Key.command.',
  model_not_found:'This model is unavailable to your project. Check model access or select another supported model.',
  content_policy_violation:'OpenAI declined this prompt under its content policy. Edit the prompt before submitting again.'
 };
 let explanation=explanations[code];
 if(!explanation && /verif/i.test(message||''))explanation='OpenAI requires organization verification for this model. Complete verification in OpenAI organization settings.';
 if(!explanation && /size|resolution|dimension/i.test(message||''))explanation='OpenAI rejected these dimensions for this model/account. Try 2560 × 1440 or a standard size; no fallback was submitted.';
 if(!explanation && status===401)explanation=explanations.invalid_api_key;
 if(!explanation && status===403)explanation='Your API key or project does not have permission for this model or endpoint.';
 if(!explanation && status===429)explanation='OpenAI reports a rate or quota limit. Check Billing and Limits before trying again.';
 return new StudioError(`${explanation||'OpenAI could not complete this request.'} No automatic retry was made. (HTTP ${status}${/^[a-z0-9_]{1,80}$/.test(code||'')?', '+code:''})`,502,status>=500);
}
export function estimateUsage(usage){
 const t=usage?.input_tokens_details?.text_tokens,i=usage?.input_tokens_details?.image_tokens,o=usage?.output_tokens_details?.image_tokens??usage?.output_tokens;
 if(![t,i,o].every(n=>Number.isFinite(n)&&n>=0))return null;
 return {usd:(t*5+i*8+o*30)/1e6,label:'Estimated from returned usage at standard uncached rates; Billing is authoritative.',rates:PRICING};
}
export async function generateOnce(settings,key,fetchImpl=fetch){
 const body={model:settings.model,prompt:settings.prompt,n:1,size:settings.size,quality:settings.quality,output_format:'png',background:'opaque'};
 const isEdit=settings.references.length>0;
 if(isEdit)body.images=settings.references.map(ref=>({image_url:`data:${ref.mime};base64,${ref.bytes.toString('base64')}`}));
 let response;
 try{response=await fetchImpl(`https://api.openai.com/v1/images/${isEdit?'edits':'generations'}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15*60*1000)});}
 catch{throw new StudioError('Connection lost or timed out after submission. The request may have consumed credits. Check OpenAI Usage before generating again. No retry was made.',502,true);}
 let data;
 try{data=await response.json();}catch{throw new StudioError('OpenAI returned an unreadable response. This request may have consumed credits; no retry was made.',502,true);}
 if(!response.ok)throw apiFailure(response.status,data?.error?.code,data?.error?.message);
 const encoded=data?.data?.[0]?.b64_json;
 if(typeof encoded!=='string'||encoded.length>160*1024*1024)throw new StudioError('OpenAI returned no usable image. Check Usage before generating again.',502,true);
 const bytes=Buffer.from(encoded,'base64'),actual=imageDimensions(bytes),[width,height]=settings.size.split('x').map(Number);
 return {bytes,actual,matchesRequested:width===actual.width&&height===actual.height,usage:data.usage??null,estimatedCost:estimateUsage(data.usage),requestId:response.headers.get('x-request-id'),resolvedQuality:data.quality??settings.quality};
}
export async function checkModels(key,fetchImpl=fetch){
 let response;
 try{response=await fetchImpl('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new StudioError('Could not reach OpenAI. No image was generated.',502);}
 let data;try{data=await response.json();}catch{throw new StudioError('Could not read the model-access response.',502);}
 if(!response.ok)throw apiFailure(response.status,data?.error?.code,data?.error?.message);
 const ids=new Set((data.data||[]).map(m=>m.id));
 return {checkedAt:new Date().toISOString(),models:MODELS.filter(m=>ids.has(m.id)).map(m=>m.id),organization:response.headers.get('openai-organization'),note:'Model listing is free. It does not verify credit balance or guarantee a generation will succeed.'};
}
async function atomic(path,data){await writeFile(path+'.tmp',data,{mode:0o600});await rename(path+'.tmp',path);}
export class JobStore {
 static async open(options){const store=new JobStore(options);await mkdir(store.dataDir,{recursive:true,mode:0o700});for(const id of await readdir(store.dataDir)){if(!UUID.test(id))continue;try{const job=JSON.parse(await readFile(join(store.dataDir,id,'settings.json'),'utf8'));if(['queued','running'].includes(job.status)){job.status='uncertain';job.error='The app stopped before completion was recorded. Check OpenAI Usage. This request was not retried.';await store.save(job);}store.jobs.set(id,job);}catch{ /* unrelated or incomplete directory is not a reusable job */ }}return store;}
 constructor({dataDir,keyProvider,fetchImpl=fetch}){this.dataDir=dataDir;this.keyProvider=keyProvider;this.fetchImpl=fetchImpl;this.jobs=new Map();this.active=null;this.submitting=false;}
 list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 get(id){return this.jobs.get(id);}
 save(job){return atomic(join(this.dataDir,job.id,'settings.json'),JSON.stringify(job,null,2)+'\n');}
 async publish(id,body){
  const job=this.get(id);if(!job)throw new StudioError('Image not found.',404);
  if(job.status!=='complete')throw new StudioError('Wait for this image to finish before selecting it.',409);
  if(typeof body?.name!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,110}\.png$/.test(body.name)||body.name.includes('..'))throw new StudioError('Use a simple PNG filename without folders.');
  if(body.title!==undefined&&(typeof body.title!=='string'||!body.title.trim()||body.title.length>140||/[\x00-\x1f\x7f]/.test(body.title)))throw new StudioError('Use a short image title.');
  if(!['review','approved'].includes(body.reviewStatus))throw new StudioError('Choose Ready for review or Approved.');
  if(this.publishing?.has(id))throw new StudioError('This selection is already being saved.',409);
  this.publishing??=new Set();this.publishing.add(id);
  try{
   let selectedImage=job.selectedImage;
   if(body.image){
    let ref;try{ref=referenceImage(body.image);if(ref.mime!=='image/png')throw Error();}catch{throw new StudioError('Choose a valid PNG under 15 MB.');}
    const actual=imageDimensions(ref.bytes),sha256=createHash('sha256').update(ref.bytes).digest('hex');
    // Keep previous selections intact until their replacement metadata commits.
    const file=`selected-${sha256}.png`;
    await atomic(join(this.dataDir,id,file),ref.bytes);
    selectedImage={file,actual,sha256,bytes:ref.bytes.length};
   }
   if(!selectedImage)throw new StudioError('Supply the selected PNG first.');
   const updated={...job,selectedImage:{...selectedImage,name:body.name,title:body.title?.trim()||selectedImage.title||body.name,reviewStatus:body.reviewStatus,updatedAt:new Date().toISOString()}};
   await this.save(updated);this.jobs.set(id,updated);return updated;
  }finally{this.publishing.delete(id);}
 }
 async submit(body){
  const s=validateRequest(body);
  const hash=requestFingerprint(body,s);
  const existing=this.jobs.get(s.submissionId);
  if(existing){if(existing.fingerprint!==hash)throw new StudioError('This submission ID already belongs to another image.',409);return existing;}
  if(this.submitting)throw new StudioError('A submission is already being saved. Please wait.',409);
  if(this.active){const active=this.jobs.get(this.active);if(active.fingerprint===hash)return active;throw new StudioError('An image is already generating. Wait for it to finish.',409);}
  this.submitting=true;
  try{
   const key=await this.keyProvider();
   const referenceFiles=s.references.map((ref,index)=>({file:`reference-${String(index+1).padStart(2,'0')}.${ref.extension}`,name:ref.name||`Reference ${index+1}`,mime:ref.mime,bytes:ref.bytes.length,sha256:createHash('sha256').update(ref.bytes).digest('hex')}));
   const job={id:s.submissionId,fingerprint:hash,prompt:s.prompt,model:s.model,size:s.size,quality:s.quality,outputFormat:'png',background:'opaque',status:'queued',createdAt:new Date().toISOString(),upscaled:false,referenceFile:referenceFiles[0]?.file??null,referenceFiles,pricingChecked:PRICING.checked};
   const dir=join(this.dataDir,job.id);
   // Exclusive creation also prevents reuse if an interrupted job record is corrupt.
   await mkdir(dir,{mode:0o700});
   await writeFile(join(dir,'prompt.txt'),s.prompt+'\n',{mode:0o600});
   for(let i=0;i<s.references.length;i++)await writeFile(join(dir,referenceFiles[i].file),s.references[i].bytes,{mode:0o600});
   await this.save(job);this.jobs.set(job.id,job);this.active=job.id;
   this.run(job,s,key);return job;
  }finally{this.submitting=false;}
 }
 async run(job,s,key){
  try{
   job.status='running';await this.save(job);
   const result=await generateOnce(s,key,this.fetchImpl);
   await writeFile(join(this.dataDir,job.id,'image.png'),result.bytes,{mode:0o600});
   const {bytes,...metadata}=result;
   Object.assign(job,metadata,{status:'complete',completedAt:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),imageBytes:bytes.length});
  }catch(e){job.status=e.uncertain?'uncertain':'failed';job.error=e instanceof StudioError?e.message:'The image could not be saved or submitted. Check OpenAI Usage before trying again. No retry was made.';}
  finally{key=null;try{await this.save(job);}catch{job.status='uncertain';job.error='Could not save the final record. Check the output folder and OpenAI Usage before another request.';}this.active=null;}
 }
}
