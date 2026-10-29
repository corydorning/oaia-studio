import {crc32,deflateSync} from 'node:zlib';
function chunk(type,data){const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,8+data.length)),8+data.length);return b;}
const cache=new Map();
export function png(w=3840,h=2160,padding=0){
 const key=`${w},${h},${padding}`;if(cache.has(key))return cache.get(key);
 const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;
 const parts=[Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((w+1)*h)))];
 if(padding)parts.push(chunk('stUD',Buffer.alloc(padding)));
 parts.push(chunk('IEND',Buffer.alloc(0)));const b=Buffer.concat(parts);cache.set(key,b);return b;
}
