// Optional real-recording workflow check. Never opens the user's installed app.
// electron tests/recording-ui-regression.cjs --audio=/path/file.m4a --sample=/path/project.supertitles --qa=/tmp/qa
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const arg=k=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3);
const root=path.resolve(__dirname,'..'),qa=arg('qa')||path.join(os.tmpdir(),'stq-recording-ui');
const audioPath=arg('audio'),samplePath=arg('sample');
if(!audioPath||!samplePath)throw new Error('Pass --audio and --sample; these are read-only inputs.');
fs.mkdirSync(qa,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stq-recording-profile-'));
app.setPath('userData',profile);app.setPath('sessionData',profile);
app.commandLine.appendSwitch('disable-background-networking');
const checks=[],errors=[];let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=async code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
const until=async(code,label,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await js('return !!('+code+');'))return;await pause(100);}throw new Error('Timeout: '+label);};
const test=async(name,fn)=>{await fn();checks.push({name,pass:true});console.log('PASS '+name);};
const shot=async name=>{fs.writeFileSync(path.join(qa,name+'.png'),(await win.capturePage()).toPNG());};
const loadAudio=async(name=path.basename(audioPath))=>js(`window.__inputFile=new File([STCSlideTransfer.bytes(${JSON.stringify(fs.readFileSync(audioPath).toString('base64'))})],${JSON.stringify(name)},{type:'audio/mp4'});
  const dt=new DataTransfer();dt.items.add(window.__inputFile);document.querySelector('#fAudio').files=dt.files;
  document.querySelector('#fAudio').dispatchEvent(new Event('change',{bubbles:true}));`);
const finish=async keep=>{await js(`await stopRun(${keep});`);await until('!run&&!stoppingRun','finish');};
const bytesDigest=async()=>js('return Array.from(refRuns.cpgf6cr.feat).reduce((n,v)=>(Math.imul(n,31)+v)>>>0,0);');
const timer=setTimeout(()=>{console.error('Recording UI test timed out');app.exit(1);},260000);
(async()=>{
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));
  session.defaultSession.setPermissionRequestHandler((_,__,done)=>done(false));
  win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',e=>{if(e.level==='error'||e.level>=3)errors.push(e.message);});
  await win.loadFile(path.join(root,'dist','Supertitle_Cuer.html'));
  await js(`window.confirm=()=>{window.__confirms=(window.__confirms||0)+1;return true;};`);
  await test('open the actual project without modifying the source file',async()=>{
    await js(`await openAny(new File([STCSlideTransfer.bytes(${JSON.stringify(fs.readFileSync(samplePath).toString('base64'))})],'Anvil workflow test.supertitles'),null);`);
    assert.deepEqual(await js('return [pdfDoc.numPages,state.slides.length,partsList().length];'),[20,30,2]);
  });
  await test('Follow identifies the correct Anvil PDF and links the actual M4A',async()=>{
    await js(`document.querySelector('#followBtn').click();document.querySelector('#fAudio').click=()=>{};`);
    assert.equal(await js('return document.querySelectorAll("#fParts .frow").length;'),2);
    await shot('follow-select-anvil');
    await js(`document.querySelector('#fParts [data-part="cpgf6cr"] [data-f="load"]').click();`);
    await loadAudio();await until('run?.kind==="along"','real recording loaded');
    assert.equal(await js('return run.part;'),'cpgf6cr');
    assert.ok(await js('return Math.abs(run.media.duration-160.287)<.1;'));
    assert.ok(await js('return run.fileId?.startsWith("stq-chunks-v1:");'));
    await shot('cue-along-ready');
  });
  await test('native media playback records pending cue times while preserving the old timeline',async()=>{
    await js(`document.querySelector('#runBar [data-run="rate"]').value='1.5';document.querySelector('#runBar [data-run="rate"]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#runBar [data-run="play"]').click();`);
    await until('run.media.currentTime>1 && run.frames.length>0','playback and analysis',12000);
    for(const cue of [18,19,20]){
      await js(`goTo(${cue},false);`);await pause(500);
    }
    assert.equal(await js('return run.timed.size;'),3);
    assert.equal(await js('return run.times.size;'),3);
    assert.equal(await js('return state.markers.slice(18,21).every(m=>m.t===undefined);'),true);
    await shot('cue-along-three-cues');
    let last=0;
    while(!await js('return run.media.ended;')){
      const now=await js('return run.media.currentTime;');
      if(now-last>30){console.log('PLAYBACK '+Math.round(now)+' /160 seconds');last=now;}
      await pause(1000);
    }
    await finish(true);
    const summary=await js(`const r=refRuns.cpgf6cr,NB=STCFollow.NB;let active=0;for(let i=0;i<r.feat.length;i+=NB)if(r.feat[i+13])active++;return {frames:r.feat.length/NB,covered:active/(r.feat.length/NB),timed:timedIn('cpgf6cr'),fileId:r.fileId};`);
    assert.equal(summary.timed,3);assert.ok(summary.covered>.9,JSON.stringify(summary));
    fs.writeFileSync(path.join(qa,'reference-coverage.json'),JSON.stringify(summary,null,2));
  });
  await test('save and reopen keeps the analysis, file identity and cue times together',async()=>{
    await js(`window.__save=null;window.showSaveFilePicker=async()=>({name:'Anvil workflow test.supertitles',createWritable:async()=>({write:async b=>{window.__save=new Uint8Array(b);},close:async()=>{}})});await saveDoc(true,'supertitles');`);
    const before=await js('return {fileId:refRuns.cpgf6cr.fileId,times:state.markers.map(m=>m.t??null),length:refRuns.cpgf6cr.feat.length};');
    const saved=await js('return STCSlideTransfer.base64(window.__save);');
    fs.writeFileSync(path.join(qa,'test-project.supertitles'),Buffer.from(saved,'base64'));
    await js(`await openAny(new File([window.__save],'Anvil workflow test.supertitles'),null);`);
    assert.deepEqual(await js('return {fileId:refRuns.cpgf6cr.fileId,times:state.markers.map(m=>m.t??null),length:refRuns.cpgf6cr.feat.length};'),before);
    await js(`document.querySelector('#followBtn').click();`);await shot('follow-saved-three-cues');
  });
  await test('renamed identical audio reuses the reference; Discard preserves it exactly',async()=>{
    const before=await bytesDigest(),times=await js('return state.markers.map(m=>m.t??null);');
    await js(`document.querySelector('#fParts [data-part="cpgf6cr"] [data-f="load"]').click();window.__confirms=0;`);
    await loadAudio('Renamed same recording.m4a');await until('run?.kind==="along"','relink');
    assert.equal(await js('return run.reuse;'),true);assert.equal(await js('return window.__confirms;'),0);
    await js(`run.media.currentTime=25;document.querySelector('#runBar [data-run="play"]').click();`);
    await until('run.media.currentTime>26','retime playback');
    await js('goTo(19,false);');await finish(false);
    assert.equal(await bytesDigest(),before);assert.deepEqual(await js('return state.markers.map(m=>m.t??null);'),times);
  });
  await test('pressing Done before playback preserves the previous reference and timeline',async()=>{
    const before=await bytesDigest(),times=await js('return state.markers.map(m=>m.t??null);');
    await js(`await startCueAlong('cpgf6cr',window.__inputFile);`);await finish(true);
    assert.equal(await bytesDigest(),before);assert.deepEqual(await js('return state.markers.map(m=>m.t??null);'),times);
  });
  await js(`await stopProjectActivity();`);
  fs.writeFileSync(path.join(qa,'recording-ui-report.json'),JSON.stringify({checks,errors,sourceAppVersion:'2.9.1',microphone:false,physicalOutputMuted:true,cueTimesAreMechanicalTestData:true},null,2));
  assert.deepEqual(errors,[]);clearTimeout(timer);console.log('ALL '+checks.length+' REAL RECORDING UI TESTS PASSED');win.destroy();app.exit(0);
})().catch(async e=>{console.error(e.stack);try{await shot('failure');fs.writeFileSync(path.join(qa,'failure.json'),JSON.stringify({error:String(e.stack),checks,errors},null,2));}catch(_){}clearTimeout(timer);app.exit(1);});
