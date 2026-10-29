import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {StudioManager,openBrowser} from './studios.mjs';
import {lanAddresses} from '../src/network.mjs';

function showReady(studio){
 console.log(`\n${studio.name} is ready: ${studio.url}`);
 for(const ip of lanAddresses())console.log(`Local network: http://${ip}:${studio.port}`);
 console.log(`Images: ${studio.dataDir}`);
}
function showList(rows){
 console.log('\nOAIA Studio — studios');
 if(!rows.length)console.log('No studios have been started yet. Open Default to begin.');
 for(const row of rows)console.log(`  ${row.name}: ${row.error|| (row.running?`${row.url}${row.active?' · generating':''}`:'stopped')}`);
}
async function menu(manager){
 if(!stdin.isTTY)throw Error('Open Manage OAIA Studios.command in Terminal, or use open/list/stop from the command line.');
 const input=createInterface({input:stdin,output:stdout});
 try{
  console.log('Each studio has its own history and image queue. All studios share the saved API key and credit balance.');
  for(;;){
   showList(await manager.list());
   console.log('\n1  Open a studio\n2  Create a studio\n3  Stop a studio\n4  Restart a studio\n5  Refresh list\n0  Close this menu');
   const choice=(await input.question('\nChoose: ')).trim();if(choice==='0')return;if(choice==='5')continue;
   if(!['1','2','3','4'].includes(choice)){console.log('Choose a number from the menu.');continue;}
   const name=(await input.question(choice==='2'?'New studio name: ':'Studio name [Default]: ')).trim();
   if(choice==='2'&&!name){console.log('Enter a name to create a studio.');continue;}
   try{
    if(choice==='3'){const result=await manager.stop(name||'default');console.log(`${result.name} is stopped.`);}
    else{const result=choice==='4'?await manager.restart(name||'default'):await manager.ensure(name||'default');showReady(result);await openBrowser(result.url);}
   }catch(e){console.error(e.message);}
  }
 }finally{input.close();}
}
export async function main(args=process.argv.slice(2)){
 process.umask(0o077);
 const noOpen=args.includes('--no-open'),positional=args.filter(arg=>arg!=='--no-open'),mode=positional[0]||'open',name=positional[1]||'default';
 const manager=new StudioManager();
 try{
  if(positional.length>2||!['open','create','stop','restart','list','manage'].includes(mode))throw Error('Use: node scripts/launch.mjs open|create|stop|restart|list|manage [studio name] [--no-open]');
  if(mode==='manage')return await menu(manager);
  if(mode==='list'){showList(await manager.list());return;}
  if(mode==='stop'){const result=await manager.stop(name);console.log(`${result.name} is stopped.`);return;}
  const studio=mode==='restart'?await manager.restart(name):await manager.ensure(name);showReady(studio);if(!noOpen)await openBrowser(studio.url);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
