#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Save an already chosen image. This is not a webpage scraper or a visual approval tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const LIMITS = Object.freeze({bytes: 20 * 1024 * 1024, pixels: 40_000_000, dimension: 32768, timeoutMs: 15000, redirects: 5});
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const DEFAULT_DIRECTORY = '03_视觉设计/参考图';
const need = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), {code}); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const within = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };
const exists = async p => { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

/** Provenance deliberately omits credentials, all query parameters and fragments. */
export function safeSourceUrl(input) {
  let u; try { u = new URL(input); } catch { throw Object.assign(new Error('来源页必须是 HTTP(S) URL。'), {code:'SOURCE_URL'}); }
  need(['http:', 'https:'].includes(u.protocol), 'SOURCE_URL', '来源页必须是 HTTP(S) URL。');
  u.username = ''; u.password = ''; u.search = ''; u.hash = '';
  return u.toString();
}
function requestUrl(input) {
  let u; try { u = new URL(input); } catch { throw Object.assign(new Error('图像 URL 无效。'), {code:'INPUT_URL'}); }
  need(['http:', 'https:'].includes(u.protocol), 'INPUT_URL', '只支持 HTTP(S) 图像 URL。');
  need(!u.username && !u.password, 'URL_CREDENTIALS', '不接受含用户名或密码的下载 URL；请使用可公开访问的图像地址。');
  u.hash = '';
  return u;
}
function dimensions(width, height) {
  need(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0, 'IMAGE_DIMENSIONS', '图像尺寸无效。');
  need(width <= LIMITS.dimension && height <= LIMITS.dimension && width * height <= LIMITS.pixels, 'IMAGE_TOO_LARGE', '图像尺寸超过本工具的安全上限。');
}
const crcTable = Uint32Array.from({length:256}, (_, n) => { for (let k=0;k<8;k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(b) { let c=0xffffffff; for (const v of b) c=crcTable[(c^v)&255]^(c>>>8); return (c^0xffffffff)>>>0; }

function png(b) {
  let offset=8, width, height, imageData=false, ended=false, chunks=0;
  while (offset < b.length) {
    need(offset+12 <= b.length, 'IMAGE_TRUNCATED', 'PNG 块头或结尾被截断。');
    const length=b.readUInt32BE(offset), end=offset+12+length;
    need(end <= b.length, 'IMAGE_TRUNCATED', 'PNG 块数据被截断。');
    const type=b.toString('ascii',offset+4,offset+8);
    need(/^[A-Za-z]{4}$/.test(type), 'IMAGE_STRUCTURE', 'PNG 块类型无效。');
    need(b.readUInt32BE(end-4)===crc32(b.subarray(offset+4,end-4)), 'IMAGE_STRUCTURE', 'PNG 块校验不一致。');
    if (chunks++===0) {
      need(type==='IHDR' && length===13, 'IMAGE_STRUCTURE', 'PNG 缺少完整 IHDR。');
      width=b.readUInt32BE(offset+8); height=b.readUInt32BE(offset+12); dimensions(width,height);
      const depth=b[offset+16], color=b[offset+17], permitted={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      need(permitted[color]?.includes(depth) && b[offset+18]===0 && b[offset+19]===0 && b[offset+20]<=1, 'IMAGE_STRUCTURE', 'PNG IHDR 参数无效。');
    } else need(type!=='IHDR', 'IMAGE_STRUCTURE', 'PNG 出现重复 IHDR。');
    if (type==='IDAT' && length>0) imageData=true;
    if (type==='IEND') { need(length===0 && end===b.length, 'IMAGE_STRUCTURE', 'PNG 结尾无效或包含额外数据。'); ended=true; break; }
    offset=end;
  }
  need(ended && imageData, 'IMAGE_TRUNCATED', 'PNG 缺少图像数据或 IEND。');
  return {format:'png',extension:'png',width,height};
}
function jpeg(b) {
  let offset=2,width,height,scan=false,ended=false;
  const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  while(offset<b.length) {
    need(b[offset]===0xff, 'IMAGE_STRUCTURE', 'JPEG 标记结构无效。');
    while(offset<b.length && b[offset]===0xff) offset++;
    need(offset<b.length, 'IMAGE_TRUNCATED', 'JPEG 标记被截断。');
    const marker=b[offset++];
    if(marker===0xd9) { ended=true; need(offset===b.length, 'IMAGE_STRUCTURE', 'JPEG EOI 后有额外数据。'); break; }
    need(marker!==0 && marker!==0xd8 && !(marker>=0xd0&&marker<=0xd7), 'IMAGE_STRUCTURE', 'JPEG 标记位置无效。');
    if(marker===1) continue;
    need(offset+2<=b.length, 'IMAGE_TRUNCATED', 'JPEG 段长被截断。');
    const length=b.readUInt16BE(offset), end=offset+length;
    need(length>=2 && end<=b.length, 'IMAGE_TRUNCATED', 'JPEG 段数据被截断。');
    if(sof.has(marker)) {
      need(length>=8 && length===8+3*b[offset+7], 'IMAGE_STRUCTURE', 'JPEG SOF 结构无效。');
      const h=b.readUInt16BE(offset+3),w=b.readUInt16BE(offset+5); dimensions(w,h);
      need(!width || (width===w&&height===h), 'IMAGE_STRUCTURE', 'JPEG 帧尺寸不一致。'); width=w;height=h;
    }
    if(marker===0xda) {
      need(width && length>=6 && length===6+2*b[offset+2], 'IMAGE_STRUCTURE', 'JPEG SOS 结构无效。'); scan=true;
      offset=end;
      while(offset<b.length) {
        if(b[offset]!==0xff) { offset++;continue; }
        let next=offset+1;while(next<b.length&&b[next]===0xff)next++;
        need(next<b.length, 'IMAGE_TRUNCATED', 'JPEG 扫描数据被截断。');
        if(b[next]===0 || (b[next]>=0xd0&&b[next]<=0xd7)) {offset=next+1;continue;}
        break;
      }
    } else offset=end;
  }
  need(ended&&scan&&width, 'IMAGE_TRUNCATED', 'JPEG 缺少图像帧、扫描数据或 EOI。');
  return {format:'jpeg',extension:'jpg',width,height};
}
function webp(b) {
  need(b.length>=20 && b.readUInt32LE(4)+8===b.length, 'IMAGE_TRUNCATED', 'WebP RIFF 长度不完整或不一致。');
  let offset=12,width,height,frame=false;
  while(offset<b.length) {
    need(offset+8<=b.length, 'IMAGE_TRUNCATED', 'WebP 块头被截断。');
    const type=b.toString('ascii',offset,offset+4),length=b.readUInt32LE(offset+4),start=offset+8,end=start+length,padded=end+(length%2);
    need(padded<=b.length, 'IMAGE_TRUNCATED', 'WebP 块数据被截断。');
    if(type==='VP8X') {need(length===10, 'IMAGE_STRUCTURE', 'WebP VP8X 结构无效。');width=b.readUIntLE(start+4,3)+1;height=b.readUIntLE(start+7,3)+1;dimensions(width,height);}
    if(type==='VP8 ') {
      need(length>10 && (b[start]&1)===0 && b.subarray(start+3,start+6).equals(Buffer.from([0x9d,0x01,0x2a])), 'IMAGE_STRUCTURE', 'WebP VP8 帧头无效。');
      const w=b.readUInt16LE(start+6)&0x3fff,h=b.readUInt16LE(start+8)&0x3fff;dimensions(w,h);if(!width){width=w;height=h;}frame=true;
    }
    if(type==='VP8L') {need(length>5 && b[start]===0x2f && (b[start+4]&0xe0)===0, 'IMAGE_STRUCTURE', 'WebP VP8L 帧头无效。');const bits=b.readUInt32LE(start+1),w=(bits&0x3fff)+1,h=((bits>>>14)&0x3fff)+1;dimensions(w,h);if(!width){width=w;height=h;}frame=true;}
    if(type==='ANMF') {
      need(width && length>=24, 'IMAGE_STRUCTURE', 'WebP 动画帧头无效。');
      const x=b.readUIntLE(start,3)*2,y=b.readUIntLE(start+3,3)*2,w=b.readUIntLE(start+6,3)+1,h=b.readUIntLE(start+9,3)+1;
      need(x+w<=width&&y+h<=height, 'IMAGE_STRUCTURE', 'WebP 动画帧越出画布。');
      let at=start+16,hasFrame=false;
      while(at<end) {need(at+8<=end, 'IMAGE_TRUNCATED', 'WebP 动画子块被截断。');const sub=b.toString('ascii',at,at+4),n=b.readUInt32LE(at+4);at+=8+n+(n%2);need(at<=end, 'IMAGE_TRUNCATED', 'WebP 动画子块数据被截断。');if(['VP8 ','VP8L'].includes(sub))hasFrame=true;}
      need(hasFrame, 'IMAGE_STRUCTURE', 'WebP 动画没有图像子块。');frame=true;
    }
    offset=padded;
  }
  need(frame&&width, 'IMAGE_STRUCTURE', 'WebP 没有可识别图像帧。');
  return {format:'webp',extension:'webp',width,height};
}
function gif(b) {
  need(b.length>=14, 'IMAGE_TRUNCATED', 'GIF 文件头被截断。');
  const width=b.readUInt16LE(6),height=b.readUInt16LE(8);dimensions(width,height);
  let offset=13,frames=0,ended=false;
  if(b[10]&0x80) offset+=3*(1<<((b[10]&7)+1));
  need(offset<=b.length, 'IMAGE_TRUNCATED', 'GIF 全局调色板被截断。');
  const subBlocks=()=>{let bytes=0;while(true){need(offset<b.length,'IMAGE_TRUNCATED','GIF 子块被截断。');const n=b[offset++];if(n===0)return bytes;need(offset+n<=b.length,'IMAGE_TRUNCATED','GIF 子块数据被截断。');bytes+=n;offset+=n;}};
  while(offset<b.length) {
    const type=b[offset++];
    if(type===0x3b) {need(offset===b.length,'IMAGE_STRUCTURE','GIF 结束标记后有额外数据。');ended=true;break;}
    if(type===0x21) {need(offset<b.length,'IMAGE_TRUNCATED','GIF 扩展被截断。');offset++;subBlocks();continue;}
    need(type===0x2c,'IMAGE_STRUCTURE','GIF 数据块类型无效。');
    need(offset+9<=b.length,'IMAGE_TRUNCATED','GIF 图像描述符被截断。');
    const x=b.readUInt16LE(offset),y=b.readUInt16LE(offset+2),w=b.readUInt16LE(offset+4),h=b.readUInt16LE(offset+6),flags=b[offset+8];
    need(w>0&&h>0&&x+w<=width&&y+h<=height,'IMAGE_STRUCTURE','GIF 图像尺寸越界。');offset+=9;
    if(flags&0x80)offset+=3*(1<<((flags&7)+1));
    need(offset<b.length,'IMAGE_TRUNCATED','GIF 局部调色板或图像数据被截断。');
    const lzw=b[offset++];need(lzw>=2&&lzw<=8,'IMAGE_STRUCTURE','GIF LZW 参数无效。');need(subBlocks()>0,'IMAGE_STRUCTURE','GIF 缺少图像数据。');frames++;
  }
  need(ended&&frames>0,'IMAGE_TRUNCATED','GIF 缺少图像或结束标记。');
  return {format:'gif',extension:'gif',width,height};
}

/** Container/header validation only. Pixel decoding and actual viewing remain separate. */
export function inspectImageHeader(bytes) {
  need(Buffer.isBuffer(bytes),'IMAGE_INPUT','图像输入必须是字节。');
  need(bytes.length>0&&bytes.length<=LIMITS.bytes,'IMAGE_TOO_LARGE','图像为空或超过20 MiB上限。');
  let result;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) result=png(bytes);
  else if(bytes[0]===0xff&&bytes[1]===0xd8) result=jpeg(bytes);
  else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') result=webp(bytes);
  else if(['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))) result=gif(bytes);
  else throw Object.assign(new Error('不是支持的真实图像头；仅接受 PNG、JPEG、WebP、GIF，不接受网页、SVG或检索摘要。'),{code:'IMAGE_FORMAT'});
  return {...result,bytes:bytes.length,sha256:hash(bytes),validation:'header-valid',decoded:false,viewed:false};
}

async function download(input, timeoutMs=LIMITS.timeoutMs) {
  need(typeof fetch==='function','RUNTIME_FETCH','当前 Node.js 没有内置 fetch；请使用已可用的支持该功能的运行时，不自动安装。');
  let u=requestUrl(input);const requested=safeSourceUrl(u),controller=new AbortController();
  // Shorter timeouts are useful to callers/tests; callers cannot remove the bound.
  need(Number.isFinite(timeoutMs)&&timeoutMs>0&&timeoutMs<=LIMITS.timeoutMs,'TIMEOUT_OPTION','下载超时必须在1–15000毫秒内。');
  const timer=setTimeout(()=>controller.abort(),timeoutMs);let redirects=0;
  try {
    while(true) {
      const response=await fetch(u,{redirect:'manual',credentials:'omit',headers:{Accept:'image/png,image/jpeg,image/webp,image/gif,application/octet-stream;q=0.5'},signal:controller.signal});
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location');await response.body?.cancel();
        need(location&&redirects<LIMITS.redirects,'HTTP_REDIRECT','重定向缺少目标或次数超过上限。');
        u=requestUrl(new URL(location,u));redirects++;continue;
      }
      if(!response.ok) {await response.body?.cancel();throw Object.assign(new Error(`图像请求返回HTTP ${response.status}；未保存图像。`),{code:'HTTP_STATUS'});}
      const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(['text/html','application/xhtml+xml'].includes(mime)) {await response.body?.cancel();throw Object.assign(new Error('地址返回网页而不是图像；未抓取页面内链。'),{code:'HTTP_HTML'});}
      const declared=Number(response.headers.get('content-length'));
      if(declared>LIMITS.bytes) {await response.body?.cancel();throw Object.assign(new Error('图像响应超过20 MiB上限。'),{code:'IMAGE_TOO_LARGE'});}
      need(response.body,'HTTP_EMPTY','图像响应没有内容。');const chunks=[];let size=0;
      for await(const chunk of response.body) {size+=chunk.length;if(size>LIMITS.bytes){controller.abort();throw Object.assign(new Error('图像响应超过20 MiB上限。'),{code:'IMAGE_TOO_LARGE'});}chunks.push(Buffer.from(chunk));}
      return {bytes:Buffer.concat(chunks),source:{type:'http',requestedUrl:requested,finalUrl:safeSourceUrl(u),redirects,reportedContentType:mime||null,urlQueryAndFragmentOmitted:true}};
    }
  } catch(e) {
    if(typeof e.code==='string'&&['HTTP_REDIRECT','URL_CREDENTIALS','INPUT_URL','HTTP_STATUS','HTTP_HTML','IMAGE_TOO_LARGE','HTTP_EMPTY','TIMEOUT_OPTION'].includes(e.code)) throw e;
    throw Object.assign(new Error(controller.signal.aborted?'图像请求超时；未保存图像。':'图像请求失败；未保存图像。'),{code:controller.signal.aborted?'HTTP_TIMEOUT':'HTTP_FETCH'});
  } finally {clearTimeout(timer);}
}

async function outputDirectory(project, relative) {
  need(typeof project==='string'&&project.length>0,'PROJECT_REQUIRED','必须指定项目目录。');
  const absolute=path.resolve(project),stat=await fs.stat(absolute);need(stat.isDirectory(),'PROJECT_DIRECTORY','项目路径必须是已有目录。');
  const root=await fs.realpath(absolute);
  need(typeof relative==='string'&&relative.length>0&&!path.isAbsolute(relative)&&!path.win32.isAbsolute(relative),'OUTPUT_PATH','输出目录必须是项目内相对路径。');
  const parts=relative.split(/[\\/]/).filter(x=>x&&x!=='.');
  need(!parts.includes('..')&&parts.every(x=>!/[\x00-\x1f:*?"<>|]/.test(x)&&!/[ .]$/.test(x)),'OUTPUT_PATH','输出目录含无效字符或上级路径。');
  let current=root;
  for(const part of parts) {
    current=path.join(current,part);let s=await exists(current);
    if(!s) {try{await fs.mkdir(current);}catch(e){if(e.code!=='EEXIST')throw e;}s=await fs.lstat(current);}
    const real=await fs.realpath(current);need(within(root,real),'PATH_ESCAPE','输出目录经链接解析后越出项目；未写入图像。');
    need((await fs.stat(current)).isDirectory(),'OUTPUT_DIRECTORY','输出路径包含非目录对象。');current=real;
  }
  return {root,directory:current};
}

export async function saveReferenceImage({project,input,name,sourcePage,directory=DEFAULT_DIRECTORY,timeoutMs=LIMITS.timeoutMs}) {
  need(typeof name==='string'&&/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,79}$/u.test(name)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name),'NAME','名称只用字母、汉字、数字、短横线或下划线，不带扩展名。');
  need(typeof input==='string'&&input.length>0&&input.length<=8192,'INPUT','必须提供图像 URL 或本地路径。');
  const page=sourcePage?safeSourceUrl(sourcePage):null;
  // Resolve all output parents before reading/downloading; never write through an escaping junction.
  const output=await outputDirectory(project,directory);
  let loaded;
  if(/^https?:/i.test(input)) loaded=await download(input,timeoutMs);
  else {
    need(!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)&&!/^data:/i.test(input),'INPUT_URL','不支持此输入协议；本地文件请使用实际路径。');
    const local=path.resolve(input),stat=await fs.stat(local);need(stat.isFile(),'LOCAL_FILE','本地输入必须是文件。');
    need(stat.size>0&&stat.size<=LIMITS.bytes,'IMAGE_TOO_LARGE','本地图像为空或超过20 MiB上限。');
    loaded={bytes:await fs.readFile(local),source:{type:'local',path:local}};
  }
  const details=inspectImageHeader(loaded.bytes),imagePath=path.join(output.directory,`${name}.${details.extension}`),sourcePath=path.join(output.directory,`${name}.source.json`);
  // Recheck the resolved directory immediately before the exclusive writes.
  need(within(output.root,await fs.realpath(output.directory)),'PATH_ESCAPE','输出目录已改变或越出项目。');
  for(const ext of EXTENSIONS) {
    const other=path.join(output.directory,`${name}.${ext}`),s=await exists(other);
    if(s) need(other===imagePath&&!s.isSymbolicLink()&&s.isFile(),'OUTPUT_CONFLICT','同名候选已有其他文件或链接；请换名称，不覆盖。');
  }
  const old=await exists(imagePath),oldSource=await exists(sourcePath);
  need(!oldSource||(!oldSource.isSymbolicLink()&&oldSource.isFile()),'OUTPUT_CONFLICT','来源记录已存在且不是普通文件。');
  if(old) need(hash(await fs.readFile(imagePath))===details.sha256,'OUTPUT_CONFLICT','同名图像内容不同；请换名称，不覆盖旧候选。');
  else need(!oldSource,'OUTPUT_CONFLICT','同名来源记录已存在但图像缺失；请检查旧候选后换名称。');
  let provenance;
  if(oldSource) {
    try{provenance=JSON.parse(await fs.readFile(sourcePath,'utf8'));}catch{throw Object.assign(new Error('已有来源记录无法读取；未覆盖。'),{code:'OUTPUT_CONFLICT'});}
    need(provenance.schemaVersion===1&&['local','http'].includes(provenance.source?.type)&&provenance.image?.sha256===details.sha256&&provenance.image?.file===path.basename(imagePath),'OUTPUT_CONFLICT','已有来源记录与图片不一致；未覆盖。');
    for(const key of ['requestedUrl','finalUrl','pageUrl']) if(provenance.source[key]) need(provenance.source[key]===safeSourceUrl(provenance.source[key]),'OUTPUT_CONFLICT','已有来源记录含未清理的URL信息；未覆盖或输出该记录。');
  } else {
    provenance={schemaVersion:1,savedAt:new Date().toISOString(),source:{...loaded.source,...(page?{pageUrl:page,pageVerification:'provided-not-verified'}:{})},image:{file:path.basename(imagePath),...details},purpose:'candidate-reference-only',note:'仅结构及文件头校验。必须用实际图像工具打开检查，再从本地交审；保存不代表用户选定、可用于成片或允许再分发。'};
    if(!old) await fs.writeFile(imagePath,loaded.bytes,{flag:'wx'});
    await fs.writeFile(sourcePath,JSON.stringify(provenance,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  }
  // Never echo unknown fields from an existing provenance file (it may have been edited elsewhere).
  const visibleSource={};for(const key of ['type','path','requestedUrl','finalUrl','redirects','reportedContentType','urlQueryAndFragmentOmitted','pageUrl','pageVerification'])if(Object.hasOwn(provenance.source,key))visibleSource[key]=provenance.source[key];
  return {status:old?'existing':'saved',path:imagePath,relativePath:path.relative(output.root,imagePath).split(path.sep).join('/'),sourceRecord:sourcePath,...details,source:visibleSource,next:'Open the local image with an image-viewing tool; verify visible content and show its local path. No visual approval recorded.'};
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help') {console.log('node scripts/save-reference-image.mjs --project ROOT --input URL_OR_LOCAL_PATH --name ref-01 [--source-page URL] [--directory PROJECT_RELATIVE_DIRECTORY]\nDefault: 03_视觉设计/参考图. Existing Node.js only. Downloads/copies the chosen image; no webpage scraping, auth, state initialization or visual approval.');return;}
  const allowed=new Set(['project','input','name','source-page','directory']),options={};
  for(let i=0;i<args.length;i+=2) {const key=args[i].slice(2);need(args[i].startsWith('--')&&allowed.has(key)&&args[i+1]!==undefined&&!Object.hasOwn(options,key),'ARGUMENT','参数无效或重复；使用 --help 查看用法。');options[key]=args[i+1];}
  const result=await saveReferenceImage({...options,sourcePage:options['source-page']});console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{const code=typeof e.code==='string'?e.code:'IO_ERROR';console.error(JSON.stringify({status:'failed',code,message:code.startsWith('E')?'本地文件操作失败；未覆盖已有候选。':e.message}));process.exitCode=1;});
