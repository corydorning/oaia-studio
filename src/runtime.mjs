import {homedir} from 'node:os';
import {join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';

export function resolvePython({env=process.env,home=homedir(),knownPaths=['/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3']}={}){
 const override=env.LOCAL_IMAGE_STUDIO_PYTHON;
 // Keep the original Keychain interpreter when available: macOS can authorize one
 // Python executable to read an item while another can only see that it exists.
 const bundled=join(home,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
 const candidates=override?[override]:[bundled,...(env.PATH||'').split(delimiter).filter(Boolean).map(dir=>join(dir,'python3')),...knownPaths];
 for(const candidate of new Set(candidates)){
  const result=spawnSync(candidate,['--version'],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']});
  const version=/Python (\d+)\.(\d+)/.exec(result.stdout||result.stderr||'');
  if(result.status===0&&version&&(Number(version[1])>3||Number(version[1])===3&&Number(version[2])>=8))return candidate;
 }
 throw Error('Python 3.8 or newer is required for macOS Keychain. Install Python 3 from python.org or Homebrew, then reopen the app. You may set LOCAL_IMAGE_STUDIO_PYTHON to its full path. No software was installed.');
}
