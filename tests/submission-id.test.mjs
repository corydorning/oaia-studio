import test from 'node:test';
import assert from 'node:assert/strict';
import {newSubmissionId} from '../public/submission-id.js';
test('creates valid request IDs when HTTP on a LAN address does not expose randomUUID',()=>{
 const random={getRandomValues:array=>globalThis.crypto.getRandomValues(array)};
 const a=newSubmissionId(random),b=newSubmissionId(random);
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.notEqual(a,b);
});
