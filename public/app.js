import {createReferenceLoader} from './reference.js';
import {newSubmissionId} from './submission-id.js';
import {sizeError} from './image-options.js';
const $=id=>document.getElementById(id);
let config,access,references=[],jobs=[],selected=null,busy=false,referenceLoading=false,referenceError=null;
const referenceURLs=new Map();
let pending=null,pendingKey='studio.pending';
async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Studio-Token':config.csrfToken},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');return result;
}
function options(element,items){element.replaceChildren(...items.map(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.label||item.name;return o;}));}
function notes(){
 $('model-note').textContent=config.models.find(m=>m.id===$('model').value)?.description||'';
 const custom=$('size').value==='custom',size=selectedSize(),error=sizeError(size),[width,height]=size.split('x').map(Number);
 $('custom-size').hidden=!custom;$('custom-width').disabled=!custom;$('custom-height').disabled=!custom;
 $('size-note').textContent=error||((width*height>3686400?'Experimental native resolution. ':'Native API resolution. ')+(custom?'Use multiples of 16; neither edge above 3840. ':'')+'The downloaded file is never upscaled or resized.');
 $('size-note').classList.toggle('field-error',!!error);
}
function selectedSize(){return $('size').value==='custom'?`${$('custom-width').value}x${$('custom-height').value}`:$('size').value;}
function readiness(){const available=access?.models.includes($('model').value);$('generate').disabled=busy||!!pending||referenceLoading||!!referenceError||!!sizeError(selectedSize())||!available;$('generate').textContent=referenceLoading?'Reading references…':busy||pending?'Generating…':'Generate image';}
async function connection(){
 $('check').disabled=true;$('connection-status').textContent='Checking OpenAI…';
 try{access=await api('/api/check',{});$('connection-status').textContent=access.models.length?'Connected · key in Keychain':'No supported models available';
  for(const o of $('model').options)o.disabled=!access.models.includes(o.value);
  if(access.models.length&&!access.models.includes($('model').value))$('model').value=access.models[0];
  $('form-status').textContent=access.models.length?'Connection checked without generating an image.':'Your project does not currently list either image model. Check OpenAI access and organization verification.';
 }catch(e){access=null;$('connection-status').textContent='Connection needs attention';$('form-status').textContent=e.message;}
 finally{$('check').disabled=false;readiness();notes();}
}
function setPending(id){pending=id;if(id)localStorage.setItem(pendingKey,id);else localStorage.removeItem(pendingKey);readiness();}
const selectionLabel=job=>job.selectedImage?(job.selectedImage.reviewStatus==='approved'?'Approved':'Ready for review'):'Draft';
const renderVersion=job=>JSON.stringify([job.id,job.status,job.selectedImage]);
let selectedVersion='';
function show(job){
 selectedVersion=renderVersion(job);
 selected=job.id;const complete=job.status==='complete',running=['queued','running'].includes(job.status);
 $('empty').hidden=true;$('working').hidden=!running;$('result').hidden=!complete;$('result-details').hidden=!complete;$('error').hidden=!job.error;
 $('preview-title').textContent=complete?(job.selectedImage?.title||job.selectedImage?.name||'Draft image'):running?'Generation in progress':'Generation record';
 $('preview-status').textContent=running?'One request · no retries':complete?selectionLabel(job):job.status;
 if(job.error)$('error').textContent=job.error;
 if(complete){
  const file=job.selectedImage?'selected.png':'image.png',actual=job.selectedImage?.actual||job.actual;
  $('result').src=`/files/${job.id}/${file}`;
  $('dimensions').textContent=`${actual.width.toLocaleString()} × ${actual.height.toLocaleString()} pixels · ${job.selectedImage?'Selected PNG · Original generation also retained':job.matchesRequested?'Matches requested native dimensions':'SIZE MISMATCH — requested '+job.size.replace('x',' × ')+'; file kept unchanged'}`;
  $('result-cost').textContent=job.estimatedCost?`Estimated API usage: $${job.estimatedCost.usd.toFixed(4)}. Billing is authoritative.`:'API usage cost was not returned. Check OpenAI Billing for the charge.';
  $('download').href=`/files/${job.id}/${file}?download=1`;$('settings-download').href=`/files/${job.id}/settings.json?download=1`;$('prompt-download').href=`/files/${job.id}/prompt.txt?download=1`;
  $('saved-path').textContent=`Saved in ${config.outputFolder}/${job.id}`;
 }
 for(const item of $('history-list').children)item.setAttribute('aria-pressed',String(item.dataset.id===selected));
}
let historyVersion='';
function history(){
 const version=jobs.map(renderVersion).join();if(version===historyVersion)return;historyVersion=version;
 $('history-count').textContent=`${jobs.filter(j=>j.status==='complete').length} images`;$('history-empty').hidden=jobs.length>0;
 const ordered=[...jobs].sort((a,b)=>Number(!!b.selectedImage)-Number(!!a.selectedImage)||(a.selectedImage&&b.selectedImage?a.selectedImage.name.localeCompare(b.selectedImage.name,undefined,{numeric:true}):0));
 $('history-list').replaceChildren(...ordered.slice(0,36).map(job=>{
  const button=document.createElement('button');button.className='history-item';button.dataset.id=job.id;button.type='button';button.setAttribute('aria-pressed',String(job.id===selected));
  if(job.status==='complete'){const image=document.createElement('img');image.src=`/files/${job.id}/${job.selectedImage?'selected.png':'image.png'}`;image.alt='';image.loading='lazy';button.append(image);}
  const div=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('span'),actual=job.selectedImage?.actual||job.actual;title.textContent=job.selectedImage?.title||job.selectedImage?.name||'Draft · '+job.prompt;sub.textContent=job.status==='complete'?`${selectionLabel(job)} · ${actual.width} × ${actual.height}`:job.status;div.append(title,sub);button.append(div);button.onclick=()=>show(job);return button;
 }));
}
async function refresh(){
 try{
  jobs=await api('/api/jobs');history();const active=jobs.find(j=>['queued','running'].includes(j.status));busy=!!active;
  const pendingJob=jobs.find(j=>j.id===pending);
  if(pendingJob){show(pendingJob);if(!['queued','running'].includes(pendingJob.status)){setPending(null);$('form-status').textContent=pendingJob.status==='complete'?'Saved. You can download the original PNG below.':pendingJob.error;}}
  else if(active){setPending(active.id);show(active);}
  else if(!selected&&jobs.length)show(jobs[0]);
  else{const current=jobs.find(j=>j.id===selected);if(current&&renderVersion(current)!==selectedVersion)show(current);}
  $('new-request').hidden=!pending||!!pendingJob;
  readiness();
 }catch{if(pending)$('form-status').textContent='Cannot reach the local app. Your request is not being resubmitted. Reopen OAIA Studio to check its status.';}
}
const referenceLoader=createReferenceLoader(state=>{
 references=state.value;referenceLoading=state.loading;referenceError=state.error;
 const keep=new Set(state.items.map(item=>item.id));
 for(const [id,url] of referenceURLs)if(!keep.has(id)){URL.revokeObjectURL(url);referenceURLs.delete(id);}
 $('reference-list').replaceChildren(...state.items.map((item,index)=>{
  if(!referenceURLs.has(item.id))referenceURLs.set(item.id,URL.createObjectURL(item.file));
  const row=document.createElement('div');row.className='reference-item';
  const image=document.createElement('img');image.src=referenceURLs.get(item.id);image.alt=`Reference ${index+1}`;
  const label=document.createElement('div'),number=document.createElement('strong'),name=document.createElement('span');
  number.textContent=`Reference ${index+1}`;name.textContent=item.file.name+(item.loading?' · Reading…':item.error?' · Read failed':'');label.append(number,name);
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove reference ${index+1}: ${item.file.name}`);remove.onclick=()=>referenceLoader.remove(item.id);
  row.append(image,label,remove);return row;
 }));
 $('remove-reference').hidden=!state.items.length&&!state.error;$('reference-error').hidden=!state.error;$('reference-error').textContent=state.error||'';readiness();
});
$('reference').onchange=()=>{
 referenceLoader.add($('reference').files);$('reference').value='';
};
$('remove-reference').onclick=()=>{referenceLoader.clear();$('reference').value='';};
$('model').onchange=()=>{notes();readiness();};$('size').onchange=()=>{notes();readiness();};$('check').onclick=connection;
for(const id of ['custom-width','custom-height'])$(id).oninput=()=>{notes();readiness();};
$('generate-form').onsubmit=async event=>{
 event.preventDefault();if(busy||pending||referenceLoading||referenceError||sizeError(selectedSize())||!access?.models.includes($('model').value))return;
 const submissionId=newSubmissionId();setPending(submissionId);busy=true;readiness();$('form-status').textContent='Submitting one image request…';$('error').hidden=true;
 try{const job=await api('/api/jobs',{submissionId,prompt:$('prompt').value,model:$('model').value,size:selectedSize(),quality:$('quality').value,references});setPending(job.id);show(job);$('form-status').textContent='OpenAI is generating your image. No automatic retries.';await refresh();}
 catch(e){$('form-status').textContent=e.message+' No automatic retry. Checking saved request status…';busy=false;await refresh();$('new-request').hidden=!pending;readiness();}
};
$('new-request').onclick=()=>{if(confirm('No completed result is recorded for the last submission. If it reached OpenAI, it may have consumed credits. Check OpenAI Usage first. Start a new, separately billed request?')){setPending(null);busy=false;$('new-request').hidden=true;$('form-status').textContent='Ready for a new request.';readiness();}};
try{
 config=await api('/api/config');
 const studio=config.studio;
 if(studio){$('studio-name').textContent=studio.name==='Default'?'OAIA Studio':studio.name;document.title=`${studio.name} — OAIA Studio`;pendingKey=`studio.pending.${studio.instanceId}`;}
 pending=localStorage.getItem(pendingKey);
 options($('model'),config.models);options($('size'),config.sizes);options($('quality'),config.qualities.map(q=>({id:q,label:q==='auto'?'Auto':q==='xhigh'?'Extra high':q.charAt(0).toUpperCase()+q.slice(1)})));$('quality').value='medium';
 $('price-note').textContent=config.pricing.note;$('output-folder').textContent=`Output folder: ${config.outputFolder}`;
 if(config.account)$('account-note').textContent=`Verified ${config.account.verifiedDate}: $${config.account.grantUsd} Pro grant, expires ${config.account.expiresDate}. Next scheduled grant: $${config.account.nextGrantUsd} on ${config.account.expiresDate}. This is a setup snapshot, not a live balance.`;
 if(config.account?.keyExpiresDate)$('key-note').textContent+=` Setup snapshot: key expiry ${config.account.keyExpiresDate}. Check the current key’s expiry in OpenAI.`;
 notes();await refresh();await connection();setInterval(refresh,3000);
}catch{$('connection-status').textContent='App unavailable';$('form-status').textContent='Reopen OAIA Studio using the Desktop launcher.';}
