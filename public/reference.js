import {referenceSelectionError} from './image-options.js';
export function createReferenceLoader(onChange,Reader=FileReader){
 let items=[],nextId=1,selectionError=null;
 const emit=()=>{
  const loading=items.some(item=>item.loading),error=selectionError||items.find(item=>item.error)?.error||null;
  onChange({items:items.map(({reader,...item})=>item),loading,error,value:loading||error?null:items.map(item=>item.value)});
 };
 const clear=()=>{const old=items;items=[];selectionError=null;for(const item of old)item.reader?.abort();emit();};
 const remove=id=>{const old=items.find(item=>item.id===id);items=items.filter(item=>item.id!==id);selectionError=null;old?.reader?.abort();emit();};
 const add=files=>{
  const incoming=Array.from(files||[]);selectionError=referenceSelectionError([...items.map(i=>i.file),...incoming]);
  if(selectionError){emit();return;}
  const additions=incoming.map(file=>({id:nextId++,file,value:null,loading:true,error:null,reader:new Reader()}));
  items.push(...additions);emit();
  for(const item of additions){
   const reader=item.reader;
   reader.onload=()=>{if(!items.includes(item))return;item.reader=null;item.loading=false;item.value={base64:String(reader.result).split(',')[1],mime:item.file.type,name:item.file.name};emit();};
   reader.onerror=()=>{if(!items.includes(item))return;item.reader=null;item.loading=false;item.error=`Could not read ${item.file.name}. Remove it and add it again.`;emit();};
   reader.readAsDataURL(item.file);
  }
 };
 return {add,remove,clear};
}
