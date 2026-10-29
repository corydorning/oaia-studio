import test from 'node:test';
import assert from 'node:assert/strict';
import {allowConnection,lanAddresses} from '../src/network.mjs';
const interfaces={en0:[{family:'IPv4',internal:false,address:'192.168.1.20',netmask:'255.255.255.0'}],utun4:[{family:'IPv4',internal:false,address:'100.108.190.115',netmask:'255.255.255.255'}]};
const request=(extra={})=>({host:'192.168.1.20:8787',remoteAddress:'192.168.1.50',port:8787,...extra});
test('accepts the Mac LAN IP from its local subnet and retains localhost access',()=>{
 assert.equal(allowConnection(request(),interfaces),true);
 assert.equal(allowConnection(request({host:'127.0.0.1:8787',remoteAddress:'127.0.0.1'}),interfaces),true);
 assert.equal(allowConnection(request({host:'localhost:8787',remoteAddress:'127.0.0.1'}),interfaces),true);
 assert.deepEqual(lanAddresses(interfaces),['192.168.1.20']);
});
test('rejects unrecognized hosts, wrong ports and peers outside the local subnet',()=>{
 for(const extra of [{host:'attacker.example:8787'},{host:'192.168.1.99:8787'},{host:'192.168.1.20:80'},{remoteAddress:'8.8.8.8'},{remoteAddress:'192.168.2.50'},{remoteAddress:'100.108.190.100'}])assert.equal(allowConnection(request(extra),interfaces),false);
});
