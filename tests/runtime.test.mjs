import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolvePython} from '../src/runtime.mjs';
const exec=promisify(execFile);
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'studio-runtime-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function fakePython(path,version='3.12.1'){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,`#!/bin/sh\nprintf 'Python ${version}\\n'\n`,{mode:0o700});}
test('Python discovery validates versions and uses PATH when the bundle is missing or too old',async t=>{
 const dir=await fixture(t),bin=join(dir,'bin'),fallback=join(dir,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
 await fakePython(join(bin,'python3'),'3.7.9');await fakePython(fallback);
 assert.equal(resolvePython({env:{PATH:bin},home:dir,knownPaths:[]}),fallback);
 await fakePython(fallback,'3.7.9');await fakePython(join(bin,'python3'),'3.11.8');assert.equal(resolvePython({env:{PATH:bin},home:dir,knownPaths:[]}),join(bin,'python3'));
 await rm(fallback);assert.equal(resolvePython({env:{PATH:bin},home:dir,knownPaths:[]}),join(bin,'python3'));
});
test('an explicit invalid Python override gives actionable guidance without silently choosing another runtime',async t=>{
 const dir=await fixture(t);assert.throws(()=>resolvePython({env:{LOCAL_IMAGE_STUDIO_PYTHON:join(dir,'missing')},home:dir,knownPaths:[]}),/Python 3\.8.*LOCAL_IMAGE_STUDIO_PYTHON/s);
});
test('double-click Node discovery accepts the installed runtime and rejects a bad explicit override',async()=>{
 const script=join(import.meta.dirname,'../scripts/runtime.zsh');
 const result=await exec('/bin/zsh',['-c','source "$1"; studio_find_node','zsh',script],{env:{...process.env,LOCAL_IMAGE_STUDIO_NODE:process.execPath}});
 assert.equal(result.stdout.trim(),process.execPath);
 await assert.rejects(exec('/bin/zsh',['-c','source "$1"; studio_find_node','zsh',script],{env:{...process.env,LOCAL_IMAGE_STUDIO_NODE:'/does/not/exist'}}),e=>/Node.js 22/.test(e.stderr));
});
test('Node discovery rejects 22.0 and 22.1, accepts 22.2 and newer for PNG checksum support',async t=>{
 const dir=await fixture(t),node=join(dir,'node'),script=join(import.meta.dirname,'../scripts/runtime.zsh');
 for(const [version,allowed] of [['22.0.0',false],['22.1.0',false],['22.2.0',true],['22.20.0',true],['24.0.0',true]]){
  await writeFile(node,`#!/bin/sh\nprintf 'v${version}\\n'\n`,{mode:0o700});
  const run=()=>exec('/bin/zsh',['-c','source "$1"; studio_find_node','zsh',script],{env:{...process.env,LOCAL_IMAGE_STUDIO_NODE:node}});
  if(allowed)assert.equal((await run()).stdout.trim(),node);else await assert.rejects(run(),e=>/22\.2/.test(e.stderr));
 }
});
test('an existing bundled Python keeps Keychain access when Homebrew is also available',async t=>{
 const dir=await fixture(t),bin=join(dir,'bin'),bundled=join(dir,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
 await fakePython(join(bin,'python3'),'3.14.7');await fakePython(bundled,'3.12.14');
 assert.equal(resolvePython({env:{PATH:bin},home:dir,knownPaths:[]}),bundled);
});
test('a valid explicit Python override takes precedence over the bundled interpreter',async t=>{
 const dir=await fixture(t),override=join(dir,'preferred/python3'),bundled=join(dir,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
 await fakePython(override);await fakePython(bundled);
 assert.equal(resolvePython({env:{LOCAL_IMAGE_STUDIO_PYTHON:override},home:dir,knownPaths:[]}),override);
});
