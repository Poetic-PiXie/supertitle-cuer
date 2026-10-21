// Regression checks for section identity, insert boundaries, and the operator's end-of-section alert.
// Run with: node scripts/section-ui-checks.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.html'), 'utf8');
const between = (a, b) => {
  const start = html.indexOf(a), end = html.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, `Source block: ${a}`);
  return html.slice(start, end);
};
const ctx = vm.createContext({ console });
vm.runInContext(`
  const state={parts:[], markers:[], slides:[], settings:{lockOrder:false}};
  let mode='edit', cur=-1, snapshots=[];
  const partsList=()=>state.parts;
  const cuePart=i=>state.markers[i] ? partOfPage(partsList(),state.markers[i].page) : null;
  const blankPad=()=>({text:'',pad:true});
  const snap=()=>snapshots.push(JSON.stringify(state));
  const setDirty=()=>{}, save=()=>{}, updateOutput=()=>{}, renderParts=()=>{};
  const $=()=>({open:false});
  ${between('function partOfPage(', 'const PDFS_ICON=')}
  ${between('function sectionsNow(', 'const normalizeSections =')}
  ${between('function sectionTitle(', 'function renderSlides(')}
  ${between('function insertSectionSlide(', 'const SCORE_EMPTY_BIG =')}
  ${between('function sectionEndAt(', 'function updateSectionEnd(')}
  globalThis.api={state, sectionTitle, setSectionTitle, insertSectionSlide, sectionEndAt,
    get snapshots(){return snapshots;}, setMode:m=>mode=m};
`, ctx);
const { api } = ctx;
const { state } = api;
const line = text => ({ text, b: 'hard' });
function reset() {
  state.settings.lockOrder = false;
  api.setMode('edit');
  state.parts = [{id:'a',name:'Act I.pdf',pages:2}, {id:'b',name:'Act II.pdf',pages:2}];
  state.markers = [{page:1},{page:2},{page:3},{page:4}];
  state.slides = [line('A1'),line('A2'),line('B1'),line('B2'),line('Tail')];
}
const texts = rows => Array.from(rows || [], s => s.text);

reset();
const originalName = state.parts[1].name;
assert.equal(api.setSectionTitle('b', '  Act II — Finale  '), true);
assert.equal(api.sectionTitle(state.parts[1]), 'Act II — Finale');
assert.equal(state.parts[1].name, originalName);
assert.equal(JSON.parse(JSON.stringify(state.parts))[1].title, 'Act II — Finale');
assert.equal(JSON.parse(api.snapshots.at(-1)).parts[1].title, undefined);
state.settings.lockOrder = true;
assert.equal(api.setSectionTitle('b', 'Locked edit'), false);
state.settings.lockOrder = false;
api.setMode('show');
assert.equal(api.setSectionTitle('b', 'Show edit'), false);
api.setMode('edit');
assert.equal(api.setSectionTitle('b', ''), true);
assert.equal(api.sectionTitle(state.parts[1]), 'Act II');
assert.equal(state.parts[1].title, undefined);
assert.equal(state.parts[1].name, originalName);

reset();
state.parts[1].spare = [line('B waiting')];
const above = api.insertSectionSlide(2, true);
assert.equal(state.slides[2], above);
assert.deepEqual(texts(state.slides), ['A1','A2','','B1','Tail']);
assert.deepEqual(texts(state.parts[1].spare), ['B2','B waiting']);
assert.equal(state.parts[0].spare, undefined);

reset();
api.insertSectionSlide(1, false);
assert.deepEqual(texts(state.slides), ['A1','A2','B1','B2','Tail']);
assert.deepEqual(texts(state.parts[0].spare), ['']);
assert.equal(state.parts[1].spare, undefined);
api.insertSectionSlide(4, true);
assert.deepEqual(texts(state.slides), ['A1','A2','B1','B2','','Tail']);

reset();
assert.equal(api.sectionEndAt(-1), null);
assert.equal(api.sectionEndAt(0), null);
assert.equal(api.sectionEndAt(1).id, 'a');
assert.equal(api.sectionEndAt(2), null);
assert.equal(api.sectionEndAt(3).id, 'b');
assert.equal(api.sectionEndAt(4), null, 'Uncued tail is not a section ending');
state.parts[1].spare = [line('Waiting')];
assert.equal(api.sectionEndAt(3).id, 'b', 'Waiting text must not become a cued slide');
state.slides.length = 3;
assert.equal(api.sectionEndAt(3), null, 'A marker without a slide is not a slide alert');
reset();
state.parts = [state.parts[0]];
state.markers = state.markers.slice(0,2);
state.slides = state.slides.slice(0,2);
api.insertSectionSlide(0, true);
assert.deepEqual(texts(state.slides), ['','A1','A2']);
assert.equal(api.sectionEndAt(1).id, 'a');

console.log('Section UI checks passed: rename/persistence/locks, insertion boundaries, cued endings.');
