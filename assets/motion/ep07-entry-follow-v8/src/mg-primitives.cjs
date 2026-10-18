// Shared native SVG primitives. No text, raster images, external assets or defs.
const C = {canvas:'#FDF7E4',surface:'#FFFFFF',card:'#FFFDF9',ink:'#373733',muted:'#77736B',action:'#FF6500',system:'#58728A',line:'#DCE3E8',status:'#FFF8F1'};
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

function iconMarkup(type,cx,cy,scale=1,color=C.system) {
  let d='';
  if(type==='rename') d=`<rect x="-29" y="-22" width="58" height="44" rx="8" fill="none"/><path d="M-16 -5H7M-16 8H0M13 -27V-10M7 -27H19M7 -10H19"/>`;
  if(type==='transcode') d=`<rect x="-31" y="-24" width="62" height="48" rx="7" fill="none"/><path d="M-22 -24V24M22 -24V24M-31 -12H-22M-31 2H-22M-31 16H-22M22 -12H31M22 2H31M22 16H31M-10 -8H9L3 -14M10 8H-9L-3 14"/>`;
  if(type==='archive') d=`<path d="M-31 -14V-21Q-31 -25 -26 -25H-6L3 -16H26Q31 -16 31 -11V21Q31 25 26 25H-26Q-31 25 -31 20Z" fill="${C.surface}"/><path d="M-29 -8H29M-11 7H11"/>`;
  // The rear file remains visible at its top and left; the front file is a separate copy.
  if(type==='backup') d=`<path d="M-27 13V-26H2L14 -14V13Z" fill="${C.card}"/><path d="M2 -26V-14H14"/><path d="M-13 27V-12H16L28 0V27Z" fill="${C.surface}"/><path d="M16 -12V0H28M-4 9H17M-4 17H11"/>`;
  return `<g transform="translate(${cx} ${cy}) scale(${scale})" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
}

function videoBody({w=78,h=92,variant='A',accent=C.system}={}) {
  let body=`<rect width="${w}" height="${h}" rx="12" fill="${C.surface}" stroke="${accent}" stroke-width="2.4"/>`;
  body+=`<path d="M0 20H${w}" stroke="${C.line}" stroke-width="2"/><circle cx="12" cy="10" r="2" fill="${accent}"/><circle cx="21" cy="10" r="2" fill="${accent}"/>`;
  body+=`<rect x="14" y="31" width="${w-28}" height="${h-50}" rx="5" fill="${accent}" opacity=".09"/>`;
  if(variant==='B') {
    body+=`<circle cx="${w*.66}" cy="${h*.46}" r="${Math.min(w,h)*.065}" fill="${accent}"/><path d="M${w*.24} ${h*.73}L${w*.41} ${h*.52}L${w*.55} ${h*.68}L${w*.67} ${h*.58}L${w*.78} ${h*.73}Z" fill="${accent}"/>`;
  } else if(variant==='C') {
    body+=`<rect x="${w*.28}" y="${h*.48}" width="${w*.13}" height="${h*.25}" rx="2" fill="${accent}"/><rect x="${w*.46}" y="${h*.40}" width="${w*.13}" height="${h*.33}" rx="2" fill="${accent}"/><rect x="${w*.64}" y="${h*.55}" width="${w*.13}" height="${h*.18}" rx="2" fill="${accent}"/>`;
  } else {
    body+=`<path d="M${w*.43} ${h*.48}L${w*.43} ${h*.72}L${w*.65} ${h*.60}Z" fill="${accent}"/>`;
  }
  return body;
}

module.exports={C,esc,iconMarkup,videoBody};
