// 极简 Markdown 重排：把真实文件原文按文档阅读样式显示（不是编辑器截图）。
// 改自 D03 重做 md.jsx：代码块按行渲染（中文长句不用等宽字体，DESIGN 第 5 节），支持逐元素“写出”、聚焦与锚点测量。
import React from 'react';

export function parseMd(src) {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  const isList = s => /^(\s*)([-*]|\d+\.)\s+/.test(s);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if (/^```/.test(l)) {
      const body = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; blocks.push({type: 'code', lines: body}); continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { blocks.push({type: 'h', level: m[1].length, text: m[2]}); i++; continue; }
    if (/^---+\s*$/.test(l)) { blocks.push({type: 'hr', text: ''}); i++; continue; }
    if ((m = l.match(/^>\s?(.*)$/))) {
      const body = [];
      while (i < lines.length && (m = lines[i].match(/^>\s?(.*)$/))) { body.push(m[1].trim()); i++; }
      blocks.push({type: 'quote', text: body.filter(Boolean).join(' ')}); continue;
    }
    if (/^\|/.test(l)) { while (i < lines.length && /^\|/.test(lines[i])) i++; blocks.push({type: 'p', text: '（表格）'}); continue; }
    if (isList(l)) {
      const items = [];
      while (i < lines.length) {
        const mm = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (mm) { items.push({indent: mm[1].length, marker: mm[2], text: mm[3]}); i++; }
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; }
        else break;
      }
      blocks.push({type: 'list', items, ordered: /\d/.test(items[0].marker)}); continue;
    }
    const body = [l.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\||>|---)/.test(lines[i]) && !isList(lines[i])) { body.push(lines[i].trim()); i++; }
    blocks.push({type: 'p', text: body.join(' ')});
  }
  return blocks;
}

export function inline(text) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(!?\[[^\]]*\]\([^)]*\))/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(<code key={k++} className="ic">{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k++}>{inline(t.slice(2, -2))}</strong>);
    else if (m[3] && t[0] !== '!') out.push(<span key={k++} className="lk">{inline(t.match(/^\[([^\]]*)\]/)[1])}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// marks：{anchorId: [{text, cls}]} 在该元素内给子串加类（只改颜色/底色，不改字重和边框宽度）。
function withMarks(text, marks) {
  if (!marks || !marks.length) return inline(text);
  const out = []; let rest = text; let k = 0;
  for (const mk of marks) {
    const idx = rest.indexOf(mk.text);
    if (idx < 0) continue;
    if (idx > 0) out.push(<React.Fragment key={k++}>{inline(rest.slice(0, idx))}</React.Fragment>);
    out.push(<span key={k++} className={'mk ' + (mk.cls || '')} data-anchor={mk.anchor}>{inline(mk.text)}</span>);
    rest = rest.slice(idx + mk.text.length);
  }
  if (rest) out.push(<React.Fragment key={k++}>{inline(rest)}</React.Fragment>);
  return out;
}

// anchors：{id: 原文子串}，按出现顺序匹配到块、列表项或代码行。
// cls：{id: 类名}；focus：只保留这些 id 为正常亮度，其余加 dim；reveal：0..1 已写出的元素比例（写出进度），caret 显示在最后一个已写元素后。
export function MdDoc({src, anchors = {}, marks = {}, cls = {}, focus = null, reveal = 1, caret = false, codeTitle = {}}) {
  const blocks = parseMd(src);
  const used = new Set();
  const idFor = text => {
    for (const [id, sub] of Object.entries(anchors)) if (!used.has(id) && text.includes(sub)) { used.add(id); return id; }
    return undefined;
  };
  // 先数元素总数，按比例决定写到哪里
  let total = 0;
  for (const b of blocks) total += b.type === 'list' ? b.items.length : b.type === 'code' ? b.lines.filter(x => x.trim()).length + 1 : 1;
  const shown = Math.round(total * reveal);
  let n = 0;
  const vis = () => { n++; return n <= shown ? (n === shown && caret && reveal < 1 ? ' last' : '') : ' unwritten'; };
  const cl = (id, extra = '') => [cls[id] || '', focus && !focus.includes(id) ? 'dim' : '', extra].filter(Boolean).join(' ');
  return <div className="md">{blocks.map((b, bi) => {
    if (b.type === 'list') {
      const Tag = b.ordered ? 'ol' : 'ul';
      return <Tag key={bi}>{b.items.map((it, ii) => {
        const id = idFor(it.text);
        return <li key={ii} data-anchor={id} className={cl(id, (it.indent ? 'sub' : '') + vis())} value={b.ordered ? parseInt(it.marker) : undefined}>{withMarks(it.text, marks[id])}</li>;
      })}</Tag>;
    }
    if (b.type === 'code') {
      const boxV = vis();
      return <div key={bi} className={'cb' + boxV}>{b.lines.map((line, li) => {
        if (!line.trim()) return <div key={li} className="cl gap" />;
        const id = idFor(line);
        return <div key={li} data-anchor={id} className={'cl ' + cl(id, vis())}>{withMarks(line, marks[id])}</div>;
      })}</div>;
    }
    const id = idFor(b.text || '');
    const c = cl(id, vis());
    if (b.type === 'h') { const H = 'h' + Math.min(b.level, 4); return <H key={bi} data-anchor={id} className={c}>{withMarks(b.text, marks[id])}</H>; }
    if (b.type === 'hr') return <hr key={bi} className={c} />;
    if (b.type === 'quote') return <blockquote key={bi} data-anchor={id} className={c}>{withMarks(b.text, marks[id])}</blockquote>;
    return <p key={bi} data-anchor={id} className={c}>{withMarks(b.text, marks[id])}</p>;
  })}</div>;
}

// 动态版：高亮与压暗的强度由容器上的 CSS 变量控制（0..1），可以随时间渐变；变量缺省＝1，与静态版同色。
const cm = (c, v) => `color-mix(in srgb, ${c} calc(var(${v},1) * 100%), transparent)`;
export const mdCss = (C, ui, mono) => `
.md{font-family:${ui};color:${C.ink};font-size:18px;line-height:1.45}
.md h1{font-size:34px;font-weight:600;line-height:1.16;margin:0 0 20px}
.md h2{font-size:24px;font-weight:600;line-height:1.25;margin:30px 0 12px}
.md h3{font-size:22px;font-weight:600;line-height:1.3;margin:22px 0 8px}
.md h4{font-size:18px;font-weight:600;margin:16px 0 6px}
.md p{margin:0 0 12px}
.md ul,.md ol{margin:0 0 12px;padding-left:26px}
.md li{margin:0 0 8px}
.md li.sub{margin-left:24px}
.md li::marker{color:${C.muted}}
.md blockquote{margin:0 0 14px;padding:2px 0 2px 16px;border-left:3px solid ${C.line};color:${C.muted};font-size:16px}
.md hr{border:none;border-top:2px solid ${C.line};margin:20px 0}
.md .cb{background:${C.chrome};border:2px solid ${C.line};border-radius:10px;padding:14px 18px 6px;margin:0 0 16px}
.md .cl{margin:0 0 8px;white-space:pre-wrap;border-radius:4px}
.md .cl.gap{height:6px;margin:0}
.md .ic{font-family:${mono};font-size:0.88em;background:${C.chrome};border:1px solid ${C.line};border-radius:6px;padding:0 5px}
.md .lk{color:${C.system}}
.md strong{font-weight:600}
.md .unwritten{visibility:hidden}
.md .last::after{content:'';display:inline-block;width:2px;height:1.1em;background:${C.action};margin-left:3px;vertical-align:-0.18em}
.md .dim{opacity:calc(1 - 0.68 * var(--dimk,1))}
.md .hl{background:${cm(C.status, '--hlk')};box-shadow:-8px 0 0 ${cm(C.status, '--hlk')},8px 0 0 ${cm(C.status, '--hlk')}}
.md .role{background:${cm(C.status, '--rok')};box-shadow:-8px 0 0 ${cm(C.status, '--rok')},8px 0 0 ${cm(C.status, '--rok')}}
.md .flowmark{background:${C.line};box-shadow:-8px 0 0 ${C.line},8px 0 0 ${C.line}}
.md .mk.trigger{background:${cm(C.status, '--trk')};box-shadow:inset 0 -3px 0 ${cm(C.action, '--trk')}}
.md .mk.file{color:color-mix(in srgb, ${C.action} calc(var(--flk,1) * 100%), ${C.system});background:${cm(C.status, '--flk')};box-shadow:inset 0 -3px 0 ${cm(C.action, '--flk')}}
`;
