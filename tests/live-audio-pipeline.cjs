// Real-time decoded recording -> WebAudio MediaStream -> production audioTap,
// extractor, follower, HUD and Auto. No hardware microphone or speaker output.
// electron tests/live-audio-pipeline.cjs --project=/path/file.supertitles --audio=/path/file --qa=/tmp/out
const {app,BrowserWindow,session}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),crypto=require('crypto');
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const root=path.resolve(__dirname,'..'),project=arg('project'),audio=arg('audio'),qa=arg('qa');
const html=arg('html')||path.join(root,'dist/Supertitle_Cuer.html');
if(!project||!audio||!qa)throw Error('Pass project/audio/qa explicitly.');fs.mkdirSync(qa,{recursive:true});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before={project:hash(project),audio:hash(audio),html:hash(html)};
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stq-live-pipeline-'));
for(const key of ['userData','sessionData','documents','crashDumps']){const dir=path.join(profile,key);fs.mkdirSync(dir);app.setPath(key,dir);}app.setAppLogsPath(path.join(profile,'logs'));
app.commandLine.appendSwitch('disable-background-networking');let win;const errors=[];
async function js(code){const result=await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(e){return {__error:String(e.stack||e)}}})()`,true);if(result?.__error)throw Error(result.__error);return result;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));let timer;
(async()=>{
 await app.whenReady();session.defaultSession.setPermissionRequestHandler((_,__,done)=>done(false));session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));
 win=new BrowserWindow({show:false,width:1320,height:940,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.setAudioMuted(true);
 win.webContents.on('console-message',e=>{if(e.level==='error'||e.level>=3)errors.push(e.message);});
 await win.loadFile(html);
 const p=fs.readFileSync(project).toString('base64'),a=fs.readFileSync(audio).toString('base64');
 const loaded=await js(`await idbGet('doc');await idbGet('follow');await idbGet('score');window.confirm=()=>true;
 await openAny(new File([STCSlideTransfer.bytes(${JSON.stringify(p)})],${JSON.stringify(path.basename(project))}),null);
 window.__originalMarkers=JSON.stringify(state.markers);window.__originalRefs=refRuns;window.__originalBytes=Object.fromEntries(Object.entries(refRuns).map(([k,v])=>[k,Array.from(v.feat).join(',')]));
 window.__inputCtx=new AudioContext({sampleRate:STCFollow.SR});window.__decoded=await window.__inputCtx.decodeAudioData(STCSlideTransfer.bytes(${JSON.stringify(a)}).buffer);
 window.__inputDest=window.__inputCtx.createMediaStreamDestination();window.__inputSource=window.__inputCtx.createBufferSource();window.__inputSource.buffer=window.__decoded;window.__inputSource.connect(window.__inputDest);
 window.__ended=false;window.__inputSource.onended=()=>{window.__ended=true;};window.__events=[];window.__trace=[];
 const autoOriginal=autoGoTo;autoGoTo=(index,scroll=true)=>{const event={index,time:window.__startAt==null?0:window.__inputCtx.currentTime-window.__startAt,estimate:follow?.st?{...follow.st}:null};autoOriginal(index,scroll);event.visible=cur;window.__events.push(event);};
 getMic=async()=>window.__inputDest.stream;
 await startAutoLive();if(autoRun?.kind!=='live')throw Error('Auto live failed to start');
 window.__tap={nodeType:follow.tap.node.constructor.name,sampleRate:follow.tap.ctx.sampleRate};
 window.__capture=setInterval(()=>window.__trace.push({time:window.__inputCtx.currentTime-window.__startAt,seq:follow?.seq??null,index:cur,state:follow?.st?{...follow.st}:null,view:follow?.view?{...follow.view}:null,auto:!!autoRun}),200);
 await window.__inputCtx.resume();window.__startAt=window.__inputCtx.currentTime+.3;window.__inputSource.start(window.__startAt);
 return {duration:window.__decoded.duration,cues:state.markers.length,parts:partsList().length,times:state.markers.map(m=>m.t),tap:window.__tap};`);
 console.log('START '+JSON.stringify(loaded));
 timer=setTimeout(()=>{console.error('Timed out');app.exit(1);},(loaded.duration+25)*1000);
 let lastLog=Date.now();while(!await js('return window.__ended;')){await delay(1000);if(Date.now()-lastLog>30000){console.log('PROGRESS '+JSON.stringify(await js('return {time:window.__inputCtx.currentTime-window.__startAt,index:cur,seq:follow?.seq,state:follow?.st,status:autoRun?.status};')));lastLog=Date.now();}}
 await delay(500);
 const result=await js(`clearInterval(window.__capture);const r={events:window.__events,trace:window.__trace,finalIndex:cur,stillActive:!!autoRun,tap:window.__tap,markersUnchanged:JSON.stringify(state.markers)===window.__originalMarkers,referencesSame:refRuns===window.__originalRefs,referenceBytesUnchanged:Object.entries(refRuns).every(([k,v])=>Array.from(v.feat).join(',')===window.__originalBytes[k])};stopAuto();await window.__inputCtx.close();return r;`);
 assert.equal(result.markersUnchanged,true);assert.equal(result.referencesSame,true);assert.equal(result.referenceBytesUnchanged,true);
 assert.ok(result.events.every((e,i)=>e.visible===e.index&&(!i||e.index>result.events[i-1].index)));assert.ok(result.events.slice(1).every(e=>e.estimate&&e.estimate.refTime>=loaded.times[e.index]));
 const after={project:hash(project),audio:hash(audio),html:hash(html)};assert.deepEqual(after,before);assert.deepEqual(errors,[]);
 const report={loaded,...result,before,after,errors,hardwareMicrophone:false,realWebAudioMediaStream:true,limitations:['Decoded recording is routed through WebAudio; this is not a speaker/room/microphone capture.','Reference cue times are not independent musical onset ground truth.']};
 fs.writeFileSync(path.join(qa,'live-pipeline-report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(qa,'complete.png'),(await win.capturePage()).toPNG());
 console.log('RESULT '+JSON.stringify({titles:result.events.length,expected:loaded.cues,finalIndex:result.finalIndex,stillActive:result.stillActive,nodeType:result.tap.nodeType,errors:result.events.map(e=>({cue:e.index+1,error:e.time-loaded.times[e.index]}))}));
 clearTimeout(timer);win.destroy();app.exit(0);
})().catch(e=>{console.error(e.stack);clearTimeout(timer);app.exit(1);});
