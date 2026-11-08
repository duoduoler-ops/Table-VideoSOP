// MIT. Copy this authored example, then replace its content, layout and audio event windows.
// It is not a recipe requiring every topic to become inspection / repair / routing.
'use strict';
const {createStage}=require('./stage.cjs');
const {tray,workpiece,inspectionBench,label,INK}=require('./parts.cjs');
const {makeCamera,projectPoint}=require('./space.cjs');
const {cubicPath,createCameraMove,followCamera,handoffCamera}=require('./camera.cjs');
const {createTiming,cubicBezier}=require('./timing.cjs');
const kit=require('./motion-kit.cjs');
const CONFIG={width:1280,height:720,fps:30,duration:11};
const DEFAULT={
  parts:[{id:'a',length:48},{id:'b',length:76},{id:'c',length:54}],limit:60,repairCapacity:20,
  labels:{source:'待检组件',inspect:'逐件核对',accepted:'进入装配',rework:'退回返修'},
  // Illustrative silent timings. Formal production replaces these with adopted voice/audio events.
  // Neighbouring stages overlap at each hand-off: the next one starts while the previous one is still settling.
  windows:{transport:[0.8,3.0],scan:[2.8,4.2],repair:[4.05,6.2],dispatch:[6.3,8.8],overview:[8.6,9.6],retire:[9.75,10.85]},
};
const MAX_HANDOFF_OVERLAP=0.6;
const clamp=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,p)=>a+(b-a)*p;
const vMix=(a,b,p)=>a.map((n,i)=>mix(n,b[i],p));

function normalize(input={}) {
  const p={...DEFAULT,...input,labels:{...DEFAULT.labels,...input.labels},windows:{...DEFAULT.windows,...input.windows},config:{...CONFIG,...input.config}};
  if (!Array.isArray(p.parts)||p.parts.length!==3||new Set(p.parts.map(x=>x.id)).size!==3) throw Error('Example requires exactly three uniquely named parts; redesign parts.cjs for other structures.');
  if(p.parts.some(x=>typeof x.id!=='string'||!Number.isFinite(x.length)||x.length<=0||x.length>90))throw Error('Part lengths must be finite and in (0,90].');
  if(!Number.isFinite(p.limit)||p.limit<=0||p.limit>80||!Number.isFinite(p.repairCapacity)||p.repairCapacity<0)throw Error('Invalid limit / repairCapacity');
  for(const [name,window] of Object.entries(p.windows))if(!Array.isArray(window)||window.length!==2||window.some(x=>!Number.isFinite(x))||window[0]<0||window[1]<=window[0]||window[1]>p.config.duration)throw Error('Invalid '+name+' window');
  // Causality is about onset order: a stage starts only after its cause has begun, and may overlap the cause's
  // settling tail by at most MAX_HANDOFF_OVERLAP seconds. Requiring every stage to stop before the next starts
  // produces move-stop-move slides, so it is not required.
  const chainOrder=['transport','scan','repair','dispatch','retire'];
  for(let i=1;i<chainOrder.length;i++){const a=p.windows[chainOrder[i-1]],b=p.windows[chainOrder[i]];if(b[0]<a[0]||b[0]<a[1]-MAX_HANDOFF_OVERLAP)throw Error('Transport, inspection, repair, dispatch and retirement must start in causal order; a hand-off may overlap the previous stage by at most '+MAX_HANDOFF_OVERLAP+' s (causality).');}
  return p;
}

function createScene(rawInput={}) {
  const input=normalize(rawInput), {windows:w,config}=input, viewport={width:config.width,height:config.height};
  const failures=input.parts.map((p,i)=>p.length>input.limit?i:-1).filter(i=>i>=0);
  const repairable=failures.filter(i=>input.parts[i].length-input.limit<=input.repairCapacity);
  const finalLengths=input.parts.map((p,i)=>repairable.includes(i)?input.limit:p.length);
  const route=finalLengths.every(v=>v<=input.limit)?'accepted':'rework';
  const source=[-500,0,180], bench=[0,32,40], destinations={accepted:[500,-105,240],rework:[500,235,-30]};
  const destination=destinations[route];
  const travel=createTiming({start:w.transport[0],end:w.transport[1],knots:[{time:w.transport[0],progress:0,speed:0},{time:mix(...w.transport,.38),progress:.29},{time:mix(...w.transport,.72),progress:.81},{time:w.transport[1],progress:1,speed:0}]});
  const outgoing=createTiming({start:w.dispatch[0],end:w.dispatch[1]});
  const scan=createTiming({start:w.scan[0],end:w.scan[1]});
  const retire=createTiming({start:w.retire[0],end:w.retire[1]});
  const incomingPath=cubicPath([source,[-390,-60,80],[-130,-70,-45],bench]);
  const outgoingPath=cubicPath([bench,[160,20,-95],[350,destination[1]-100,destination[2]-65],destination]);
  const repairSpan=(w.repair[1]-w.repair[0])/Math.max(1,repairable.length);
  const repairs=repairable.map((index,j)=>({index,start:w.repair[0]+j*repairSpan,end:w.repair[0]+(j+1)*repairSpan}));
  const progressIn=(t,a,b)=>cubicBezier(.42,0,.38,1)(clamp((t-a)/(b-a)));
  function stateAt(t) {
    const partProgress=input.parts.map(()=>0), offcutFall=input.parts.map(()=>0), offcutLand=input.parts.map(()=>0);
    let activePart=-1,cutProgress=0,cutterY=-52,previousY=-52,cutterLength=input.limit,previousLength=input.limit;
    for(const r of repairs){
      const p=progressIn(t,r.start,r.end);partProgress[r.index]=p;
      offcutFall[r.index]=kit.seg(t,r.start+(r.end-r.start)*.16,r.end+.35,kit.ease.fall);
      offcutLand[r.index]=kit.press(t-(r.end+.35));
      if(t>=r.start-.22&&t<=r.end+.12){activePart=r.index;cutProgress=p;}
      const targetY=14+r.index*46;
      if(t>=r.start-.35){
        const aim=progressIn(t,r.start-.35,r.start);
        // Anticipation: the tool lifts slightly just before it bites, then presses in.
        cutterY=mix(previousY,targetY,aim)-10*kit.bump(t,r.start-.2,.2);
        cutterLength=t<r.start?mix(previousLength,input.parts[r.index].length,aim):mix(input.parts[r.index].length,finalLengths[r.index],p);
      }
      previousY=targetY;
      previousLength=finalLengths[r.index];
    }
    if(repairs.length&&t>=w.repair[1])cutterY=mix(previousY,-52,progressIn(t,w.repair[1],w.repair[1]+.35));
    const lengths=input.parts.map((p,i)=>mix(p.length,finalLengths[i],partProgress[i]));
    // Anticipation before leaving: pull back a little, then go.
    const pull=14*kit.seg(t,w.dispatch[0]-.18,w.dispatch[0])*(1-kit.seg(t,w.dispatch[0],w.dispatch[0]+.12));
    const base=t<=w.transport[1]?incomingPath(travel(t)):t<w.dispatch[0]?bench:outgoingPath(outgoing(t));
    const position=[base[0]-pull,base[1],base[2]];
    // Secondary motion. Arrival presses the carrier and the bench answers 3 frames later; the carrier rolls
    // slightly along its arc; on delivery the receiving tray takes the load after the same lag.
    const kitPress=6*(kit.press(t-w.transport[1])+kit.press(t-w.dispatch[1]));
    const benchPress=3*kit.press(t-w.transport[1]-kit.LAG.near)+2*Math.max(0,...offcutLand);
    const trayPress=5*kit.press(t-w.dispatch[1]-kit.LAG.near);
    const roll=t<=w.transport[1]?3*Math.sin(Math.PI*travel(t)):t>=w.dispatch[0]&&t<=w.dispatch[1]?-3*Math.sin(Math.PI*outgoing(t)):0;
    const retirement=retire(t),retiredOffset=[0,-1200*retirement,240*retirement];
    return {t,position,lengths,finalLengths,partProgress,offcutFall,offcutLand,activePart,cutProgress,cutterY,cutterLength,route,failures,repairable,kitPress,benchPress,trayPress,roll,
      scanProgress:scan(t),gateProgress:progressIn(t,w.repair[1],w.dispatch[0]),received:t>=w.dispatch[1],retiredOffset};
  }
  const focalLength=1050,cam=(position,target)=>makeCamera({position,target,viewport,focalLength});
  const opening=cam([-560,-110,-1120],[-460,0,160]);
  // Close enough to read the changing edge, tool contact and dimensional limit together.
  const inspection=cam([-25,-30,-440],[0,40,70]);
  const overview=cam([10,-120,-1700],[30,20,120]);
  const approachStart=Math.max(w.transport[0],w.transport[1]-1.5);
  const approach=createCameraMove({positionPath:cubicPath([opening.position,[-490,-150,-1240],[-155,-120,-500],inspection.position]),
    targetPath:cubicPath([opening.target,[-320,-15,110],[-90,10,75],inspection.target]),start:approachStart,end:w.transport[1],viewport,focalLength,
    timing:kit.cameraTiming(approachStart,w.transport[1])});
  const inspectionAnchor=projectPoint(bench,inspection);
  function following(t){
    const u=outgoing(t),s=stateAt(t);
    const orientation=cam(vMix(inspection.position,[380,-170,-1180],u),vMix(inspection.target,destination,u));
    // Widen toward reception so the source edge and receiving socket remain in context.
    // XYZ curvature comes from the actual carrier route and authored aim; no decorative depth oscillation.
    return followCamera({subject:s.position,screenAnchor:[mix(inspectionAnchor.x,viewport.width*.46,u),mix(inspectionAnchor.y,viewport.height*.47,u)],distance:mix(inspectionAnchor.depth,1250,u),orientation});
  }
  const depart=handoffCamera({follow:()=>inspection,destination:following,start:w.dispatch[0]-.3,end:w.dispatch[0]+.3,timing:kit.cameraTiming(w.dispatch[0]-.3,w.dispatch[0]+.3)});
  const endView=handoffCamera({follow:following,destination:overview,start:w.overview[0],end:w.overview[1],timing:kit.cameraTiming(w.overview[0],w.overview[1])});
  function cameraAt(t){if(t<w.transport[0])return opening;if(t<=w.transport[1])return approach(t);if(t<w.dispatch[0]-.3)return inspection;if(t<w.dispatch[0]+.3)return depart(t);if(t<w.overview[0])return following(t);return endView(t);}
  const actions=[
    {id:'carry-to-inspection',objectId:'kit',start:w.transport[0],end:w.transport[1],kind:'transfer'},
    {id:'camera-approach',objectId:'inspection',start:approachStart,end:w.transport[1],kind:'camera'},
    {id:'scan-parts',objectId:'inspection.scanner',start:w.scan[0],end:w.scan[1],kind:'process',channels:['y','pathProgress']},
    ...repairs.flatMap(r=>{
      const id=input.parts[r.index].id;
      return [
        {id:'aim-cutter-'+id,objectId:'kit.cutter',start:r.start-.35,end:r.start,kind:'process',channels:['x','y']},
        {id:'trim-edge-'+id,objectId:'kit.cutter',start:r.start,end:r.end,kind:'process',channels:['x','morphProgress']},
        {id:'repair-'+id,objectId:'kit.part.'+id,start:r.start,end:r.end,kind:'process',channels:['width','morphProgress']},
        {id:'separate-offcut-'+id,objectId:'kit.offcut.'+id,start:r.start,end:r.end,kind:'process',channels:['x','width','morphProgress']},
        {id:'drop-offcut-'+id,objectId:'kit.offcut.'+id,start:r.start+(r.end-r.start)*.16,end:r.end+.35,kind:'process',channels:['x','y']},
      ];
    }),
    ...(repairs.length?[{id:'retract-cutter',objectId:'kit.cutter',start:w.repair[1],end:w.repair[1]+.35,kind:'process',channels:['y']}]:[]),
    {id:'route-gate',objectId:'inspection.gate',start:w.repair[1],end:w.dispatch[0],kind:'process',channels:['width','morphProgress']},
    {id:'carry-to-result',objectId:'kit',start:w.dispatch[0],end:w.dispatch[1],kind:'transfer'},
    {id:'camera-result',objectId:'kit',start:w.dispatch[0]-.3,end:w.overview[1],kind:'camera'},
    ...['source','inspection','kit','tray.accepted','tray.rework'].map(id=>({id:'retire-'+id,objectId:id,start:w.retire[0],end:w.retire[1],kind:'transfer'})),
  ];
  const relays=[{id:'contact-then-scan',fromAction:'carry-to-inspection',toAction:'scan-parts',motionGate:'rigid-feedback'},
    ...repairs.flatMap((r,i)=>{const id=input.parts[r.index].id;return [
      {id:'inspection-repair-'+i,fromAction:i?'repair-'+input.parts[repairs[i-1].index].id:'scan-parts',toAction:'aim-cutter-'+id,motionGate:'follow'},
      {id:'tool-contact-'+id,fromAction:'aim-cutter-'+id,toAction:'repair-'+id,motionGate:'rigid-feedback'},
      {id:'tool-trims-'+id,fromAction:'repair-'+id,toAction:'trim-edge-'+id,motionGate:'rigid-feedback'},
      {id:'cut-separates-'+id,fromAction:'repair-'+id,toAction:'separate-offcut-'+id,motionGate:'rigid-feedback'},
      {id:'released-falls-'+id,fromAction:'separate-offcut-'+id,toAction:'drop-offcut-'+id,motionGate:'follow'},
    ];}),
    {id:'gate-selects-departure',fromAction:'route-gate',toAction:'carry-to-result',motionGate:'rigid-feedback'}];
  const checkpoints=[{id:'transfer-midpoint',time:mix(...w.transport,.5),objectIds:['kit','inspection'],role:'pass'},
    {id:'dispatch-midpoint',time:mix(...w.dispatch,.5),objectIds:['kit','tray.'+route],role:'pass'}];
  const timeline={actions,relays,checkpoints};
  function render(t,{omitIds=[]}={}){
    const state=stateAt(t), camera=cameraAt(t),stage=createStage({camera,viewport,omitIds,timeline});
    tray(stage,{id:'source',center:source.map((v,i)=>v+(i===2?30:0)),title:input.labels.source,active:t<w.transport[0],received:false,retirement:state.retiredOffset});
    inspectionBench(stage,state,input);
    tray(stage,{id:'tray.accepted',center:destinations.accepted.map((v,i)=>v+(i===2?35:0)),title:input.labels.accepted,active:state.gateProgress>0&&route==='accepted',received:state.received&&route==='accepted',retirement:state.retiredOffset,press:route==='accepted'?state.trayPress:0});
    tray(stage,{id:'tray.rework',center:destinations.rework.map((v,i)=>v+(i===2?35:0)),title:input.labels.rework,active:state.gateProgress>0&&route==='rework',received:state.received&&route==='rework',retirement:state.retiredOffset,press:route==='rework'?state.trayPress:0});
    workpiece(stage,state,input);
    const result=stage.finish();
    return {...result,state,semantic:{'kit':route,...Object.fromEntries(input.parts.map((p,i)=>['kit.part.'+p.id,lengthsOrValue(state,i)]))}};
  }
  const coverage = {mainContentIds:['kit','inspection','tray.'+route]};
  return {config,input,timeline,coverage,stateAt,cameraAt,render,finalLengths,route};
}
function lengthsOrValue(state,i){return state.lengths[i];}
module.exports={CONFIG,DEFAULT,normalize,createScene};
