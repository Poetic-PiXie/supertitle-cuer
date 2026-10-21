/* Isolated mixed-section orchestration stress tests. Generated PDFs and two
 * short WAVs only; no installed app, microphone, clipboard, network or projects.
 * electron tests/multi-section-auto-regression.cjs [--qa=/absolute/tmp/folder]
 */
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const qa = path.resolve(process.argv.find(v => v.startsWith('--qa='))?.slice(5) || fs.mkdtempSync(path.join(os.tmpdir(), 'stq-multi-section-')));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stq-multi-profile-'));
fs.mkdirSync(qa, { recursive: true });
for (const key of ['userData', 'sessionData', 'documents', 'crashDumps']) { const dir = path.join(profile, key); fs.mkdirSync(dir); app.setPath(key, dir); }
app.setAppLogsPath(path.join(profile, 'logs')); app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('enable-precise-memory-info');
execFileSync(process.execPath, [path.join(root, 'scripts/build-html.js')], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
const checks = [], errors = [], observations = [], scenarios = []; let win, lastScenario;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function js(code) { const value = await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(e){return {__error:String(e.stack||e)}}})()`, true); if (value?.__error) throw new Error(value.__error); return value; }
async function until(code, label, timeout = 5000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await js(`return !!(${code});`)) return; await delay(20); } throw new Error('Timeout: ' + label); }
async function test(name, fn) { const start = performance.now(); await fn(); checks.push({ name, pass: true, elapsedMs: +(performance.now() - start).toFixed(2) }); console.log('PASS ' + name); }
async function shot(name) { await js('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'); await delay(60); fs.writeFileSync(path.join(qa, name + '.png'), (await win.capturePage()).toPNG()); }
function wav(pitch) { const rate = 8000, count = Math.round(rate * 1.2), out = Buffer.alloc(44 + count * 2); out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40); for (let i = 0; i < count; i++) out.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (pitch + Math.floor(i / 3200) * 55) * i / rate) * 3000), 44 + i * 2); return out.toString('base64'); }
const waves = [wav(440), wav(523)];
function rng(seed) { let v = seed >>> 0; return () => { v ^= v << 13; v ^= v >>> 17; v ^= v << 5; return (v >>> 0) / 4294967296; }; }
const random = rng(0x2940a17);
async function fixture(count) {
  const started = performance.now();
  const result = await js(`if(window.__realNow)Object.defineProperty(performance,'now',{configurable:true,value:window.__realNow});
    await stopProjectActivity();setDirty(false);resetProject();window.confirm=()=>true;
    window.__waves=await Promise.all(${JSON.stringify(waves)}.map(async(b,i)=>new File([STCSlideTransfer.bytes(b)],'Reference '+(i+1)+'.wav',{type:'audio/wav'})));
    window.__identities=await Promise.all(window.__waves.map(f=>STCRecordingReference.fileIdentity(f)));
    const pdf=await PDFLib.PDFDocument.create(),font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const kinds=['linked-a','linked-b','embedded','missing','partial','backwards','legacy'];
    state.parts=[];state.markers=[];state.slides=[];refRuns={};window.__spec=[];
    for(let s=0;s<${count};s++){
      const id='part-'+s,kind=s===19?'linked-b':kinds[s%kinds.length],times=[.1,.4+(s%3)*.025,.8+(s%4)*.025];
      const part={id,name:'Generated PDF '+(s+1)+'.pdf',title:'Section '+(s+1)+' · '+kind,pages:3};state.parts.push(part);
      for(let p=0;p<3;p++){const page=pdf.addPage([612,792]);page.drawText('SECTION '+(s+1)+' / PAGE '+(p+1),{x:42,y:730,font,size:18});}
      const first=state.markers.length;
      for(let c=0;c<3;c++){const m={page:s*3+1,x:.2,y:.2+c*.2,t:times[c]};if(kind==='partial'&&c===2)delete m.t;if(kind==='backwards'&&c===2)m.t=times[1]-.1;state.markers.push(m);state.slides.push({text:'Section '+(s+1)+' / title '+(c+1),b:'hard'});}
      if(kind!=='missing'){
        const features=new Float32Array(Math.ceil(1.2*STCFollow.FPS)*STCFollow.NB);
        for(let k=0;k<features.length;k+=STCFollow.NB){features[k+s%12]=1;features[k+12]=-20-s/10;features[k+13]=3;}
        const r={source:kind==='embedded'?'recorded':'file',name:'Section '+(s+1)+' reference',duration:1.2,feat:STCFollow.pack(features),audio:null};
        if(kind==='embedded'){r.audio=new Uint8Array(await window.__waves[s%2].arrayBuffer());r.audioType='audio/wav';}
        else if(kind!=='legacy')r.fileId=window.__identities[kind==='linked-b'||kind==='backwards'?1:0];
        refRuns[id]=r;
      }
      window.__spec.push({id,kind,first,last:first+2,times,wave:kind==='linked-b'||kind==='backwards'?1:0,live:!['missing','partial','backwards'].includes(kind),recording:['linked-a','linked-b','embedded'].includes(kind)});
    }
    const bytes=new Uint8Array(await pdf.save());await loadPdfBytes('Mixed '+${count}+' PDFs.pdf',bytes);
    setMode('show');changed(true);goTo(-1,false);setDirty(false);updateAutoBtn();
    window.__pickerOpened=0;document.querySelector('#autoAudio').click=()=>window.__pickerOpened++;
    window.__events=[];window.__originalAutoGoTo=window.__originalAutoGoTo||autoGoTo;autoGoTo=(index,scroll=true)=>{window.__events.push({index,part:cuePart(index)?.id});return window.__originalAutoGoTo(index,scroll);};
    window.__refs=()=>Object.fromEntries(Object.entries(refRuns).map(([id,r])=>[id,{meta:refMeta(r),feat:STCSlideTransfer.base64(r.feat),audio:r.audio?STCSlideTransfer.base64(r.audio):null}]));
    window.__snapshot=()=>({parts:JSON.parse(JSON.stringify(state.parts)),markers:JSON.parse(JSON.stringify(state.markers)),slides:JSON.parse(JSON.stringify(state.slides)),refs:window.__refs()});
    window.__baseline=window.__snapshot();return {spec:window.__spec,pages:pdfDoc.numPages,referenceCount:Object.keys(refRuns).length,pdfBytes:bytes.length};`);
  observations.push({ phase: 'load', count, elapsedMs: +(performance.now() - started).toFixed(2), ...result, spec: undefined });
  return result.spec;
}
async function select(s, offset = 0) { await js(`stopAuto();stopFollow();if(window.__realNow)Object.defineProperty(performance,'now',{configurable:true,value:window.__realNow});goTo(${s.first + offset},false);window.__events=[];updateAutoBtn();`); }
async function unchanged() { assert.deepEqual(await js('return window.__snapshot();'), await js('return window.__baseline;'), 'all sections retain their own titles, times and reference bytes'); }
async function live(s) {
  await select(s, 1); await js(`window.__micStops=0;window.__tapCloses=0;getMic=async()=>({getTracks:()=>[{stop:()=>window.__micStops++}]});audioTap=async()=>({close:()=>window.__tapCloses++});await startAutoLive();clearInterval(autoRun.timer);clearInterval(follow.timer);window.__realNow=window.__realNow||performance.now.bind(performance);window.__clock=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>window.__clock});window.__anchors=0;const original=follow.f.anchor;follow.f.anchor=(...v)=>{window.__anchors++;return original(...v);};`);
  assert.deepEqual(await js('return {cur,part:follow.part,events:window.__events};'), { cur: s.first, part: s.id, events: [{ index: s.first, part: s.id }] });
  for (const [t, now] of [[s.times[1], 0], [s.times[1] + .01, 100], [s.times[1] + .02, 200], [s.times[2], 400], [s.times[2] + .01, 500], [s.times[2] + .02, 600]]) await js(`window.__clock=${now};follow.st={refTime:${t},tempo:1,confidence:.1,held:0,loud:-20,jumps:0};follow.seq++;follow.sampledAt=window.__clock;tickAuto();`);
  assert.deepEqual(await js('return {cur,active:!!autoRun,following:!!follow,events:window.__events.map(e=>e.index),anchors:window.__anchors};'), { cur: s.last, active: false, following: false, events: [s.first, s.first + 1, s.last], anchors: 0 });
  assert.equal(await js('return window.__micStops===1&&window.__tapCloses===1;'), true); await unchanged();
}
async function recording(s, { finish = true } = {}) {
  await select(s, 1); await js(`await startAutoRecording();if(autoPending)await useAutoRecordingFile(window.__waves[${s.wave}]);`);
  await until('autoRun?.kind==="recording"&&!autoRun.loading', 'recording metadata');
  assert.deepEqual(await js('return {cur,part:autoRun.part.id,events:window.__events};'), { cur: s.first, part: s.id, events: [{ index: s.first, part: s.id }] });
  if (finish) { await js('autoRun.media.playbackRate=8;'); await until('!autoRun', 'selected group playback end'); assert.equal(await js('return cur;'), s.last); assert.deepEqual(await js('return [...new Set(window.__events.map(e=>e.part))];'), [s.id]); await delay(30); assert.equal(await js('return cur;'), s.last); }
  await unchanged();
}
async function manual(s) { await select(s); const before = await js('return cur;'); await js('await startAutoLive();await startAutoRecording();'); assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing;'), true); assert.equal(await js('return cur;'), before); await js(`handleKey(' ',{preventDefault(){}});`); assert.equal(await js('return cur;'), before + 1); await unchanged(); }
async function selected(s) { await select(s, 1); assert.deepEqual(await js('return {id:autoSection().part.id,live:!document.getElementById("autoLive").disabled,recording:!document.getElementById("autoRecord").disabled};'), { id: s.id, live: s.live, recording: s.recording }); }
async function cancelPending(s) { await select(s); await js(`await startAutoRecording();window.__hash=STCRecordingReference.fileIdentity;STCRecordingReference.fileIdentity=()=>new Promise(resolve=>window.__resolveHash=resolve);window.__opening=useAutoRecordingFile(window.__waves[${s.wave}]);handleKey(' ',{preventDefault(){}});window.__resolveHash(window.__identities[${s.wave}]);await window.__opening;STCRecordingReference.fileIdentity=window.__hash;`); assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing;'), true); assert.equal(await js('return cur;'), s.first + 1); await unchanged(); }
async function wrongFile(s) { await select(s, 1); await js(`await startAutoRecording();await useAutoRecordingFile(window.__waves[${1 - s.wave}]);`); assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing;'), true); assert.equal(await js('return cur;'), s.first + 1); await unchanged(); }
async function memoryObservation(count) {
  const samples = [];
  for (const page of [0, Math.floor(count * 1.5), count * 3 - 1, 0]) {
    await js(`pageEls[${page}].wrap.scrollIntoView({block:'start'});`); await delay(180);
    const sample = await js(`return {atPage:${page + 1},pages:pageEls.length,rendered:pageEls.filter(p=>p.renderedW>0).length,blankDefaultCanvases:pageEls.filter(p=>!p.renderedW&&p.canvas.width===300&&p.canvas.height===150).length,pixels:pageEls.reduce((n,p)=>n+p.canvas.width*p.canvas.height,0),largestPixels:Math.max(...pageEls.map(p=>p.canvas.width*p.canvas.height)),activeRenders:activePageRenders,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,featureBytes:Object.values(refRuns).reduce((n,r)=>n+r.feat.byteLength,0),embeddedAudioBytes:Object.values(refRuns).reduce((n,r)=>n+(r.audio?.byteLength||0),0)};`);
    assert.ok(sample.rendered <= 8); assert.ok(sample.largestPixels <= 8000000); assert.ok(sample.activeRenders <= 2); samples.push(sample);
  }
  const pid = win.webContents.getOSProcessId(), metric = app.getAppMetrics().find(m => m.pid === pid);
  observations.push({ phase: 'scroll-render', count, samples, rendererMemoryKiB: metric?.memory || null });
}
async function persistenceAndReorder(spec) {
  await js(`stopAuto();stopFollow();if(window.__realNow)Object.defineProperty(performance,'now',{configurable:true,value:window.__realNow});setDirty(false);window.__roundtrip=await buildProjectPdf();resetProject();await openAny(new File([window.__roundtrip],'Mixed roundtrip.supertitles'),null);`);
  await unchanged();
  await js(`setMode('edit');state.settings.lockCues=false;state.settings.lockOrder=false;updateLocks();window.__beforeReorder=window.__snapshot();window.__byPart=Object.fromEntries(partsList().map(p=>[p.id,cuesOf(p.id).map(i=>({marker:{...state.markers[i],page:state.markers[i].page-partStarts(partsList())[p.id]+1},slide:state.slides[i]}))]));window.__reordered=[...partsList()].reverse();if(!await applyParts(window.__reordered))throw new Error('reorder failed');`);
  assert.equal(await js(`return partsList().map(p=>p.id).join(',')===window.__beforeReorder.parts.map(p=>p.id).reverse().join(',');`), true);
  assert.equal(await js(`return JSON.stringify(window.__refs())===JSON.stringify(window.__beforeReorder.refs);`), true);
  assert.equal(await js(`return partsList().every(p=>JSON.stringify(cuesOf(p.id).map(i=>({marker:{...state.markers[i],page:state.markers[i].page-partStarts(partsList())[p.id]+1},slide:state.slides[i]})))===JSON.stringify(window.__byPart[p.id]));`), true);
  await js(`window.__baseline=window.__snapshot();writeSlidePayload=async p=>{window.__copied=STCSlideTransfer.validate(p);return true;};await copySectionWithPdf(${JSON.stringify(spec[0].id)});goTo(cuesOf(partsList()[0].id)[0],false);await applySlideClipboard(window.__copied);await waitForProjectCommit();`);
  const copied = await js(`const p=partsList()[1];return {id:p.id,parts:partsList().length,pages:pdfDoc.numPages,ref:!!refRuns[p.id],times:cuesOf(p.id).map(i=>state.markers[i].t??null),slides:cuesOf(p.id).map(i=>state.slides[i].text),refs:window.__refs(),before:window.__baseline.refs};`);
  assert.equal(copied.parts, spec.length + 1); assert.equal(copied.pages, (spec.length + 1) * 3); assert.equal(copied.ref, false); assert.deepEqual(copied.times, [null, null, null]); assert.deepEqual(copied.slides, ['Section 1 / title 1', 'Section 1 / title 2', 'Section 1 / title 3']); assert.deepEqual(copied.refs, copied.before);
  await js(`window.__baseline=window.__snapshot();setDirty(false);const b=await buildProjectPdf();resetProject();await openAny(new File([b],'Mixed copied reordered roundtrip.supertitles'),null);`); await unchanged();
}
const watchdog = setTimeout(() => { console.error('Mixed section regression timed out'); app.exit(1); }, 240000);
(async () => {
  await app.whenReady(); session.defaultSession.setPermissionRequestHandler((_, __, done) => done(false)); session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); win.webContents.setAudioMuted(true); win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  await win.loadFile(path.join(root, 'dist/Supertitle_Cuer.html')); await js(`await idbGet('doc');await idbGet('follow');await idbGet('score');`);
  for (const count of [10, 20]) {
    let spec; await test(count + ' actual PDF sections load with isolated mixed references', async () => { spec = await fixture(count); assert.equal(await js('return pdfDoc.numPages;'), count * 3); });
    await test(count + ' section score rendering remains canvas-bounded while scrolling', () => memoryObservation(count));
    for (const s of spec) await test(count + ' section eligibility: ' + s.id + ' / ' + s.kind, () => selected(s));
    await test(count + ' Next and Back across every boundary select the correct section and its eligibility', async () => {
      for(let i=0;i<spec.length-1;i++){
        await select(spec[i],2);await js(`handleKey(' ',{preventDefault(){}});updateAutoBtn();`);
        assert.deepEqual(await js('return {cur,id:autoSection().part.id,live:!document.getElementById("autoLive").disabled};'),{cur:spec[i+1].first,id:spec[i+1].id,live:spec[i+1].live});
        await js(`handleKey('ArrowLeft',{preventDefault(){}});updateAutoBtn();`);
        assert.deepEqual(await js('return {cur,id:autoSection().part.id};'),{cur:spec[i].last,id:spec[i].id});
      }
      await unchanged();
    });
    await test(count + ' section menus show their own readiness without changing selection', async () => {
      await select(spec[0],1);
      for(const s of spec){
        await js(`document.querySelector('button[data-section-menu="${s.id}"]').click();`);
        assert.deepEqual(await js(`return {cur,target:autoSection().part.id,live:!document.querySelector('#sectionMenu [data-section-action="autoLive"]').disabled,recording:!document.querySelector('#sectionMenu [data-section-action="autoRecord"]').disabled};`),{cur:spec[0].first+1,target:spec[0].id,live:s.live,recording:s.recording});
        await js('closeSectionMenu();');
      }
      await unchanged();
    });
    await test(count + ' explicit section recording actions replace old playback and launch the requested reference', async () => {
      for(const s of [spec[1],spec.at(-1)]){
        await recording(spec[0],{finish:false});await js('autoRun.media.pause();window.__oldAuto=autoRun;window.__oldMedia=autoRun.media;');
        await js(`document.querySelector('button[data-section-menu="${s.id}"]').click();`);
        assert.equal(await js(`return autoRun===window.__oldAuto&&cur===${spec[0].first};`),true,'opening another section menu does not stop Auto or change cue');
        await js(`document.querySelector('#sectionMenu [data-section-action="autoRecord"]').click();`);
        await until(`autoPending?.section?.part.id===${JSON.stringify(s.id)}||autoRun?.part.id===${JSON.stringify(s.id)}`,'explicit recording target');
        await js(`if(autoPending)await useAutoRecordingFile(window.__waves[${s.wave}]);`);
        await until(`autoRun?.part.id===${JSON.stringify(s.id)}&&!autoRun.loading`,'explicit recording metadata');
        assert.equal(await js(`return cur===${s.first}&&window.__oldMedia.paused&&window.__oldAuto!==autoRun;`),true);
        await js('stopAuto();');await unchanged();
      }
    });
    await test(count + ' explicit section live actions launch section2 and the final section while another cue is current', async () => {
      for(const s of [spec[1],spec.at(-1)]){
        await select(spec[0],1);await js(`getMic=async()=>({getTracks:()=>[{stop(){}}]});audioTap=async()=>({close(){}});document.querySelector('button[data-section-menu="${s.id}"]').click();document.querySelector('#sectionMenu [data-section-action="autoLive"]').click();`);
        await until(`autoRun?.kind==='live'&&autoRun.part.id===${JSON.stringify(s.id)}`,'explicit live target');
        assert.deepEqual(await js('return {cur,part:follow.part};'),{cur:s.first,part:s.id});await js('stopAuto();');await unchanged();
      }
    });
    await test(count + ' existing global Auto buttons still receive native click events for the selected section', async () => {
      const s=spec[1];await select(s,1);await js(`document.getElementById('autoRecord').click();`);
      await until(`autoPending?.section?.part.id===${JSON.stringify(s.id)}`,'global native recording click');await js(`await useAutoRecordingFile(window.__waves[${s.wave}]);`);
      assert.equal(await js(`return autoRun.part.id===${JSON.stringify(s.id)}&&cur===${s.first};`),true);await js('stopAuto();');
      await select(s,1);await js(`getMic=async()=>({getTracks:()=>[{stop(){}}]});audioTap=async()=>({close(){}});document.getElementById('autoLive').click();`);
      await until(`autoRun?.kind==='live'&&autoRun.part.id===${JSON.stringify(s.id)}`,'global native live click');assert.equal(await js(`return cur===${s.first}&&follow.part===${JSON.stringify(s.id)};`),true);await js('stopAuto();');await unchanged();
    });
    const liveChoices = spec.filter(s => s.live), recordChoices = spec.filter(s => s.recording), linked = spec.filter(s => s.kind.startsWith('linked')), manualChoices = spec.filter(s => !s.live);
    for (const s of liveChoices) await test(count + ' live launch and boundary: ' + s.id, () => live(s));
    for (const s of recordChoices) await test(count + ' recording launch and boundary: ' + s.id, () => recording(s));
    for (const s of manualChoices) await test(count + ' unprepared section remains manual: ' + s.id, () => manual(s));
    await test(count + ' Space takes over active section playback without changing saved timing or other references', async () => {
      const s=recordChoices[0];await recording(s,{finish:false});await js(`window.__takenMedia=autoRun.media;handleKey(' ',{preventDefault(){}});`);
      assert.equal(await js('return !autoRun&&!autoPending&&!autoPreparing&&window.__takenMedia.paused;'),true);assert.equal(await js('return cur;'),s.first+1);await unchanged();
    });
    for (let i = 0; i < 60; i++) {
      const kind = Math.floor(random() * 6), choices = kind === 0 ? liveChoices : kind === 1 ? recordChoices : kind === 2 ? manualChoices : kind === 3 ? spec : linked, s = choices[Math.floor(random() * choices.length)];
      lastScenario = { count, i, kind, part: s.id }; const start = performance.now();
      if (kind === 0) await live(s); else if (kind === 1) await recording(s); else if (kind === 2) await manual(s); else if (kind === 3) { await selected(s); await js(`handleKey('ArrowLeft',{preventDefault(){}});handleKey('ArrowRight',{preventDefault(){}});updateAutoBtn();`); assert.equal(await js('return autoSection().part.id;'), s.id); } else if (kind === 4) await wrongFile(s); else await cancelPending(s);
      scenarios.push({ ...lastScenario, pass: true, elapsedMs: +(performance.now() - start).toFixed(2) });
    }
    await test(count + ' sections survive serialization, reverse order, PDF copy and reopen without reference leakage', () => persistenceAndReorder(spec));
    await shot('mixed-' + count + '-sections');
  }
  await test('reset disposes every retained score-page canvas and the live PDF DOM',async()=>{
    await js('window.__retiredPages=[...pageEls];await stopProjectActivity();setDirty(false);resetProject();');
    await delay(60);assert.equal(await js('return pageEls.length===0&&document.querySelectorAll("#pages canvas").length===0&&window.__retiredPages.every(p=>p.canvas.width===0&&p.canvas.height===0);'),true);
  });
  await js('await stopProjectActivity();'); assert.deepEqual(errors, []);
  const report = { checks, randomSeed: '0x2940a17', deterministicScenarios: scenarios, observations, errors, source: root, profile, generatedPdfAndAudioOnly: true, distinctAudioFixtures: 2, audioFixtureSeconds: 1.2, audioOutputMuted: true, hardwareMicrophone: false, networkDenied: true };
  fs.writeFileSync(path.join(qa, 'multi-section-auto-report.json'), JSON.stringify(report, null, 2)); clearTimeout(watchdog); console.log(checks.length + ' checks and ' + scenarios.length + ' deterministic randomized scenarios passed. QA: ' + qa); win.destroy(); app.exit(0);
})().catch(async error => { console.error(error.stack); try { await shot('failure'); fs.writeFileSync(path.join(qa, 'failure.json'), JSON.stringify({ error: String(error.stack), lastScenario, checks, scenarios, observations, errors }, null, 2)); } catch (_) {} clearTimeout(watchdog); app.exit(1); });
