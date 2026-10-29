export const MAX_REFERENCES=16;
export const MAX_REFERENCE_BYTES=15*1024*1024-64;
export const MAX_REFERENCE_TOTAL_BYTES=50*1024*1024;
export function sizeError(size){
 const match=typeof size==='string'&&size.match(/^(\d{1,4})x(\d{1,4})$/);
 if(!match)return 'Enter a width and height in pixels.';
 const width=Number(match[1]),height=Number(match[2]);
 if(!width||!height||width%16||height%16)return 'Width and height must be positive multiples of 16. Dimensions are never rounded.';
 if(width>3840||height>3840)return 'Neither edge can exceed 3840 pixels.';
 if(width>height*3||height>width*3)return 'Use an aspect ratio between 1:3 and 3:1.';
 if(width*height<655360||width*height>8294400)return 'Use between 655,360 and 8,294,400 total pixels.';
 return null;
}
export function referenceSelectionError(files){
 if(files.length>MAX_REFERENCES)return 'Choose up to 16 reference images.';
 if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||!Number.isFinite(f.size)||f.size>MAX_REFERENCE_BYTES))return 'Each reference must be a PNG, JPEG or WebP under 15 MB.';
 if(files.reduce((sum,f)=>sum+f.size,0)>MAX_REFERENCE_TOTAL_BYTES)return 'Reference images must total 50 MB or less.';
 return null;
}
