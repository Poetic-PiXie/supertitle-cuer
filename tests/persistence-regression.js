// Run: node --test tests/persistence-regression.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const PDFLib = require('pdf-lib');
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
const STCRecordingReference = require('../src/recording-reference');
const pdfLibBundle=fs.readFileSync(require.resolve('pdf-lib/dist/pdf-lib.min.js'),'utf8');
const source = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
const desktop = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
function between(text, start, end) { const a=text.indexOf(start), b=text.indexOf(end,a); assert.ok(a>=0 && b>a, start); return text.slice(a,b); }
function deferred() { let resolve, reject; const promise=new Promise((a,b)=>{ resolve=a; reject=b; }); return {promise,resolve,reject}; }
async function until(check) { for(let i=0;i<100 && !check();i++) await new Promise(setImmediate); assert.ok(check(),'asynchronous operation reached expected state'); }

function renderer() {
  const messages=[], writes=[], records=[];
  const el={firstChild:{firstChild:{}},removeAttribute(){},classList:{toggle(){}}};
  const c=vm.createContext({PDFLib,pdfjsLib,TextEncoder,TextDecoder,Uint8Array,Float32Array,Blob,console,Promise,
    NATIVE:true, projectCommit:null,waitForProjectCommit:async()=>{},stopRun:async()=>{},document:{title:''}, $:()=>el, setTimeout,clearTimeout,
    toast:m=>messages.push(m),save(){},idbPut:(...x)=>records.push(x),commitSectionEdit(){},
    window:{stc:{docState(){},saveDialog:async()=>'/tmp/show.supertitles',writeFile:async(p,b)=>{writes.push({path:p,bytes:b});}}},
  });
  // Run pdf-lib in the renderer realm, matching the production bundled script.
  vm.runInContext(pdfLibBundle,c);
  vm.runInContext(`
    const state={pdfName:null, parts:[{id:'act1',name:'Act I.pdf',title:'Opening scene',pages:1}], markers:[],slides:[{text:'Original title'}],settings:{markerSize:4}};
    let dirty=true,docName='show.supertitles',fileHandle={nativePath:'/tmp/show.supertitles'},pdfBytes=null,editRevision=0,projectGeneration=0,saveT;
    let refRuns={act1:{name:'Rehearsal',source:'recorded',duration:6,feat:new Uint8Array([1,2]),audio:new Uint8Array([3,4])}};
    const PROJ_ATTACH='supertitle-cuer-project.json',ORIG_ATTACH='original-score.pdf',FOLLOW_REF='supertitle-cuer-reference-',FOLLOW_AUDIO='supertitle-cuer-recording-';
    const partsList=()=>state.parts||[],allLines=()=>state.slides;
    const refMeta=r=>({name:r.name,source:r.source,duration:r.duration,audioType:r.audioType||null});
    const cueColor=i=>state.slides[i]?.color||'',hexRgb=()=>PDFLib.rgb(1,0,0),baseName=()=>docName;
  `+between(source,'function setDirty(d){','async function readProjectFromPdf')+
    between(source,'async function readProjectFromPdf','async function buildPrintablePdf'), c);
  return {c,messages,writes,records,run:code=>vm.runInContext(code,c)};
}

test('saved project is a consistent snapshot, including section titles, score and recording attachments',async()=>{
  const h=renderer(), original=await PDFLib.PDFDocument.create(); original.addPage([500,700]);
  h.c.score=await original.save();
  h.run(`pdfBytes=score; state.pdfName='Act I.pdf'; state.markers=[{page:1,x:.2,y:.3}]; state.slides[0].color='#ff0000'; var captured=captureProject(); state.slides[0].text='Edited while saving'; state.parts[0].title='Later title'; state.markers[0].x=.9;`);
  const bytes=await h.run('buildProjectPdf(captured)'); h.c.resultBytes=bytes;
  const result=await h.run('readProjectFromPdf(resultBytes)');
  assert.equal(result.project.slides[0].text,'Original title');
  assert.equal(result.project.parts[0].title,'Opening scene');
  assert.equal(result.project.markers[0].x,.2);
  assert.deepEqual(Array.from(result.original),Array.from(h.c.score));
  assert.deepEqual(Array.from(result.follow.act1.feat),[1,2]);
  assert.deepEqual(Array.from(result.follow.act1.audio),[3,4]);
});

test('edits made during disk write stay dirty and next save includes them',async()=>{
  const h=renderer(), gate=deferred(); let calls=0;
  h.c.window.stc.writeFile=async(p,b)=>{ h.writes.push({path:p,bytes:b}); if(++calls===1) await gate.promise; };
  const saving=h.run('saveDoc(false)'); await until(()=>h.writes.length===1);
  h.run(`state.slides[0].text='Newer edit'; setDirty(true);`); gate.resolve();
  assert.equal(await saving,true); assert.equal(h.run('dirty'),true);
  assert.ok(h.messages.some(m=>m.includes('newer edits still need saving')));
  assert.equal(await h.run('saveDoc(false)'),true); assert.equal(h.run('dirty'),false);
  h.c.resultBytes=h.writes[1].bytes;
  assert.equal((await h.run('readProjectFromPdf(resultBytes)')).project.slides[0].text,'Newer edit');
});

test('save completions cannot replace the current project handle after New/Open',async()=>{
  const h=renderer(), gate=deferred();let writes=0;h.c.window.stc.writeFile=async()=>{writes++;await gate.promise;};
  const saving=h.run('saveDoc(false)'),queued=h.run('saveDoc(false)'); await until(()=>writes===1);
  h.run(`projectGeneration++;docName='Other.supertitles';fileHandle={nativePath:'/tmp/Other.supertitles'};dirty=true;`);
  gate.resolve(); assert.equal(await saving,false);
  assert.equal(await queued,false);assert.equal(writes,1);
  assert.equal(h.run('docName'),'Other.supertitles'); assert.equal(h.run('fileHandle.nativePath'),'/tmp/Other.supertitles'); assert.equal(h.run('dirty'),true);
});

test('rapid Save requests perform one write at a time',async()=>{
  const h=renderer(), gate=deferred(); let active=0,maxActive=0;
  h.c.window.stc.writeFile=async()=>{ active++;maxActive=Math.max(active,maxActive); if(h.writes.length===0){h.writes.push(1);await gate.promise;}else h.writes.push(1);active--; };
  const first=h.run('saveDoc(false)'),second=h.run('saveDoc(false)');
  await until(()=>h.writes.length===1); assert.equal(active,1); gate.resolve();
  await Promise.all([first,second]); assert.equal(h.writes.length,2); assert.equal(maxActive,1);
});

test('desktop startup offers interrupted dirty work and keeps clean startup at welcome',async()=>{
  const startup=between(source,'  let recover=false, interrupted=true;','  applyAlign(); sortMarkers();');
  for(const fixture of [{marker:'active',accept:true,recover:true},{marker:'active',accept:false,recover:false},{marker:'clean',accept:true,recover:false}]){
    const stored=new Map([['session',fixture.marker]]),cleared=[];let prompts=0;
    const c=vm.createContext({NATIVE:true,dirty:true,docName:'Draft',cur:2,SESSION_KEY:'session',state:{pdfName:'Score.pdf',parts:[{}],markers:[{}],slides:[{text:'Draft'}],settings:{}},hasProject:()=>true,save(){},idbPut:async(k,v)=>cleared.push([k,v]),localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},window:{stc:{askRecovery:async()=>{prompts++;return fixture.accept;}}}});
    await vm.runInContext('(async()=>{'+startup+'return {freshStart,recover};})()',c);
    assert.equal(c.state.slides.length,fixture.recover?1:0);
    assert.equal(cleared.length,fixture.recover?0:3);
    assert.equal(prompts,fixture.marker==='clean'?0:1); assert.equal(stored.get('session'),'active');
  }
});

test('score-only unsaved work and active recordings participate in the close check',()=>{
  const c=vm.createContext({window:{},dirty:true,hasProject:()=>true,run:null,stoppingRun:null});
  vm.runInContext(between(source,'window.__stcIsDirty =','window.__stcPrepareClose ='),c);
  assert.equal(c.window.__stcIsDirty(),true); c.dirty=false;assert.equal(c.window.__stcIsDirty(),false);
  c.run={};assert.equal(c.window.__stcIsDirty(),true); c.run=null;c.stoppingRun=Promise.resolve();assert.equal(c.window.__stcIsDirty(),true);
});

test('undo and redo of the first pasted score restores the prior score-free project',async()=>{
  const savedScores=[],scoreNode={scrollTop:0,open:false};
  const c=vm.createContext({console,Promise,Uint8Array,projectCommit:null,state:{pdfName:null,parts:null,markers:[],slides:[{text:'Before paste'}]},pdfBytes:null,pdfDoc:null,undoStack:[],redoStack:[],cur:-1,atStart:false,anchor:null,pickA:null,pickB:null,pickAnchor:null,$:()=>scoreNode,loadPdfBytes:async(name,bytes)=>{c.pdfBytes=bytes;c.pdfDoc={};c.state.pdfName=name;},clearScore:()=>{c.pdfBytes=null;c.pdfDoc=null;c.state.parts=null;},updatePartsBtn(){},idbPut:(k,v)=>savedScores.push(v),renderParts(){},lastIndex:()=>c.state.slides.length-1,changed(){},updatePicks(){},toast(){}});
  vm.runInContext(between(source,'const snapState =','/* ---------- utilities ---------- */'),c);
  vm.runInContext(`snap();pdfBytes=new Uint8Array([1,2]);pdfDoc={};state.pdfName='Pasted.pdf';state.parts=[{id:'p',name:'Pasted.pdf',pages:1}];state.markers=[{page:1,x:.2,y:.3}];state.slides=[{text:'Pasted title'}];`,c);
  await vm.runInContext('undo()',c);assert.equal(c.pdfBytes,null);assert.equal(c.pdfDoc,null);assert.equal(c.state.pdfName,null);assert.equal(c.state.parts,null);assert.equal(c.state.slides[0].text,'Before paste');assert.equal(savedScores.at(-1),null);
  await vm.runInContext('redo()',c);assert.deepEqual(Array.from(c.pdfBytes),[1,2]);assert.equal(c.state.pdfName,'Pasted.pdf');assert.equal(c.state.parts[0].id,'p');assert.equal(c.state.markers[0].page,1);assert.equal(c.state.slides[0].text,'Pasted title');
});

test('project commit modal prevents dismissal, defers autosave and releases queued actions once',async()=>{
  const stored=[],dialogs=[];
  const c=vm.createContext({Promise,projectCommit:null,LS_KEY:'draft',state:{slides:[{text:'Before'}]},cur:-1,dirty:true,docName:null,localStorage:{setItem:(k,v)=>stored.push(JSON.parse(v))},document:{body:{append(){}},createElement:()=>{const node={style:{},setAttribute(){},append(){},addEventListener:(name,fn)=>{node[name]=fn;},showModal(){node.open=true;},close(){node.open=false;},remove(){}};dialogs.push(node);return node;}}});
  vm.runInContext(between(source,'function save(){','function loadLocal(){'),c);
  const finish=c.beginProjectCommit('Pasting section…');let dismissed=false;dialogs[0].cancel({preventDefault(){dismissed=true;}});assert.equal(dismissed,true);
  c.state.slides=[{text:'Partial intermediate data'}];c.save();assert.equal(stored.length,0);
  let continued=false;const waiting=c.waitForProjectCommit().then(()=>{continued=true;});await Promise.resolve();assert.equal(continued,false);
  c.state.slides=[{text:'Complete project'}];finish();finish();await waiting;
  assert.equal(c.projectCommit,null);assert.equal(stored.length,1);assert.equal(stored[0].slides[0].text,'Complete project');assert.equal(dialogs[0].open,false);
});

test('PDF canvas eviction cancels work, frees bitmap memory and caps pixel count',()=>{
  const c=vm.createContext({window:{devicePixelRatio:3},MAX_PAGE_PIXELS:8000000});
  vm.runInContext(between(source,'function releasePage(p){','function releaseScorePages')+between(source,'function pageTargetWidth(p){','function schedulePageRenders'),c);
  let cancelled=0,cleaned=0; const p={wanted:true,canvas:{width:4000,height:6000},renderedW:4000,renderTask:{cancel(){cancelled++;}},page:{cleanup(){cleaned++;}},wrap:{clientWidth:10000},hw:1.5};
  c.p=p; assert.ok(vm.runInContext('pageTargetWidth(p)**2*p.hw <= MAX_PAGE_PIXELS',c));
  c.releasePage(p);assert.equal(cancelled,1);assert.equal(cleaned,1);assert.equal(p.canvas.width,0);assert.equal(p.canvas.height,0);assert.equal(p.renderedW,0);assert.equal(p.wanted,false);
});

test('PDF renderer keeps at most eight nearby canvases and two active render tasks',async()=>{
  const frames=[],tasks=[],elements={};let live=0,maxLive=0,cancelled=0;
  const root={getBoundingClientRect:()=>({top:0,bottom:200}),replaceChildren(){},hidden:false};
  const pages=Array.from({length:12},(_,i)=>({visible:true,wanted:false,generation:0,vw:100,hw:1.4,renderedW:0,canvas:{width:0,height:0,getContext:()=>({drawImage(){}})},wrap:{clientWidth:100,getBoundingClientRect:()=>({top:i*150,bottom:i*150+140})},page:{cleanup(){},getViewport:({scale})=>({width:100*scale,height:140*scale}),render(){const gate=deferred();live++;maxLive=Math.max(maxLive,live);const task={promise:gate.promise.finally(()=>live--),cancel(){cancelled++;gate.reject(Object.assign(new Error('cancelled'),{name:'RenderingCancelledException'}));},gate};tasks.push(task);return task;}}}));
  const c=vm.createContext({console,Promise,window:{devicePixelRatio:1},requestAnimationFrame:f=>{frames.push(f);return frames.length;},document:{createElement:()=>({getContext:()=>({})})},$:selector=>elements[selector]||root,IntersectionObserver:class{observe(){}unobserve(){}},pageEls:pages,pageHW:[],pdfDoc:null,pdfBytes:null,state:{settings:{}},SCORE_EMPTY_BIG:'Welcome'});
  vm.runInContext(between(source,'let pdfGeneration=0','/* ---------- cue markers ---------- */'),c);
  c.schedulePageRenders();frames.shift()();assert.equal(pages.filter(p=>p.wanted).length,8);assert.equal(tasks.length,2);assert.equal(live,2);
  tasks[0].gate.resolve();await until(()=>frames.length>0);frames.shift()();assert.equal(tasks.length,3);assert.equal(live,2);assert.equal(maxLive,2);
  // Clearing/replacing the score cancels both remaining tasks and frees every bitmap.
  vm.runInContext(between(source,'function clearScore(){','function resetProject(){'),c);c.clearScore();
  await until(()=>live===0);assert.equal(cancelled,2);assert.ok(pages.every(p=>p.canvas.width===0 && p.canvas.height===0));
});

test('project transitions wait for recording finalization and reset Show/blackout/selection state',async()=>{
  const gate=deferred(),calls=[];const rec={state:'recording',stop(){gate.promise.then(()=>{this.state='inactive';this.onstop();});}};
  const dlg={open:true,close(){this.open=false;}};
  const c=vm.createContext({Promise,Blob,Uint8Array,Float32Array,STCRecordingReference,console,clearInterval(){},run:{kind:'record',rec,chunks:[],type:'audio/webm',part:'act1',partName:'Act I',frames:Array.from({length:6},()=>new Float32Array([1])),timed:new Set([1]),tap:{close:()=>calls.push('tap closed')},stream:{getTracks:()=>[{stop:()=>calls.push('mic stopped')}] }},stoppingRun:null,activityGeneration:0,meterT:null,meterTap:null,loadFor:'act1',cur:4,blackout:true,atStart:true,anchor:3,fresh:2,pickA:1,pickB:3,pickAnchor:1,mode:'show',FPSF:1,STCFollow:{NB:1,pack:()=>new Uint8Array([7])},$:s=>s==='#followDlg'?dlg:{},stopFollow:()=>calls.push('follow stopped'),setMode:m=>{c.mode=m;},updateOutput(){},updateFollowBtn(){},setDirty:v=>calls.push('dirty'),snap:()=>calls.push('undo snapshot'),save(){},toast(){},fmtT:String,setRun:()=>calls.push('reference kept')});
  vm.runInContext(between(source,'function stopRun(keep=true){','function paintRun(build){'),c);
  const stopping=c.stopRun(true),transition=c.stopProjectActivity();
  assert.equal(c.mode,'show');assert.equal(c.cur,4);assert.equal(c.run,null);
  gate.resolve();await Promise.all([stopping,transition]);
  assert.deepEqual(calls.filter(x=>x==='reference kept'),['reference kept']);
  assert.ok(calls.includes('mic stopped') && calls.includes('tap closed'));
  assert.equal(c.mode,'edit');assert.equal(c.cur,-1);assert.equal(c.blackout,false);assert.equal(c.pickA,null);assert.equal(c.anchor,null);
});

test('native close serializes its prompt and stays open if edits arrived during Save',async()=>{
  const closeCode=between(desktop,"  win.on('close', async (e) => {","  win.on('closed', () => {");
  for(const response of [0,1]){
    const gate=deferred(),calls=[];let callback;
    const target={on:(name,f)=>{callback=f;},isDestroyed:()=>false,close:()=>calls.push('closed'),webContents:{executeJavaScript:async code=>{if(code.includes('__stcPrepareClose'))await gate.promise;else if(code.includes('saveDoc'))return false;else if(code.includes('__stcIsDirty'))return true;else if(code.includes('__stcCleanClose'))calls.push('clean marker');}}};
    const c=vm.createContext({win:target,allowClose:false,closePending:false,quitRequested:false,rendererDirty:true,dialog:{showMessageBox:async()=>{calls.push('prompt');return {response};}}});vm.runInContext(closeCode,c);
    const first=callback({preventDefault(){}}),second=callback({preventDefault(){}});gate.resolve();await Promise.all([first,second]);
    assert.equal(calls.filter(x=>x==='prompt').length,1);assert.equal(c.closePending,false);
    assert.equal(calls.includes('closed'),response===1);assert.equal(calls.includes('clean marker'),response===1);
  }
});

function mainHarness(fileSystem=fs) {
  const handlers=new Map(),events=new Map(),nativeClipboard={text:'',html:''};
  const electron={app:{on:(n,f)=>events.set(n,f),addRecentDocument(){},requestSingleInstanceLock:()=>true,whenReady:()=>({then(){}})},ipcMain:{handle:(n,f)=>handlers.set(n,f),on(){}},clipboard:{write:v=>Object.assign(nativeClipboard,v),readText:()=>nativeClipboard.text,readHTML:()=>nativeClipboard.html}};
  const buffer={from:Buffer.from,byteLength:v=>v==='simulated oversized payload'?128*1024*1024+1:Buffer.byteLength(v)};
  const c=vm.createContext({require:n=>n==='electron'?electron:n==='fs'?fileSystem:require(n),__dirname:path.join(__dirname,'../electron'),process,console,Buffer:buffer,setTimeout,clearTimeout});
  vm.runInContext(desktop,c);
  const frame={},wc={mainFrame:frame};c.operator={webContents:wc,isDestroyed:()=>false}; vm.runInContext('win=operator;',c);
  return {c,handlers,event:{sender:wc,senderFrame:frame},nativeClipboard};
}

test('native clipboard accepts the operator main frame and rejects untrusted, malformed or oversized data',()=>{
  const h=mainHarness(),write=h.handlers.get('write-clipboard'),read=h.handlers.get('read-clipboard');
  assert.equal(write(h.event,{text:'Cue 1',html:'<p>Cue 1</p>'}),true);
  assert.equal(read(h.event).html,'<p>Cue 1</p>');
  assert.throws(()=>read({sender:{},senderFrame:h.event.senderFrame}),/denied/);
  assert.throws(()=>write({sender:h.event.sender,senderFrame:{}},{text:'',html:''}),/Invalid/);
  assert.throws(()=>write(h.event,{text:3,html:''}),/Invalid/);
  assert.throws(()=>write(h.event,{text:'',html:'simulated oversized payload'}),/Invalid/);
});

test('native async saves preserve the old file on failure and remove temporary files',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stq-save-regression-')),target=path.join(dir,'show.supertitles');
  try{
    fs.writeFileSync(target,'old project');
    const broken={...fs,promises:{...fs.promises,rename:async()=>{throw new Error('simulated rename failure');}}};
    const failing=mainHarness(broken); await assert.rejects(failing.handlers.get('write-file')({}, {path:target,bytes:new Uint8Array([1,2])}),/rename failure/);
    assert.equal(fs.readFileSync(target,'utf8'),'old project');assert.deepEqual(fs.readdirSync(dir),['show.supertitles']);
    const ok=mainHarness();
    assert.equal(await ok.handlers.get('write-file')({}, {path:target,bytes:new Uint8Array([1,2])}),true);
    assert.deepEqual(Array.from(fs.readFileSync(target)),[1,2]);assert.deepEqual(fs.readdirSync(dir),['show.supertitles']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
