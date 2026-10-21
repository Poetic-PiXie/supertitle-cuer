// Presentation state only. The audio matcher and saved cue times are unchanged.
// Weak matches keep their estimate on screen, accompanied by a steady warning.
const STCFollowDisplay = (() => {
  function create() {
    let context, previousState, lastFrameAt, ready, warning, clearSince, seconds, progress;
    function reset() {
      context = null; previousState = null; lastFrameAt = null; ready = false;
      warning = true; clearSince = null; seconds = null; progress = 0;
    }
    reset();
    function update({ state: st, reference, cue, anchor = 0, nextTime, previousTime = 0, anchored = false, continuous = false, now }) {
      const jumps = st && st.jumps;
      if (!context || context.reference !== reference || context.cue !== cue || context.anchor !== anchor || context.jumps !== jumps || context.nextTime !== nextTime) {
        const samePath=continuous && context && context.reference===reference && context.anchor===anchor && context.jumps===jumps;
        if(samePath){ seconds=null; progress=0; } else reset();
        context = { reference, cue, anchor, jumps, nextTime };
      }
      const fresh = !!st && st !== previousState;
      if (lastFrameAt !== null && now - lastFrameAt > 1200) { warning = true; clearSince = null; }
      if (fresh) { previousState = st; lastFrameAt = now; }
      const valid = reference && cue && st && Number.isFinite(st.refTime) && Number.isFinite(st.tempo) && st.tempo > 0 &&
        Number.isFinite(st.confidence) && Number.isFinite(st.held) && Number.isFinite(nextTime) && Number.isFinite(now);
      if (!valid) {
        ready = false; seconds = null; progress = 0; warning = true; clearSince = null;
        return { status: 'unavailable', seconds: null, progress: 0, warning: true };
      }
      // The initial engine state has held=0 too; do not mistake it for music.
      if (anchored || st.confidence > 0 || (Number.isFinite(st.loud) && st.loud >= -80 && st.held === 0)) ready = true;
      if (!ready) {
        warning = true; clearSince = null;
        return { status: 'waiting', seconds: null, progress: 0, warning: true };
      }
      const quiet = st.held > 1.2 || (lastFrameAt !== null && now - lastFrameAt > 1200);
      if (!quiet || seconds === null) {
        seconds = Math.max(0, (nextTime - st.refTime) / st.tempo);
        const start = Number.isFinite(previousTime) ? previousTime : 0;
        progress = Math.max(0, Math.min(100, (st.refTime - start) / Math.max(0.5, nextTime - start) * 100));
      }
      if (quiet) {
        warning = true; clearSince = null;
        return { status: 'paused', seconds, progress, warning: true };
      }
      if (st.confidence < 0.30) { warning = true; clearSince = null; }
      else if (warning && st.confidence >= 0.35) {
        if (clearSince === null) clearSince = now;
        // A timer repaint of an old audio snapshot cannot establish a match.
        if (fresh && now - clearSince >= 800) { warning = false; clearSince = null; }
      } else if (warning) clearSince = null;
      return { status: warning ? 'tentative' : 'tracking', seconds, progress, warning };
    }
    return { update, reset };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = STCFollowDisplay;
