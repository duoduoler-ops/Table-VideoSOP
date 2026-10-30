import {createHash} from 'node:crypto';
import {requireValue as need} from './schema.mjs';

// Narrow, dependency-free proof: integer PCM WAV only, one positive scalar for
// all channels. Quantization is an interval intersection, not a free error budget.
function pcm(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length>=44 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WAVE',
    'GAIN_FORMAT','Only RIFF integer PCM WAV is supported');
  need(bytes.readUInt32LE(4)+8===bytes.length,'GAIN_FORMAT','Truncated or trailing RIFF data is unsupported');
  let format, data;
  for (let p=12;p+8<=bytes.length;) {
    const name=bytes.toString('ascii',p,p+4), size=bytes.readUInt32LE(p+4), start=p+8;
    need(start+size<=bytes.length,'GAIN_FORMAT','Invalid WAV chunk');
    if(name==='fmt ') { need(!format && size>=16,'GAIN_FORMAT','Ambiguous format'); format=bytes.subarray(start,start+size); }
    if(name==='data') { need(!data,'GAIN_FORMAT','Multiple data chunks unsupported'); data=bytes.subarray(start,start+size); }
    p=start+size+(size%2);
  }
  need(format && data && format.readUInt16LE(0)===1,'GAIN_FORMAT','Compressed, float or extensible WAV is not proven by this operation');
  const channels=format.readUInt16LE(2), rate=format.readUInt32LE(4), bits=format.readUInt16LE(14), width=bits/8;
  need(channels>0 && rate>0 && [16,24,32].includes(bits) && format.readUInt16LE(12)===channels*width &&
    format.readUInt32LE(8)===rate*channels*width && data.length>0 && data.length%(channels*width)===0,'GAIN_FORMAT','Unsupported or inconsistent PCM structure');
  return {channels,rate,bits,width,data,frames:data.length/(channels*width)};
}
export function proveWavGain(beforeBytes,afterBytes) {
  const a=pcm(beforeBytes), b=pcm(afterBytes);
  need(['channels','rate','bits','frames'].every(k=>a[k]===b[k]),'GAIN_TIMING','Channel layout, sample format and sample count must be identical');
  let low=0,high=Infinity,nonzero=0;
  const max=2**(a.bits-1)-1, min=-(2**(a.bits-1));
  for(let p=0;p<a.data.length;p+=a.width) {
    const x=a.data.readIntLE(p,a.width), y=b.data.readIntLE(p,b.width);
    need(y!==max && y!==min,'GAIN_CLIPPING','Output reaches PCM rails; clipping cannot be ruled out');
    if(x===0) {need(y===0,'GAIN_NOT_SCALAR','Zero samples changed; not a scalar gain');continue;}
    nonzero++;
    const u=(y-0.5)/x, v=(y+0.5)/x;
    low=Math.max(low,Math.min(u,v)); high=Math.min(high,Math.max(u,v));
    need(high>=low && high>0,'GAIN_NOT_SCALAR','Samples do not share one positive gain within half-LSB rounding');
  }
  need(nonzero>0 && Number.isFinite(high),'GAIN_UNPROVABLE','All-silence input cannot establish a gain');
  const gain=(low+high)/2;
  // Recheck the chosen common scalar; no aggregate RMS tolerance can hide edits.
  for(let p=0;p<a.data.length;p+=a.width) {
    const x=a.data.readIntLE(p,a.width),y=b.data.readIntLE(p,b.width);
    need(Math.abs(y-gain*x)<=0.50000001,'GAIN_NOT_SCALAR','No common quantized scalar');
  }
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  return {algorithm:'pcm-positive-scalar-v1',beforeHash:hash(beforeBytes),afterHash:hash(afterBytes),
    channels:a.channels,sampleRate:a.rate,bits:a.bits,frames:a.frames,gain,quantizationHalfLSB:0.5,nonzeroSamples:nonzero};
}
