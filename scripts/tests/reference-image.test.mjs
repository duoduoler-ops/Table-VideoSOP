// SPDX-License-Identifier: MIT
// Offline fixtures only. Artifacts are retained; TABLE_VIDEO_TEST_OUTPUT can select the report directory.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {saveReferenceImage,inspectImageHeader,LIMITS,safeSourceUrl} from '../save-reference-image.mjs';

const root=path.resolve(process.env.TABLE_VIDEO_TEST_OUTPUT||'reports/reference-image-tests',`reference-image-${Date.now()}-${process.pid}`);
await fs.mkdir(root,{recursive:true});
const project=async name=>{const p=path.join(root,name);await fs.mkdir(p,{recursive:true});return p;};
const crc32=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);};
function png(width=1,height=1){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const pixels=Buffer.alloc((1+width*4)*height,255);for(let y=0;y<height;y++)pixels[y*(1+width*4)]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
const image=png(),otherImage=png(2,1),local=path.join(root,'本地真实图片.bin');await fs.writeFile(local,image);
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==','base64');
// A complete minimal baseline grayscale JPEG: one 8x8 block, DC=0 and EOB.
const jpegSegment=(marker,data)=>{const h=Buffer.from([0xff,marker,0,0]);h.writeUInt16BE(data.length+2,2);return Buffer.concat([h,data]);};
const codes=Buffer.from([1,...Array(15).fill(0),0]);
const jpeg=Buffer.concat([Buffer.from([0xff,0xd8]),jpegSegment(0xdb,Buffer.from([0,...Array(64).fill(1)])),jpegSegment(0xc0,Buffer.from([8,0,1,0,1,1,1,0x11,0])),jpegSegment(0xc4,Buffer.concat([Buffer.from([0]),codes,Buffer.from([0x10]),codes])),jpegSegment(0xda,Buffer.from([1,1,0,0,63,0])),Buffer.from([0x3f,0xff,0xd9])]);
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
await Promise.all([['fixture.jpg',jpeg],['fixture.gif',gif],['fixture.webp',webp]].map(([name,bytes])=>fs.writeFile(path.join(root,name),bytes)));
const requests=[];
const server=http.createServer((req,res)=>{
  requests.push({url:req.url,authorization:req.headers.authorization,cookie:req.headers.cookie});
  const route=req.url.split('?')[0];
  if(route==='/redirect'){res.writeHead(302,{Location:'/image?signature=PRIVATE-REDIRECT'});res.end();return;}
  if(route==='/loop'){res.writeHead(302,{Location:'/loop'});res.end();return;}
  if(route==='/credentials'){res.writeHead(302,{Location:`http://name:PRIVATE-PASSWORD@127.0.0.1:${server.address().port}/image`});res.end();return;}
  if(route==='/html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>Not a picture</html>');return;}
  if(route==='/fake'){res.writeHead(200,{'Content-Type':'image/png'});res.end('<html>Not a picture</html>');return;}
  if(route==='/oversize'){res.writeHead(200,{'Content-Type':'image/png','Content-Length':String(LIMITS.bytes+1)});res.end('x');return;}
  if(route==='/slow')return;
  if(route==='/missing'){res.writeHead(403);res.end('Forbidden');return;}
  res.writeHead(200,{'Content-Type':'image/png'});res.end(route==='/truncated'?image.subarray(0,-5):image);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(root,'fixture-summary.json'),JSON.stringify({root,externalNetworkUsed:false,requests:requests.length,authorizationOrCookieSent:requests.some(x=>x.authorization||x.cookie),artifactsRetained:true},null,2)+'\n');});
const isCode=code=>e=>e.code===code;

test('real PNG, JPEG, GIF and WebP headers expose dimensions without claiming decoded/viewed',()=>{
  for(const [buffer,format] of [[image,'png'],[jpeg,'jpeg'],[gif,'gif'],[webp,'webp']]){const r=inspectImageHeader(buffer);assert.equal(r.format,format);assert.equal(r.width,1);assert.equal(r.height,1);assert.equal(r.validation,'header-valid');assert.equal(r.decoded,false);assert.equal(r.viewed,false);}
});
test('offline copy uses actual format, local project path and a small source record',async()=>{
  const p=await project('copy'),r=await saveReferenceImage({project:p,input:local,name:'ref-01'});
  assert.equal(r.status,'saved');assert.equal(r.relativePath,'03_视觉设计/参考图/ref-01.png');assert.deepEqual(await fs.readFile(r.path),image);assert.equal(JSON.parse(await fs.readFile(r.sourceRecord,'utf8')).image.sha256,r.sha256);
  await assert.rejects(fs.stat(path.join(p,'00_本期控制','state.json')),e=>e.code==='ENOENT');
});
test('direct HTTP image persists original bytes and scrubs URL credentials/query/fragment from provenance',async()=>{
  const p=await project('http'),r=await saveReferenceImage({project:p,input:base+'/image?token=PRIVATE-TOKEN#PRIVATE-FRAGMENT',sourcePage:'https://name:PRIVATE-PASSWORD@example.com/work?key=PRIVATE-KEY#PRIVATE-FRAGMENT',name:'reference'});
  assert.deepEqual(await fs.readFile(r.path),image);const serialized=await fs.readFile(r.sourceRecord,'utf8');assert.ok(!serialized.includes('PRIVATE-'));assert.equal(r.source.pageUrl,'https://example.com/work');assert.ok(requests.every(x=>!x.authorization&&!x.cookie));
});
test('HTTP redirect follows image target but records sanitized final URL',async()=>{const r=await saveReferenceImage({project:await project('redirect'),input:base+'/redirect',name:'redirect'});assert.equal(r.source.redirects,1);assert.equal(r.source.finalUrl,base+'/image');});
test('redirect loops and credential-bearing redirects are refused',async()=>{for(const [route,code]of[['loop','HTTP_REDIRECT'],['credentials','URL_CREDENTIALS']])await assert.rejects(saveReferenceImage({project:await project(route),input:base+'/'+route,name:'ref'}),isCode(code));});
test('HTML MIME and HTML bytes disguised as image are refused with no image files',async()=>{
  for(const [route,code]of[['html','HTTP_HTML'],['fake','IMAGE_FORMAT']]){const p=await project(route);await assert.rejects(saveReferenceImage({project:p,input:base+'/'+route,name:'ref'}),isCode(code));assert.deepEqual(await fs.readdir(path.join(p,'03_视觉设计','参考图')),[]);}
});
test('failed HTTP and bounded timeout do not become success',async()=>{await assert.rejects(saveReferenceImage({project:await project('http-status'),input:base+'/missing',name:'ref'}),isCode('HTTP_STATUS'));await assert.rejects(saveReferenceImage({project:await project('timeout'),input:base+'/slow',name:'ref',timeoutMs:60}),isCode('HTTP_TIMEOUT'));});
test('truncated containers and damaged PNG chunks are refused',()=>{
  for(const buffer of [image,jpeg,gif,webp])assert.throws(()=>inspectImageHeader(buffer.subarray(0,-1)),e=>['IMAGE_TRUNCATED','IMAGE_STRUCTURE'].includes(e.code));
  const damaged=Buffer.from(image);damaged[damaged.length-16]^=1;assert.throws(()=>inspectImageHeader(damaged),isCode('IMAGE_STRUCTURE'));
});
test('truncated downloaded image is not saved',async()=>{await assert.rejects(saveReferenceImage({project:await project('truncated'),input:base+'/truncated',name:'ref'}),isCode('IMAGE_TRUNCATED'));});
test('declared byte limit and oversized pixel dimensions are refused',async()=>{
  await assert.rejects(saveReferenceImage({project:await project('large-http'),input:base+'/oversize',name:'ref'}),isCode('IMAGE_TOO_LARGE'));
  const giant=Buffer.from(image);giant.writeUInt32BE(40000,16);giant.writeUInt32BE(crc32(giant.subarray(12,29)),29);assert.throws(()=>inspectImageHeader(giant),isCode('IMAGE_TOO_LARGE'));
});
test('same content can be reused; a different image never overwrites it',async()=>{
  const p=await project('reuse'),r=await saveReferenceImage({project:p,input:local,name:'ref'}),provenance=await fs.readFile(r.sourceRecord);
  const again=await saveReferenceImage({project:p,input:local,name:'ref'});assert.equal(again.status,'existing');assert.deepEqual(await fs.readFile(r.sourceRecord),provenance);
  const other=path.join(root,'different.png');await fs.writeFile(other,otherImage);await assert.rejects(saveReferenceImage({project:p,input:other,name:'ref'}),isCode('OUTPUT_CONFLICT'));assert.deepEqual(await fs.readFile(r.path),image);
});
test('same logical name in another image format is a conflict, not a new overwrite',async()=>{
  const p=await project('format-conflict'),d=path.join(p,'refs');await fs.mkdir(d);await fs.writeFile(path.join(d,'ref.webp'),webp);await assert.rejects(saveReferenceImage({project:p,input:local,name:'ref',directory:'refs'}),isCode('OUTPUT_CONFLICT'));assert.deepEqual(await fs.readFile(path.join(d,'ref.webp')),webp);
});
test('reuse does not echo unknown fields added to a local source record',async()=>{
  const p=await project('metadata-fields'),r=await saveReferenceImage({project:p,input:local,name:'ref'}),record=JSON.parse(await fs.readFile(r.sourceRecord,'utf8'));record.source.unexpectedSecret='PRIVATE-FIXTURE-ONLY';await fs.writeFile(r.sourceRecord,JSON.stringify(record));const again=await saveReferenceImage({project:p,input:local,name:'ref'});assert.ok(!JSON.stringify(again).includes('PRIVATE-FIXTURE-ONLY'));
});
test('parent traversal, absolute directories and unsafe names are refused',async()=>{
  const p=await project('paths');for(const directory of ['../outside',path.resolve(root,'outside')])await assert.rejects(saveReferenceImage({project:p,input:local,name:'ref',directory}),isCode('OUTPUT_PATH'));
  for(const name of ['../ref','ref.png','CON','a/b'])await assert.rejects(saveReferenceImage({project:p,input:local,name}),isCode('NAME'));
});
test('junction or symlink cannot redirect project output outside the project',async()=>{
  const p=await project('junction'),outside=await project('outside'),link=path.join(p,'refs');await fs.symlink(outside,link,process.platform==='win32'?'junction':'dir');await assert.rejects(saveReferenceImage({project:p,input:local,name:'ref',directory:'refs/nested'}),isCode('PATH_ESCAPE'));assert.deepEqual(await fs.readdir(outside),[]);
});
test('preexisting output file symlink is not followed or overwritten',async t=>{
  const p=await project('file-link'),d=path.join(p,'refs');await fs.mkdir(d);
  try{await fs.symlink(local,path.join(d,'ref.png'),'file');}catch(e){if(process.platform==='win32'&&['EPERM','EACCES'].includes(e.code)){t.skip('Host does not permit file symlinks; directory junction escape was tested separately.');return;}throw e;}
  await assert.rejects(saveReferenceImage({project:p,input:local,name:'ref',directory:'refs'}),isCode('OUTPUT_CONFLICT'));assert.deepEqual(await fs.readFile(local),image);
});
test('unsupported source protocol and SVG are not silently converted',async()=>{await assert.rejects(saveReferenceImage({project:await project('protocol'),input:'ftp://example.invalid/picture.png',name:'ref'}),isCode('INPUT_URL'));assert.throws(()=>inspectImageHeader(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),isCode('IMAGE_FORMAT'));});
test('CLI returns usable local path and truthful header-only status',async()=>{
  const p=await project('cli'),script=fileURLToPath(new URL('../save-reference-image.mjs',import.meta.url));const result=JSON.parse(execFileSync(process.execPath,[script,'--project',p,'--input',local,'--name','CLI参考','--directory','refs'],{encoding:'utf8',windowsHide:true}));assert.equal(result.status,'saved');assert.equal(result.validation,'header-valid');assert.equal(result.viewed,false);assert.equal(result.path,path.join(p,'refs','CLI参考.png'));assert.equal(safeSourceUrl('https://u:p@example.com/a?x=y#f'),'https://example.com/a');
});
