import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {ROOT} from '../src/config.mjs';
import {resolvePython} from '../src/runtime.mjs';
try{const result=spawnSync(resolvePython(),[join(ROOT,'scripts/keychain.py'),'set'],{stdio:'inherit'});process.exitCode=result.status??1;}
catch(e){console.error(e.message);process.exitCode=1;}
