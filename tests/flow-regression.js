// Flow behavior tests run the actual app functions and textarea handlers in a small DOM fixture.
// A fixed-width line counter stands in for the separately tested measured wrapping engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
const flow = html.slice(html.indexOf('let flowT=null;'), html.indexOf('// Flow mode is for writing'));
const input = html.slice(html.indexOf("slidesEl.addEventListener('input',"), html.indexOf("slidesEl.addEventListener('mousedown',"));

function fixture(slides, {width=30, lines=2, markers=[]}={}) {
  const listeners = {}, textareas = new Map(), result = {changed:0, clearedTimers:0, focused:null};
  const state = {slides:slides.map(s=>typeof s==='string'?{text:s,b:'hard'}:{...s}), markers, settings:{flow:true,lockOrder:false}};
  const textarea = i => {
    if(!textareas.has(i)) {
      const card = {dataset:{i:String(i)}, scrollIntoView(){}};
      const ta = {tagName:'TEXTAREA',readOnly:false,value:state.slides[i]?.text||'',selectionStart:0,selectionEnd:0,
        closest:()=>card,focus(){this.value=state.slides[i]?.text||'';result.focused=i;},
        setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};
      textareas.set(i,ta);
    }
    return textareas.get(i);
  };
  const context = vm.createContext({state,cur:1,mode:'edit',saveT:null,undoStack:[],redoStack:[],
    slidesEl:{addEventListener(type,fn){(listeners[type] ||= []).push(fn);}},
    document:{querySelector(selector){const m=selector.match(/data-i="(\d+)"/);return m?textarea(+m[1]):null;}},
    clearTimeout(){result.clearedTimers++;},setTimeout(){return 1;},
    setDirty(){},grow(){},showOverflow(){},save(){},updateOutput(){},
    changed(){result.changed++;textareas.clear();},
    snapState(sl=state.slides){return {d:JSON.stringify({s:sl,m:state.markers})};},
    overflowCut(text){let row=1,col=0;for(let i=0;i<text.length;i++){if(text[i]==='\n'){row++;col=0;}else if(++col>width){row++;col=1;}if(row>lines)return text[i]==='\n'?i+1:i;}return -1;}
  });
  vm.runInContext('function snap(){undoStack.push(snapState());redoStack=[];}',context);
  vm.runInContext(input+'\n'+flow,context);
  function key(i,key,extra={}) {
    const ta=textarea(i);ta.value=state.slides[i].text;
    const event={target:ta,key,prevented:false,preventDefault(){this.prevented=true;},...extra};
    for(const fn of listeners.keydown||[])fn(event);
    return event;
  }
  function paste(i,text,caret=text.length) {
    const ta=textarea(i);ta._before=state.slides[i].text;ta.value=text;ta.setSelectionRange(caret,caret);
    for(const fn of listeners.input||[])fn({target:ta,inputType:'insertFromPaste'});
    return ta;
  }
  return {state,context,result,textarea,key,paste};
}

let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
const texts = f => f.state.slides.map(s=>s.text);

test('paste into the second line stays anchored despite an earlier soft boundary',()=>{
  const f=fixture([{text:'Slide one',b:'soft'},{text:'Slide two',b:'soft'},'Slide three']);
  f.paste(1,'Slide two\nSlide three');
  assert.deepEqual(texts(f),['Slide one','Slide two\nSlide three','Slide three']);
  assert.equal(f.result.changed,0);
});
test('an overflowing paste pushes forward and preserves its internal newline',()=>{
  const f=fixture([{text:'Earlier stays put',b:'soft'},{text:'old',b:'soft'},'later']);
  f.paste(1,'old\nsecond line\nthird');
  assert.deepEqual(texts(f),['Earlier stays put','old\nsecond line','third later']);
  assert.equal(f.result.focused,2);
  assert.equal(f.textarea(2).selectionStart,5);
});
test('overflow inserts before a hard boundary without absorbing the next title',()=>{
  const f=fixture(['one','old','Separate title']);
  f.paste(1,'old\nsecond line\nthird');
  assert.deepEqual(texts(f),['one','old\nsecond line','third','Separate title']);
  assert.equal(f.state.slides[2].b,'hard');
  assert.equal(f.state.slides[1].b,'soft');
});
test('overflow undo restores the text from before the edit',()=>{
  const f=fixture(['one','old','last']);
  const old=f.paste(1,'old\nsecond line\nthird');
  assert.equal(JSON.parse(f.context.undoStack[0].d).s[1].text,'old');
  assert.equal(old._before,undefined);
  assert.equal(f.context.undoStack.length,1);
});
test('a non-progressing fit cannot create an infinite sequence of empty slides',()=>{
  const f=fixture(['previous','oversized']);f.context.overflowCut=()=>0;
  assert.equal(vm.runInContext('flowPush(1,5)',f.context),null);
  assert.deepEqual(texts(f),['previous','oversized']);
});
test('Enter removes selected text and preserves deliberate whitespace and newlines',()=>{
  const f=fixture(['previous','alpha\nSELECT omega','later']);
  f.textarea(1).setSelectionRange(6,12);
  assert.equal(f.key(1,'Enter').prevented,true);
  assert.deepEqual(texts(f),['previous','alpha\n',' omega','later']);
  assert.equal(f.result.focused,2);
  assert.equal(f.textarea(2).selectionStart,0);
});
test('Backspace merges a hard boundary upward without pulling from earlier slides',()=>{
  const f=fixture(['untouched','before','after','later']);
  assert.equal(f.key(2,'Backspace').prevented,true);
  assert.deepEqual(texts(f),['untouched','before after','later']);
  assert.equal(f.result.focused,1);
  assert.equal(f.textarea(1).selectionStart,7);
});
test('Backspace also merges a soft boundary',()=>{
  const f=fixture([{text:'before',b:'soft'},'after','later']);
  assert.equal(f.key(1,'Backspace').prevented,true);
  assert.deepEqual(texts(f),['before after','later']);
});
test('Backspace removes generated split ellipses when joining a sentence',()=>{
  const f=fixture([{text:'before…',b:'split'},'…after','later']);
  f.key(1,'Backspace');
  assert.deepEqual(texts(f),['before after','later']);
});
test('Backspace preserves a leading explicit newline without inserting an extra space',()=>{
  const f=fixture(['before','\nafter','later']);f.key(1,'Backspace');
  assert.deepEqual(texts(f),['before\nafter','later']);
  assert.equal(f.textarea(0).selectionStart,6);
});
test('a merged title that overflows flows forward ahead of the next hard title',()=>{
  const f=fixture(['first\nsecond','third','Separate title']);f.key(1,'Backspace');
  assert.deepEqual(texts(f),['first\nsecond third','Separate title']);
  // Reducing to six columns forces a forward page split while retaining the content order.
  const g=fixture(['first\nsecond','third','Separate title'],{width:6});g.key(1,'Backspace');
  assert.equal(texts(g).slice(0,-1).join(' ').replace(/\s+/g,' '),'first second third');
  assert.equal(g.state.slides.at(-1).text,'Separate title');
  assert.ok(g.state.slides.length>=3);
});
test('overflow into a generated split continuation does not leave ellipses inside the sentence',()=>{
  const f=fixture(['previous',{text:'old…',b:'split'},'…later']);
  f.paste(1,'old\nsecond line\nthird…');
  assert.deepEqual(texts(f),['previous','old\nsecond line','third later']);
  assert.equal(f.textarea(2).selectionStart,5);
});
test('readonly, locked, composing, modified, and non-collapsed keys keep native behavior',()=>{
  for(const setting of ['readonly','locked','composing','modified','selected']){
    const f=fixture(['before','after']);const extra={};
    if(setting==='readonly')f.textarea(1).readOnly=true;
    if(setting==='locked')f.state.settings.lockOrder=true;
    if(setting==='composing')extra.isComposing=true;
    if(setting==='modified')extra.metaKey=true;
    if(setting==='selected')f.textarea(1).setSelectionRange(0,2);
    assert.equal(f.key(1,'Backspace',extra).prevented,false,setting);
    assert.deepEqual(texts(f),['before','after']);
  }
});
test('Backspace never merges into a cued slide',()=>{
  const f=fixture(['cued','uncued'],{markers:[{}]});
  assert.equal(f.key(1,'Backspace').prevented,false);
  assert.deepEqual(texts(f),['cued','uncued']);
});
console.log(`${checks} Flow regression cases passed.`);
