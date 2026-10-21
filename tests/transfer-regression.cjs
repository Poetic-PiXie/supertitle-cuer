/* Run with node_modules/.bin/electron tests/transfer-regression.cjs
 * Runs the standalone HTML in Chromium with a temporary profile, synthetic PDFs and
 * DataTransfer objects. It never reads/writes the system clipboard or original projects.
 */
const {app,BrowserWindow,session} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'stc-transfer-regression-'));
const qa = path.resolve(process.argv.find(a=>a.startsWith('--qa='))?.slice(5) || path.join(os.tmpdir(),'supertitle-cuer-2.9-qa-transfer'));
fs.mkdirSync(qa,{recursive:true});
for(const name of ['userData','sessionData','documents','logs','crashDumps']){
  const folder=path.join(profile,name);fs.mkdirSync(folder,{recursive:true});
  if(name==='logs')app.setAppLogsPath(folder);else app.setPath(name,folder);
}
app.setName('Supertitle Cuer Transfer Regression');
app.commandLine.appendSwitch('disable-background-networking');
execFileSync(process.execPath,[path.join(root,'scripts/build-html.js')],{
  cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'
});
let win,checks=0;
const results=[],messages=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function js(code){
  const value=await win.webContents.executeJavaScript(`(async()=>{try{${code}\n}catch(error){return {__transferError:String(error.stack||error)};}})()`,true);
  if(value&&value.__transferError)throw new Error(value.__transferError);return value;
}
async function settle(){await delay(60);await js('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));');}
async function test(name,run){await run();checks++;results.push({name,pass:true});console.log('PASS '+name);}
async function fixture(kind){
  await js(`document.activeElement?.blur();await stopProjectActivity();setDirty(false);resetProject();setMode('edit');
    const source=${JSON.stringify(kind==='source')};
    state.settings={...defaults(),shape:source?'16/9':'6/1',font:source?SAFE_FONTS[0]:SAFE_FONTS[3],textScale:source?0.5:1,markerSize:source?2:6,
      fg:source?'#f1e2d3':'#010101',bg:source?'#102030':'#fafafa',cueColor:source?'#995522':'#00ff00',flow:false};
    const d=await PDFLib.PDFDocument.create(),font=await d.embedFont(PDFLib.StandardFonts.Helvetica);
    for(let i=1;i<=(source?5:3);i++){const p=d.addPage([612,792]);p.drawText((source?'SOURCE':'TARGET')+' PAGE '+i,{x:40,y:730,size:20,font});}
    await loadPdfBytes(source?'Source score.pdf':'Target score.pdf',new Uint8Array(await d.save()));
    if(source){
      state.parts=[{id:'source-a',name:'Original Act A.pdf',title:'Copied Act A',pages:2,color:'#117733',spare:[{text:'A waiting',b:'hard'}]},
        {id:'source-b',name:'Original Act B.pdf',title:'Copied Act B',pages:2,spare:[{text:'B waiting',b:'hard'}]},
        {id:'source-c',name:'Uncued source.pdf',title:'Uncued Interlude',pages:1,color:'#225588',spare:[{text:'C waiting 1',b:'hard'},{text:'C waiting 2',b:'hard',color:'#ccaa22',colorCue:true}]}];
      state.markers=[{page:1,x:0.67,y:0.22,t:11},{page:1,x:0.24,y:0.235,t:23},{page:3,x:0.31,y:0.43,t:35},{page:4,x:0.57,y:0.63,t:47}];
      state.slides=[{text:'Line one\\nLine two\\nLine three\\nLine four\\nLine five\\nLine six',b:'hard',color:'#aabbcc',colorCue:true},
        {text:'A inherited',b:'hard'},{text:'B has no slide tag',b:'hard'},{text:'B own tag only',b:'hard',color:'#cc33aa'}, {text:'SOURCE uncued tail',b:'hard'}];
    }else{
      state.parts=[{id:'target-a',name:'Target First.pdf',title:'Existing First',pages:1,color:'#ee1122',spare:[{text:'Target waiting',b:'hard'}]},
        {id:'target-b',name:'Target Second.pdf',title:'Existing Second',pages:2,color:'#3344ff'}];
      state.markers=[{page:1,x:0.11,y:0.15,t:100},{page:1,x:0.4,y:0.35,t:200},{page:3,x:0.3,y:0.6,t:300}];
      state.slides=['Target 1','Target 2','Target 3','Target tail'].map(text=>({text,b:'hard'}));
    }
    refRuns={};sortMarkers();undoStack=[];redoStack=[];changed(true);goTo(source?0:1,false);`);
  await settle();
}
async function summary(){return js(`return {pages:pdfDoc.numPages,parts:JSON.parse(JSON.stringify(partsList())),markers:JSON.parse(JSON.stringify(state.markers)),slides:JSON.parse(JSON.stringify(state.slides)),all:allLines().map(s=>s.text),settings:JSON.parse(JSON.stringify(state.settings))};`);}
async function pdfLabels(base64){return js(`const d=await pdfjsLib.getDocument({data:STCSlideTransfer.bytes(${JSON.stringify(base64)})}).promise;try{const out=[];for(let i=1;i<=d.numPages;i++)out.push((await(await d.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));return out;}finally{await d.destroy();}`);}
async function pasteSection(payload){await js(`await applySlideClipboard(${JSON.stringify(payload)});`);await settle();}
async function rollbackState(){
  const snapshot=await js(`const cached=await idbGet('score');
    const stack=s=>s.map(x=>({d:x.d,parts:x.parts,name:x.name,bytes:x.bytes?STCSlideTransfer.base64(x.bytes):null}));
    return {state:JSON.parse(JSON.stringify(state)),pdf:!!pdfDoc,pages:pdfDoc?.numPages||0,bytes:pdfBytes?STCSlideTransfer.base64(pdfBytes):null,
      cur,anchor,dirty,docName,fileHandle,undo:stack(undoStack),redo:stack(redoStack),
      cached:cached?{name:cached.name,bytes:STCSlideTransfer.base64(new Uint8Array(cached.bytes))}:null};`);
  const digest=base64=>base64==null?null:crypto.createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
  snapshot.bytes=digest(snapshot.bytes);if(snapshot.cached)snapshot.cached.bytes=digest(snapshot.cached.bytes);
  for(const entry of [...snapshot.undo,...snapshot.redo])entry.bytes=digest(entry.bytes);
  return snapshot;
}
async function injectFailedSectionLoad(payload){
  const result=await js(`const originalLoad=loadPdfBytes, originalError=console.error;let calls=0,installedPages=0;const errors=[];
    loadPdfBytes=async(...args)=>{const ok=await originalLoad(...args);calls++;if(calls===1){installedPages=pdfDoc?.numPages||0;return false;}return ok;};
    console.error=(...args)=>errors.push(args.map(String).join(' '));
    try{await applySlideClipboard(${JSON.stringify(payload)});}finally{loadPdfBytes=originalLoad;console.error=originalError;}
    await waitForProjectCommit();return {calls,installedPages,errors,commitReleased:projectCommit===null,pastingReleased:!pastingSection,openDialogs:document.querySelectorAll('dialog[open]').length};`);
  await settle();return result;
}
const timeout=setTimeout(()=>{console.error('FAIL transfer regression timed out');app.exit(1);},150000);

(async()=>{
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,done)=>done({cancel:true}));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,done)=>done(false));
  win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level>=3)messages.push(String(event.message));});
  await win.loadFile(path.join(root,'dist','Supertitle_Cuer.html'));await settle();
  await js(`if(NATIVE)throw new Error('Expected the standalone HTML path, without a preload');
    window.__capturedTransfer=null;writeSlidePayload=async payload=>{window.__capturedTransfer=STCSlideTransfer.validate(payload);return true;};`);
  let sourceA,sourceB,sourceC,slideHtml;

  await test('extract only the chosen section PDF and normalize cue coordinates',async()=>{
    await fixture('source');
    sourceA=await js('await copySectionWithPdf("source-a");return window.__capturedTransfer;');
    sourceB=await js('await copySectionWithPdf("source-b");return window.__capturedTransfer;');
    sourceC=await js('await copySectionWithPdf("source-c");return window.__capturedTransfer;');
    assert.deepEqual(await pdfLabels(sourceA.pdf),['SOURCE PAGE 1','SOURCE PAGE 2']);
    assert.deepEqual(await pdfLabels(sourceB.pdf),['SOURCE PAGE 3','SOURCE PAGE 4']);
    assert.deepEqual(await pdfLabels(sourceC.pdf),['SOURCE PAGE 5']);
    assert.deepEqual(sourceB.cues,[{page:1,x:0.31,y:0.43},{page:2,x:0.57,y:0.63}]);
    assert.deepEqual(sourceA.slides.map(s=>s.text),['Line one\nLine two\nLine three\nLine four\nLine five\nLine six','A inherited','A waiting']);
    assert.equal(sourceA.slides[0].color,'#aabbcc');assert.equal(sourceA.slides[0].cueColorOverride,'#aabbcc');
    assert.equal(sourceA.slides[1].color,'#117733');assert.equal(sourceA.slides[1].cueColorOverride,'#117733');
    assert.equal(sourceB.slides[0].color,undefined);assert.equal(sourceB.slides[0].cueColorOverride,'#995522');
    assert.deepEqual(sourceA.slides[0].screenColors,{fg:'#f1e2d3',bg:'#102030'});
    assert.equal(sourceC.cues.length,0);assert.equal(sourceC.slides.length,2);
  });
  await test('real copy DataTransfer roundtrips slide metadata through HTML only',async()=>{
    const copied=await js(`pickA=0;pickB=3;const dt=new DataTransfer(),e=new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true});
      document.body.dispatchEvent(e);return {handled:e.defaultPrevented,html:dt.getData('text/html'),payload:STCSlideTransfer.decode({html:dt.getData('text/html')})};`);
    assert.equal(copied.handled,true);assert.equal(copied.payload.slides.length,4);
    assert.equal(copied.payload.slides[2].color,undefined);assert.equal(copied.payload.slides[2].keepColors,true);
    slideHtml=copied.html;
  });
  await test('copying the only PDF includes its uncued tail',async()=>{
    const solo=await js('state.parts=[{id:"solo",name:"Solo score.pdf",pages:5}];return sectionPayload("solo");');
    assert.equal(solo.slides.length,5);assert.equal(solo.slides.at(-1).text,'SOURCE uncued tail');
  });
  await test('paste a section after the selected target section with all existing pairs intact',async()=>{
    await fixture('target');const before=await summary();
    const roundtrip=await js(`return STCSlideTransfer.decode({html:STCSlideTransfer.encode(${JSON.stringify(sourceA)}).html});`);
    await pasteSection(roundtrip);const after=await summary();
    assert.equal(after.pages,5);assert.deepEqual(after.parts.map(p=>p.title),['Existing First','Copied Act A','Existing Second']);
    assert.equal(after.parts[1].name,'Original Act A.pdf');assert.equal(after.parts[1].color,'#117733');
    assert.deepEqual(after.markers.map(m=>m.page),[1,1,2,2,5]);
    assert.deepEqual(after.markers.slice(0,2),before.markers.slice(0,2));
    assert.deepEqual({...after.markers[4],page:3},before.markers[2]);
    assert.deepEqual(after.markers.slice(2,4),[sourceA.cues[1],sourceA.cues[0]].map(m=>({...m,page:m.page+1})), 'Target marker size changes row ordering');
    assert.deepEqual(after.parts[0].spare,before.parts[0].spare);assert.deepEqual(after.parts[1].spare.map(s=>s.text),['A waiting']);
    assert.deepEqual(after.slides.map(s=>s.text),['Target 1','Target 2','A inherited',sourceA.slides[0].text,'Target 3','Target tail'], 'Each imported title follows its own cue when target row ordering changes');
    assert.equal(after.settings.font,before.settings.font);assert.equal(after.settings.shape,'6/1');assert.equal(after.settings.fg,'#010101');
    const colors=await js('const i=state.slides.findIndex(s=>s.text.startsWith("Line one"));return {tag:slideColor(i),cue:cueColor(i),screen:screenColors(state.slides[i]),refs:Object.keys(refRuns)};');
    assert.deepEqual(colors,{tag:'#aabbcc',cue:'#aabbcc',screen:{fg:'#f1e2d3',bg:'#102030'},refs:[]});
  });
  await test('one undo restores the PDF, section order, all cue links and waiting lines',async()=>{
    await js('await undo();');await settle();const restored=await summary();
    assert.equal(restored.pages,3);assert.deepEqual(restored.parts.map(p=>p.id),['target-a','target-b']);
    assert.deepEqual(restored.markers.map(m=>m.page),[1,1,3]);assert.deepEqual(restored.slides.map(s=>s.text),['Target 1','Target 2','Target 3','Target tail']);
    assert.deepEqual(restored.parts[0].spare.map(s=>s.text),['Target waiting']);
    await js('await redo();');await settle();assert.equal((await summary()).pages,5);
  });
  await test('save/reopen preserves copied section labels, colors, PDF pages and cue links',async()=>{
    const before=await summary();
    await js(`const bytes=await buildProjectPdf();setDirty(false);resetProject();await openAny(new File([bytes],'Transfer roundtrip.supertitles'),null);`);await settle();
    const after=await summary();assert.equal(after.pages,5);assert.deepEqual(after.parts,before.parts);assert.deepEqual(after.markers,before.markers);assert.deepEqual(after.slides,before.slides);
  });
  await test('a section without cues retains its waiting titles and appends when no cue is selected',async()=>{
    await fixture('target');const before=await summary();await js('goTo(-1,false);');await pasteSection(sourceC);const after=await summary();
    assert.equal(after.pages,4);assert.equal(after.parts.length,3);assert.equal(after.parts[2].title,'Uncued Interlude');
    assert.deepEqual(after.parts[2].spare.map(s=>s.text),['C waiting 1','C waiting 2']);
    assert.deepEqual(after.markers,before.markers);assert.deepEqual(after.slides,before.slides);
  });
  await test('the first pasted PDF in an empty project can be undone to empty and redone',async()=>{
    await js('document.activeElement?.blur();setDirty(false);resetProject();setMode("edit");state.settings.markerSize=6;');
    await pasteSection(sourceA);let state=await summary();assert.equal(state.pages,2);assert.equal(state.parts.length,1);assert.equal(state.markers.length,2);
    assert.deepEqual(state.slides.map(s=>s.text),['A inherited',sourceA.slides[0].text,'A waiting']);
    await js('await undo();');await settle();
    assert.deepEqual(await js('return {pdf:!!pdfDoc,bytes:!!pdfBytes,parts:partsList().length,markers:state.markers.length,slides:state.slides.length};'),{pdf:false,bytes:false,parts:0,markers:0,slides:0});
    await js('await redo();');await settle();state=await summary();assert.equal(state.pages,2);assert.equal(state.markers.length,2);assert.equal(state.slides.length,3);
  });
  await test('plain-slide HTML paste keeps count/text/colors and grays overflow under the target layout',async()=>{
    await fixture('target');await js('goTo(0,false);');const before=await summary();
    const handled=await js(`const dt=new DataTransfer();dt.setData('text/html',${JSON.stringify(slideHtml)});const e=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented;`);
    await settle();assert.equal(handled,true);
    const pasted=await js(`return {all:allLines().map(s=>s.text),copies:allLines().filter(s=>s.keepColors),overflow:document.querySelector('.slide[data-i="1"]').classList.contains('over'),gray:document.querySelector('.slide[data-i="1"] .mirror .ovf')?.textContent,shape:state.settings.shape,font:state.settings.font};`);
    assert.equal(pasted.all.length,before.all.length+4);assert.equal(pasted.copies.length,4);
    assert.deepEqual(pasted.copies.map(s=>s.text),[sourceA.slides[0].text,'A inherited','B has no slide tag','B own tag only']);
    assert.equal(pasted.overflow,true);assert.ok(pasted.gray.includes('Line three'));assert.equal(pasted.shape,'6/1');assert.equal(pasted.font,before.settings.font);
    assert.equal(pasted.copies[2].color,undefined);assert.equal(pasted.copies[2].cueColorOverride,'#995522');
    assert.deepEqual(pasted.copies[2].screenColors,{fg:'#f1e2d3',bg:'#102030'});
    for(const text of before.all)assert.ok(pasted.all.includes(text));
  });
  await test('untagged copied waiting slides do not inherit the destination section color',async()=>{
    const rendered=await js(`const p=partsList()[0],i=p.spare.findIndex(s=>s.text==='B has no slide tag'),card=document.querySelector('.spare[data-sp="'+p.id+':'+i+'"]');return {exists:!!card,tinted:card?.classList.contains('tinted'),color:card?.style.getPropertyValue('--sc')};`);
    assert.equal(rendered.exists,true);assert.equal(rendered.tinted,false);assert.equal(rendered.color,'');
  });
  await test('a failed installed section load restores the complete existing target and releases its modal',async()=>{
    await fixture('target');
    await js(`snap();state.slides[0].text='Target 1 revised';changed(true);snap();state.slides[1].text='Temporary second edit';changed(true);await undo();
      goTo(1,false);anchor=0;setDirty(false);await idbPut('score',{name:state.pdfName,bytes:pdfBytes});save();`);
    const before=await rollbackState();assert.equal(before.undo.length,1);assert.equal(before.redo.length,1);assert.equal(before.dirty,false);
    const injected=await injectFailedSectionLoad(sourceA),after=await rollbackState();
    assert.equal(injected.calls,2);assert.equal(injected.installedPages,5,'The injected failure must occur after the new PDF is installed');
    assert.deepEqual(injected.errors,['Error: The copied score section could not be displayed']);
    assert.deepEqual(after,before,'Original score SHA256, cached score, state, names, selection, dirty flag and both history stacks must survive');
    assert.equal(injected.commitReleased,true);assert.equal(injected.pastingReleased,true);assert.equal(injected.openDialogs,0);
  });
  await test('a failed first section load restores an empty target and releases its modal',async()=>{
    await js('document.activeElement?.blur();setDirty(false);resetProject();setMode("edit");await idbPut("score",null);save();');
    const before=await rollbackState(),injected=await injectFailedSectionLoad(sourceA),after=await rollbackState();
    assert.equal(injected.calls,1);assert.equal(injected.installedPages,2);
    assert.deepEqual(injected.errors,['Error: The copied score section could not be displayed']);assert.deepEqual(after,before);
    assert.equal(injected.commitReleased,true);assert.equal(injected.pastingReleased,true);assert.equal(injected.openDialogs,0);
  });
  assert.deepEqual(messages,[],'Unexpected renderer errors');
  fs.writeFileSync(path.join(qa,'transfer-regression-results.json'),JSON.stringify({checks,pass:true,results,messages,profile},null,2));
  console.log(`${checks} standalone HTML transfer regression cases passed.`);clearTimeout(timeout);win.destroy();app.exit(0);
})().catch(async error=>{
  console.error(error.stack||error);clearTimeout(timeout);
  if(win&&!win.isDestroyed())try{fs.writeFileSync(path.join(qa,'failure.png'),(await win.capturePage()).toPNG());}catch(_){}
  fs.writeFileSync(path.join(qa,'transfer-regression-results.json'),JSON.stringify({checks,pass:false,error:String(error.stack||error),results,messages,profile},null,2));
  if(win&&!win.isDestroyed())win.destroy();app.exit(1);
});
