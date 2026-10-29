import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {JobStore} from '../src/generation.mjs';
import {png} from './png-fixture.mjs';

test('a failed replacement preserves the previous approved selection after reopening',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'studio-publish-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const id=randomUUID(),dir=join(dataDir,id);await mkdir(dir);
 const original=png(1328,2880),approved=png(1320,2868),replacement=png(1024,1024);
 await writeFile(join(dir,'image.png'),original);
 await writeFile(join(dir,'settings.json'),JSON.stringify({id,status:'complete',createdAt:new Date().toISOString()}));
 const options={dataDir,keyProvider:async()=>{throw Error('must not generate');}};
 const store=await JobStore.open(options);
 const first=await store.publish(id,{name:'hole-1.png',title:'Hole 1 — Lakeside',reviewStatus:'approved',image:{base64:approved.toString('base64')}});
 store.save=async()=>{throw Error('simulated metadata write failure');};
 await assert.rejects(store.publish(id,{name:'replacement.png',reviewStatus:'review',image:{base64:replacement.toString('base64')}}),/simulated metadata write failure/);
 assert.deepEqual(store.get(id).selectedImage,first.selectedImage);
 const reopened=await JobStore.open(options),selected=reopened.get(id).selectedImage;
 assert.deepEqual(selected,first.selectedImage);
 assert.deepEqual(await readFile(join(dir,selected.file)),approved);
 assert.deepEqual(await readFile(join(dir,'image.png')),original);
});
