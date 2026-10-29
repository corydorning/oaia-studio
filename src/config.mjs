import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const DATA_DIR=resolve(homedir(),'Pictures','Local Image Studio');
export const MODELS=[
 {id:'gpt-image-2.5-sunburst',name:'GPT Image 2.5 Sunburst',description:'Most capable · precise edits and complex images'},
 {id:'gpt-image-2.5-flare',name:'GPT Image 2.5 Flare',description:'Faster everyday generation'}
];
export const SIZES=[
 {id:'3840x2160',label:'4K landscape · 3840 × 2160',experimental:true},
 {id:'2160x3840',label:'4K portrait · 2160 × 3840',experimental:true},
 {id:'2560x1440',label:'1440p landscape · 2560 × 1440'},
 {id:'1440x2560',label:'1440p portrait · 1440 × 2560'},
 {id:'1536x1024',label:'Standard landscape · 1536 × 1024'},
 {id:'1024x1536',label:'Standard portrait · 1024 × 1536'},
 {id:'1024x1024',label:'Square · 1024 × 1024'},
 {id:'custom',label:'Custom'}
];
export const QUALITIES=['low','medium','high','xhigh','max','auto'];
export const PRICING={checked:'2026-10-29',textInputPerMillion:5,imageInputPerMillion:8,imageOutputPerMillion:30,
 note:'OpenAI does not publish a reliable per-image estimate for GPT Image 2.5. Quality, prompt and reference affect token use. Example only: 10,000 image output tokens cost $0.30, plus input. This is not a 4K price quote.',
 source:'https://developers.openai.com/api/docs/models/gpt-image-2.5-flare'};
