import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {releaseFiles,buildRelease} from '../scripts/package.mjs';
import {resolvePython} from '../src/runtime.mjs';
const exec=promisify(execFile);
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'studio-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of ['src','scripts','tests','docs','public','skills','.runtime','outputs','node_modules','dist'])await mkdir(join(root,dir));
 for(const [path,text] of [['README.md','A reusable studio'],['package.json','{}'],['.gitignore','.runtime/\n'],['Open OAIA Studio.command','#!/bin/zsh\n'],['src/app.mjs','export const safe=true;'],['src/credentials.mjs','export const status=()=>false;'],['public/index.html','<p>Studio</p>'],['skills/SKILL.md','A reusable local workflow'],['.runtime/account.json','private account'],['.env','secret'],['outputs/image.png','image'],['node_modules/leak.mjs','dependency'],['dist/old.zip','archive']])await writeFile(join(root,path),text);
 return root;
}
test('release allowlist excludes runtime, local account, environment, dependencies and generated output',async t=>{
 const root=await fixture(t),files=await releaseFiles(root),names=files.map(file=>file.path);
 assert.deepEqual(names,['.gitignore','Open OAIA Studio.command','README.md','package.json','public/index.html','skills/SKILL.md','src/app.mjs','src/credentials.mjs']);
});
test('release refuses likely credentials in source and never prints their value',async t=>{
 const root=await fixture(t),secret='sk-'+'x'.repeat(40);await writeFile(join(root,'src/accidental.mjs'),`const key='${secret}';`);
 await assert.rejects(releaseFiles(root),error=>/credential|secret/i.test(error.message)&&!error.message.includes(secret));
});
test('release refuses symlinks and private-looking files inside allowed directories',async t=>{
 const root=await fixture(t);await symlink(join(root,'.env'),join(root,'src/linked.mjs'));await assert.rejects(releaseFiles(root),/symbolic|symlink/i);
 await rm(join(root,'src/linked.mjs'));await writeFile(join(root,'docs','.env.local'),'do not include');await assert.rejects(releaseFiles(root),/private|unexpected/i);
});
test('release ZIPs reproduce the same bytes and carry executable Finder launchers',async t=>{
 const root=await fixture(t),a=join(root,'dist/a.zip'),b=join(root,'dist/b.zip');
 await buildRelease({root,destination:a});await buildRelease({root,destination:b});assert.deepEqual(await readFile(a),await readFile(b));
 const result=await exec(resolvePython(),['-c','import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({i.filename: oct(i.external_attr >> 16) for i in z.infolist()}))',a]);
 const contents=JSON.parse(result.stdout);assert.equal(contents['oaia-studio/Open OAIA Studio.command'],'0o100755');assert.ok(!Object.keys(contents).some(path=>/\.runtime|\.env|node_modules|outputs|old\.zip/.test(path)));
});
