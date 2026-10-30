import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {options,allowed,run} from './cli.mjs';
const execute=promisify(execFile);
async function probe(command,args) {
  try {
    const {stdout,stderr}=await execute(command,args,{timeout:10000,windowsHide:true,maxBuffer:65536});
    return {available:true,version:(stdout||stderr).split(/\r?\n/)[0]};
  } catch(e) {return {available:false,code:e.code || 'PROBE_FAILED'};}
}
await run(async()=>{
  const o=options(process.argv.slice(2));allowed(o,['project']);
  let exists=false;
  try{exists=(await fs.stat(path.resolve(o.project))).isDirectory();}catch(e){if(e.code!=='ENOENT')throw e;}
  const [ffmpeg,ffprobe,powershell]=await Promise.all([
    probe('ffmpeg',['-version']),probe('ffprobe',['-version']),
    probe(process.platform==='win32'?'C:\\Program Files\\PowerShell\\7\\pwsh.exe':'pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()'])
  ]);
  return {ok:true,readOnly:true,project:{path:path.resolve(o.project),exists},runtime:{node:{available:true,version:process.version},ffmpeg,ffprobe,powershell},
    capabilities:{planning:'available',stateTools:'available',rendering:'unverified',actualListening:'unverified',hostSkillDiscovery:'unverified',tts:'external-only',imageGeneration:'user-manual-only',videoGeneration:'user-manual-only'},
    note:'版本探测只证明命令可执行；未安装依赖，未登录、渲染或调用生成服务。实际视听与宿主加载须分别验证。'};
});
