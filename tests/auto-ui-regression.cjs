// Isolated real-renderer Auto tests. Generated score/WAV only; no installed app,
// hardware microphone, system clipboard, network, or user projects are accessed.
// Run: electron tests/auto-ui-regression.cjs [--qa=/absolute/tmp/folder]
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const qa = process.argv.find(s => s.startsWith('--qa='))?.slice(5) || fs.mkdtempSync(path.join(os.tmpdir(), 'stq-auto-ui-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stq-auto-profile-'));
fs.mkdirSync(qa, { recursive: true });
for (const key of ['userData', 'sessionData', 'documents', 'crashDumps']) { const dir = path.join(profile, key); fs.mkdirSync(dir); app.setPath(key, dir); }
app.setAppLogsPath(path.join(profile, 'logs')); app.commandLine.appendSwitch('disable-background-networking');
execFileSync(process.execPath, [path.join(root, 'scripts/build-html.js')], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
const checks = [], errors = []; let win;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function js(code) {
  const result = await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(e){return {__error:String(e.stack||e)}}})()`, true);
  if (result?.__error) throw new Error(result.__error); return result;
}
async function until(code, label, timeout = 6000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await js(`return !!(${code});`)) return; await delay(25); } throw new Error('Timeout: ' + label); }
async function test(name, fn) { await fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); }
async function shot(name) {
  await js('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));');
  await delay(80); fs.writeFileSync(path.join(qa, name + '.png'), (await win.capturePage()).toPNG());
}
function wav() {
  const rate = 8000, count = rate * 3, out = Buffer.alloc(44 + count * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) out.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (i < rate ? 440 : 660) * i / rate) * 3000), 44 + i * 2);
  return out.toString('base64');
}
const wave = wav();
async function fixture(times = [.35, .9, 1.5], second = false) {
  await js(`if(window.__realNow)Object.defineProperty(performance,'now',{configurable:true,value:window.__realNow});
    await stopProjectActivity();setDirty(false);resetProject();window.confirm=()=>true;
    const d=await PDFLib.PDFDocument.create();d.addPage([612,792]);${second ? 'd.addPage([612,792]);' : ''}
    await loadPdfBytes('Generated Auto Score.pdf',await d.save());
    state.parts=[{id:'a',name:'Generated Act I.pdf',pages:1}${second ? ",{id:'b',name:'Generated Act II.pdf',pages:1}" : ''}];
    state.markers=${JSON.stringify(times.map((t, i) => ({ page: second && i ? 2 : 1, x: .2, y: .2 + i * .12, t })))};
    state.slides=state.markers.map((_,i)=>({text:'Generated cue '+(i+1),b:'hard'}));
    window.__wave=new File([STCSlideTransfer.bytes(${JSON.stringify(wave)})],'Generated.wav',{type:'audio/wav'});
    const identity=await STCRecordingReference.fileIdentity(window.__wave);
    const feature=new Float32Array(Math.ceil(3*STCFollow.FPS)*STCFollow.NB);for(let i=0;i<feature.length;i+=STCFollow.NB){feature[i]=1;feature[i+12]=-20;feature[i+13]=3;}
    refRuns={};for(const part of partsList())refRuns[part.id]={source:'file',name:'Generated.wav',fileId:identity,duration:3,feat:STCFollow.pack(feature),audio:null};
    window.__originalTimes=JSON.stringify(state.markers);window.__originalRef=refRuns.a;window.__originalBytes=Array.from(refRuns.a.feat).join(',');
    document.querySelector('#autoAudio').click=()=>{window.__pickerOpened=true;};
    setMode('show');changed(true);goTo(-1,false);setDirty(false);updateAutoBtn();
    window.__autoEvents=[];window.__originalAutoGoTo=window.__originalAutoGoTo||autoGoTo;
    autoGoTo=(index,scroll=true)=>{window.__autoEvents.push(index);return window.__originalAutoGoTo(index,scroll);};`);
}
async function startRecording() { await js('await startAutoRecording();await useAutoRecordingFile(window.__wave);'); await until('autoRun?.kind==="recording"&&!autoRun.loading&&!autoRun.media.paused', 'Auto playback'); }
async function immutable() {
  const result = await js(`return {markers:JSON.stringify(state.markers),originalMarkers:window.__originalTimes,sameReference:refRuns.a===window.__originalRef,sameBytes:Array.from(refRuns.a.feat).join(',')===window.__originalBytes};`);
  assert.equal(result.markers, result.originalMarkers, 'saved cue data is unchanged');
  assert.equal(result.sameReference, true, 'reference object is unchanged'); assert.equal(result.sameBytes, true, 'reference feature bytes are unchanged');
}
async function startLive() {
  await js(`window.__micStops=0;window.__tapCloses=0;
    getMic=async()=>({getTracks:()=>[{stop:()=>window.__micStops++}]});audioTap=async()=>({close:()=>window.__tapCloses++});
    await startAutoLive();clearInterval(autoRun.timer);clearInterval(follow.timer);
    window.__realNow=window.__realNow||performance.now.bind(performance);window.__clock=0;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>window.__clock});
    window.__anchorCalls=0;const anchor=follow.f.anchor;follow.f.anchor=(...args)=>{window.__anchorCalls++;return anchor(...args);};`);
}
async function feed(refTime, now, confidence = .9, extra = {}) {
  return js(`window.__clock=${now};follow.st={refTime:${refTime},tempo:1,confidence:${confidence},held:0,loud:-20,jumps:0,...${JSON.stringify(extra)}};
    follow.seq++;follow.sampledAt=window.__clock;tickAuto();return {cur,active:!!autoRun,status:autoRun?.status,warning:follow?.view?.warning};`);
}
const watchdog = setTimeout(() => { console.error('Auto UI tests timed out'); app.exit(1); }, 120000);
(async () => {
  await app.whenReady(); session.defaultSession.setPermissionRequestHandler((_, __, done) => done(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  win = new BrowserWindow({ show: false, width: 1320, height: 940, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true); win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  await win.loadFile(path.join(root, 'dist/Supertitle_Cuer.html'));
  // Drain the same ordered IndexedDB reads as asynchronous startup before creating fixtures.
  await js(`await idbGet('doc');await idbGet('follow');await idbGet('score');`);
  await test('Auto buttons require a complete timed section and verified recording', async () => {
    await fixture(); assert.deepEqual(await js(`return ['autoBtn','autoRecord','autoLive'].map(id=>document.getElementById(id).disabled);`), [false, false, false]);
    await js('delete state.markers[1].t;updateAutoBtn();'); assert.equal(await js(`return document.getElementById('autoBtn').disabled;`), true);
    await js('state.markers[1].t=.9;delete refRuns.a.fileId;updateAutoBtn();');
    assert.deepEqual(await js(`return ['autoBtn','autoRecord','autoLive'].map(id=>document.getElementById(id).disabled);`), [false, true, false]);
    await js('delete refRuns.a;updateAutoBtn();'); assert.equal(await js(`return document.getElementById('autoBtn').disabled;`), true);
    await fixture(); await js('run={kind:"record"};updateAutoBtn();');
    assert.deepEqual(await js(`return ['autoBtn','autoRecord','autoLive'].map(id=>document.getElementById(id).disabled);`), [true, true, true]);
    await js('run=null;state.slides.pop();updateAutoBtn();'); assert.equal(await js(`return document.getElementById('autoBtn').disabled;`), true);
  });
  await test('different recording bytes are rejected and picker cancellation releases pending Auto', async () => {
    await fixture(); await js('await startAutoRecording();await useAutoRecordingFile(new File([new Uint8Array([1,2,3])],"Wrong.wav"));');
    assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing&&cur===-1;'), true); await immutable();
    await js('await startAutoRecording();document.getElementById("autoAudio").dispatchEvent(new Event("cancel"));');
    assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing;'), true);
  });
  await test('muted real WAV playback advances on media time, pauses, resumes and stops at the end', async () => {
    await fixture([1.2, 1.8, 2.5]); await startRecording(); assert.equal(await js('return cur;'), 0);
    await delay(120); assert.equal(await js('return cur;'), 0);
    await until('cur===1', 'second automatic cue');
    assert.ok(await js('return autoRun.media.currentTime>=state.markers[1].t;'));
    await js('document.querySelector("#autoBar [data-auto=pause]").click();window.__pauseAt=autoRun.media.currentTime;window.__pauseCue=cur;');
    await delay(240); assert.equal(await js('return autoRun.media.paused&&Math.abs(autoRun.media.currentTime-window.__pauseAt)<.03&&cur===window.__pauseCue;'), true);
    await shot('auto-recording-paused'); await js('document.querySelector("#autoBar [data-auto=pause]").click();');
    await until('cur===2&&!autoRun', 'playback end', 6000); await immutable();
  });
  await test('an embedded reference recording can play automatically without a file picker or timing transaction', async () => {
    await fixture(); await js(`refRuns.a.source='recorded';refRuns.a.audio=new Uint8Array(await window.__wave.arrayBuffer());refRuns.a.audioType='audio/wav';delete refRuns.a.fileId;window.__pickerOpened=false;updateAutoBtn();await startAutoRecording();`);
    await until('autoRun?.kind==="recording"&&!autoRun.loading&&!autoRun.media.paused', 'embedded playback');
    assert.equal(await js('return !window.__pickerOpened&&!run&&!stoppingRun;'), true);
    await js('stopAuto();'); await immutable();
  });
  await test('manual cue keys, cue clicks and blackout take over without later automatic advancement', async () => {
    for (const action of ['handleKey(" ",{preventDefault(){}})', 'document.querySelector(\'.slide[data-i="1"] .num\').click()', 'toggleBlackout()']) {
      await fixture(); await startRecording(); await js(`window.__oldMedia=autoRun.media;${action};`);
      const before = await js('return {cur,blackout};'); assert.equal(await js('return !autoRun&&window.__oldMedia.paused;'), true);
      await delay(450); assert.deepEqual(await js('return {cur,blackout};'), before); await immutable();
    }
  });
  await test('Space at the final global title stops active playback and pending starts without advancing', async () => {
    await fixture([.35,.9,1.5]);await startRecording();await until('cur===2&&!!autoRun','last visible title while recording still plays');
    await js(`window.__lastMedia=autoRun.media;handleKey(' ',{preventDefault(){}});`);
    assert.equal(await js('return cur===2&&!autoRun&&!autoPending&&!autoPreparing&&window.__lastMedia.paused;'),true);
    await delay(250);assert.equal(await js('return cur===2&&!autoRun&&window.__lastMedia.paused;'),true);await immutable();
    await fixture([.35]);await js(`goTo(0,false);await startAutoRecording();window.__hash=STCRecordingReference.fileIdentity;STCRecordingReference.fileIdentity=()=>new Promise(resolve=>window.__finishHash=resolve);window.__opening=useAutoRecordingFile(window.__wave);handleKey(' ',{preventDefault(){}});window.__finishHash(window.__originalRef.fileId);await window.__opening;STCRecordingReference.fileIdentity=window.__hash;`);
    assert.equal(await js('return cur===0&&!autoRun&&!autoPending&&!autoPreparing;'),true);await immutable();
  });
  await test('projector Escape and Stop Auto pause playback immediately', async () => {
    for (const action of ['window.cueKey("Escape")', 'document.querySelector("#autoBar [data-auto=stop]").click()']) {
      await fixture(); await startRecording(); await js(`window.__oldMedia=autoRun.media;${action};`);
      assert.equal(await js('return !autoRun&&window.__oldMedia.paused&&document.getElementById("autoBar").hidden;'), true);
    }
  });
  await test('manual takeover while identity hashing is pending prevents a late Auto start', async () => {
    await fixture(); await js(`await startAutoRecording();window.__hash=STCRecordingReference.fileIdentity;STCRecordingReference.fileIdentity=()=>new Promise(resolve=>window.__finishHash=resolve);window.__opening=useAutoRecordingFile(window.__wave);goTo(0,false);window.__finishHash(window.__originalRef.fileId);await window.__opening;STCRecordingReference.fileIdentity=window.__hash;`);
    assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing&&cur===0;'), true); await immutable();
  });
  await test('Open cancellation, New and Close stop playback before leaving the current project', async () => {
    await fixture(); await startRecording(); await js(`window.__oldMedia=autoRun.media;window.showOpenFilePicker=async()=>{throw Object.assign(new Error('Canceled'),{name:'AbortError'});};await openDialog();`);
    assert.equal(await js('return !autoRun&&window.__oldMedia.paused&&state.markers.length===3;'), true);
    for (const action of ['await newProject()', 'await closeProject()', 'await window.__stcPrepareClose()']) {
      await fixture(); await startRecording(); await js(`window.__oldMedia=autoRun.media;${action};`);
      assert.equal(await js('return !autoRun&&!autoPending&&window.__oldMedia.paused;'), true);
    }
  });
  await test('Auto live follows fresh displayed tentative estimates at confidence.10–.25 without hiding or blocking later titles', async () => {
    await fixture([1.2,2,3]);await startLive();assert.equal(await js('return cur;'),0);
    for(let i=0;i<=22;i++)await feed(i/10,i*100,[.1,.15,.2,.25][i%4]);
    const middle=await js(`return {cur,events:window.__autoEvents,status:follow.view.status,warning:follow.view.warning,text:document.getElementById('fbText').textContent,classes:document.getElementById('followBar').className,anchors:window.__anchorCalls};`);
    assert.equal(middle.cur,1);assert.deepEqual(middle.events,[0,1]);assert.equal(middle.status,'tentative');assert.equal(middle.warning,true);
    assert.match(middle.text,/Estimated cue 3.*~0\.8 s/);assert.match(middle.text,/Reference match uncertain/);
    assert.doesNotMatch(middle.classes,/\b(?:now|soon)\b/);assert.equal(middle.anchors,0);
    for(let i=23;i<=32;i++)await feed(i/10,i*100,.1);
    assert.deepEqual(await js('return {cur,active:!!autoRun,events:window.__autoEvents,anchors:window.__anchorCalls};'),{cur:2,active:false,events:[0,1,2],anchors:0});await immutable();
  });
  await test('100ms Auto polling between200ms microphone updates does not starve tentative advancement', async () => {
    await fixture([1.2,2,3]);await startLive();await feed(2,0,.1);
    await js('window.__clock=100;tickAuto();');assert.equal(await js('return cur;'),0);
    await feed(2.1,200,.1);assert.equal(await js('return cur;'),1);
    await feed(3,400,.1);await js('window.__clock=500;tickAuto();');assert.equal(await js('return cur;'),1);
    await feed(3.1,600,.1);assert.deepEqual(await js('return {cur,active:!!autoRun,events:window.__autoEvents};'),{cur:2,active:false,events:[0,1,2]});
    assert.equal(await js('return window.__anchorCalls;'),0);await immutable();
  });
  await test('known music with zero confidence can advance while the warning remains visible', async () => {
    await fixture([1.2,2,4]);await startLive();await feed(0,0,.1);
    for(let i=1;i<=22;i++)await feed(i/10,i*100,0);
    assert.equal(await js('return cur;'),1);assert.equal(await js('return follow.view.status;'),'tentative');
    assert.equal(await js('return follow.view.warning&&window.__anchorCalls===0;'),true);await immutable();
  });
  await test('waiting, quiet and stale estimates cannot advance but recover without a permanent hidden hold', async () => {
    await fixture([1.2,2,4]);await startLive();
    for(let i=0;i<=22;i++)await feed(i/10,i*100,0,{loud:-120});
    assert.equal(await js('return cur;'),0);assert.equal(await js('return follow.view.status;'),'waiting');
    await feed(2.3,2300,.1);await feed(2.4,2400,.1);assert.equal(await js('return cur;'),0);
    await feed(2.5,2500,.1);assert.equal(await js('return cur;'),1);
    await fixture([1.2,2,4]);await startLive();
    await feed(1.9,0,.1);await feed(2,100,.1);
    await feed(2.1,200,.1,{held:1.3});await feed(2.2,400,.1,{held:1.3});
    assert.equal(await js('return cur;'),0);assert.equal(await js('return follow.view.status;'),'paused');
    await feed(2.3,500,.1);await feed(2.4,600,.1);assert.equal(await js('return cur;'),0);
    await feed(2.5,700,.1);assert.equal(await js('return cur;'),1);
    await fixture([1.2,2,4]);await startLive();await feed(2,0,.1);
    await js('window.__clock=700;tickAuto();');assert.equal(await js('return cur;'),0);
    await feed(2.1,800,.1);await feed(2.2,900,.1);assert.equal(await js('return cur;'),0);
    await feed(2.3,1000,.1);assert.equal(await js('return cur;'),1);await immutable();
    await js(`stopAuto({keepFollowing:true});document.getElementById('toast').classList.remove('on');window.__clock=1200;follow.st={refTime:.4,tempo:1,confidence:.1,held:0,loud:-20,jumps:0};paintFollow();`);
    await shot('steady-tentative');
    await js(`window.__clock=3200;follow.st={...follow.st,held:2,confidence:0};paintFollow();`);await shot('quiet-paused');
  });
  await test('missing or unavailable countdowns clear cached view and cannot advance Auto', async () => {
    await fixture([1.2,2,4]);await startLive();await feed(.5,0,.1);
    assert.equal(await js('return follow.view.status;'),'tentative');
    await js('delete state.markers[1].t;');await feed(2.1,100,.1);await feed(2.2,300,.1);
    assert.equal(await js('return cur===0&&follow.view===null;'),true);
    await js('state.markers[1].t=2;window.__savedFollower=follow.f;follow.f=null;');
    await feed(2.3,400,.1);await feed(2.4,600,.1);assert.equal(await js('return cur===0&&follow.view===null;'),true);
    await js('follow.f=window.__savedFollower;');await feed(2.5,700,.1,{refTime:null});await feed(2.6,900,.1,{refTime:null});
    assert.equal(await js('return cur===0&&follow.view.status==="unavailable"&&follow.view.seconds===null;'),true);
    await feed(2.7,1000,.1);await feed(2.8,1100,.1);assert.equal(await js('return cur;'),0);
    await feed(2.9,1200,.1);assert.equal(await js('return cur;'),1);await immutable();
  });
  await test('successive tentative automatic transitions immediately show the next countdown and warning', async () => {
    await fixture([.2,1,2,4]);await startLive();
    for(let i=0;i<=12;i++)await feed(i/10,i*100,.1);
    assert.deepEqual(await js(`return {cur,status:follow.view.status,warning:follow.view.warning,seconds:follow.view.seconds};`),{cur:1,status:'tentative',warning:true,seconds:.8});
    assert.match(await js('return document.getElementById("fbText").textContent;'),/Estimated cue 3/);
    for(let i=13;i<=22;i++)await feed(i/10,i*100,.1);
    assert.equal(await js('return cur;'),2);assert.equal(await js('return follow.view.status;'),'tentative');
    assert.equal(await js('return follow.view.warning;'),true);assert.match(await js('return document.getElementById("fbText").textContent;'),/Estimated cue 4/);await immutable();
  });
  await test('manual takeover during pending live microphone startup prevents a late Auto start', async () => {
    await fixture([1.2, 2, 2.7]); await js(`window.__lateStops=0;getMic=()=>new Promise(resolve=>window.__lateMic=resolve);window.__startingLive=startAutoLive();`);
    await until('!!autoPending&&autoPreparing', 'pending live');
    await js(`handleKey(' ',{preventDefault(){}});window.__lateMic({getTracks:()=>[{stop:()=>window.__lateStops++}]});await window.__startingLive;`);
    assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing&&!follow&&cur===1&&window.__lateStops===1;'), true); await immutable();
  });
  await test('stopping Auto live releases its microphone graph and leaves no running scheduler', async () => {
    await fixture([1.2, 2, 2.7]); await startLive(); await js(`document.querySelector('#autoBar [data-auto=stop]').click();`);
    assert.equal(await js('return !autoRun&&!follow&&window.__micStops===1&&window.__tapCloses===1;'), true); await immutable();
  });
  await test('resuming Auto live confirms the current displayed due interval without flashing missed titles', async () => {
    await fixture([1.2,2.2,2.9,4]);await startLive();
    for(let i=0;i<=9;i++)await feed(i/10,i*100,.1);
    await js(`document.querySelector('#autoBar [data-auto=pause]').click();`);
    for(let i=10;i<=32;i++)await feed(i/10,i*100,.1);
    assert.equal(await js('return cur;'),0);await js(`document.querySelector('#autoBar [data-auto=pause]').click();`);
    await feed(3.3,3300,.1);await feed(3.4,3400,.1);assert.equal(await js('return cur;'),0);
    await feed(3.5,3500,.1);assert.equal(await js('return cur;'),2);
    assert.deepEqual(await js('return window.__autoEvents;'),[0,2]);assert.equal(await js('return window.__anchorCalls;'),0);await immutable();
  });
  await test('strong live samples advance once per stable due interval without anchoring the matcher themselves', async () => {
    await fixture([1.2,2.2,2.9]);await startLive();
    for(let i=0;i<=32&&await js('return !!autoRun;');i++)await feed(i/10,i*100);
    assert.equal(await js('return cur;'),2);assert.equal(await js('return autoRun;'),null);
    assert.deepEqual(await js('return window.__autoEvents;'),[0,1,2]);assert.equal(await js('return window.__anchorCalls;'),0);await immutable();
  });
  await test('closely spaced later cues follow displayed estimates without a confidence requalification delay', async () => {
    await fixture([.2,1.2,1.5]);await startLive();assert.equal(await js('return cur;'),0);
    for(let i=0;i<=14;i++)await feed(i/10,i*100,.1);assert.equal(await js('return cur;'),1);
    for(let i=15;i<=17;i++)await feed(i/10,i*100,.1);assert.equal(await js('return cur;'),2);
    assert.equal(await js('return autoRun;'),null);assert.equal(await js('return window.__anchorCalls;'),0);await immutable();
  });
  await test('candidate jitter, relocation and backwards estimates recover without rewinding or intermediate flashes', async () => {
    await fixture([.2,1,2,3,4]);await startLive();
    let now=0;for(const t of [1.9,2.01,1.99,2.02,1.98,2.01]){await feed(t,now,.1);now+=100;}
    assert.equal(await js('return cur;'),0);await feed(2.1,now,.1);now+=100;await feed(2.2,now,.1);now+=100;
    assert.equal(await js('return cur;'),2);assert.deepEqual(await js('return window.__autoEvents;'),[0,2]);
    await feed(.5,now,.1);now+=100;await feed(.6,now,.1);now+=100;assert.equal(await js('return cur;'),2);
    await feed(3.1,now,.1,{jumps:1});now+=100;await feed(3.2,now,.1,{jumps:1});now+=100;
    assert.equal(await js('return cur;'),2);await feed(3.3,now,.1,{jumps:1});
    assert.equal(await js('return cur;'),3);assert.deepEqual(await js('return window.__autoEvents;'),[0,2,3]);await immutable();
  });
  await test('Auto live presents the selected second PDF\'s first title immediately and allows manual takeover', async () => {
    await fixture([.2, 1.2, 2.1, 2.8], true); await js('goTo(2,false);'); await startLive();
    assert.deepEqual(await js('return {part:follow.part,cur,blackout};'), { part: 'b', cur: 1, blackout: false });
    for (let i = 0; i <= 12; i++) await feed(i / 10, i * 100);
    assert.equal(await js('return cur;'), 1); assert.equal(await js('return blackout;'), false);
    await js('handleKey(" ",{preventDefault(){}});'); assert.equal(await js('return !autoRun&&!!follow;'), true);
    assert.equal(await js('return window.__anchorCalls;'), 1); await immutable();
  });
  await test('recording Auto ends at its selected group and the next recording needs a new explicit launch', async () => {
    await fixture([1.2, .35, .9, 1.5], true);
    await js(`const bytes=new Uint8Array(await window.__wave.arrayBuffer());bytes[bytes.length-1]^=1;
      window.__otherWave=new File([bytes],'Other recording.wav',{type:'audio/wav'});refRuns.b.fileId=await STCRecordingReference.fileIdentity(window.__otherWave);refRuns.b.name=window.__otherWave.name;`);
    await startRecording(); await until('!autoRun', 'first group recording end', 6000);
    assert.equal(await js('return cur;'), 0); await delay(150); assert.equal(await js('return cur;'), 0);
    await js('goTo(2,false);await startAutoRecording();await useAutoRecordingFile(window.__wave);');
    assert.equal(await js('return !autoRun&&!autoPending&&cur===2;'), true);
    await js('await startAutoRecording();await useAutoRecordingFile(window.__otherWave);');
    assert.equal(await js('return autoRun.part.id;'), 'b'); assert.equal(await js('return cur;'), 1);
    await js('stopAuto();'); await immutable();
  });
  await test('live Auto finishes one group without crossing into the next group\'s separate timeline', async () => {
    await fixture([.2, 1.2, .4, 1], true);
    await js('state.markers[1].page=1;window.__originalTimes=JSON.stringify(state.markers);changed(true);goTo(-1,false);');
    await startLive();
    for (let i = 0; i <= 14; i++) await feed(i / 10, i * 100,.1);
    assert.equal(await js('return cur;'), 1); assert.equal(await js('return !autoRun&&!follow;'), true);
    await delay(150); assert.equal(await js('return cur;'), 1);
    await js('goTo(2,false);'); await startLive();
    assert.deepEqual(await js('return {part:follow.part,cur};'), { part: 'b', cur: 2 }); await immutable();
  });
  await js('await stopProjectActivity();');
  fs.writeFileSync(path.join(qa, 'auto-ui-report.json'), JSON.stringify({ checks, errors, profile, source: root, hardwareMicrophone: false, audioOutputMuted: true, generatedFixturesOnly: true }, null, 2));
  assert.deepEqual(errors, []); clearTimeout(watchdog); console.log(checks.length + ' Auto UI cases passed. QA: ' + qa); win.destroy(); app.exit(0);
})().catch(async error => { console.error(error.stack); try { await shot('failure'); fs.writeFileSync(path.join(qa, 'failure.json'), JSON.stringify({ error: String(error.stack), checks, errors }, null, 2)); } catch (_) {} clearTimeout(watchdog); app.exit(1); });
