// SPDX-License-Identifier: MIT
import React from 'react';

export const palette = {
  background: '#F4F5F3', paper: '#FFFFFF', ink: '#252628',
  yellow: '#E8D744', line: '#DDE0DE', muted: '#777E7C',
  pale: '#ECEFEC', yellowPale: '#F5F0BD',
};
const p = palette;
const font = 'Segoe UI, Microsoft YaHei, sans-serif';

function Type({ x = 0, y = 0, size = 18, weight = 500, fill = p.ink, anchor = 'start', children, ...rest }) {
  return <text x={x} y={y} fontFamily={font} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} {...rest}>{children}</text>;
}

// The geometry belongs to the poster. Its caller supplies all motion and camera transforms.
function OpenBook({ x = 0, y = 0, scale = 1, rotate = 0 }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} strokeLinejoin="round">
    <path d="M-95 -59 Q-51 -73 0 -48 Q50 -73 95 -59 L95 67 Q48 49 0 75 Q-49 49 -95 67Z" fill={p.ink} />
    <path d="M-87 -55 Q-47 -65 -4 -43 L-4 63 Q-47 43 -87 58Z" fill={p.paper} />
    <path d="M4 -43 Q47 -65 87 -55 L87 58 Q47 43 4 63Z" fill={p.paper} />
    <path d="M-3 -42V64" fill="none" stroke={p.yellow} strokeWidth="5" />
    <path d="M-72 -32Q-44 -36 -18 -24 M-72 -14Q-44 -18 -18 -6 M-72 4Q-44 0 -18 12 M-72 22Q-44 18 -31 24 M19 -23Q44 -35 72 -31 M19 -5Q44 -17 72 -13 M19 13Q44 1 72 5 M19 31Q44 19 60 21" fill="none" stroke={p.muted} strokeWidth="2.4" />
    <path d="M53 -58 L53 -13 L64 -20 L74 -13 L74 -60Z" fill={p.yellow} />
  </g>;
}

function ClosedBook({ x, y, width = 150, height = 28, rotate = 0, fill = p.yellow }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x={-width / 2} y={-height / 2} width={width} height={height} rx="3" fill={fill} stroke={p.ink} strokeWidth="2" />
    <path d={`M${-width / 2 + 13} ${-height / 2 + 4} H${width / 2 - 4} V${height / 2 - 4} H${-width / 2 + 13}`} fill={p.paper} stroke={p.ink} strokeWidth="1.2" />
    <path d={`M${-width / 2 + 17} 0 H${width / 2 - 7}`} stroke={p.line} strokeWidth="1.5" />
  </g>;
}

function Tag({ x, y, label, rotate = 0, width = 122, dark = false }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x={-width / 2} y="-19" width={width} height="38" rx="2" fill={dark ? p.ink : p.yellow} />
    <circle cx={-width / 2 + 11} cy="0" r="2.6" fill={dark ? p.yellow : p.ink} />
    <Type x="7" y="6" size="17" weight="700" anchor="middle" fill={dark ? p.paper : p.ink}>{label}</Type>
  </g>;
}

function Arrow({ x, y, rotate = 0 }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`} fill="none" stroke={p.ink} strokeWidth="3.5" strokeLinecap="square">
    <path d="M-19 0H19 M6 -13L19 0L6 13" />
  </g>;
}

function Footer() {
  return <g>
    <path d="M-171 207H171" stroke={p.ink} strokeWidth="1.2" />
    <Type x="-171" y="232" size="12" weight="700">阅读 · 交换 · 分享</Type>
    <Type x="171" y="232" size="12" anchor="end">SAT / SUN</Type>
  </g>;
}

function Layout0() {
  return <g>
    <rect x="-173" y="-129" width="346" height="286" rx="2" fill={p.pale} />
    <path d="M-172 152L171 -115" stroke={p.yellow} strokeWidth="39" />
    <Type x="-173" y="-166" size="60" weight="900" letterSpacing="-3">周末书市</Type>
    <Type x="-170" y="-118" size="15" weight="600">把闲置好书，交给下一位读者。</Type>
    <OpenBook x="-4" y="37" scale="1.39" rotate="-9" />
    <ClosedBook x="15" y="150" width="224" height="26" rotate="4" />
    <Tag x="-104" y="-33" label="带本书来" rotate="-10" />
    <Tag x="108" y="89" label="读者分享" rotate="9" dark />
    <Tag x="73" y="-174" label="旧书交换" rotate="-8" width="142" />
    <Type x="-170" y="189" size="15" weight="700">这个周末，遇见好书。</Type>
  </g>;
}

function Layout1() {
  return <g>
    <rect x="53" y="-211" width="120" height="395" fill={p.yellow} />
    <Type x="-175" y="-130" size="81" weight="900" letterSpacing="-5">周末</Type>
    <Type x="-175" y="-47" size="81" weight="900" letterSpacing="-5">书市</Type>
    <Type x="-169" y="-10" size="13" weight="600">阅读 · 交换 · 分享</Type>
    <Arrow x="123" y="-161" rotate="45" />
    <OpenBook x="35" y="97" scale="1.34" rotate="23" />
    <ClosedBook x="-83" y="169" width="160" height="27" rotate="-8" fill={p.ink} />
    <Tag x="98" y="-16" label="带本书来" rotate="9" width="130" dark />
    <Tag x="-79" y="-60" label="旧书交换" rotate="-7" width="134" />
    <Type x="-168" y="191" size="14" weight="700">让好书继续流动。</Type>
  </g>;
}

function Layout2() {
  return <g>
    <path d="M-174 -211H174V-76H-174Z" fill={p.ink} />
    <Type x="0" y="-150" size="60" weight="900" fill={p.paper} anchor="middle" letterSpacing="8">周末书市</Type>
    <Type x="0" y="-111" size="16" weight="600" fill={p.paper} anchor="middle">让书本，遇见新主人。</Type>
    <rect x="-152" y="-45" width="304" height="225" fill={p.yellowPale} />
    <ClosedBook x="-26" y="124" width="250" height="34" rotate="-12" fill={p.ink} />
    <ClosedBook x="24" y="163" width="250" height="28" rotate="5" />
    <OpenBook x="3" y="28" scale="1.26" rotate="-4" />
    <Tag x="-103" y="87" label="读者分享" rotate="12" width="128" />
    <Tag x="101" y="116" label="限时好价" rotate="-11" width="132" dark />
    <Tag x="77" y="-163" label="旧书交换" rotate="8" width="140" />
    <Type x="-169" y="193" size="14" weight="700">带一本书，认识一个新朋友。</Type>
  </g>;
}

function Layout3() {
  return <g>
    <rect x="-173" y="-211" width="346" height="224" fill={p.pale} />
    <path d="M-173 -211H-135V13H-173Z" fill={p.yellow} />
    <OpenBook x="-8" y="-101" scale="1.35" rotate="-18" />
    <ClosedBook x="51" y="5" width="211" height="26" rotate="6" />
    <Tag x="110" y="-167" label="带本书来" rotate="10" width="126" />
    <Type x="-172" y="96" size="60" weight="900" letterSpacing="-3">周末书市</Type>
    <Type x="-171" y="141" size="17" weight="700">旧书不闲置 / 好书有回声</Type>
    <Type x="-171" y="172" size="13">阅读 · 交换 · 分享</Type>
    <Tag x="72" y="86" label="旧书交换" rotate="-9" width="143" />
    <Arrow x="147" y="175" />
  </g>;
}

// Integer snapshots: rendering a historical card never depends on prior frames.
export function Poster({ version = 0 }) {
  const v = Math.max(0, Math.min(3, Math.round(Number(version) || 0)));
  const Layout = [Layout0, Layout1, Layout2, Layout3][v];
  return <g data-poster-version={`V${v}`}>
    <rect x="-200" y="-260" width="400" height="520" rx="4" fill={p.paper} stroke={p.line} strokeWidth="2" />
    <Type x="-172" y="-231" size="11" weight="700" letterSpacing="2">WEEKEND BOOK MARKET</Type>
    <Type x="174" y="-231" size="11" weight="700" anchor="end" fill={p.muted}>{`V${v}`}</Type>
    <Layout />
    <Footer />
  </g>;
}
