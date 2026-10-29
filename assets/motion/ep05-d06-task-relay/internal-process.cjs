// SPDX-License-Identifier: MIT
// Portable DocCard -> Slip extraction. Timeline pAt drives reading, picked rule,
// rewrite, teeth and contact. This is an actual incompatibility/adaptation example,
// not a generic review gate. World transfer and camera remain project decisions.
const TL=require('./src/timeline.cjs');
const RANGE=Object.freeze([32.2,33.75]);
const bounds=Object.freeze({width:1000,height:560});
const C={card:'#FFFDF9',ink:'#373733',action:'#FF6500',system:'#58728A',line:'#DCE3E8',status:'#FFF8F1'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function stateAt(sourceSeconds,options={}){
  if(!Number.isFinite(sourceSeconds))throw Error('sourceSeconds must be finite');
  const t=TL.clamp(sourceSeconds,...RANGE),source=TL.pAt(t),slip=source.slips?.find(s=>s.headerB)??source.slips?.[0]??{},doc=source.doc??{};
  const before=options.before??['时长：“6秒”','画幅：“横屏”','声音：“加音效”'],after=options.after??['时长：6（秒）','宽高：1920 × 1080','声音：环境声、拟音'];
  const requirements=options.requirements??['分别提供输入参数','时长采用数值','宽度和高度分别提供','保留文件路径','保留原始输入','时长、宽高和声音须分列','动作写清起止时间','声音写明实际来源','删除无关指令','保存适配后的副本'];
  if(!Array.isArray(before)||before.length!==3||!Array.isArray(after)||after.length!==3||!Array.isArray(requirements)||requirements.length!==10||[...before,...after,...requirements].some(x=>typeof x!=='string'||!x.length))throw Error('Content requires three before/after rows and ten requirement rows');
  const rowIds=['duration','dimensions','sound'],binding=options.binding??{requirementIndex:5,rowIds};
  if(!Number.isInteger(binding.requirementIndex)||binding.requirementIndex<0||binding.requirementIndex>=requirements.length||!Array.isArray(binding.rowIds)||!binding.rowIds.length||new Set(binding.rowIds).size!==binding.rowIds.length||binding.rowIds.some(id=>!rowIds.includes(id)))throw Error('Binding requires a valid requirement index and actual row IDs');
  const rewrite=slip.rewrite??0,teethK=slip.teethK??0;
  // Geometry replaces the legacy JSX alpha swap; the source progress, stagger,
  // reading and contact remain intact. Four old teeth merge into two mating teeth.
  const teeth=[[0,44],[66,44],[132,44],[198,44]].map(([y,h],i)=>({
    y:TL.lerp(y,i<2?10:130,teethK),height:TL.lerp(h-12,84,teethK),width:20,
  }));
  return {kind:'rule-adaptation',sourceSeconds:t,bounds:{...bounds},content:{before:[...before],after:[...after],requirements:[...requirements]},
    document:{read:doc.readP??0,readOpacity:doc.readO??0,pick:doc.pickK??0,selectedRow:binding.requirementIndex},
    binding:{requirementIndex:binding.requirementIndex,rowIds:[...binding.rowIds]},
    rows:before.map((text,i)=>{const selected=binding.rowIds.includes(rowIds[i]);return{id:rowIds[i],before:text,after:selected?after[i]:text,erase:selected?TL.clamp(rewrite*1.6-i*.18):0,reveal:selected?TL.clamp((rewrite*1.5-.3-i*.15)/(1.2-i*.15)):0};}),
    rewrite,teethK,teeth,header:slip.headerK??0,contact:slip.squash??0,dockX:slip.headerB?slip.x-2848:-68,
    source};
}
function renderSvg(s,{idPrefix='adapt'}={}){
  if(s?.kind!=='rule-adaptation')throw Error('Expected rule-adaptation state');
  if(!/^[A-Za-z][\w-]*$/.test(idPrefix))throw Error('idPrefix must be a safe unique SVG id prefix');
  const d=s.document,tx=(x,y,str,size=18)=>`<text x="${x}" y="${y}" fill="${C.ink}" font-size="${size}" textLength="${Math.min(286,[...str].length*size*.9)}" lengthAdjust="spacingAndGlyphs">${esc(str)}</text>`;
  const defs=s.rows.map((r,i)=>`<clipPath id="${idPrefix}-old-${i}"><rect x="${520+320*r.erase}" y="${185+i*68}" width="${320*(1-r.erase)}" height="40"/></clipPath><clipPath id="${idPrefix}-new-${i}"><rect x="520" y="${185+i*68}" width="${320*r.reveal}" height="40"/></clipPath>`).join('');
  const rules=s.content.requirements.map((r,i)=>`${i===d.selectedRow?`<rect x="48" y="${111+i*34}" width="312" height="31" rx="6" fill="${C.status}" stroke="${C.action}" stroke-width="${2*d.pick}" opacity="${d.pick}"/>`:''}${tx(60,132+i*34,r)}`).join('');
  const rows=s.rows.map((r,i)=>`<g clip-path="url(#${idPrefix}-old-${i})">${tx(520,212+i*68,r.before)}</g><g clip-path="url(#${idPrefix}-new-${i})" transform="translate(${18*(1-r.reveal)} 0)">${tx(520,212+i*68,r.after)}</g>`).join('');
  return `<g font-family="Microsoft YaHei, Segoe UI, sans-serif"><defs>${defs}</defs>
    <rect x="28" y="50" width="352" height="448" rx="16" fill="${C.card}" stroke="${C.line}" stroke-width="2"/>
    ${tx(60,90,'官方输入约束',25)}${rules}<rect x="44" y="${111+d.read*310}" width="320" height="31" rx="6" fill="${C.system}" opacity="${.23*d.readOpacity}"/>
    <path d="M360 ${127+d.selectedRow*34} C420 ${127+d.selectedRow*34} 420 160 500 160" fill="none" stroke="${C.action}" stroke-width="3" stroke-dasharray="500 500" stroke-dashoffset="${500*(1-d.pick)}"/>
    <g transform="translate(${s.dockX} 0) translate(880 280) scale(${1-.02*s.contact} ${1+.03*s.contact}) translate(-880 -280)">
    <rect x="490" y="128" width="370" height="304" rx="16" fill="${C.card}" stroke="${C.system}" stroke-width="2"/>
    ${tx(520,168,'输入内容',25)}${rows}
    ${s.teeth.map(a=>`<rect x="860" y="${158+a.y}" width="${a.width}" height="${a.height}" rx="5" fill="${C.system}"/>`).join('')}
    </g><path d="M912 155 V168 H880 V252 H912 V288 H880 V372 H912 V410" fill="none" stroke="${C.line}" stroke-width="8" stroke-linejoin="round"/>
    </g>`;
}
function renderDocument(state,options={}){return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${renderSvg(state,options)}</svg>`;}
module.exports={stateAt,renderSvg,renderDocument,bounds,sourceRange:RANGE};
