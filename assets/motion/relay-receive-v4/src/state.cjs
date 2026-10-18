// Local seconds and local frames, clamped to the borrowed source interval.
const versions={v3:require('./timeline-v3.cjs'),v4:require('./timeline-v4.cjs')};
const FPS=60,FRAMES=504,SOURCE_START_FRAME=1036,SECONDS=FRAMES/FPS;
function timeline(version){if(!versions[version])throw Error('Expected v3 or v4');return versions[version];}
function atSeconds(localSeconds,version='v4'){if(!Number.isFinite(localSeconds))throw Error('Finite local seconds required');return timeline(version).state((SOURCE_START_FRAME+FPS*Math.max(0,Math.min(SECONDS,localSeconds)))/FPS);}
const atFrame=(frame,version='v4')=>{if(!Number.isFinite(frame))throw Error('Finite frame required');return timeline(version).state((SOURCE_START_FRAME+Math.max(0,Math.min(FRAMES,frame)))/FPS);};
const events=(version='v4')=>timeline(version).events.filter(([a,b])=>b>SOURCE_START_FRAME/FPS&&a<(SOURCE_START_FRAME+FRAMES)/FPS).map(([a,b,event])=>({event,localStart:a-SOURCE_START_FRAME/FPS,localEnd:b-SOURCE_START_FRAME/FPS,sourceStart:a,sourceEnd:b}));
module.exports={atSeconds,atFrame,events,timeline,FPS,FRAMES,SECONDS,SOURCE_START_FRAME};
if(require.main===module){const [version='v4',...seconds]=process.argv.slice(2);console.log(JSON.stringify((seconds.length?seconds.map(Number):[0,4.083333333333333,8.4]).map(t=>({localSeconds:t,state:atSeconds(t,version)})),null,2));}
