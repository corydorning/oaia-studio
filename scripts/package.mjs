import {readdir,lstat,readFile,mkdir} from 'node:fs/promises';
import {join,dirname,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {ROOT} from '../src/config.mjs';
import {resolvePython} from '../src/runtime.mjs';

const rootFiles=new Set(['SKILL.md','LICENSE','Install OAIA Skill.command','README.md','package.json','.gitignore','Open OAIA Studio.command','Manage OAIA Studios.command','Restart OAIA Studio.command','Stop OAIA Studio.command','Configure OAIA API Key.command']);
const rootDirectories=new Set(['src','public','scripts','tests','docs','skills']);
const publicDocuments=new Set(['docs/sources.md']);
const extensions=new Set(['.mjs','.js','.py','.zsh','.html','.css','.md','.json']);
const privateName=name=>name.startsWith('.')||['node_modules','dist','outputs','__pycache__'].includes(name)||/^(account|credentials?|secrets?)(?:\.(?:json|txt|env|key|pem))?$/i.test(name);
export async function releaseFiles(root=ROOT){
 const files=[];
 async function add(relative){
  if(relative.startsWith('docs/')&&!publicDocuments.has(relative))return;
  const path=join(root,relative),info=await lstat(path);
  if(info.isSymbolicLink())throw Error(`Release refused a symbolic link: ${relative}`);
  if(info.isDirectory()){
   for(const name of (await readdir(path)).sort()){
    if(name==='.DS_Store')continue;
    if(privateName(name))throw Error(`Release refused a private or unexpected file: ${relative}/${name}`);
    await add(`${relative}/${name}`);
   }
   return;
  }
  if(!info.isFile()||(!rootFiles.has(relative)&&!extensions.has(extname(relative)))||info.size>2*1024*1024)throw Error(`Release refused an unexpected source file: ${relative}`);
  const bytes=await readFile(path),text=bytes.toString('utf8');
  if(text.includes('\0')||/\bsk-[A-Za-z0-9_-]{20,}\b/.test(text)||/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text)||/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/.test(text))throw Error(`Release refused a possible secret or non-text file: ${relative}. Remove private data before packaging.`);
  files.push({path:relative,data:bytes.toString('base64'),executable:relative.endsWith('.command')});
 }
 for(const name of (await readdir(root)).sort())if(rootFiles.has(name)||rootDirectories.has(name))await add(name);
 return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export async function buildRelease({root=ROOT,destination=join(root,'dist','oaia-studio.zip')}={}){
 const files=await releaseFiles(root);if(!files.length)throw Error('No release source files were found.');
 await mkdir(dirname(resolve(destination)),{recursive:true});
 const payload=JSON.stringify({destination:resolve(destination),files});
 await new Promise((resolve,reject)=>{
  const child=spawn(resolvePython(),[fileURLToPath(new URL('./package_zip.py',import.meta.url))],{stdio:['pipe','ignore','pipe']});
  child.stderr.resume();child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Release ZIP could not be created. Check the output folder and Python installation.')));child.stdin.on('error',()=>{});child.stdin.end(payload);
 });
 return {destination:resolve(destination),files:files.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Use: node scripts/package.mjs [--output /path/to/oaia-studio.zip]');
  const result=await buildRelease(args.length?{destination:args[1]}:{});console.log(`Created ${result.destination} (${result.files} source files; no runtime, keys, or image history).`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
