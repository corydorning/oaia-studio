import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {ROOT} from './config.mjs';
import {resolvePython} from './runtime.mjs';
let python;const runtime=()=>python??=resolvePython();
const exec=promisify(execFile);
export async function credentialStatus(){
 try {const {stdout}=await exec(runtime(),[join(ROOT,'scripts/keychain.py'),'status'],{timeout:15000,maxBuffer:1024});return JSON.parse(stdout).configured===true;}catch{return false;}
}
export async function getKey(){
 try {const {stdout}=await exec(runtime(),[join(ROOT,'scripts/keychain.py'),'read'],{timeout:30000,maxBuffer:4096});const key=stdout.trim();if(!key.startsWith('sk-'))throw Error();return key;}
 catch{throw new Error('API key unavailable. Open Configure OAIA API Key.command, then check connection.');}
}
