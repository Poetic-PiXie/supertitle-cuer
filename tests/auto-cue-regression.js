/* Run: node tests/auto-cue-regression.js. No browser, media or wall clock needed. */
const assert = require('node:assert/strict');
const Auto = require('../src/auto-cue.js');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS '+name); }
  catch (error) { console.error('FAIL '+name); throw error; }
}
function items(times, offset = 0) { return times.map((time,i) => ({ index: offset+i, time })); }
function rig(times, offset = 0) {
  const live = Auto.createLive(items(times,offset));
  let seq = 0, now = 0, currentIndex = live.startIndex;
  function tick(refTime, changes = {}) {
    now += 200; seq++;
    const frame = { refTime, tempo: 1, confidence: .8, held: 0, jumps: 0, estimateVisible: true,
      now, sampledAt: now, seq, currentIndex, ...changes };
    const result = live.step(frame);
    if (result.index !== null) currentIndex = result.index;
    return result;
  }
  return { live, tick, get currentIndex() { return currentIndex; }, get now() { return now; }, get seq() { return seq; } };
}
function noCue(result, status) {
  assert.equal(result.index,null);
  if (status) assert.equal(result.status,status);
}

test('timeline uses every selected global index, accepts zero, copies values', () => {
  const markers = [{t:0},{t:4},{t:8},{t:11}];
  const t = Auto.timeline(markers,[1,3]);
  assert.deepEqual(t,{ok:true,reason:'',items:[{index:1,time:4},{index:3,time:11}],startIndex:0,endIndex:3});
  markers[1].t = 30;
  assert.equal(t.items[0].time,4);
  assert.equal(Auto.timeline([{t:0}]).ok,true);
});
test('timeline rejects a missing time anywhere, without silently dropping cues', () => {
  for (const bad of [undefined,null,NaN,Infinity,-1,'2']) {
    const t = Auto.timeline([{t:0},{t:bad},{t:4}]);
    assert.equal(t.ok,false);
    assert.deepEqual(t.items,[]);
    assert.equal(t.startIndex,null);
  }
});
test('timeline rejects empty, invalid, duplicate or reordered indices and decreasing time', () => {
  for (const selection of [[],[1],[0,0],[1,0],[-1],[.5]]) {
    const markers = selection[0]===1 && selection.length===2 ? [{t:0},{t:1}] : [{t:0}];
    assert.equal(Auto.timeline(markers,selection).ok,false);
  }
  assert.equal(Auto.timeline([{t:3},{t:2}]).ok,false);
  assert.equal(Auto.timeline(null).ok,false);
  assert.equal(Auto.timeline([{t:1},{t:1}]).ok,true);
});
test('Playback is media-time driven, handles intro, boundaries, seeks, and equal times', () => {
  const list = [{index:3,time:2},{index:5,time:4},{index:6,time:4},{index:9,time:8}];
  assert.equal(Auto.playbackIndex(list,0),2);
  assert.equal(Auto.playbackIndex(list,2),3);
  assert.equal(Auto.playbackIndex(list,3.999),3);
  assert.equal(Auto.playbackIndex(list,4),6);
  assert.equal(Auto.playbackIndex(list,200),9);
  assert.equal(Auto.playbackIndex(list,1),2);
  assert.equal(Auto.playbackIndex(list,NaN),null);
  assert.equal(Auto.playbackIndex([],0),null);
});
test('Live exposes immutable copied timeline and reset clears progress', () => {
  const list = items([0,2],5), live = Auto.createLive(list);
  list[0].time = 99;
  assert.equal(live.startIndex,4); assert.equal(live.items[0].time,0);
  assert.deepEqual(live.reset(),{index:null,status:'waiting',reason:'Waiting for the first cue.',currentIndex:4,nextIndex:5,nextTime:0});
  assert.ok(Object.isFrozen(live.items)); assert.ok(Object.isFrozen(live.items[0]));
  assert.deepEqual(Auto.LIMITS,{sampleAgeMs:500,confirmMs:200,heldSeconds:1.2});
  assert.ok(Object.isFrozen(Auto.LIMITS));
});
test('Live confirms a reached interval for200ms and emits each global index only once', () => {
  const r=rig([.4,1],7);
  noCue(r.tick(0),'waiting');noCue(r.tick(.2),'waiting');noCue(r.tick(.4));
  assert.equal(r.tick(.6).index,7);noCue(r.tick(.8));noCue(r.tick(1));
  const end=r.tick(1.2);assert.equal(end.index,8);assert.equal(end.status,'complete');
  noCue(r.tick(2),'complete');
});
test('Accurate tentative estimates at confidence.10–.25 can advance every later title', () => {
  const r=rig([1,2,3]);const emitted=[];
  for(let i=0;i<=34;i++) { const v=r.tick(i/10,{confidence:[.1,.15,.2,.25][i%4]});if(v.index!==null)emitted.push(v.index); }
  assert.deepEqual(emitted,[0,1,2]);
});
test('Zero confidence after known music remains eligible when the numeric estimate is displayed', () => {
  const r=rig([1]);noCue(r.tick(.9,{confidence:0}));noCue(r.tick(1,{confidence:0}));
  assert.equal(r.tick(1.1,{confidence:0}).index,0);
});
test('A waiting or unavailable HUD estimate cannot start or complete confirmation', () => {
  const r=rig([0]);for(let i=0;i<8;i++)noCue(r.tick(0,{confidence:0,estimateVisible:false}),'uncertain');
  noCue(r.tick(0));assert.equal(r.tick(0).index,0);
});
test('Live never reaches a future cue using wall time or tempo extrapolation', () => {
  const r=rig([10]);for(let i=0;i<100;i++)noCue(r.tick(9,{tempo:2}),'waiting');
});
test('Confirmation needs two fresh snapshots and the full200ms boundary', () => {
  const r=rig([0]);noCue(r.tick(0,{now:0,sampledAt:0}));
  noCue(r.tick(0,{now:199,sampledAt:199}));assert.equal(r.tick(0,{now:200,sampledAt:200}).index,0);
});
test('Timer repaints never advance but preserve a valid candidate until a fresh sample confirms it', () => {
  const r=rig([0]);noCue(r.tick(0,{now:0,sampledAt:0}));
  noCue(r.tick(0,{now:100,sampledAt:0,seq:r.seq}));
  assert.equal(r.tick(0,{now:200,sampledAt:200}).index,0);
});
test('Audio callbacks every200ms with100ms timer polls cannot starve confirmation', () => {
  const c=Auto.createLive(items([2]));let seq=0,cur=-1,st=null,emitted=[];
  for(let now=0;now<=1000;now+=100){
    if(now%200===0)st={refTime:2+now/1000,tempo:1,confidence:.1,held:0,jumps:0,estimateVisible:true,seq:++seq,sampledAt:now};
    const r=c.step({...st,now,currentIndex:cur});if(r.index!==null){cur=r.index;emitted.push({index:r.index,now});}
  }
  assert.deepEqual(emitted,[{index:0,now:200}]);
});
test('Duplicate stale, mismatched, hidden or quiet snapshots clear the candidate', () => {
  for(const change of [{sampledAt:1},{estimateVisible:false},{held:1.3},{jumps:1}]){
    const r=rig([0]);noCue(r.tick(0,{now:0,sampledAt:0}));
    noCue(r.tick(0,{now:100,sampledAt:0,seq:r.seq,...change}),'uncertain');
    noCue(r.tick(0,{now:200,sampledAt:200}));assert.equal(r.tick(0,{now:400,sampledAt:400}).index,0);
  }
  const r=rig([0]);noCue(r.tick(0,{now:0,sampledAt:0}));
  noCue(r.tick(0,{now:501,sampledAt:0,seq:r.seq}),'uncertain');
  noCue(r.tick(0,{now:600,sampledAt:600}));assert.equal(r.tick(0,{now:800,sampledAt:800}).index,0);
});
test('Invalid future sequence and timestamp cannot poison the next genuine audio sample', () => {
  const r=rig([0]);noCue(r.tick(0,{now:0,sampledAt:0}));
  noCue(r.tick(0,{now:100,sampledAt:9999,seq:9999}),'uncertain');
  noCue(r.tick(0,{now:200,sampledAt:200}));assert.equal(r.tick(0,{now:400,sampledAt:400}).index,0);
});
test('Stale, future-dated and repeated sample timestamps reset candidate dwell', () => {
  for(const change of [{now:1000,sampledAt:499},{now:1000,sampledAt:1001},{now:1000,sampledAt:200}]){
    const r=rig([0]);noCue(r.tick(0));noCue(r.tick(0,change),'uncertain');
    noCue(r.tick(0,{now:1200,sampledAt:1200}));assert.equal(r.tick(0,{now:1400,sampledAt:1400}).index,0);
  }
});
test('A sample exactly500ms old is valid and confirmation uses audio timestamps', () => {
  const r=rig([0]);noCue(r.tick(0,{now:1000,sampledAt:500}));
  assert.equal(r.tick(0,{now:1200,sampledAt:700}).index,0);
});
test('A long audio-snapshot gap starts a new confirmation interval', () => {
  const r=rig([0]);noCue(r.tick(0));noCue(r.tick(0,{now:3000,sampledAt:3000}));
  assert.equal(r.tick(0,{now:3200,sampledAt:3200}).index,0);
});
test('Quiet beyond1.2s freezes eligibility but recovers automatically after fresh evidence', () => {
  const r=rig([0]);noCue(r.tick(0));noCue(r.tick(0,{held:1.201}),'uncertain');
  noCue(r.tick(0,{held:0}));assert.equal(r.tick(0,{held:0}).index,0);
  const s=rig([0]);noCue(s.tick(0,{held:1.2,confidence:.1}));assert.equal(s.tick(0,{held:1.2,confidence:.1}).index,0);
});
test('Invalid fields fail closed, clear dwell and allow a later valid estimate to recover', () => {
  for(const change of [{refTime:NaN},{refTime:-1},{tempo:0},{tempo:Infinity},{confidence:NaN},{confidence:1.01},
    {held:-1},{held:NaN},{jumps:NaN},{jumps:-1},{seq:NaN},{seq:.5},{now:NaN},{sampledAt:NaN}]){
    const r=rig([0]);noCue(r.tick(0));noCue(r.tick(0,change),'uncertain');
    noCue(r.tick(0));assert.equal(r.tick(0).index,0);
  }
  const r=rig([0]);noCue(r.tick(0));noCue(r.tick(0,{now:100,sampledAt:100}),'uncertain');
});
test('Malformed calls do not throw or permanently stop a valid scheduler', () => {
  const r=rig([0]);for(const frame of [undefined,null,1,'sample',{}, {currentIndex:NaN}])noCue(r.live.step(frame),'uncertain');
  noCue(r.tick(0));assert.equal(r.tick(0).index,0);
});
test('A manual current-index change prevents controller advancement', () => {
  const r=rig([0,1]);noCue(r.tick(0,{currentIndex:4}),'uncertain');noCue(r.tick(0,{currentIndex:4}),'uncertain');
  assert.equal(r.live.reset().currentIndex,-1);noCue(r.tick(0));assert.equal(r.tick(0).index,0);
});
test('Reference relocation resets dwell and then automatically accepts the stable due interval', () => {
  const r=rig([1]);noCue(r.tick(1));noCue(r.tick(1.1,{jumps:1}));
  assert.equal(r.tick(1.2,{jumps:1,confidence:.1}).index,0);
});
test('Jitter between candidate intervals cannot flash an intermediate or future title', () => {
  const r=rig([1,2,3]);for(const time of [1.9,2.01,1.99,2.02,1.98,2.01])noCue(r.tick(time));
  const stable=r.tick(2.1);assert.equal(stable.index,1);assert.equal(r.currentIndex,1);
});
test('Catch-up confirms the last due title and dispatches it once without intermediate flashes', () => {
  const r=rig([1,2,3,10],6);noCue(r.tick(3.5,{confidence:.1}));
  const reached=r.tick(3.6,{confidence:.1});assert.equal(reached.index,8);assert.equal(reached.nextIndex,9);
  noCue(r.tick(3.7));noCue(r.tick(4));assert.equal(r.currentIndex,8);
});
test('Backwards estimates never rewind a displayed title and do not permanently disable recovery', () => {
  const r=rig([1,2,3]);noCue(r.tick(2.1));assert.equal(r.tick(2.2).index,1);
  for(const time of [1.5,.2,1.8,2.5])noCue(r.tick(time));
  noCue(r.tick(3.0));assert.equal(r.tick(3.1).index,2);
});
test('Late estimates have no hidden timeout and recover after stable visible evidence', () => {
  const r=rig([1,10]);for(let i=0;i<20;i++)noCue(r.tick(5,{estimateVisible:false}),'uncertain');
  noCue(r.tick(5,{confidence:.1}));assert.equal(r.tick(5.1,{confidence:.1}).index,0);
});
test('Equal-time cues resolve to the final due title without intermediate flashes', () => {
  const r=rig([1,1,2]);noCue(r.tick(1));assert.equal(r.tick(1).index,1);
  noCue(r.tick(2));assert.equal(r.tick(2).index,2);
});
test('Pause clears only confirmation, preserving current title and remaining timeline', () => {
  const r=rig([1,2]);noCue(r.tick(1));assert.equal(r.tick(1.1).index,0);
  noCue(r.tick(2));r.live.pause();noCue(r.tick(2.1));assert.equal(r.tick(2.2).index,1);
});
test('Selected groups retain global indices and cannot dispatch a title outside their own timeline', () => {
  const r=rig([0,.4],10);noCue(r.tick(10));const end=r.tick(10.1);assert.equal(end.index,11);assert.equal(end.status,'complete');
  noCue(r.tick(100),'complete');assert.equal(r.currentIndex,11);
});
test('Invalid direct timelines never emit a cue', () => {
  for(const list of [[],null,[{index:0,time:NaN}],[{index:2,time:2},{index:1,time:3}]]){
    const live=Auto.createLive(list);noCue(live.step({}),'uncertain');assert.equal(live.startIndex,null);
  }
});
console.log(`Auto cue: ${passed} cases passed.`);
