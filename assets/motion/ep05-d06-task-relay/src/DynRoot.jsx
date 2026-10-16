// 2026-09-25 D06 整段动态：画面是段内时间 T＝frame/60 的函数（timeline.cjs 的 pAt）。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, G2, ui, mono} from './parts';
import {mdCss} from './md';
import {Stage} from './scenes';
import TL from './timeline.cjs';

export function D06Dyn({deleteText = false}) {
  const frame = useCurrentFrame();
  const p = TL.pAt(frame / TL.FPS);
  return <AbsoluteFill style={{fontFamily: ui, background: G2, color: C.ink, overflow: 'hidden'}}>
    <style>{mdCss(C, ui, mono) + (deleteText ? '.txt{visibility:hidden!important}' : '')}</style>
    <Stage s={{p}} />
    <div style={{position: 'absolute', right: 24, bottom: 18, padding: '5px 10px', borderRadius: 6, background: 'rgba(255,253,249,.92)', color: '#77736B', fontSize: 16}}>第五期过程源码示例 · 媒体占位 · 无原声</div>
  </AbsoluteFill>;
}
