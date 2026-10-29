import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readlink,realpath,rm,lstat,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {installSkill,installationTargets} from '../scripts/install-skill.mjs';
import {buildRelease} from '../scripts/package.mjs';
import {resolvePython} from '../src/runtime.mjs';
import {ROOT} from '../src/config.mjs';
const exec=promisify(execFile);
async function temporary(t){const dir=await mkdtemp(join(tmpdir(),'oaia-studio-install-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const destinations=dir=>({codexSkills:join(dir,'codex-skills'),claudeSkills:join(dir,'claude-skills')});

test('installation targets honor CODEX_HOME without changing the process home',()=>{
 const original=process.env.HOME,targets=installationTargets({home:'/example/home',env:{CODEX_HOME:'/example/custom-codex'}});
 assert.deepEqual(targets.map(t=>t.path),['/example/custom-codex/skills/oaia-studio','/example/home/.claude/skills/oaia-studio']);assert.equal(process.env.HOME,original);
 assert.deepEqual(installationTargets({home:'/example/home',env:{}}).map(t=>t.path),['/example/home/.codex/skills/oaia-studio','/example/home/.claude/skills/oaia-studio']);
});
test('installer links the canonical complete package for both clients and repeats safely',async t=>{
 const dir=await temporary(t),alias=join(dir,'app-link');await symlink(ROOT,alias,'dir');
 const first=await installSkill({root:alias,...destinations(dir)}),canonical=await realpath(ROOT);
 assert.equal(first.links.length,2);
 for(const link of first.links){assert.equal(link.status,'installed');assert.equal(await readlink(link.path),canonical);assert.ok((await lstat(link.path)).isSymbolicLink());assert.ok(await readFile(join(link.path,'skills/oaia-studio/SKILL.md'),'utf8'));}
 const again=await installSkill({root:ROOT,...destinations(dir)});assert.ok(again.links.every(link=>link.status==='already-installed'));
});
test('conflicting files, directories and dangling links are preserved before either client changes',async t=>{
 for(const kind of ['file','directory','link']){
  const dir=await temporary(t),opts=destinations(dir),conflict=join(opts.claudeSkills,'oaia-studio');await mkdir(opts.claudeSkills,{recursive:true});
  if(kind==='file')await writeFile(conflict,'keep this file');
  if(kind==='directory'){await mkdir(conflict);await writeFile(join(conflict,'keep.txt'),'keep this directory');}
  if(kind==='link')await symlink(join(dir,'missing-target'),conflict);
  await assert.rejects(installSkill({root:ROOT,...opts}),/already exists|conflict/i);
  await assert.rejects(access(join(opts.codexSkills,'oaia-studio')));
  if(kind==='file')assert.equal(await readFile(conflict,'utf8'),'keep this file');
  if(kind==='directory')assert.equal(await readFile(join(conflict,'keep.txt'),'utf8'),'keep this directory');
  if(kind==='link')assert.equal(await readlink(conflict),join(dir,'missing-target'));
 }
});
test('an already-installed full package directory is accepted without creating a self-link',async t=>{
 const dir=await temporary(t),opts=destinations(dir),result=await installSkill({root:ROOT,codexSkills:join(ROOT,'..'),claudeSkills:opts.claudeSkills,skillName:'oaia-studio'});
 assert.equal(result.links[0].status,'already-installed');assert.ok((await lstat(ROOT)).isDirectory());assert.equal(await realpath(result.links[1].path),await realpath(ROOT));
});
test('concurrent installers can share the same intended links without overwriting anything',async t=>{
 const dir=await temporary(t),options={root:ROOT,...destinations(dir)};
 const results=await Promise.all([installSkill(options),installSkill(options)]);assert.equal(results.length,2);
 for(const path of Object.values(destinations(dir)))assert.equal(await realpath(join(path,'oaia-studio')),await realpath(ROOT));
});
test('an incomplete skill-only folder is rejected before creating client destinations',async t=>{
 const dir=await temporary(t),root=join(dir,'incomplete');await mkdir(root);await writeFile(join(root,'SKILL.md'),'---\nname: oaia-studio\ndescription: Test\n---\n');
 await assert.rejects(installSkill({root,...destinations(dir)}),/complete|missing/i);
 for(const path of Object.values(destinations(dir)))await assert.rejects(access(path));
});
test('a clean extracted source package installs for both clients and runs helper help through either link',async t=>{
 const dir=await temporary(t),zip=join(dir,'release.zip'),extracted=join(dir,'unpacked');await buildRelease({destination:zip});
 await exec(resolvePython(),['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',zip,extracted]);
 const root=join(extracted,'oaia-studio'),opts=destinations(dir);
 await access(join(root,'SKILL.md'));await access(join(root,'Install OAIA Skill.command'));
 const run=await exec(process.execPath,[join(root,'scripts/install-skill.mjs'),'--codex-skills',opts.codexSkills,'--claude-skills',opts.claudeSkills]);assert.match(run.stdout,/installed/i);
 for(const skills of Object.values(opts)){
  const linked=join(skills,'oaia-studio');assert.equal(await realpath(linked),await realpath(root));
  const result=await exec(process.execPath,[join(linked,'skills/oaia-studio/scripts/oaia-studio.mjs'),'--help'],{cwd:dir});assert.match(result.stdout,/prepare REQUEST\.json/);assert.match(result.stdout,/status RECORD_DIRECTORY/);
 }
 await assert.rejects(access(join(root,'.runtime')));
});
test('public packages include reusable source notes and exclude local task history',async t=>{
 const dir=await temporary(t),root=join(dir,'package');await mkdir(join(root,'docs/superpowers/plans'),{recursive:true});
 await writeFile(join(root,'docs/sources.md'),'Public API references');await writeFile(join(root,'docs/spec.md'),'Private original task instructions');await writeFile(join(root,'docs/superpowers/plans/local.md'),'Private planning history');
 const {releaseFiles}=await import('../scripts/package.mjs');
 assert.deepEqual((await releaseFiles(root)).map(file=>file.path),['docs/sources.md']);
 assert.equal(await readFile(join(root,'docs/spec.md'),'utf8'),'Private original task instructions');
});
