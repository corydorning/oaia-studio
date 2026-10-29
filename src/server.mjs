import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {ROOT,DATA_DIR,MODELS,SIZES,QUALITIES,PRICING} from './config.mjs';
import {getKey,credentialStatus} from './credentials.mjs';
import {JobStore,StudioError,checkModels} from './generation.mjs';
import {allowConnection} from './network.mjs';
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/reference.js':['reference.js','text/javascript; charset=utf-8'],'/image-options.js':['image-options.js','text/javascript; charset=utf-8'],'/submission-id.js':['submission-id.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function reply(res,status,data,type='application/json; charset=utf-8',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(type.startsWith('application/json')?JSON.stringify(data):data);}
async function readBody(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new StudioError('Expected a JSON request.',415);
 let size=0;const parts=[];
 for await(const part of req){size+=part.length;if(size>70*1024*1024)throw new StudioError('Reference images exceed the 50 MB combined limit.',413);parts.push(part);}
 try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw new StudioError('The request could not be read.');}
}
export async function createStudio({dataDir=DATA_DIR,keyProvider=getKey,statusProvider=credentialStatus,fetchImpl=fetch,interfacesProvider=networkInterfaces,studio={id:'default',name:'Default',instanceId:'default'},controlToken=null,accountFile=join(ROOT,'.runtime/account.json')}={}){
 const store=await JobStore.open({dataDir,keyProvider,fetchImpl});
 const csrfToken=randomBytes(32).toString('hex');let access=null,stopping=false;
 const active=()=>store.active||(store.submitting?'submitting':null);
 const safeToken=(supplied,expected)=>{const a=Buffer.from(supplied||''),b=Buffer.from(expected||'');return b.length>0&&a.length===b.length&&timingSafeEqual(a,b);};
 const server=http.createServer(async(req,res)=>{
  const port=server.address()?.port;
  const host=req.headers.host;
  if(!allowConnection({host,port,remoteAddress:req.socket.remoteAddress},interfacesProvider()))return reply(res,403,{error:'Local network connections only. Use this Mac’s LAN IP address.'});
  const origin=req.headers.origin;
  if((origin&&origin!==`http://${host}`)||req.headers['sec-fetch-site']==='cross-site')return reply(res,403,{error:'Cross-origin requests are blocked.'});
  try{
   const url=new URL(req.url,`http://${host}`);
   if(req.method==='POST'&&url.pathname==='/_studio/stop'){
    if(!req.socket.remoteAddress.startsWith('127.')||origin||!safeToken(req.headers['x-studio-control'],controlToken))return reply(res,403,{error:'Local studio control only.'});
    if(active()||store.publishing?.size)return reply(res,409,{error:'An image is generating or being saved. Wait for it to finish before stopping or restarting.'});
    stopping=true;reply(res,200,{stopped:true});server.close();return;
   }
   if(req.method==='POST'&&stopping)return reply(res,503,{error:'This studio is stopping. Reopen it before starting a new image.'});
   if(req.method==='POST'){
    const supplied=Buffer.from(req.headers['x-studio-token']||'');const expected=Buffer.from(csrfToken);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(res,403,{error:'Reload the app before submitting.'});
   }
   if(req.method==='GET'&&url.pathname==='/health')return reply(res,200,{app:'local-image-studio',ok:true,studio,active:active(),stopping});
   if(req.method==='GET'&&url.pathname==='/api/config'){
    let account=null;if(accountFile)try{account=JSON.parse(await readFile(accountFile,'utf8'));}catch{}
    return reply(res,200,{csrfToken,studio,models:MODELS,sizes:SIZES,qualities:QUALITIES,pricing:PRICING,credentialConfigured:await statusProvider(),outputFolder:dataDir,access,account});
   }
   if(req.method==='POST'&&url.pathname==='/api/check'){
    await readBody(req);let key;try{key=await keyProvider();}catch{throw new StudioError('API key unavailable. Open Configure OAIA API Key.command to save it in Keychain.',503);}
    try{access=await checkModels(key,fetchImpl);return reply(res,200,access);}finally{key=null;}
   }
   if(req.method==='GET'&&url.pathname==='/api/jobs')return reply(res,200,store.list());
   const publish=url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})\/publish$/i);
   if(req.method==='POST'&&publish)return reply(res,200,await store.publish(publish[1],await readBody(req)));
   if(req.method==='POST'&&url.pathname==='/api/jobs'){
    const body=await readBody(req);if(stopping)throw new StudioError('This studio is stopping. Reopen it before starting a new image.',503);let job;
    try{job=await store.submit(body);}catch(e){if(e instanceof StudioError)throw e;throw new StudioError('Could not start the image. Check your saved key and output-folder access. No automatic retry was made.',503);}
    return reply(res,202,job);
   }
   if(req.method==='GET'&&url.pathname.startsWith('/files/')){
    const match=url.pathname.match(/^\/files\/([0-9a-f-]{36})\/(image\.png|selected\.png|prompt\.txt|settings\.json)$/i);
    if(!match||!store.get(match[1]))return reply(res,404,{error:'File not found.'});
    const selected=store.get(match[1]).selectedImage;
    if(match[2]==='selected.png'&&!selected)return reply(res,404,{error:'Selected image not ready.'});
    if(match[2]==='image.png'&&store.get(match[1]).status!=='complete')return reply(res,404,{error:'Image not ready.'});
    const storedFile=match[2]==='selected.png'?selected.file:match[2];
    if(!/^(image\.png|selected(?:-[a-f0-9]{64})?\.png|prompt\.txt|settings\.json)$/.test(storedFile))return reply(res,404,{error:'File not found.'});
    let file;try{file=await readFile(join(dataDir,match[1],storedFile));}catch{return reply(res,404,{error:'File not found.'});}
    const mime=match[2].endsWith('.png')?'image/png':match[2]==='settings.json'?'application/octet-stream':'text/plain; charset=utf-8';
    const filename=match[2]==='selected.png'?selected.name:`${match[1]}-${match[2]}`;
    const extra=url.searchParams.has('download')?{'Content-Disposition':`attachment; filename="${filename}"`}:{};
    return reply(res,200,file,mime,extra);
   }
   if(req.method==='GET'&&assets[url.pathname]){
    const [name,type]=assets[url.pathname];return reply(res,200,await readFile(join(ROOT,'public',name)),type);
   }
   return reply(res,404,{error:'Not found.'});
  }catch(e){if(!res.headersSent)reply(res,e instanceof StudioError?e.status:500,{error:e instanceof StudioError?e.message:'The local app could not finish this operation. No automatic retry was made.'});else res.end();}
 });
 server.requestTimeout=60000;server.headersTimeout=10000;
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {main}=await import('../scripts/launch.mjs');
 await main(['open','--no-open']);
}
