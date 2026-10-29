import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {acquireLaunchLock} from '../scripts/launch-lock.mjs';
test('a stale launch lock recovers, while a live launch remains exclusive',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-lock-')),path=join(dir,'lock');
 await writeFile(path,JSON.stringify({pid:99999999}));
 const release=await acquireLaunchLock(path);await assert.rejects(acquireLaunchLock(path));await release();await assert.rejects(access(path));
});
