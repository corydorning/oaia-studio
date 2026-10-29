import {mkdir,lstat,realpath,symlink,readlink,unlink,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SKILL_NAME='oaia-studio';
const PACKAGE_ROOT=fileURLToPath(new URL('..',import.meta.url));
const completePackageFiles=['SKILL.md',`skills/${SKILL_NAME}/SKILL.md`,`skills/${SKILL_NAME}/scripts/${SKILL_NAME}.mjs`,'src/config.mjs','src/server.mjs','src/generation.mjs','scripts/studios.mjs','scripts/runtime.zsh'];
function within(path,root){const part=relative(root,path);return part===''||(part!=='..'&&!part.startsWith('../')&&!isAbsolute(part));}
export function installationTargets({home=homedir(),env=process.env,codexSkills,claudeSkills,skillName=SKILL_NAME}={}){
 if(typeof skillName!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(skillName))throw Error('The skill name must contain lowercase letters, numbers, or hyphens.');
 return [
  {client:'Codex',path:join(resolve(codexSkills||join(env.CODEX_HOME||join(home,'.codex'),'skills')),skillName)},
  {client:'Claude Code',path:join(resolve(claudeSkills||join(home,'.claude','skills')),skillName)}
 ];
}
async function validatePackage(root){
 for(const file of completePackageFiles){
  let target,info;try{target=await realpath(join(root,file));info=await stat(target);}catch{throw Error(`Install the complete app package; a required file is missing: ${file}`);}
  if(!within(target,root)||!info.isFile())throw Error(`Install the complete app package; this resource must be a file inside it: ${file}`);
 }
}
async function targetStatus(target,root){
 let info;try{info=await lstat(target.path);}catch(e){if(e.code==='ENOENT')return 'missing';throw e;}
 if(info.isDirectory()||info.isSymbolicLink()){
  const current=await realpath(target.path).catch(()=>null);if(current===root)return 'already-installed';
 }
 throw Error(`${target.client}: ${target.path} already exists and belongs to another installation. Nothing there was replaced. Choose a different destination or resolve that conflict yourself.`);
}
export async function installSkill({root=PACKAGE_ROOT,...options}={}){
 const canonical=await realpath(root);await validatePackage(canonical);
 const targets=installationTargets(options),states=[];
 // Check both clients before creating either link, including dangling symlinks.
 for(const target of targets){const status=await targetStatus(target,canonical);if(status==='missing'&&within(target.path,canonical))throw Error('Install destinations must be outside the app package.');states.push({...target,status});}
 const created=[],links=[];
 try{
  for(const target of states){
   let status=target.status;
   if(status==='missing'){
    await mkdir(dirname(target.path),{recursive:true,mode:0o700});
    const actualTarget=join(await realpath(dirname(target.path)),options.skillName||SKILL_NAME);
    if(within(actualTarget,canonical))throw Error('Install destinations must be outside the app package.');
    try{await symlink(canonical,target.path,'dir');const identity=await lstat(target.path);created.push({path:target.path,ino:identity.ino,dev:identity.dev});status='installed';}
    catch(e){if(e.code!=='EEXIST')throw e;status=await targetStatus(target,canonical);}
   }
   links.push({client:target.client,path:target.path,status});
  }
 }catch(error){
  // Roll back only links this call created; never remove a pre-existing entry.
  for(const createdLink of created){const current=await lstat(createdLink.path).catch(()=>null);if(current?.isSymbolicLink()&&current.ino===createdLink.ino&&current.dev===createdLink.dev&&(await readlink(createdLink.path))===canonical)await unlink(createdLink.path);}
  throw error;
 }
 return {root:canonical,skillName:options.skillName||SKILL_NAME,links};
}
export async function main(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log(`Install the ${SKILL_NAME} skill for Codex and Claude Code.\nUsage: node scripts/install-skill.mjs [--codex-skills DIRECTORY] [--claude-skills DIRECTORY]\n\nDefaults: $CODEX_HOME/skills (or ~/.codex/skills) and ~/.claude/skills.\nEach destination gets a ${SKILL_NAME} link to this complete app folder. Existing unrelated entries are never overwritten. No studio is started and no credentials are read.`);return;}
 const options={};
 for(let i=0;i<args.length;i+=2){const key={'--codex-skills':'codexSkills','--claude-skills':'claudeSkills'}[args[i]],value=args[i+1];if(!key||!value||value.startsWith('--')||options[key])throw Error('Invalid arguments. Run node scripts/install-skill.mjs --help.');options[key]=value;}
 const result=await installSkill(options);
 for(const link of result.links)console.log(`${link.client}: ${link.status==='installed'?'installed':'already installed'} ${link.path}`);
 console.log(`Both clients use ${result.root}. Keep this folder in place.\nUse $${result.skillName} in Codex or /${result.skillName} in Claude Code. If it is not listed yet, start a new turn or session.`);
}
if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>resolve(process.argv[1]))===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
