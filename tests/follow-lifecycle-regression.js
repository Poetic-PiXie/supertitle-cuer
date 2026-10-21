// Controlled lifecycle tests: no real microphone, speakers, network or user project.
// Run: node --test tests/follow-lifecycle-regression.js
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const Reference=require('../src/recording-reference');
const source=fs.readFileSync(path.join(__dirname,'../src/app.html'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function harness(){
  const calls={messages:[],timers:new Set(),stopped:[],closed:[],revoked:[],sets:[],saved:[],written:[],media:[]};let timer=0,url=0;
  const node={open:false,hidden:true,close(){this.open=false;}};
  const c=vm.createContext({console,Promise,Uint8Array,Float32Array,TextEncoder,TextDecoder,Blob,Date,Math,Set,Map,crypto:webcrypto,activityGeneration:0,audioRequest:0,editRevision:0,projectGeneration:0,projectCommit:null,undoStack:[],redoStack:[],mode:'edit',cur:-1,blackout:false,atStart:false,anchor:null,fresh:-1,pickA:null,pickB:null,pickAnchor:null,meterT:null,meterTap:null,loadFor:null,dirty:false,pdfBytes:new Uint8Array([37,80,68,70]),docName:'Probe.supertitles',fileHandle:{nativePath:'/tmp/Probe.supertitles'},run:null,stoppingRun:null,follow:null,NATIVE:true,
    state:{pdfName:'Probe.pdf',parts:[{id:'a',name:'Act I.pdf',pages:1},{id:'b',name:'Act II.pdf',pages:1}],markers:[{page:1,x:.2,y:.2,t:1},{page:1,x:.6,y:.6,t:7},{page:2,x:.2,y:.2,t:4}],slides:[{text:'A1'},{text:'A2'},{text:'B1'}],settings:{}},refRuns:{},FPSF:1,LAG:0,
    STCFollow:{NB:2,extractor:f=>samples=>f(samples),pack:feat=>Uint8Array.from(feat),unpack:feat=>feat,follower:()=>({state:()=>({confidence:1}),step:()=>({confidence:1}),anchor(){}})},
    STCRecordingReference:{...Reference,fileIdentity:file=>Reference.fileIdentity(file,webcrypto)},
    $:()=>node,confirm:()=>true,sectionTitle:p=>p.name,toast:m=>calls.messages.push(m),setDirty:value=>{c.dirty=value;if(value)c.editRevision++;},save(){},saveRuns(){},changed(){c.dirty=true;},lastIndex:()=>c.state.slides.length-1,updatePicks(){},paintRun(){},paintFollow(){},updateFollowBtn(){},updateOutput(){},startAtPart(){c.cur=-1;},setMode:m=>{c.mode=m;},fmtT:String,scrollToCue(){},goTo(){},cueColor:()=>'',
    setInterval:()=>{const id=++timer;calls.timers.add(id);return id;},clearInterval:id=>calls.timers.delete(id),URL:{createObjectURL:()=>`blob:probe-${++url}`,revokeObjectURL:s=>calls.revoked.push(s)},getMic:async()=>({getTracks:()=>[]}),audioTap:async()=>({close(){}}),micError:e=>calls.messages.push(e.message),commitSectionEdit(){},waitForProjectCommit:async()=>{},idbPut(){},
    window:{stc:{saveDialog:async()=>'/tmp/Probe.supertitles',writeFile:async(p,bytes)=>calls.written.push({path:p,bytes})}},
  });
  c.partsList=()=>c.state.parts;c.cuePart=i=>c.state.markers[i]?(c.state.markers[i].page===1?c.state.parts[0]:c.state.parts[1]):null;c.cuesOf=id=>c.state.markers.map((m,i)=>i).filter(i=>c.cuePart(i)?.id===id);c.anyRun=()=>Object.keys(c.refRuns).length>0;c.allLines=()=>c.state.slides;
  c.setRun=(id,run)=>{c.refRuns[id]=run;calls.sets.push({id,run});};
  c.Audio=class{constructor(){this.duration=10;this.currentTime=0;this.paused=true;calls.media.push(this);}set src(value){this.url=value;}addEventListener(){}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}};
  c.MediaRecorder=class{static isTypeSupported(){return true;}constructor(stream){this.stream=stream;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>this.onstop?.());}};
  vm.runInContext(between('const snapState =','/* ---------- utilities ---------- */'),c);
  vm.runInContext(between('function onCue(i, was=-1){','// ----- making a reference run'),c);
  vm.runInContext(between('async function startRecording(id){','function paintRun(build){'),c);
  vm.runInContext(between('function followerFor(id){','function paintFollow(){'),c);
  vm.runInContext(between('const refMeta =','const partsList ='),c);
  vm.runInContext(between('const projectData =','function drawCues('),c);
  vm.runInContext(`const PROJ_EXT='.supertitles';function projectFileName(){return 'Probe.supertitles';}`+between('let saveQueue=','async function buildPrintablePdf(){'),c);
  c.buildProjectPdf=async saved=>{calls.saved.push(saved);return new Uint8Array([1]);};
  const stream=id=>({id,getTracks:()=>[{stop:()=>calls.stopped.push(id)}]});
  const tap=id=>({close:()=>calls.closed.push(id)});
  return {c,calls,stream,tap,js:code=>vm.runInContext(code,c)};
}
function oldReference(h,{fileId='file-A',duration=10}={}){const old={source:'file',name:'old.mp3',fileId,duration,feat:new Uint8Array(duration*2).fill(7),audio:null};h.c.refRuns.a=old;return old;}
function linkedRun(h,{name='new.mp3',duration=10,time=3,frames=[],fileId='file-B',reuse=false}={}){
  h.c.run={kind:'along',part:'a',partName:'Act I.pdf',name,fileId,reuse,cues:h.c.state.markers.slice(0,2),times:new Map(),media:{duration,currentTime:time,pause(){this.paused=true;}},url:'blob:new',tap:h.tap('new'),frames,timed:new Set(),time:()=>time};return h.c.run;
}

test('recording identity covers every byte in bounded chunks and ignores file naming',async()=>{
  const bytes=new Uint8Array(2*1024*1024+123);bytes.fill(8);const reads=[];
  const blob=new Blob([bytes]),file={size:blob.size,name:'first.mp3',slice:(a,b)=>{reads.push([a,b]);return blob.slice(a,b);}};
  const first=await Reference.fileIdentity(file,webcrypto),renamed=await Reference.fileIdentity(blob,webcrypto);
  bytes[1024*1024+50]=9;const changed=await Reference.fileIdentity(new Blob([bytes]),webcrypto);
  assert.match(first,/^stq-chunks-v1:[0-9a-f]{64}$/);assert.equal(first,renamed);assert.notEqual(first,changed);
  assert.equal(reads.length,3);assert.ok(reads.every(([a,b])=>b-a<=1024*1024));assert.equal(reads[0][0],0);assert.ok(reads.at(-1)[1]>=bytes.length);
  assert.equal(await Reference.fileIdentity(blob,{}),null);
});

test('only a verified identical linked recording can reuse legacy analysis',()=>{
  const ref={source:'file',fileId:'file-A',duration:10};assert.equal(Reference.canReuse(ref,'file-A',10.2),true);
  assert.equal(Reference.canReuse(ref,'file-B',10),false);assert.equal(Reference.canReuse({...ref,fileId:null},'file-A',10),false);
  assert.equal(Reference.canReuse({...ref,source:'recorded'},'file-A',10),false);assert.equal(Reference.canReuse(ref,'file-A',20),false);
});

test('cue timing stays staged, forward-only, and limited to the active PDF until kept',()=>{
  const h=harness(),run=linkedRun(h,{time:3});h.c.onCue(0,-1);h.c.onCue(0,1);h.c.onCue(2,0);
  assert.equal(h.c.state.markers[0].t,1);assert.equal(h.c.state.markers[1].t,7);assert.equal(h.c.state.markers[2].t,4);
  assert.equal(run.times.get(h.c.state.markers[0]),3);assert.equal(run.times.size,1);assert.deepEqual(Array.from(run.timed),[0]);
});

test('same-length different files replace fingerprints and clear unvisited old cue times',async()=>{
  const h=harness();oldReference(h);const frames=[];frames[2]=new Float32Array([9,9]);linkedRun(h,{frames});h.c.onCue(0,-1);await h.c.stopRun(true);
  assert.equal(h.c.refRuns.a.fileId,'file-B');assert.deepEqual(Array.from(h.c.refRuns.a.feat.slice(0,2)),[0,0]);assert.deepEqual(Array.from(h.c.refRuns.a.feat.slice(4,6)),[9,9]);
  assert.equal(h.c.state.markers[0].t,3);assert.equal(h.c.state.markers[1].t,undefined);assert.equal(h.c.state.markers[2].t,4);
});

test('revisiting the verified same file preserves unheard frames and untouched cue times',async()=>{
  const h=harness();oldReference(h);const frames=[];frames[2]=new Float32Array([9,9]);linkedRun(h,{frames,fileId:'file-A',reuse:true});h.c.onCue(0,-1);await h.c.stopRun(true);
  assert.deepEqual(Array.from(h.c.refRuns.a.feat.slice(0,2)),[7,7]);assert.deepEqual(Array.from(h.c.refRuns.a.feat.slice(4,6)),[9,9]);assert.deepEqual(Array.from(h.c.refRuns.a.feat.slice(6,8)),[7,7]);
  assert.equal(h.c.state.markers[0].t,3);assert.equal(h.c.state.markers[1].t,7);assert.equal(h.c.state.markers[2].t,4);
});

test('Undo and Redo restore the reference and cue timeline together after replacing a recording',async()=>{
  const h=harness(),old=oldReference(h);linkedRun(h,{frames:[new Float32Array([9,9])]});h.c.onCue(0,-1);await h.c.stopRun(true);
  const replacement=h.c.refRuns.a;assert.notEqual(replacement,old);assert.equal(h.c.undoStack.length,1);
  await h.js('undo()');assert.equal(h.c.refRuns.a,old);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[1,7,4]);
  await h.js('redo()');assert.equal(h.c.refRuns.a,replacement);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[3,undefined,4]);
  assert.equal(replacement.feat[0],9);assert.equal(old.feat[0],7);
});

test('Undo and Redo keep same-file retiming and merged analysis paired',async()=>{
  const h=harness(),old=oldReference(h);const frames=[];frames[2]=new Float32Array([9,9]);linkedRun(h,{frames,fileId:'file-A',reuse:true});h.c.onCue(0,-1);await h.c.stopRun(true);
  const revised=h.c.refRuns.a;assert.equal(revised.feat[4],9);assert.equal(revised.feat[0],7);
  await h.js('undo()');assert.equal(h.c.refRuns.a,old);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[1,7,4]);assert.equal(h.c.refRuns.a.feat[4],7);
  await h.js('redo()');assert.equal(h.c.refRuns.a,revised);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[3,7,4]);assert.equal(h.c.refRuns.a.feat[4],9);
});

test('Undo crosses a new reference commit and an earlier slide edit without mixing timelines',async()=>{
  const h=harness(),old=oldReference(h);h.c.snap();h.c.state.slides[0].text='Revised title';
  linkedRun(h,{frames:[new Float32Array([9,9])]});h.c.onCue(0,-1);await h.c.stopRun(true);const replacement=h.c.refRuns.a;
  await h.js('undo()');assert.equal(h.c.state.slides[0].text,'Revised title');assert.equal(h.c.refRuns.a,old);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[1,7,4]);
  await h.js('undo()');assert.equal(h.c.state.slides[0].text,'A1');assert.equal(h.c.refRuns.a,old);
  await h.js('redo()');await h.js('redo()');assert.equal(h.c.state.slides[0].text,'Revised title');assert.equal(h.c.refRuns.a,replacement);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[3,undefined,4]);
});

test('active and finalizing runs reject Undo, Edit, unlocks, pasted content and PDF mutations',async()=>{
  for(const finalizing of [false,true]){
    const h=harness(),nodes=new Map(),events=[];oldReference(h);h.c.snap();
    h.c.mode='show';h.c.state.settings={lockCues:true,lockOrder:true};
    h.c.$=selector=>{if(!nodes.has(selector))nodes.set(selector,{onclick:null});return nodes.get(selector);};
    h.c.document={addEventListener:(type,callback)=>events.push(callback)};
    h.js(between('function setMode(m){','document.querySelectorAll(\'#modeSeg'));
    h.js(between('document.addEventListener(\'click\', e=>{ const b=e.target.closest(\'[data-lock]\');','/* ---------- cueing ---------- */'));
    h.js(between("$('#partsUnlock').onclick=", "$('#partsBtn').onclick="));
    h.js(between('async function applyParts(newParts, removedId, noSnap){','let partInsertAt=0;'));
    h.js(between('function pasteCopiedSlides(payload){','function applySlideClipboard(payload){'));
    h.js(between('const actions = {',"$('#fPdf').onchange="));
    h.js(between('function openImport(){','function impFitNote(){'));
    if(finalizing)h.c.stoppingRun=new Promise(()=>{});else linkedRun(h,{frames:[new Float32Array([9,9])]});
    const before=JSON.stringify(h.c.state),markers=h.c.state.markers;
    await h.js('undo()');h.c.setMode('edit');
    events[0]({target:{closest:()=>({dataset:{lock:'lockCues'}})}});nodes.get('#partsUnlock').onclick();
    h.c.pasteCopiedSlides({slides:[{text:'Forbidden'}]});await h.c.pasteCopiedSection({});await h.c.applyParts([]);
    h.js('actions.clearMarkers();actions.clearSlides();openImport();');
    assert.equal(JSON.stringify(h.c.state),before);assert.equal(h.c.state.markers,markers);assert.equal(h.c.mode,'show');assert.equal(h.c.undoStack.length,1);assert.ok(h.calls.messages.length>=10);assert.ok(h.calls.messages.every(m=>m.includes('Done or Discard')));
  }
});

test('a run starting while a PDF merge is pending cancels the mutation and clears its busy UI',async()=>{
  const h=harness(),gate=deferred(),busy=new Set(),info={textContent:''},node={classList:{add:x=>busy.add(x),remove:x=>busy.delete(x)}};
  h.c.$=selector=>selector==='#partsInfo'?info:node;h.c.partStarts=()=>({a:1,b:2});h.c.mergeSegments=()=>gate.promise;
  h.js(between('async function applyParts(newParts, removedId, noSnap){','let partInsertAt=0;'));
  const before=JSON.stringify(h.c.state),markers=h.c.state.markers,pending=h.c.applyParts([...h.c.state.parts].reverse());
  assert.equal(busy.has('busy'),true);linkedRun(h);gate.resolve(new Uint8Array([1]));await pending;
  assert.equal(JSON.stringify(h.c.state),before);assert.equal(h.c.state.markers,markers);assert.equal(busy.has('busy'),false);assert.equal(info.textContent,'');
});

test('PDF removal confirmed after a run has started leaves cues, slides and section order intact',async()=>{
  const h=harness(),gate=deferred(),node={close(){},showModal(){}};h.c.$=()=>node;h.c.partStarts=()=>({a:1,b:2});h.c.ask=()=>gate.promise;h.c.rangeTxt=String;h.c.renderParts=()=>{};
  h.c.sectionsNow=()=>({groups:{a:h.c.state.slides.slice(0,2),b:h.c.state.slides.slice(2)},tail:[]});h.c.applyParts=async()=>false;
  h.c.rebuildSections=sections=>{h.c.state.slides=[...(sections.groups.a||[]),...(sections.groups.b||[]),...sections.tail];};h.c.renderSlides=()=>{};h.c.keyName=String;
  h.js(between('async function removePart(i){','async function renderParts(){'));
  const before=JSON.stringify(h.c.state),markers=h.c.state.markers,pending=h.c.removePart(0);linkedRun(h);gate.resolve({ok:true,checked:true});await pending;
  assert.equal(JSON.stringify(h.c.state),before);assert.equal(h.c.state.markers,markers);assert.equal(h.c.undoStack.length,0);assert.ok(h.calls.messages.some(m=>m.includes('Done or Discard')));
});

test('a canceled PDF merge during removal does not delete that section\'s slides',async()=>{
  const h=harness(),merging=deferred(),finished=deferred(),node={close(){},showModal(){}};h.c.$=()=>node;h.c.partStarts=()=>({a:1,b:2});h.c.ask=async()=>({ok:true,checked:true});h.c.rangeTxt=String;h.c.renderParts=()=>{};
  h.c.sectionsNow=()=>({groups:{a:h.c.state.slides.slice(0,2),b:h.c.state.slides.slice(2)},tail:[]});h.c.applyParts=()=>{merging.resolve();return finished.promise;};
  let rebuilds=0;h.c.rebuildSections=()=>{rebuilds++;};h.c.renderSlides=()=>{};h.c.keyName=String;
  h.js(between('async function removePart(i){','async function renderParts(){'));
  const before=JSON.stringify(h.c.state),pending=h.c.removePart(0);await merging.promise;linkedRun(h);finished.resolve(false);await pending;
  assert.equal(JSON.stringify(h.c.state),before);assert.equal(rebuilds,0);assert.equal(h.c.undoStack.length,0);
});

test('legacy references without file identity remain usable but cannot merge during relink',async()=>{
  const h=harness();oldReference(h,{fileId:null});const frames=[new Float32Array([9,9])];linkedRun(h,{frames,fileId:'new-hash',reuse:true});h.c.onCue(0,-1);await h.c.stopRun(true);
  assert.equal(h.c.refRuns.a.fileId,'new-hash');assert.deepEqual(Array.from(h.c.refRuns.a.feat.slice(2,4)),[0,0]);assert.equal(h.c.state.markers[1].t,undefined);
});

test('Discard releases the linked run and preserves old reference and cue times exactly',async()=>{
  const h=harness(),old=oldReference(h);linkedRun(h,{frames:[new Float32Array([9,9])]});h.c.onCue(0,-1);await h.c.stopRun(false);
  assert.equal(h.c.refRuns.a,old);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[1,7,4]);assert.equal(h.c.run,null);assert.deepEqual(h.calls.revoked,['blob:new']);assert.deepEqual(h.calls.closed,['new']);assert.equal(h.calls.sets.length,0);
});

test('Done without playing music does not replace a reference or commit staged times',async()=>{
  const h=harness(),old=oldReference(h);linkedRun(h);h.c.onCue(0,-1);await h.c.stopRun(true);
  assert.equal(h.c.refRuns.a,old);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[1,7,4]);assert.equal(h.calls.sets.length,0);assert.ok(h.calls.messages.some(m=>m.includes('No music was played')));
});

test('Save finalizes a run before capturing the reference/timing snapshot',async()=>{
  const h=harness();oldReference(h);linkedRun(h,{duration:20,frames:[new Float32Array([9,9])]});h.c.onCue(0,-1);
  const before=h.js('captureProject()');assert.equal(before.data.markers[0].t,1);assert.equal(before.data.follow.runs.a.name,'old.mp3');
  assert.equal(await h.c.saveDoc(false),true);assert.equal(h.c.run,null);assert.equal(h.calls.saved.length,1);assert.equal(h.calls.written.length,1);
  const saved=h.calls.saved[0];assert.equal(saved.data.markers[0].t,3);assert.equal(saved.data.markers[1].t,undefined);assert.equal(saved.data.follow.runs.a.name,'new.mp3');assert.equal(saved.data.follow.runs.a.fileId,'file-B');assert.equal(saved.runs.a.feat[0],9);
});

test('short microphone recordings keep the previous reference/times and stop the microphone',async()=>{
  const h=harness(),old=oldReference(h);h.c.run={kind:'record',part:'a',partName:'Act I',frames:Array.from({length:5},()=>new Float32Array([9,9])),rec:null,chunks:[],type:'audio/webm',tap:h.tap('recording'),stream:h.stream('recording'),times:new Map([[h.c.state.markers[0],3]]),cues:h.c.state.markers.slice(0,2),reuse:false,timed:new Set([0])};
  await h.c.stopRun(true);assert.equal(h.c.refRuns.a,old);assert.deepEqual(Array.from(h.c.state.markers,m=>m.t),[1,7,4]);assert.deepEqual(h.calls.stopped,['recording']);assert.deepEqual(h.calls.closed,['recording']);
});

test('overlapping Follow starts release the superseded stream and leave one stoppable graph',async()=>{
  const h=harness(),a=deferred(),b=deferred();let n=0;oldReference(h);h.c.getMic=()=>[a,b][n++].promise;h.c.audioTap=async()=>h.tap('active');
  const first=h.c.startFollow(),second=h.c.startFollow();a.resolve(h.stream('first'));await first;b.resolve(h.stream('second'));await second;
  assert.equal(h.calls.timers.size,1);h.c.stopFollow();assert.deepEqual(h.calls.stopped,['first','second']);assert.equal(h.calls.timers.size,0);assert.equal(h.c.follow,null);
});

test('overlapping Record starts release the superseded stream and leave one stoppable recorder',async()=>{
  const h=harness(),a=deferred(),b=deferred();let n=0;h.c.getMic=()=>[a,b][n++].promise;h.c.audioTap=async()=>h.tap('active');
  const first=h.c.startRecording('a'),second=h.c.startRecording('a');a.resolve(h.stream('first'));await first;b.resolve(h.stream('second'));await second;
  assert.equal(h.c.run.kind,'record');assert.equal(h.calls.timers.size,1);await h.c.stopRun(false);assert.deepEqual(h.calls.stopped,['first','second']);assert.equal(h.calls.timers.size,0);assert.equal(h.c.run,null);
});

test('overlapping Link starts revoke the superseded URL and leave one stoppable player',async()=>{
  const h=harness();h.c.audioTap=async()=>h.tap('linked');const file=new Blob([new Uint8Array([1,2,3])]);file.name='music.mp3';
  const first=h.c.startCueAlong('a',file),second=h.c.startCueAlong('a',file);h.calls.media[0].onloadedmetadata();h.calls.media[1].onloadedmetadata();await Promise.all([first,second]);
  assert.equal(h.c.run.kind,'along');assert.equal(h.calls.timers.size,1);assert.deepEqual(h.calls.revoked,['blob:probe-1']);await h.c.stopRun(false);assert.deepEqual(h.calls.revoked,['blob:probe-1','blob:probe-2']);assert.equal(h.calls.timers.size,0);
});

test('New/Close during a pending microphone or linked-file start cancels that start',async()=>{
  const h=harness(),gate=deferred();h.c.getMic=()=>gate.promise;const pending=h.c.startRecording('a');await h.c.stopProjectActivity();gate.resolve(h.stream('cancelled'));await pending;
  assert.equal(h.c.run,null);assert.deepEqual(h.calls.stopped,['cancelled']);assert.equal(h.c.mode,'edit');
  const file=new Blob([new Uint8Array([1])]);file.name='music.mp3';const linking=h.c.startCueAlong('a',file);await h.c.stopProjectActivity();h.calls.media[0].onloadedmetadata();await linking;
  assert.equal(h.c.run,null);assert.deepEqual(h.calls.revoked,['blob:probe-1']);assert.equal(h.calls.timers.size,0);
});

test('a pending recording superseded by Follow cannot overwrite the active follower',async()=>{
  const h=harness(),a=deferred(),b=deferred();let n=0;oldReference(h);h.c.getMic=()=>[a,b][n++].promise;h.c.audioTap=async()=>h.tap('active');
  const record=h.c.startRecording('a'),follow=h.c.startFollow();a.resolve(h.stream('record'));await record;b.resolve(h.stream('follow'));await follow;
  assert.equal(h.c.run,null);assert.ok(h.c.follow);h.c.stopFollow();assert.deepEqual(h.calls.stopped,['record','follow']);assert.equal(h.calls.timers.size,0);
});

test('microphone denial leaves no half-started run or timers',async()=>{
  const h=harness();h.c.getMic=async()=>{throw new Error('permission denied');};await h.c.startRecording('a');assert.equal(h.c.run,null);assert.equal(h.calls.timers.size,0);assert.ok(h.calls.messages.includes('permission denied'));
});
