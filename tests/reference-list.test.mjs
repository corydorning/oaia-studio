import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceLoader} from '../public/reference.js';
class Reader {static all=[];constructor(){Reader.all.push(this);}readAsDataURL(){}abort(){}finish(value){this.result='data:image/png;base64,'+value;this.onload();}fail(){this.onerror();}}
const file=(name,size=100)=>({name,size,type:'image/png'});

test('multiple file reads preserve selection order and block until every file is ready',()=>{
 let state;const loader=createReferenceLoader(s=>state=s,Reader);loader.add([file('A'),file('B')]);
 const [a,b]=Reader.all.slice(-2);b.finish('BBBB');assert.equal(state.loading,true);assert.equal(state.value,null);
 a.finish('AAAA');assert.equal(state.loading,false);assert.deepEqual(state.value.map(r=>r.base64),['AAAA','BBBB']);
 loader.add([file('C')]);Reader.all.at(-1).finish('CCCC');assert.deepEqual(state.value.map(r=>r.name),['A','B','C']);
});
test('removed or cleared pending files cannot reappear after their reads finish',()=>{
 let state;const loader=createReferenceLoader(s=>state=s,Reader);loader.add([file('A'),file('B')]);const [a,b]=Reader.all.slice(-2);
 loader.remove(state.items[0].id);a.finish('AAAA');b.finish('BBBB');assert.deepEqual(state.value.map(r=>r.name),['B']);
 loader.clear();b.finish('BBBB');assert.deepEqual(state.value,[]);
});
test('failed and over-limit reference selections cannot submit an incomplete set',()=>{
 let state;const loader=createReferenceLoader(s=>state=s,Reader);loader.add([file('A')]);Reader.all.at(-1).fail();
 assert.ok(state.error);assert.equal(state.value,null);loader.remove(state.items[0].id);assert.equal(state.error,null);
 loader.add(Array.from({length:17},(_,i)=>file(String(i))));assert.ok(state.error);assert.equal(state.items.length,0);
 loader.clear();loader.add([file('too-big',15*1024*1024)]);assert.ok(state.error);assert.equal(state.items.length,0);
 loader.clear();loader.add(Array.from({length:4},(_,i)=>file(String(i),14*1024*1024)));assert.ok(state.error);assert.equal(state.items.length,0);
});
