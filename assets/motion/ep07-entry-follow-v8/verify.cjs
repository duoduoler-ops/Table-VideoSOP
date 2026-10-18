'use strict';
// Narrow implementation checks for this revision. These checks do not accept visual quality.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scene=require('./src/scene.cjs');
const {frameAt,CONFIG,carrierAt}=scene,{cameraAt,CAMERA_EVENTS}=require('./src/camera.cjs');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
 if(args[i]==='--help'){console.log('node verify.cjs [--runtime <existing node_modules containing sharp>] [--out <new report.json>]');process.exit(0);}
 if(!['--runtime','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid argument '+args[i]);
 options[args[i].slice(2)]=args[++i];
}
if(options.out&&fs.existsSync(path.resolve(options.out)))throw Error('OUTPUT_EXISTS: choose a new report');
const checks=[],failures=[],skipped=[];
const {spawnSync}=require('node:child_process');
function test(name,fn){try{const detail=fn();checks.push({name,pass:true,...(detail?{detail}:{})});}catch(e){checks.push({name,pass:false,message:e.message});failures.push(name);}}
const obj=(s,id)=>s.objects.find(o=>o.id===id);
const near=(a,b,tol=1e-7,message='coordinates differ')=>assert(Math.abs(a-b)<=tol,`${message}: ${a} / ${b}`);
const screen=(s,x,y)=>[960+(x-s.camera.cx)*s.camera.z,540+(y-s.camera.cy)*s.camera.z];
function group(svg,id){const m=new RegExp('<g id="'+id+'"[^>]*>').exec(svg);if(!m)return '';let level=1,end=m.index+m[0].length;const re=/<g\b[^>]*>|<\/g>/g;re.lastIndex=end;for(let n;(n=re.exec(svg));){level+=n[0].startsWith('</')?-1:1;if(!level)return svg.slice(end,n.index);}throw Error('Unclosed group '+id);}
const attr=(tag,key)=>new RegExp('(?:^|\\s)'+key+'="([^"]*)"').exec(tag)?.[1];
function paths(t,id){return [...group(frameAt(t).svg,id).matchAll(/<path\b[^>]*>/g)].map(m=>({d:attr(m[0],'d'),dash:attr(m[0],'stroke-dasharray'),pathLength:attr(m[0],'pathLength')}));}
function polygonArea(d){const tokens=d.match(/[MLHVZmlhvz]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi),p=[];let i=0,cmd='',x=0,y=0;while(i<tokens.length){if(/[A-Za-z]/.test(tokens[i]))cmd=tokens[i++];if(cmd==='Z'||cmd==='z')break;if(cmd==='M'||cmd==='L'){x=Number(tokens[i++]);y=Number(tokens[i++]);}else if(cmd==='H')x=Number(tokens[i++]);else if(cmd==='V')y=Number(tokens[i++]);else throw Error('Unsupported polygon command '+cmd);p.push([x,y]);}return Math.abs(p.reduce((sum,a,j)=>{const b=p[(j+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;}
test('792 independently evaluated frames have unique object IDs and finite world and screen coordinates',()=>{assert.equal(CONFIG.duration*CONFIG.fps,792);for(let f=0;f<792;f++){const s=frameAt(f/60),ids=s.objects.map(o=>o.id);assert.equal(ids.length,new Set(ids).size,`duplicate object F${f}`);const svgIds=[...s.svg.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(svgIds.length,new Set(svgIds).size,`duplicate SVG ID F${f}`);for(const k of ['cx','cy','z','x','y','w','h'])assert(Number.isFinite(s.camera[k]),`camera ${k} F${f}`);assert(s.camera.z>0);for(const o of s.objects){for(const k of ['x','y','w','h','opacity','scale','scaleY'])assert(Number.isFinite(o[k]),`${o.id}.${k} F${f}`);assert(o.w>=0&&o.h>=0);for(const v of screen(s,o.x,o.y))assert(Number.isFinite(v));}}});
test('Random access yields the same entire SVG and state before and after sequential evaluation',()=>{const ts=[12.5,0,5.58,3.08,7.9,11.08,5.65,8.25,3.75,10.5,6.5],saved=ts.map(t=>frameAt(t));for(let f=0;f<792;f++)frameAt(f/60);ts.forEach((t,i)=>assert.deepEqual(frameAt(t),saved[i],`different direct state ${t}`));});
test('Second-row copies and extracted operation copies start at their actual source positions',()=>{const evidence=[];['rename','transcode','archive'].forEach((type,j)=>{const start=.54+j*.09,s=frameAt(start),src=obj(s,'history-1-'+type),copy=obj(s,'history-2-'+type);assert(copy&&src);near(copy.x,src.x);near(copy.y,src.y);const first=Math.ceil(start*60-1e-8)/60,firstCopy=obj(frameAt(first),'history-2-'+type);evidence.push({id:copy.id,start,firstSample:first,sourceOffsetAtStart:[copy.x-src.x,copy.y-src.y],firstSampleDisplacement:Math.hypot(firstCopy.x-src.x,firstCopy.y-src.y)});});const s=frameAt(3.08);for(const type of ['rename','transcode','archive']){const copy=obj(s,'recipe-'+type),src=obj(s,'history-2-'+type);near(copy.x,src.x);near(copy.y,src.y);}const i=frameAt(3.34),copy=obj(i,'source-history-input'),src=obj(i,'history-input-1');near(copy.x,src.x);near(copy.y,src.y);return evidence;});
test('Fold polygons begin with zero area and then develop real area, independent of reported bounding boxes',()=>{const upper0=paths(5.58,'script-upper-fold')[0],lower0=paths(5.58,'script-lower-fold')[0];assert(upper0&&lower0);near(polygonArea(upper0.d),0);near(polygonArea(lower0.d),0);const upper=polygonArea(paths(5.70,'script-upper-fold')[0].d),lower=polygonArea(paths(5.85,'script-lower-fold')[0].d);assert(upper>1000&&lower>1000);return {initialUpperArea:0,initialLowerArea:0,upperAt5_70:upper,lowerAt5_85:lower,measurement:'actual SVG path polygon area; not object bbox'};});
if(options.runtime)test('New connections grow in actual sharp/librsvg pixels with early and mid paths short of the endpoint',()=>{
 const sets=[
  ['history-link-1-0',.94,1.04,1.14,[0,0,40,1],[40,0]],
  ['recipe-link-0',5.49,5.59,5.69,[0,0,48,1],[48,0]],
  ['recipe-link-1',5.57,5.67,5.77,[0,0,48,1],[48,0]],
  ['execution-route',6.86,7.08,7.30,[0,0,56,133],[28,133]],
  ['execution-output-route',7,7.18,7.36,[0,0,20,167],[0,167]],
  ['backup-input-binding',9.72,9.91,10.10,[2700,800,520,580],[2712,835]],
  ['backup-connected-link',10.88,10.96,11.04,[0,0,207,1],[207,0]],
  ['backup-data-route',11.04,11.18,11.32,[0,0,300,1],[300,0]]
 ],requests=[],evidence=[];
 for(const [id,a,m,b,bounds,end] of sets){
  const first=(Math.floor(a*60+1e-8)+1)/60;
  const stages=[['start',a],['first-rendered-frame',first],['mid',m],['full',b]];
  for(const [stage,t] of stages){
   const [x,y,w,h]=bounds,width=Math.ceil(w+16),height=Math.ceil(h+16),view=[x-8,y-8,width,height];
   const body=group(frameAt(t).svg,id);
   assert(!body.includes('pathLength='),`${id} still relies on normalized pathLength`);
   requests.push({id,stage,t,endPixel:[end[0]-view[0],end[1]-view[1]],svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${view.join(' ')}"><rect x="${view[0]}" y="${view[1]}" width="${width}" height="${height}" fill="#FFFFFF"/><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`});
  }
 }
 // Counterexamples use the SAME backend. Never infer pixel correctness from progress fields.
 const fixture=(id,body)=>({id,stage:'negative',t:null,endPixel:[308,8],svg:'<svg xmlns="http://www.w3.org/2000/svg" width="316" height="16" viewBox="-8 -8 316 16"><rect x="-8" y="-8" width="316" height="16" fill="white"/><g fill="none" stroke="#FF6500" stroke-width="3" stroke-linecap="round">'+body+'</g></svg>'});
 requests.push(fixture('negative-full-at-mid','<path d="M0 0H300"/>'));
 requests.push(fixture('negative-old-normalized-mid','<path d="M0 0H300" pathLength="1" stroke-dasharray="0.5 1"/>'));
 // This is the explicitly selected existing sharp backend and exact scene SVG path body.
 // Isolating the line makes pixel coverage measurable without mistaking underlying cards for it.
 const worker=`const fs=require('node:fs'),sharp=require(${JSON.stringify(path.resolve(options.runtime,'sharp'))});(async()=>{const rows=JSON.parse(fs.readFileSync(0,'utf8')),out=[];for(const r of rows){const {data,info}=await sharp(Buffer.from(r.svg)).flatten({background:'#FFFFFF'}).removeAlpha().raw().toBuffer({resolveWithObject:true});let pixels=0,endPixels=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const k=(y*info.width+x)*info.channels;if(Math.min(data[k],data[k+1],data[k+2])<250){pixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(Math.abs(x-r.endPixel[0])<=3&&Math.abs(y-r.endPixel[1])<=3)endPixels++;}}out.push({id:r.id,stage:r.stage,t:r.t,pixels,endPixels,pixelBounds:pixels?[minX,minY,maxX-minX+1,maxY-minY+1]:null});}console.log(JSON.stringify({backend:sharp.versions,rows:out}));})().catch(e=>{console.error(e);process.exit(1)});`;
 const result=spawnSync(process.execPath,['-e',worker],{input:JSON.stringify(requests),encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(result.status,0,result.stderr);
 const measured=JSON.parse(result.stdout);
 for(const [id] of sets){const rows=measured.rows.filter(r=>r.id===id),[start,first,mid,full]=rows;assert.equal(start.pixels,0,`${id} visible at zero progress`);assert(first.pixels>0&&first.pixels<full.pixels*.15,`${id} first frame already too much path: ${first.pixels}/${full.pixels}`);assert(mid.pixels>full.pixels*.25&&mid.pixels<full.pixels*.8,`${id} midpoint path ratio ${mid.pixels/full.pixels}`);assert.equal(first.endPixels,0,`${id} initial frame reaches endpoint`);assert.equal(mid.endPixels,0,`${id} midpoint reaches endpoint`);assert(full.endPixels>0,`${id} full path does not reach endpoint`);evidence.push({id,frames:rows,firstCoverageFraction:first.pixels/full.pixels,midCoverageFraction:mid.pixels/full.pixels});}
 const rejectsMid=row=>row.endPixels>0||row.pixels>=measured.rows.find(x=>x.id==='backup-data-route'&&x.stage==='full').pixels*.8;
 const fullNegative=measured.rows.find(x=>x.id==='negative-full-at-mid');
 assert(rejectsMid(fullNegative),'Pixel check accepted a full path masquerading as intermediate reveal');
 const oldNegative=measured.rows.find(x=>x.id==='negative-old-normalized-mid');
 const negativeControls={fullPathAtMidpoint:'rejected',normalizedDashOldBug:rejectsMid(oldNegative)?'reproduced-and-rejected':'not-reproduced-in-selected-backend',measurements:[fullNegative,oldNegative]};
 const route=evidence.find(x=>x.id==='backup-data-route');assert(route.frames[1].pixelBounds[2]<=6,'300 px path first render is not a short tip');assert(route.frames[2].pixelBounds[2]<160,'300 px path midpoint already full width');
 return {method:'Actual production sharp/librsvg rendering of unchanged path groups, measured non-white pixels and final-endpoint region; normalized pathLength-field check withdrawn.',renderer:{sharp:measured.backend.sharp,rsvg:measured.backend.rsvg,vips:measured.backend.vips},negativeControls,evidence};
});
else skipped.push({name:'production-renderer-pixel-reveal',status:'not-run',reason:'No --runtime supplied. Geometry checks do not establish pixel output.'});
test('C enters the actual input seat after readiness, passes the three steps, and creates no premature copy',()=>{assert(!frameAt(7.49).events.scriptReady);assert(frameAt(7.56).events.scriptReady);const s=frameAt(7.9),slot=obj(s,'generic-input'),c=obj(s,'working-file');assert(c.x>=slot.x&&c.x+c.w<=slot.x+slot.w);assert(c.y>=slot.y&&c.y+115*c.scale<=slot.y+slot.h);const dt=1e-5,speeds=[];for(const t of [7.9,8.15,8.5,8.8]){const a=obj(frameAt(t-dt),'working-file'),b=obj(frameAt(t),'working-file'),c=obj(frameAt(t+dt),'working-file'),vl=[(b.x-a.x)/dt,(b.y-a.y)/dt],vr=[(c.x-b.x)/dt,(c.y-b.y)/dt];assert(Math.hypot(...vl)>100);assert(Math.hypot(vr[0]-vl[0],vr[1]-vl[1])<1);speeds.push({t,worldSpeed:Math.hypot(...vl)});}for(const t of [9.08,10.8,11.04,11.079])assert(!obj(frameAt(t),'backup-copy'));const arrival=frameAt(11.08),original=obj(arrival,'working-file'),copy=obj(arrival,'backup-copy');assert(arrival.events.backupConnected);near(copy.x,original.x);near(copy.y,original.y);return {slotAt7_90:{x:slot.x,y:slot.y,w:slot.w,h:slot.h},fileImageAt7_90:{x:c.x,y:c.y,w:c.w,h:115*c.scale},passSpeeds:speeds,copyBornAtOriginal:11.08};});
test('Archived original remains in world position while copy leaves; final wide shows complete steps and destinations',()=>{const base=obj(frameAt(11.08),'working-file');for(let f=665;f<792;f++){const s=frameAt(f/60),o=obj(s,'working-file');near(o.x,base.x);near(o.y,base.y);}const evidence=[];for(const t of [12.56,13.19]){const s=frameAt(t);for(const id of ['recipe-rename','recipe-transcode','recipe-archive','backup-action','working-file','backup-copy','first-backup-file','archive-final-front','backup-final-front']){const o=obj(s,id);assert(o,id);const [x,y]=screen(s,o.x,o.y),w=o.w*s.camera.z,h=o.h*s.camera.z;assert(x>=0&&x+w<=1920&&y>=0&&y+h<=1080,`${id} cropped ${t}: ${[x,y,w,h]}`);if(t===12.56)evidence.push({id,screen:[x,y,w,h]});}}return evidence;});
test('Camera follows the actual carrier and copy anchors, with no positional discontinuity at joins',()=>{let maxFallbackError=0;for(let f=0;f<792;f++){const t=f/60,s=frameAt(t),cam=cameraAt(t);maxFallbackError=Math.max(maxFallbackError,Math.abs(s.camera.cx-cam[0]),Math.abs(s.camera.cy-cam[1]),Math.abs(s.camera.z-cam[2]));}assert(maxFallbackError<1e-6,`anchor fallback mismatch ${maxFallbackError}`);const anchorSamples=[];for(const t of [3.55,3.90,6.50,6.95]){const s=frameAt(t),actual=carrierAt(t),o=obj(s,'operation-carrier');near(o.x,actual[0]);near(o.y,actual[1]);const moved=cameraAt(t,{carrier:[actual[0]+100,actual[1]-60,1]});near(moved[0]-s.camera.cx,100);near(moved[1]-s.camera.cy,-60);anchorSamples.push({t,carrierTopLeft:actual.slice(0,2),screenCenter:screen(s,o.x+400,o.y+o.h/2)});}for(const t of [11.20,11.5,11.9]){const s=frameAt(t),o=obj(s,'backup-copy'),q=screen(s,o.x+50,o.y+100);near(q[0],1100);near(q[1],580);const original=obj(s,'working-file'),pos=screen(s,original.x,original.y);assert(pos[0]>=0&&pos[0]+original.w*s.camera.z<=1920&&pos[1]>=0&&pos[1]+original.h*s.camera.z<=1080,`original cropped while following copy at ${t}`);}const joins=[.28,.90,3.34,4.08,6.32,7.10,10.76,11.20,12.00,12.12,12.56],eps=1e-7;let maxJoinJump=0;for(const t of joins){const a=cameraAt(t-eps),b=cameraAt(t+eps);maxJoinJump=Math.max(maxJoinJump,Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]));assert(Math.abs(a[0]-b[0])<.01&&Math.abs(a[1]-b[1])<.01&&Math.abs(a[2]-b[2])<.0001,`camera discontinuity at ${t}`);}return {maxFallbackError,maxJoinJump,anchorSamples,copyAnchorScreen:[1100,580],followAndPullbackOverlap:[12,12.12]};});

test('Actual prefix geometry grows; zero progress has no path and endpoint is not present at midpoint',()=>{
 const {linePrefix}=scene;
 assert.equal(linePrefix('M0 0H300',0),'');
 const mid=linePrefix('M0 0H300',.5);assert.match(mid,/L150\.0000 0\.0000/);assert(!mid.includes('300'));
 assert.equal(linePrefix('M0 0H300',1),'M0 0H300');
 const start=linePrefix('M0 0C0 100 100 100 100 0',.001),curveMid=linePrefix('M0 0C0 100 100 100 100 0',.5);
 assert(start!==curveMid&&curveMid!==linePrefix('M0 0C0 100 100 100 100 0',1));
 for(const bad of ['M0 0Q150 100 300 0','m0 0h300','M0 0A10 10 0 0 0 30 30','M0 0L30 30Z','M0 0H300!'])
  for(const q of [0,.5,1])assert.throws(()=>linePrefix(bad,q),/Unsupported revealed path syntax/);
 assert.match(linePrefix('M-5.5 .25H1e2',.5),/L47\.2500 0\.2500/);
 assert.throws(()=>linePrefix('M0 0H300',NaN),/Invalid revealed path or progress/);
});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('motion-audit adapter uses actual final-screen transforms and preserves timeline references',()=>{
 const {exportAudit}=require('./src/state.cjs'),spec=exportAudit();
 assert.equal(spec.coverage.basis,'render-state-final-screen');assert.equal(spec.videoFile,undefined);
 for(const a of scene.ACTIONS){const exported=spec.actions.find(x=>x.id===a.id);assert(exported);assert.equal(exported.objectId,a.objectId);near(exported.start,a.start);near(exported.end,a.end);assert.equal(exported.kind,a.kind==='process'?'reveal':a.kind);assert.deepEqual(exported.channels,a.channels);}
 assert.deepEqual(spec.relays,scene.RELAYS);assert.deepEqual(spec.coverage.cameraEvents,CAMERA_EVENTS);
 for(const p of scene.CHECKPOINTS){const exported=spec.checkpoints.find(x=>x.id===p.id);near(exported.time,p.time);assert.deepEqual(exported.objectIds,p.objectIds);if(p.role!=='pass')assert.equal(exported.exception.evidence.anchor,p.exception);}
 for(let f=0;f<=792;f++){
  const t=f/60,actual=frameAt(t),audit=spec.frameAt(t),map=new Map(actual.objects.map(o=>[o.id,o]));
  assert.equal(audit.objects.length,spec.coverage.objectIds.length);assert.deepEqual(audit.camera,{cx:actual.camera.cx,cy:actual.camera.cy,z:actual.camera.z});
  for(const o of audit.objects){const source=map.get(o.id);if(!source){assert.equal(o.opacity,0);continue;}
   const [x,y]=screen(actual,source.x,source.y),w=source.w*actual.camera.z,h=source.h*actual.camera.z;
   near(o.x,x);near(o.y,y);near(o.width,w);near(o.height,h);
   assert.equal(o.opacity,x<1920&&y<1080&&x+w>0&&y+h>0?source.opacity:0);
  }
 }
 return {coveredObjectIds:spec.coverage.objectIds.length,allOutputFramesAndEndBoundary:793,measured:'Declared rendered bounds composed with actual camera; not painted pixels or occlusion'};
});
test('Portable implementation bytes match recorded LF-normalized source locks',()=>{
 const provenance=JSON.parse(fs.readFileSync(path.join(__dirname,'provenance.json'),'utf8'));
 for(const f of provenance.sourceFiles){const bytes=fs.readFileSync(path.join(__dirname,f.packaged));assert.equal(sha(bytes.toString('utf8').replaceAll('\r\n','\n')),f.packagedLfSha256,f.packaged);}
});
const sourceFiles=['src/scene.cjs','src/camera.cjs','src/mg-primitives.cjs'];
const report={status:failures.length?'failed':'requested-technical-checks-complete',generatedAt:new Date().toISOString(),frames:792,
 sources:sourceFiles.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(__dirname,p)))})),checks,skipped,
 pixelCheck:options.runtime?(checks.find(c=>c.name.startsWith('New connections'))?.pass?'complete':'failed'):'not-run',
 visualAcceptance:'not-assessed',cameraEvents:CAMERA_EVENTS,
 limitations:['This is an example regression, not a general threshold or new-content quality approval.','No encoded-video playback or 1x listening is performed.','Geometry/state cannot establish actual rendered entrance; pixel checks require the production runtime.','Pixel line isolation does not check full-scene occlusion, text reading, semantic intention or normal-speed continuity.']};
const text=JSON.stringify(report,null,2)+'\n';
if(options.out)fs.writeFileSync(path.resolve(options.out),text,{encoding:'utf8',flag:'wx'});
console.log(text);if(failures.length)process.exitCode=1;
