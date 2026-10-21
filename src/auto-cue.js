// Experimental scheduling only. This helper neither plays audio nor anchors Follow.
const STCAutoCue = (() => {
  const LIMITS = Object.freeze({ sampleAgeMs: 500, confirmMs: 200, heldSeconds: 1.2 });
  const finite = Number.isFinite;

  function checkedItems(items) {
    if (!Array.isArray(items) || !items.length) return 'There are no cues in this selection.';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || !Number.isInteger(item.index) || item.index < 0) return 'A cue has an invalid slide index.';
      if (!finite(item.time) || item.time < 0) return 'Every cue needs a finite, nonnegative reference time.';
      if (i && item.index <= items[i-1].index) return 'Cue indices must follow slide order without duplicates.';
      if (i && item.time < items[i-1].time) return 'Cue reference times must not go backwards.';
    }
    return '';
  }

  function timeline(markers, indices) {
    const fail = reason => ({ ok: false, reason, items: [], startIndex: null, endIndex: null });
    if (!Array.isArray(markers)) return fail('There are no slides to cue.');
    if (indices === undefined) indices = markers.map((_, index) => index);
    if (!Array.isArray(indices) || !indices.length) return fail('There are no cues in this selection.');
    const items = [];
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= markers.length || !markers[index]) {
        return fail('A selected cue does not exist.');
      }
      items.push({ index, time: markers[index].t });
    }
    const reason = checkedItems(items);
    if (reason) return fail(reason);
    return { ok: true, reason: '', items, startIndex: items[0].index-1, endIndex: items[items.length-1].index };
  }

  // Media time is the sole clock. Seeking backwards is deliberately supported.
  // With equal cue times the final cue is visible, matching "last due" semantics.
  function playbackIndex(items, seconds) {
    if (checkedItems(items) || !finite(seconds)) return null;
    let lo = 0, hi = items.length;
    while (lo < hi) {
      const mid = (lo+hi) >>> 1;
      if (items[mid].time <= seconds) lo = mid+1;
      else hi = mid;
    }
    return lo ? items[lo-1].index : items[0].index-1;
  }

  function createLive(sourceItems) {
    const invalid = checkedItems(sourceItems);
    const items = invalid ? [] : sourceItems.map(item => Object.freeze({ index: item.index, time: item.time }));
    Object.freeze(items);
    const startIndex = items.length ? items[0].index-1 : null;
    let cursor, currentIndex, lastSeq, lastNow, lastSampleAt, lastJumps, candidate, candidateSince;
    function result(status, reason, index = null) {
      const next = items[cursor];
      return { index, status, reason, currentIndex, nextIndex: next ? next.index : null,
        nextTime: next ? next.time : null };
    }
    function pause() { candidate = null; candidateSince = null; }
    function reset() {
      cursor = 0; currentIndex = startIndex; lastSeq = -1; lastNow = null;
      lastSampleAt = null; lastJumps = null; pause();
      return result(invalid ? 'uncertain' : 'waiting', invalid || 'Waiting for the first cue.');
    }
    function hold(reason) { pause(); return result('uncertain', reason); }
    reset();

    // Follow's displayed estimate is the automation clock. Confidence remains a
    // visible warning, not a second hidden permission gate. Only fresh, valid,
    // non-paused estimates can establish a stable last-due title interval.
    function step(frame = {}) {
      if (invalid) return result('uncertain', invalid);
      if (!frame || typeof frame !== 'object' || !Number.isInteger(frame.currentIndex)) {
        return hold('The displayed cue state is invalid.');
      }
      if (frame.currentIndex !== currentIndex) return hold('The displayed cue changed. Take over manually.');
      if (cursor === items.length) return result('complete', 'The last cue has been displayed.');
      const { refTime, tempo, confidence, held, jumps, estimateVisible, now, seq, sampledAt } = frame;
      if (!finite(now) || now < 0 || (lastNow !== null && now < lastNow)) {
        return hold('The sample clock is invalid.');
      }
      lastNow = now;
      if (!Number.isSafeInteger(seq) || seq < 0 || seq < lastSeq) {
        return hold('The audio sample sequence is invalid.');
      }
      if (!finite(sampledAt) || sampledAt < 0 || sampledAt > now || now-sampledAt > LIMITS.sampleAgeMs) {
        return hold('The audio sample is stale or has an invalid timestamp.');
      }
      if (!finite(refTime) || refTime < 0 || !finite(tempo) || tempo <= 0 ||
          !finite(confidence) || confidence < 0 || confidence > 1 || !finite(held) || held < 0 ||
          !Number.isSafeInteger(jumps) || jumps < 0) {
        return hold('The audio estimate is invalid.');
      }
      if (seq === lastSeq) {
        if (sampledAt !== lastSampleAt || jumps !== lastJumps || !estimateVisible || held > LIMITS.heldSeconds) {
          return hold('Waiting for a fresh displayed estimate.');
        }
        // Timer repaints cannot advance. Preserve an otherwise valid candidate
        // so polling faster than microphone callbacks cannot starve confirmation.
        return result(cursor ? 'tracking' : 'waiting', 'Waiting for a new audio sample.');
      }
      if (lastSampleAt !== null && sampledAt <= lastSampleAt) {
        return hold('The audio sample timestamp did not advance.');
      }
      const gap = lastSampleAt !== null && sampledAt-lastSampleAt > LIMITS.sampleAgeMs;
      const relocated = lastJumps !== null && jumps !== lastJumps;
      lastSeq = seq; lastSampleAt = sampledAt; lastJumps = jumps;
      if (gap || relocated) pause();
      if (!estimateVisible || held > LIMITS.heldSeconds) {
        return hold(held > LIMITS.heldSeconds ? 'Audio is quiet or unclear.' : 'Waiting for a displayed estimate.');
      }
      // Resolve the last title actually due. A temporary backwards estimate
      // never rewinds the visible title. Catch-up emits one final title only.
      const index = playbackIndex(items, refTime);
      if (index === null || index <= currentIndex) {
        pause();
        return result(cursor ? 'tracking' : 'waiting', 'Tracking the next cue.');
      }
      if (candidate !== index) { candidate = index; candidateSince = sampledAt; }
      if (sampledAt-candidateSince < LIMITS.confirmMs) {
        return result('tracking', 'Confirming the displayed estimate.');
      }
      cursor = items.findIndex(item => item.index === index)+1;
      currentIndex = index; pause();
      return result(cursor === items.length ? 'complete' : 'tracking', 'Cue reached.', index);
    }
    return { items, startIndex, step, reset, pause };
  }
  return { timeline, playbackIndex, createLive, LIMITS };
})();
if (typeof module !== 'undefined') module.exports = STCAutoCue;
