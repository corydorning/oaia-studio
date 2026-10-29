import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceLoader} from '../public/reference.js';
class Reader {static all=[];constructor(){Reader.all.push(this);}readAsDataURL(){}abort(){this.onabort?.();}finish(value){this.result='data:image/png;base64,'+value;this.onload();}}
test('reference remains marked loading until bytes are ready',()=>{
 let state;const loader=createReferenceLoader(s=>state=s,Reader);loader.add([{type:'image/png',name:'A',size:100}]);
 assert.equal(state.loading,true);assert.equal(state.value,null);
 Reader.all.at(-1).finish('AAAA');assert.equal(state.loading,false);assert.equal(state.value[0].base64,'AAAA');
});
test('older reference reads cannot override the new selection or restore a removed reference',()=>{
 let state;const loader=createReferenceLoader(s=>state=s,Reader);
 loader.add([{type:'image/png',name:'A',size:100}]);const a=Reader.all.at(-1);
 loader.clear();loader.add([{type:'image/png',name:'B',size:100}]);const b=Reader.all.at(-1);
 b.finish('BBBB');a.finish('AAAA');assert.equal(state.value[0].base64,'BBBB');
 loader.clear();b.finish('BBBB');assert.deepEqual(state.value,[]);assert.equal(state.loading,false);
});
