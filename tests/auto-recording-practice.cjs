// Read-only accelerated Auto recording check against explicitly supplied files.
// electron tests/auto-recording-practice.cjs --project=/path/file.supertitles --audio=/path/file.m4a [--rate=4] [--qa=/tmp/output]
// The installed app, original files and frozen HTML are never written.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const arg = key => process.argv.find(value => value.startsWith('--' + key + '='))?.slice(key.length + 3);
const project = arg('project'), audio = arg('audio');
if (!project || !audio) throw new Error('Pass explicit --project and --audio read-only inputs.');
const expectedCues=Number(arg('expected-cues')||12);assert.ok(Number.isInteger(expectedCues)&&expectedCues>0);
const rate = Number(arg('rate') || 4); assert.ok(Number.isFinite(rate) && rate >= 1 && rate <= 8);
const root = path.resolve(__dirname, '..'), html = path.join(root, 'dist/Supertitle_Cuer.html');
const qa = arg('qa') || fs.mkdtempSync(path.join(os.tmpdir(), 'stq-actual-auto-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stq-actual-auto-profile-'));
fs.mkdirSync(qa, { recursive: true });
for (const key of ['userData', 'sessionData', 'documents', 'crashDumps']) { const folder = path.join(profile, key); fs.mkdirSync(folder); app.setPath(key, folder); }
app.setAppLogsPath(path.join(profile, 'logs')); app.commandLine.appendSwitch('disable-background-networking');
const digest = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const before = { project: digest(project), audio: digest(audio), html: digest(html) };
const inputs = { project: fs.readFileSync(project).toString('base64'), audio: fs.readFileSync(audio).toString('base64') };
let win; const errors = [], started = Date.now();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function js(code) {
  const result = await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(error){return {__error:String(error.stack||error)}}})()`, true);
  if (result?.__error) throw new Error(result.__error); return result;
}
async function until(code, label, timeout = 12000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await js(`return !!(${code});`)) return; await pause(35); } throw new Error('Timeout: ' + label); }
async function shot(name) { await js('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));'); fs.writeFileSync(path.join(qa, name + '.png'), (await win.capturePage()).toPNG()); }
const watchdog = setTimeout(() => { console.error('Actual recording test exceeded 58 seconds'); app.exit(1); }, 58000);
(async () => {
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_, __, done) => done(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  await win.loadFile(html);
  await js(`await idbGet('doc');await idbGet('follow');await idbGet('score');window.confirm=()=>true;
    window.showSaveFilePicker=async()=>{throw new Error('Unexpected save request in read-only test');};
    await openAny(new File([STCSlideTransfer.bytes(${JSON.stringify(inputs.project)})],${JSON.stringify(path.basename(project))}),null);
    window.__audio=new File([STCSlideTransfer.bytes(${JSON.stringify(inputs.audio)})],${JSON.stringify(path.basename(audio))},{type:'audio/mp4'});
    window.__part=partsList()[0];window.__reference=refRuns[window.__part.id];
    window.__savedMarkers=JSON.stringify(state.markers);window.__savedReference=JSON.stringify(refMeta(window.__reference));
    window.__feature=Array.from(window.__reference.feat).join(',');
    document.getElementById('autoAudio').click=()=>{};
    window.__events=[];const original=autoGoTo;autoGoTo=function(index,scroll=true){
      const event={index,mediaTime:autoRun?.media?.currentTime??null,assignedTime:state.markers[index]?.t??null,elapsedMs:performance.now()};
      original(index,scroll);event.visibleIndex=cur;window.__events.push(event);
    };`);
  const loaded = await js(`const identity=await STCRecordingReference.fileIdentity(window.__audio);return {pages:pdfDoc.numPages,parts:partsList().length,cues:state.markers.length,slides:state.slides.length,times:state.markers.map(m=>m.t),savedIdentity:window.__reference.fileId,computedIdentity:identity,source:window.__reference.source,duration:window.__reference.duration};`);
  assert.ok(loaded.pages > 0); assert.equal(loaded.parts, 1); assert.equal(loaded.cues, expectedCues); assert.equal(loaded.slides, expectedCues);
  assert.ok(loaded.times.every(Number.isFinite)); assert.equal(loaded.source, 'file'); assert.equal(loaded.computedIdentity, loaded.savedIdentity);
  await shot('loaded-read-only-project');
  await js('await startAutoRecording();await useAutoRecordingFile(window.__audio);');
  await until('autoRun?.kind==="recording"&&!autoRun.loading&&!autoRun.media.paused', 'verified AAC playback');
  const launch = await js(`autoRun.media.playbackRate=${rate};autoRun.media.pause();return {currentIndex:cur,currentTime:autoRun.media.currentTime,duration:autoRun.media.duration,playbackRate:autoRun.media.playbackRate,runActive:!!run};`);
  assert.equal(launch.currentIndex, 0); assert.equal(launch.runActive, false); assert.equal(launch.playbackRate, rate);
  assert.ok(Math.abs(launch.duration - loaded.duration) < 1); await shot('immediate-first-title');
  await js('await autoRun.media.play();');
  while (await js('return !!autoRun;')) {
    // Capture only before/after the timed pass: PNG encoding can delay UI timers.
    await pause(35);
  }
  const result = await js(`return {events:window.__events,currentIndex:cur,parts:partsList().length,
    markersUnchanged:JSON.stringify(state.markers)===window.__savedMarkers,
    referenceObjectUnchanged:refRuns[window.__part.id]===window.__reference,
    referenceMetadataUnchanged:JSON.stringify(refMeta(refRuns[window.__part.id]))===window.__savedReference,
    referenceBytesUnchanged:Array.from(refRuns[window.__part.id].feat).join(',')===window.__feature,
    noTimingRun:!run&&!stoppingRun,noPendingAuto:!autoPending&&!autoPreparing};`);
  assert.deepEqual(result.events.map(event => event.index), Array.from({ length: expectedCues }, (_, i) => i));
  assert.ok(result.events.every(event => event.visibleIndex === event.index)); assert.equal(result.currentIndex, expectedCues-1);
  const tolerance = rate * .12 + .10;
  for (const event of result.events.slice(1)) {
    assert.ok(event.mediaTime >= event.assignedTime - .025, 'no early scheduled title: ' + JSON.stringify(event));
    assert.ok(event.mediaTime - event.assignedTime <= tolerance, 'scheduler timing tolerance: ' + JSON.stringify(event));
  }
  for (const key of ['markersUnchanged', 'referenceObjectUnchanged', 'referenceMetadataUnchanged', 'referenceBytesUnchanged', 'noTimingRun', 'noPendingAuto']) assert.equal(result[key], true, key);
  await pause(160); assert.equal(await js('return cur;'), expectedCues-1); await shot('complete-at-last-title');
  const after = { project: digest(project), audio: digest(audio), html: digest(html) }; assert.deepEqual(after, before); assert.deepEqual(errors, []);
  const report = { source: root, project, audio, qa, loaded, launch, ...result, schedulerToleranceReferenceSeconds: tolerance,
    timingErrorsReferenceSeconds: result.events.slice(1).map(event => event.mediaTime - event.assignedTime),
    sha256Before: before, sha256After: after, originalFilesUnchanged: true, errors, elapsedWallSeconds: (Date.now() - started) / 1000,
    limitations: ['Playback is accelerated and muted.', 'No hardware microphone or Windows runtime.', 'The source project contains one section; separate mixed-section boundaries are covered by auto-ui-regression.cjs.'] };
  fs.writeFileSync(path.join(qa, 'actual-recording-report.json'), JSON.stringify(report, null, 2));
  console.log('PASS actual saved PDF project, matching recording identity/decoded metadata, all '+expectedCues+' Auto titles, first-title override, final boundary and unchanged originals.');
  console.log(JSON.stringify({ titles: result.events.length, playbackRate: rate, elapsedWallSeconds: report.elapsedWallSeconds, maxReferenceTimingError: Math.max(...report.timingErrorsReferenceSeconds), qa }));
  clearTimeout(watchdog); win.destroy(); app.exit(0);
})().catch(async error => { console.error(error.stack); try { const snapshot=await js('return {events:window.__events,currentIndex:cur};');fs.writeFileSync(path.join(qa, 'failure.json'), JSON.stringify({ error: String(error.stack), errors, snapshot, sha256Before: before, sha256After: { project: digest(project), audio: digest(audio), html: digest(html) } }, null, 2)); await shot('failure'); } catch (_) {} clearTimeout(watchdog); app.exit(1); });
