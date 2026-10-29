import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';

function privateIPv4(address){
 if(isIP(address)!==4)return false;
 const [a,b]=address.split('.').map(Number);
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}
function localInterfaces(interfaces){
 return Object.values(interfaces).flatMap(entries=>entries||[]).filter(entry=>entry.family==='IPv4'&&!entry.internal&&privateIPv4(entry.address)&&isIP(entry.netmask)===4);
}
const numeric=address=>address.split('.').reduce((value,part)=>(value<<8)|Number(part),0);
export function lanAddresses(interfaces=networkInterfaces()){
 return [...new Set(localInterfaces(interfaces).map(entry=>entry.address))];
}
export function allowConnection({host,remoteAddress,port},interfaces=networkInterfaces()){
 const local=localInterfaces(interfaces);
 const hosts=['localhost','127.0.0.1',...local.map(entry=>entry.address)].map(address=>`${address}:${port}`);
 if(!hosts.includes(host)||isIP(remoteAddress)!==4)return false;
 if(remoteAddress.startsWith('127.'))return true;
 if(!privateIPv4(remoteAddress))return false;
 return local.some(entry=>(numeric(remoteAddress)&numeric(entry.netmask))===(numeric(entry.address)&numeric(entry.netmask)));
}
