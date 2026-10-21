/* Run from the source folder:
 *   node_modules/.bin/electron tests/electron-regression.cjs
 * Optional: --sample=/absolute/path/project.supertitles --qa=/absolute/tmp/output
 * This runs the real main process/preload/renderer with isolated temporary app data.
 * Native file dialogs are canceled. The system clipboard and original sample are untouched.
 */
const {app,BrowserWindow,ipcMain,dialog,session} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const argument = name => process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const qa = path.resolve(argument('qa') || path.join(os.tmpdir(),'supertitle-cuer-2.9-qa'));
const sample = argument('sample');
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'stc-electron-regression-'));
fs.mkdirSync(qa,{recursive:true});
for(const part of ['userData','sessionData','documents','logs','crashDumps']){
  const folder=path.join(profile,part);fs.mkdirSync(folder,{recursive:true});
  if(part==='logs')app.setAppLogsPath(folder);else app.setPath(part,folder);
}
app.setName('Supertitle Cuer Regression');
app.commandLine.appendSwitch('disable-background-networking');
dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
dialog.showSaveDialog=async()=>({canceled:true});
dialog.showMessageBox=async()=>({response:1,checkboxChecked:false}); // Don't Save, if a test leaves a dirty project.

// Rebuild with the bundled Electron Node runtime, without installing anything.
execFileSync(process.execPath,[path.join(root,'scripts/build-html.js')],{
  cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'
});
const ready = new Promise(resolve=>ipcMain.once('renderer-ready',event=>resolve(BrowserWindow.fromWebContents(event.sender))));
const messages=[];
app.on('web-contents-created',(_event,contents)=>{
  contents.on('console-message',event=>{if(event.level==='warning'||event.level==='error'||event.level>=2)messages.push(String(event.message));});
});
app.whenReady().then(()=>{
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
});
require(path.join(root,'electron/main.js'));

let win, checks=0;
const results=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const js=async code=>{
  const value=await win.webContents.executeJavaScript(`(async()=>{try{${code}\n}catch(error){return {__stcHarnessError:String(error.stack||error)};}})()`,true);
  if(value&&value.__stcHarnessError)throw new Error(value.__stcHarnessError);
  return value;
};
async function settle(){await delay(70);await js('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));');}
async function until(code,label,timeout=10000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await js(`return !!(${code});`))return;await delay(35);}
  throw new Error('Timed out: '+label);
}
async function screenshot(name){await settle();const image=await win.capturePage();fs.writeFileSync(path.join(qa,name+'.png'),image.toPNG());}
async function test(name,fn){await fn();checks++;results.push({name,pass:true});console.log('PASS '+name);}
async function key(keyCode,modifiers=[]){
  win.focus(); // Native input needs the test window active, while retaining its DOM focus.
  win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});
  win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});
  await settle();
}
async function fixture(slides,flow=true){
  await js(`document.activeElement?.blur();setDirty(false);resetProject();setMode('edit');
    state.settings={...defaults(),shape:'6/1',textScale:0.75,flow:${JSON.stringify(flow)}};
    state.slides=${JSON.stringify(slides.map(s=>typeof s==='string'?{text:s,b:'hard'}:s))};
    document.body.classList.toggle('flow',state.settings.flow);cur=-1;changed(true);`);
  await settle();
}
async function focusSlide(index,position='end'){
  await js(`const ta=document.querySelector('.slide[data-i="${index}"] textarea');
    if(!ta)throw new Error('Missing textarea ${index}');ta.focus();
    const p=${position==='end'?'ta.value.length':Number(position)};ta.setSelectionRange(p,p);`);
}
async function insertText(text){await win.webContents.insertText(text);await settle();}
async function pasteText(text){
  // A synthetic clipboard event exercises app paste normalization. execCommand supplies the
  // browser's default insertion when an unmodified plain-text paste is not intercepted.
  await js(`const ta=document.activeElement,dt=new DataTransfer();dt.setData('text/plain',${JSON.stringify(text)});
    const event=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});
    if(ta.dispatchEvent(event))document.execCommand('insertText',false,${JSON.stringify(text)});`);
  await settle();
}
async function texts(){return js('return state.slides.map(s=>s.text);');}
async function scoreFixture(){
  const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const name of ['ACT I - REGRESSION SCORE','ACT II - REGRESSION SCORE']){
    const page=pdf.addPage([612,792]);page.drawText(name,{x:50,y:725,size:18,font,color:rgb(0,0,0)});
    for(let y=640;y>100;y-=80)for(let n=0;n<5;n++)page.drawLine({start:{x:50,y:y+n*8},end:{x:560,y:y+n*8},thickness:0.6});
  }
  const bytes=await pdf.save(),filename=path.join(profile,'documents','Regression Score.pdf');fs.writeFileSync(filename,bytes);
  await fixture([],false);
  await js(`await loadPdfBytes('Regression Score.pdf',new Uint8Array(${JSON.stringify(Array.from(bytes))}));
    state.parts=[{id:'act1',name:'Act I.pdf',pages:1},{id:'act2',name:'Act II.pdf',pages:1}];
    state.markers=[{page:1,x:0.2,y:0.2},{page:1,x:0.4,y:0.4},{page:2,x:0.2,y:0.2},{page:2,x:0.4,y:0.4}];
    state.slides=['A1','A2','B1','B2','Tail'].map(text=>({text,b:'hard'}));
    sortMarkers();changed(true);goTo(2,false);`);
  await settle();
}

const watchdog=setTimeout(()=>{console.error('FAIL Electron regression timed out');app.exit(1);},120000);
(async()=>{
  win=await ready;win.setSize(1440,960);win.show();win.focus();await settle();
  await test('real renderer paste retains slide 2 and its explicit second line',async()=>{
    await fixture([{text:'Earlier title',b:'soft'},{text:'Second title',b:'soft'},'Third title']);
    await focusSlide(1);await pasteText('\nThird title');
    assert.deepEqual(await texts(),['Earlier title','Second title\nThird title','Third title']);
    assert.equal(await js('return document.activeElement.closest(".slide").dataset.i;'),'1');
    await screenshot('flow-paste-anchored');
  });
  await test('real renderer paste overflows only forward before a hard title',async()=>{
    await fixture([{text:'Earlier title',b:'soft'},'Second title','Separate next title']);
    await focusSlide(1);await pasteText('\nSecond line\nThird line');
    assert.deepEqual(await texts(),['Earlier title','Second title\nSecond line','Third line','Separate next title']);
    assert.equal(await js('return document.activeElement.closest(".slide").dataset.i;'),'2');
    assert.equal(await js('return document.activeElement.selectionStart;'),10);
  });
  await test('native Backspace joins hard and generated split boundaries',async()=>{
    await fixture(['Earlier title','Before','After','Later']);await focusSlide(2,0);await key('Backspace');
    assert.deepEqual(await texts(),['Earlier title','Before After','Later']);
    assert.equal(await js('return document.activeElement.selectionStart;'),7);
    await fixture([{text:'Before…',b:'split'},'…After','Later']);await focusSlide(1,0);await key('Backspace');
    assert.deepEqual(await texts(),['Before After','Later']);
  });
  await test('native Enter replaces a selection with a slide break',async()=>{
    await fixture(['Earlier title','alpha SELECT omega','Later']);await focusSlide(1,6);
    await js('document.activeElement.setSelectionRange(6,12);');await key('Enter');
    assert.deepEqual(await texts(),['Earlier title','alpha ',' omega','Later']);
  });
  await test('compact cards and selected-slide actions fit a 960px window on either side',async()=>{
    await fixture(['First','Second','Third'],false);win.setSize(960,900);await settle();
    await js('goTo(1,false);');
    for(const swapped of [false,true]){
      await js(`applySwap(${swapped});`);await settle();
      const bounds=await js(`const card=document.querySelector('.slide[data-i="1"]'),row=document.querySelector('.addBelowRow'),r=row.getBoundingClientRect();
        const ring=card.querySelector('.sring').getBoundingClientRect(),c=card.getBoundingClientRect();
        return {sidebar:document.querySelector('aside').getBoundingClientRect().width,cardHeight:c.height,ringInside:ring.top>=c.top&&ring.bottom<=c.bottom,
          overflowing:[...row.querySelectorAll('button')].filter(b=>{const x=b.getBoundingClientRect();return x.left<r.left-1||x.right>r.right+1;}).map(b=>b.textContent)};`);
      assert.ok(bounds.sidebar>=380);assert.ok(bounds.cardHeight<60);assert.ok(bounds.ringInside);assert.deepEqual(bounds.overflowing,[]);
    }
    await js('applySwap(false);document.querySelector(".addBelowRow [data-a=up]").click();');await settle();
    assert.deepEqual(await texts(),['Second','First','Third']);
    assert.equal(await js('return document.querySelector(".addBelowRow [data-a=up]").disabled;'),true);
    await js('document.querySelector(".addBelowRow [data-a=down]").click();');await settle();
    assert.deepEqual(await texts(),['First','Second','Third']);
    await screenshot('compact-cards-960');win.setSize(1440,960);await settle();await screenshot('compact-cards-1440');
  });
  await test('textarea geometry and preview agree across fonts, sizes, and shapes',async()=>{
    await fixture(['The orchestra rises, and I shall follow you beyond the mountains.\nEven the longest unbrokenwordabcdefghijklmnopqrstuv keeps its place.'],false);
    const mismatches=await js(String.raw`const errors=[];state.settings.flow=false;
      for(const font of SAFE_FONTS)for(const shape of ['6/1','16/9','4/3'])for(const size of [0.5,1]){
        Object.assign(state.settings,{font,shape,textScale:size});renderSlides();goTo(0,false);cardFont();
        const ta=document.querySelector('.slide[data-i="0"] textarea'),cs=getComputedStyle(ta),layout=titleTextLayout(state.slides[0].text);
        const rows=Math.round((ta.scrollHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom))/parseFloat(cs.lineHeight));
        const expected=layout.lines.slice(0,maxLines()).map(l=>l.text).join('\n');
        const actual=document.querySelector('#pvText').textContent.replace(/\u200b$/,'');
        const contentWidth=ta.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
        if(rows!==layout.lines.length || actual!==expected || Math.abs(contentWidth-FIT_W*titleLayout().availW)>1)
          errors.push({font,shape,size,rows,expectedRows:layout.lines.length,contentWidth,expectedWidth:FIT_W*titleLayout().availW,previewEqual:actual===expected});
      }return errors;`);
    assert.deepEqual(mismatches,[]);
  });
  await test('real section Rename UI commits a custom title without changing the PDF name',async()=>{
    await scoreFixture();
    await js(`const heading=document.querySelector('[data-section-menu="act2"]');
      if(heading){heading.click();document.querySelector('#sectionMenu [data-section-action="rename"]').click();}
      else document.querySelector('input[data-section="act2"]').focus();
      const input=document.querySelector('input[data-section="act2"]');input.focus();input.select();`);
    await insertText('Act II: The Garden');await key('Enter');
    assert.deepEqual(await js('return {title:state.parts[1].title,name:state.parts[1].name};'),{title:'Act II: The Garden',name:'Act II.pdf'});
  });
  await test('Add above stays in the selected PDF section',async()=>{
    await js('goTo(2,false);document.querySelector(".addBelowRow [data-a=addAbove]").click();');await settle();
    assert.deepEqual(await texts(),['A1','A2','','B1','Tail']);
    assert.deepEqual(await js('return state.parts[1].spare.map(s=>s.text);'),['B2']);
    await insertText('B inserted');
    assert.deepEqual(await texts(),['A1','A2','B inserted','B1','Tail']);
  });
  await test('single-title Link to PDF works through the selection and Link dialog',async()=>{
    await js(`const n=document.querySelector('.slide[data-i="3"] .num');n.click();
      n.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,shiftKey:true,button:0}));
      document.querySelector('#pickLink').click();`);
    await until('document.querySelector("#askDlg").open','Link dialog');
    await js('document.querySelector("#linkPdf").value="act1";document.querySelector("#askOk").click();');
    await until('!document.querySelector("#askDlg").open','Link dialog close');await settle();
    assert.deepEqual(await texts(),['A1','A2','B inserted','B2','Tail']);
    assert.deepEqual(await js('return state.parts[0].spare.map(s=>s.text);'),['B1']);
    assert.equal(await js('return state.parts[1].title;'),'Act II: The Garden');
    assert.equal(await js('return getComputedStyle(document.querySelector(".spare .tools")).display;'),'flex');
    await screenshot('sections-add-above-link');
  });
  await test('custom section titles and waiting lines survive project serialization',async()=>{
    const data=await js('const bytes=await buildProjectPdf();const parsed=await readProjectFromPdf(bytes);return parsed.project;');
    assert.equal(data.parts[1].title,'Act II: The Garden');
    assert.deepEqual(data.parts[0].spare.map(s=>s.text),['B1']);
  });
  if(sample)await test('a copied real project opens without changing the original sample',async()=>{
    const original=path.resolve(sample),hash=crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex');
    const copied=path.join(profile,'documents',path.basename(original));fs.copyFileSync(original,copied);
    const base64=fs.readFileSync(copied).toString('base64');
    const info=await js(`document.activeElement?.blur();setDirty(false);
      const bytes=Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0));
      await openNativeFile({name:${JSON.stringify(path.basename(copied))},path:${JSON.stringify(copied)},bytes});
      return {pages:pdfDoc?.numPages||0,slides:state.slides.length,parts:partsList().length};`);
    assert.ok(info.pages>0);assert.ok(info.slides>0);assert.ok(info.parts>0);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'),hash);
    await screenshot('real-project-copy');results.push({sample:path.basename(original),...info});
  });
  console.log(`${checks} Electron UI regression cases passed. Screenshots: ${qa}`);
  fs.writeFileSync(path.join(qa,'electron-regression-results.json'),JSON.stringify({checks,pass:true,results,messages,profile},null,2));
  clearTimeout(watchdog);for(const window of BrowserWindow.getAllWindows())window.destroy();app.exit(0);
})().catch(async error=>{
  console.error(error.stack||error);clearTimeout(watchdog);
  if(win&&!win.isDestroyed())await screenshot('failure').catch(()=>{});
  fs.writeFileSync(path.join(qa,'electron-regression-results.json'),JSON.stringify({checks,pass:false,error:String(error.stack||error),results,messages,profile},null,2));
  for(const window of BrowserWindow.getAllWindows())window.destroy();app.exit(1);
});
