// Presentation tests only: no microphone, user project, media playback or timing edits.
// Run: node --test tests/follow-display-regression.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Display = require('../src/follow-display');
const source = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start); return source.slice(a, b);
}

function fixture() {
  const display = Display.create();
  const reference = { name: 'Reference', feat: new Uint8Array([1, 2, 3]) };
  const cue = { page: 1, x: .2, y: .3, t: 20 };
  const context = { reference, cue, nextTime: cue.t, previousTime: 10, anchor: 0, anchored: false };
  const frame = (changes = {}) => ({ refTime: 10, tempo: 1, confidence: .5, held: 0, loud: -25, jumps: 0, ...changes });
  const send = (changes = {}, now = 0, options = {}) => display.update({ ...context, state: frame(changes), now, ...options });
  const establish = (now = 0) => { send({}, now); return send({}, now + 800); };
  return { display, reference, cue, context, frame, send, establish };
}

test('a new session keeps an empty numeric slot until music evidence arrives', () => {
  const h = fixture();
  for (const now of [0, 200, 1400]) {
    const result = h.send({ confidence: 0, loud: -120 }, now);
    assert.equal(result.status, 'waiting'); assert.equal(result.seconds, null); assert.equal(result.warning, true);
  }
  const result = h.send({ confidence: 0, loud: -40 }, 1600);
  assert.equal(result.status, 'tentative'); assert.equal(result.seconds, 10); assert.equal(result.warning, true);
});

test('an explicit operator anchor can show an estimate before new audio', () => {
  const h = fixture();
  const result = h.send({ refTime: 12, confidence: 0, loud: -120 }, 0, { anchored: true });
  assert.equal(result.status, 'tentative'); assert.equal(result.seconds, 8); assert.equal(result.warning, true);
});

test('heard music keeps numeric estimates visible even at zero confidence', () => {
  const h = fixture(); h.send({ confidence: .05 }, 0);
  for (const [i, confidence] of [0, .01, .15, .29, .31, .28, .01, 0].entries()) {
    const refTime = 11 + i / 2, result = h.send({ refTime, confidence }, 100 + i * 200);
    assert.equal(result.seconds, 20 - refTime); assert.equal(result.status, 'tentative'); assert.equal(result.warning, true);
  }
});

test('warning clears only after 800 ms of uninterrupted strong reference match', () => {
  const h = fixture();
  for (const now of [0, 200, 400, 799]) assert.equal(h.send({ confidence: .35 }, now).warning, true);
  const clear = h.send({ confidence: .35 }, 800);
  assert.equal(clear.status, 'tracking'); assert.equal(clear.warning, false); assert.equal(clear.seconds, 10);
});

test('confidence hysteresis changes the warning without removing the number', () => {
  const h = fixture(); assert.equal(h.establish().warning, false);
  for (const confidence of [.34, .30]) assert.equal(h.send({ confidence }, 1000).warning, false);
  const weak = h.send({ confidence: .299999 }, 1100);
  assert.equal(weak.warning, true); assert.equal(weak.seconds, 10);
  assert.equal(h.send({ confidence: .34 }, 3000).warning, true);
  assert.equal(h.send({ confidence: .35 }, 3200).warning, true);
  assert.equal(h.send({ confidence: .35 }, 3999).warning, true);
  assert.equal(h.send({ confidence: .35 }, 4000).warning, false);
});

test('a dip below the recovery threshold restarts the full warning-clear interval', () => {
  const h = fixture(); h.send({ confidence: .4 }, 0); h.send({ confidence: .4 }, 799);
  h.send({ confidence: .349 }, 800);
  assert.equal(h.send({ confidence: .4 }, 900).warning, true);
  assert.equal(h.send({ confidence: .4 }, 1699).warning, true);
  assert.equal(h.send({ confidence: .4 }, 1700).warning, false);
});

test('timer repaints cannot turn an unchanged audio snapshot into a confirmed match', () => {
  const h = fixture(), state = h.frame({ confidence: .5 });
  const update = now => h.display.update({ ...h.context, state, now });
  assert.equal(update(0).warning, true); assert.equal(update(800).warning, true);
  const paused = update(1201);
  assert.equal(paused.status, 'paused'); assert.equal(paused.warning, true); assert.equal(paused.seconds, 10);
  assert.equal(h.send({}, 1300).warning, true);
  assert.equal(h.send({}, 2099).warning, true);
  assert.equal(h.send({}, 2100).warning, false);
});

test('a fresh snapshot after an unobserved audio gap cannot inherit old match confirmation', () => {
  const h = fixture(); h.send({}, 0);
  assert.equal(h.send({ refTime: 15 }, 2000).warning, true);
  assert.equal(h.send({ refTime: 15.5 }, 2799).warning, true);
  assert.equal(h.send({ refTime: 16 }, 2800).warning, false);
  // The same rule applies when the old state had already qualified.
  assert.equal(h.send({ refTime: 17 }, 5000).warning, true);
  assert.equal(h.send({ refTime: 17.5 }, 5799).warning, true);
  assert.equal(h.send({ refTime: 18 }, 5800).warning, false);
});

test('quiet audio freezes the last number and progress instead of extrapolating', () => {
  const h = fixture(); h.send({ refTime: 14 }, 0); const before = h.send({ refTime: 15 }, 800);
  const paused = h.send({ refTime: 19, held: 1.201, confidence: .1 }, 1000);
  assert.equal(paused.status, 'paused'); assert.equal(paused.warning, true);
  assert.equal(paused.seconds, before.seconds); assert.equal(paused.progress, before.progress);
  const later = h.send({ refTime: 19, held: 5, confidence: 0 }, 5000);
  assert.equal(later.seconds, before.seconds); assert.equal(later.progress, before.progress);
});

test('resuming from quiet starts a new warning-clear interval', () => {
  const h = fixture(); h.establish(); h.send({ held: 2 }, 1000);
  assert.equal(h.send({ refTime: 16 }, 2000).warning, true);
  assert.equal(h.send({ refTime: 16.5 }, 2799).warning, true);
  assert.equal(h.send({ refTime: 17 }, 2800).warning, false);
});

test('reference, next cue, operator anchor and relocation reset match confirmation', () => {
  for (const change of [
    { reference: { name: 'Another reference' } },
    { cue: { page: 2, t: 30 }, nextTime: 30 },
    { anchor: 1 },
    { jumps: 1 },
  ]) {
    const h = fixture(); h.establish();
    const { jumps, ...context } = change;
    const frame = jumps === undefined ? {} : { jumps };
    const result = h.send(frame, 1000, context);
    assert.equal(result.warning, true); assert.equal(result.status, 'tentative');
    assert.equal(result.seconds, (change.nextTime || 20) - 10);
    assert.equal(h.send(frame, 1799, context).warning, true);
    assert.equal(h.send(frame, 1800, context).warning, false);
  }
});

test('a new session or reference cannot reuse the previous session\'s heard-music flag', () => {
  const h = fixture(); h.establish(); h.display.reset();
  assert.equal(h.send({ confidence: 0, loud: -120 }, 1000).status, 'waiting');
  h.establish(2000);
  const switched = h.send({ confidence: 0, loud: -120 }, 3000, { reference: {} });
  assert.equal(switched.status, 'waiting'); assert.equal(switched.seconds, null);
});

test('changing a cue time on the same cue object resets confirmation and recalculates its estimate', () => {
  const h = fixture(); h.establish();
  const changed = h.send({}, 1000, { nextTime: 30 });
  assert.equal(changed.status, 'tentative'); assert.equal(changed.seconds, 20);
  assert.equal(h.send({}, 1799, { nextTime: 30 }).warning, true);
  assert.equal(h.send({}, 1800, { nextTime: 30 }).warning, false);
});

test('continuous Auto cue changes preserve a qualified unchanged matcher while updating the number', () => {
  const h = fixture(); h.establish();
  const next = h.send({ refTime: 21 }, 1000, { cue: { t: 30 }, nextTime: 30, previousTime: 20, continuous: true });
  assert.equal(next.status, 'tracking'); assert.equal(next.warning, false); assert.equal(next.seconds, 9); assert.equal(next.progress, 10);
});

test('continuous Auto still resets qualification after an anchor, reference change or relocation', () => {
  for (const change of [{ anchor: 1 }, { reference: {} }, { jumps: 1 }]) {
    const h = fixture(); h.establish(); const { jumps, ...context } = change;
    const result = h.send(jumps === undefined ? {} : { jumps }, 1000, { ...context, continuous: true });
    assert.equal(result.status, 'tentative'); assert.equal(result.warning, true);
  }
});

test('invalid timing or audio state yields a stable unavailable placeholder', () => {
  for (const changes of [
    { nextTime: NaN }, { nextTime: Infinity }, { state: null }, { now: NaN },
    ...[{ tempo: 0 }, { tempo: -1 }, { tempo: NaN }, { refTime: Infinity }, { confidence: NaN }, { held: NaN }]
      .map(change => ({ state: fixture().frame(change) })),
  ]) {
    const h = fixture(); h.establish();
    const result = h.send({}, 1000, changes);
    assert.equal(result.status, 'unavailable'); assert.equal(result.seconds, null); assert.equal(result.warning, true);
  }
});

test('a missing reference or cue cannot produce an apparently valid estimate', () => {
  for (const changes of [{ reference: null }, { reference: undefined }, { cue: null }, { cue: undefined }]) {
    const h = fixture(), result = h.send({}, 0, changes);
    assert.equal(result.status, 'unavailable'); assert.equal(result.seconds, null); assert.equal(result.warning, true);
  }
});

test('an invalid snapshot cannot preserve old readiness when a fresh initial state returns', () => {
  const h = fixture(); h.establish();
  assert.equal(h.send({ refTime: NaN }, 1000).status, 'unavailable');
  const initial = h.send({ confidence: 0, loud: -120, refTime: 0 }, 1200);
  assert.equal(initial.status, 'waiting'); assert.equal(initial.seconds, null);
});

test('tempo scales seconds and progress stays bounded before and after the cue', () => {
  const h = fixture();
  const midway = h.send({ refTime: 15, tempo: 2 }, 0);
  assert.equal(midway.seconds, 2.5); assert.equal(midway.progress, 50);
  const before = h.send({ refTime: 5 }, 200); assert.equal(before.progress, 0); assert.equal(before.seconds, 15);
  const after = h.send({ refTime: 25 }, 400); assert.equal(after.progress, 100); assert.equal(after.seconds, 0);
});

test('display updates do not edit the reference bytes or saved cue timing', () => {
  const h = fixture(), originalCue = JSON.stringify(h.cue), originalBytes = Array.from(h.reference.feat);
  h.establish(); h.send({ refTime: 15, confidence: .01 }, 1000); h.send({ held: 2 }, 1200);
  assert.equal(JSON.stringify(h.cue), originalCue); assert.deepEqual(Array.from(h.reference.feat), originalBytes);
});

function renderer() {
  let now = 0;
  const nodes = { '#followBar': { hidden: true, className: '' }, '#fbText': { innerHTML: '' }, '#fbFill': { style: {} } };
  const part = { id: 'a', name: 'Act I.pdf' }, other = { id: 'b', name: 'Act II.pdf' };
  const frame = (changes = {}) => ({ refTime: 10, tempo: 1, confidence: .5, held: 0, loud: -25, jumps: 0, ...changes });
  const c = vm.createContext({
    STCFollowDisplay: Display, Math, Number, performance: { now: () => now },
    state: { markers: [{ page: 1, t: 10 }, { page: 1, t: 20 }] }, cur: 0,
    follow: { part: part.id, f: {}, st: frame(), anchor: 0, anchored: true },
    refRuns: { a: {}, b: {} }, partsList: () => [part, other], sectionTitle: p => p.name,
    esc: s => s, $: selector => nodes[selector],
  });
  c.cuePart = i => c.state.markers[i] ? c.state.markers[i].page === 1 ? part : other : null;
  vm.runInContext(between('function paintFollow(){', 'function updateFollowBtn(){'), c);
  vm.runInContext(between('function followCue(i){', 'async function startFollow('), c);
  return { c, nodes, frame, paint(changes = {}, time = 0) { now = time; c.follow.st = frame(changes); c.paintFollow(); return nodes['#fbText'].innerHTML; } };
}

test('actual Follow renderer keeps weak-match digits beside the warning', () => {
  const h = renderer();
  for (const [i, confidence] of [.2, .05, 0, .29, .31, .28].entries()) {
    const html = h.paint({ refTime: 15, confidence }, i * 200);
    assert.match(html, /class="fbestimate"/); assert.match(html, /~5\.0 s/);
    assert.match(html, /class="fbflag"/); assert.match(html, /Reference match uncertain/);
    assert.equal(h.nodes['#followBar'].hidden, false);
    assert.equal(h.nodes['#followBar'].className, 'followbar tentative');
  }
});

test('weak near-cue and overdue estimates retain digits with neutral styling', () => {
  const h = renderer();
  for (const [refTime, expected] of [[18, '~2.0 s'], [19.8, '~0.2 s'], [21, '~0.0 s']]) {
    const html = h.paint({ refTime, confidence: .1 }, refTime * 100);
    assert.ok(html.includes(expected)); assert.doesNotMatch(html, /reached/);
    assert.equal(h.nodes['#followBar'].className, 'followbar tentative');
  }
});

test('orange near-cue styling appears only after the strong match qualifies', () => {
  const h = renderer(); h.paint({ refTime: 18 }, 0);
  assert.equal(h.nodes['#followBar'].className, 'followbar tentative');
  h.paint({ refTime: 18 }, 800); assert.equal(h.nodes['#followBar'].className, 'followbar soon');
  h.paint({ refTime: 18, confidence: .2 }, 1000); assert.equal(h.nodes['#followBar'].className, 'followbar tentative');
  h.paint({ refTime: 18, confidence: .5 }, 1200); assert.equal(h.nodes['#followBar'].className, 'followbar tentative');
  h.paint({ refTime: 18, confidence: .5 }, 2000); assert.equal(h.nodes['#followBar'].className, 'followbar soon');
});

test('actual paused Follow UI keeps its last number while showing the pause reason', () => {
  const h = renderer(); h.paint({ refTime: 15 }, 0);
  const html = h.paint({ refTime: 19, confidence: .1, held: 2 }, 2000);
  assert.match(html, /~5\.0 s/); assert.match(html, /Paused/); assert.match(html, /Audio quiet or unclear/);
  assert.equal(h.nodes['#followBar'].className, 'followbar paused');
});

test('actual pre-signal and invalid-state UI retains a stable numeric placeholder', () => {
  const h = renderer(); h.c.follow.anchored = false;
  const waiting = h.paint({ refTime: 0, confidence: 0, loud: -120 }, 0);
  assert.match(waiting, /— s/); assert.match(waiting, /Waiting for music/);
  const invalid = h.paint({ refTime: NaN }, 200);
  assert.match(invalid, /— s/); assert.match(invalid, /Position unavailable/);
});

test('manual cue anchoring refreshes the displayed engine position immediately', () => {
  const h = renderer(); h.c.state.markers = [{ page: 1, t: 10 }, { page: 1, t: 20 }];
  let position = 0;
  h.c.follow.st = h.frame({ refTime: 0 });
  h.c.follow.f = { anchor(time) { position = time; }, state: () => h.frame({ refTime: position }) };
  h.c.followCue(0);
  assert.equal(h.c.follow.st.refTime, 10); assert.equal(h.c.follow.anchor, 1); assert.equal(h.c.follow.anchored, true);
  h.c.paintFollow(); assert.match(h.nodes['#fbText'].innerHTML, /~10 s/);
  assert.deepEqual(Array.from(h.c.state.markers, marker => marker.t), [10, 20]);
});

test('changing PDF through an untimed cue cannot carry the old PDF\'s anchor evidence', () => {
  const h = renderer();
  h.c.state.markers = [{ page: 2 }, { page: 2, t: 20 }];
  h.c.followerFor = () => ({ state: () => h.frame({ refTime: 0, confidence: 0, loud: -120 }), anchor() {} });
  h.c.followCue(0); h.c.paintFollow();
  assert.match(h.nodes['#fbText'].innerHTML, /— s/); assert.match(h.nodes['#fbText'].innerHTML, /Waiting for music/);
});
