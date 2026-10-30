// MIT. A draw submission is the sole source of projected geometry and object IDs.
// CSS perspective is intentionally not certified as visible by a bounding box.
'use strict';
const {projectPlane, planePoint} = require('./space.cjs');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = style => Object.entries(style).filter(([,v]) => v !== undefined).map(([k,v]) => `${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${v}`).join(';');

function createStage({camera, viewport, omitIds = [], timeline}) {
  const submissions = [], seen = new Set(), omitted = new Set(omitIds);
  function plane({id, geometry, html = '', style = {}, parentId, independentPlane = false, paintAfter, localGeometry, contentVersion = id, process, d1Category = 'mg', semantic}) {
    if (!id || seen.has(id)) throw Error('Missing or duplicate draw ID: ' + id);
    seen.add(id);
    if (omitted.has(id) || (parentId && omitted.has(parentId))) { omitted.add(id); return; }
    const projected = geometry.width===0||geometry.height===0
      ? {projectable:false,points:[],center:null,bounds:null,depthRange:[0,0]}
      : projectPlane(geometry, camera);
    const b=projected.bounds;
    const box = b ? {x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top} : {x:0,y:0,width:0,height:0};
    const object = {
      id, parentId, x:box.x, y:box.y, width:box.width, height:box.height,
      opacity:1, rotation:geometry.rotation?.[2] || 0, contentVersion, d1Category,
      localGeometry:localGeometry || {x:geometry.center[0],y:geometry.center[1],width:geometry.width,height:geometry.height,rotation:geometry.rotation?.[2] || 0},
      ...(process ? {process} : {}),
      worldGeometry:geometry, projectedCorners:projected.points,
      observation:{state:'unknown',reason:'CSS perspective, clipping and occlusion require production pixel evidence; projected bounds are coordinates only.'},
      ...(projected.center?.projectable ? {hotspot:{x:projected.center.x,y:projected.center.y}} : {}),
      semantic,
    };
    // Actual ordering and transforms below use the same projected geometry.
    const visibleGeometry = projected.projectable && projected.cssTransform;
    const body = visibleGeometry ? `<div data-object-id="${esc(id)}"${parentId ? ` data-parent-id="${esc(parentId)}"` : ''} style="${css({position:'absolute',left:0,top:0,width:geometry.width+'px',height:geometry.height+'px',boxSizing:'border-box',transformOrigin:'0 0',transform:projected.cssTransform,...style})}">${html}</div>` : '';
    const depth = projected.depthRange ? (projected.depthRange[0]+projected.depthRange[1])/2 : projected.center?.depth || 0;
    submissions.push({object, body, depth, independentPlane, paintAfter});
    return geometry;
  }
  function part(parent, {id, box, offsetZ = 0, ...rest}) {
    const center = planePoint(parent.geometry, box.x + box.width/2, box.y + box.height/2);
    // Adjacent local parts share the parent's basis; the small world Z separation only orders flat surfaces.
    center[2] += offsetZ;
    return plane({id, parentId:parent.id, geometry:{center,width:box.width,height:box.height,rotation:parent.geometry.rotation},
      localGeometry:{...box,rotation:parent.geometry.rotation?.[2] || 0}, ...rest});
  }
  function finish() {
    const objects = submissions.map(s=>s.object);
    // Far to near; stable equal-depth order preserves the authored drawing order.
    // Each flat assembly is one paint group: its parts cannot slip behind its own background.
    // Distinct assemblies use painter ordering; interpenetrating surfaces need a mesh renderer.
    const byId=new Map(submissions.map(s=>[s.object.id,s]));
    const paint=s=>s.body+submissions.filter(c=>!c.independentPlane&&c.object.parentId===s.object.id).map(paint).join('');
    const roots=submissions.filter(s=>s.independentPlane||!byId.has(s.object.parentId)).sort((a,b)=>b.depth-a.depth);
    // A tool above a tilted board can be behind the board's *center* in depth.
    // The authored planar overlap is an actual paint operation, never a visibility assertion.
    for(const s of roots.filter(s=>s.paintAfter)){
      const at=roots.indexOf(s),anchor=roots.findIndex(x=>x.object.id===s.paintAfter);
      if(anchor>=0&&at<anchor){roots.splice(at,1);roots.splice(roots.findIndex(x=>x.object.id===s.paintAfter)+1,0,s);}
    }
    const body = roots.map(paint).join('');
    return {html:`<div style="position:absolute;inset:0;overflow:hidden;width:${viewport.width}px;height:${viewport.height}px">${body}</div>`,
      objects, renderedObjectIds:objects.map(o=>o.id),
      submittedActionIds:(timeline?.actions || []).map(a=>a.id),
      submittedRelayIds:(timeline?.relays || []).map(r=>r.id),
      camera};
  }
  return {plane, part, finish};
}
module.exports = {createStage, esc, css};
