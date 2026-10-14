// Supertitle Cuer — score following ("Follow" mode).
// Turns audio into a sequence of 12-note chroma frames and follows a live performance
// against a reference run (a recording whose cue times are known).
// Pure JavaScript, no dependencies: inlined into the app, and loadable in Node for tests.
const STCFollow = (() => {
  const SR = 22050, N = 2048, HOP = 1024;       // ~93 ms window, ~46 ms step
  const FPS = SR / HOP;                           // ~21.5 frames per second
  const NB = 14;                                  // per frame: 12 chroma, loudness (dB), tonality (peak/mean of raw chroma)

  // ---------- FFT (radix-2, in place) ----------
  const rev = new Uint32Array(N), cosT = new Float32Array(N / 2), sinT = new Float32Array(N / 2);
  for (let i = 0, b = Math.log2(N); i < N; i++) { let r = 0; for (let k = 0; k < b; k++) r |= ((i >> k) & 1) << (b - 1 - k); rev[i] = r; }
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = -Math.sin(2 * Math.PI * i / N); }
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  function fftMag(frame, re, im, mag) {
    for (let i = 0; i < N; i++) { re[rev[i]] = frame[i] * win[i]; im[rev[i]] = 0; }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
        const c = cosT[k * step], sn = sinT[k * step], a = s + k, b = a + half;
        const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    for (let i = 0; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  }

  // FFT bin -> pitch class (A0..about C8), with a gentle low-frequency fade-in
  const binPc = new Int8Array(N / 2).fill(-1), binW = new Float32Array(N / 2);
  for (let i = 1; i < N / 2; i++) {
    const f = i * SR / N; if (f < 60 || f > 5000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    binPc[i] = ((Math.round(midi) % 12) + 12) % 12; binW[i] = f < 120 ? (f - 60) / 60 : 1;
  }

  // ---------- feature extraction ----------
  // Feed mono samples at 22050 Hz in any chunk size; onFrame(Float32Array(13)) per frame.
  function extractor(onFrame) {
    const ring = new Float32Array(N), buf = new Float32Array(N), re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2);
    let w = 0, total = 0, sinceHop = 0;
    return function push(samples) {
      for (let j = 0; j < samples.length; j++) {
        ring[w] = samples[j]; w = (w + 1) % N; total++;
        if (total >= N && ++sinceHop >= HOP) {
          sinceHop = 0;
          buf.set(ring.subarray(w), 0); buf.set(ring.subarray(0, w), N - w);   // oldest sample first
          onFrame(frameFeatures(buf, re, im, mag));
        }
      }
    };
  }
  function frameFeatures(buf, re, im, mag) {
    fftMag(buf, re, im, mag);
    const out = new Float32Array(NB); let e = 0; const sc = 4 / N;
    for (let i = 1; i < N / 2; i++) { const m = mag[i] * sc; const p = binPc[i]; if (p >= 0) out[p] += binW[i] * m; e += m * m; }
    let mx = 0, sm = 0; for (let p = 0; p < 12; p++) { mx = Math.max(mx, out[p]); sm += out[p]; }
    out[13] = sm > 0 ? mx / (sm / 12) : 1;
    let n = 0; for (let p = 0; p < 12; p++) { out[p] = Math.log(1 + 100 * out[p]); n += out[p] * out[p]; }
    n = Math.sqrt(n) || 1; for (let p = 0; p < 12; p++) out[p] /= n;
    out[12] = 10 * Math.log10(e + 1e-12);       // loudness in dB (relative)
    return out;
  }
  // A whole recording at once (Float32Array, mono, 22050 Hz) -> Float32Array(frames * 13)
  function featuresOf(samples) {
    const frames = []; const push = extractor(f => frames.push(f));
    for (let i = 0; i < samples.length; i += 8192) push(samples.subarray(i, Math.min(samples.length, i + 8192)));
    const out = new Float32Array(frames.length * NB); frames.forEach((f, i) => out.set(f, i * NB)); return out;
  }
  // Compact storage: 12 chroma values as bytes + loudness as a byte (dB + 120)
  function pack(feat) { const n = feat.length / NB, b = new Uint8Array(n * NB);
    for (let i = 0; i < n; i++) { for (let p = 0; p < 12; p++) b[i * NB + p] = Math.round(Math.max(0, Math.min(1, feat[i * NB + p])) * 255);
      b[i * NB + 12] = Math.max(0, Math.min(255, Math.round(feat[i * NB + 12] + 120)));
      b[i * NB + 13] = Math.max(0, Math.min(255, Math.round(feat[i * NB + 13] * 20))); }
    return b; }
  function unpack(b) { const n = b.length / NB, f = new Float32Array(n * NB);
    for (let i = 0; i < n; i++) { let s = 0; for (let p = 0; p < 12; p++) { f[i * NB + p] = b[i * NB + p] / 255; s += f[i * NB + p] ** 2; }
      s = Math.sqrt(s) || 1; for (let p = 0; p < 12; p++) f[i * NB + p] /= s; f[i * NB + 12] = b[i * NB + 12] - 120; f[i * NB + 13] = b[i * NB + 13] / 20; }
    return f; }

  // ---------- the follower ----------
  // An online, banded dynamic-time-warping path with fading memory: each live frame moves the
  // reference position by 0, 1 or 2 frames (half to double speed), choosing the cheapest
  // recent history. Quiet or noisy frames (pauses, applause, speech) hold the position.
  function follower(ref, opts = {}) {
    const n = ref.length / NB;
    const BACK = Math.round((opts.back ?? 8) * FPS), AHEAD = Math.round((opts.ahead ?? 30) * FPS);
    const LAMBDA = opts.lambda ?? 0.99, STEP = opts.stepCost ?? 0.08, BIG = 1e9;
    let D = new Float32Array(n).fill(BIG), D2 = new Float32Array(n).fill(BIG);
    let pos = 0, liveFrames = 0, conf = 0, held = 0;
    const hist = [];                                    // [live frame, ref frame] for tempo
    // loudness reference: the 20th percentile of the reference's music frames counts as "quiet"
    const loud = []; for (let i = 0; i < n; i++) loud.push(ref[i * NB + 12]); loud.sort((a, b) => a - b);
    const quiet = loud[Math.floor(loud.length * 0.2)] - 6;
    const TONAL = opts.tonal ?? 1.8;

    function anchor(refFrame, spread = 1.5) {          // restart the path around a known point
      const c = Math.max(0, Math.min(n - 1, Math.round(refFrame))), w = Math.round(spread * FPS);
      D.fill(BIG); for (let i = Math.max(0, c - w); i <= Math.min(n - 1, c + w); i++) D[i] = Math.abs(i - c) / w * 0.5;
      pos = c; hist.length = 0; hist.push([liveFrames, c]); held = 0; recent.length = 0; pending = null;
    }
    // Re-finding the place: every ~0.75 s the last ~3 s of music are matched against a wide stretch
    // of the reference (±RANGE). If somewhere else fits clearly better than where we think we are,
    // twice in a row, we jump there — a restart, a cut, or a passage played again.
    const L = Math.round(3 * FPS), RANGE = Math.round((opts.relocate ?? 120) * FPS), recent = []; let pending = null;
    function matchEnd(lo, hi, eLo = lo, eHi = hi) {     // subsequence DTW of `recent` inside [lo, hi], ending in [eLo, eHi]
      let prev = new Float32Array(hi - lo + 1), cur = new Float32Array(hi - lo + 1);
      for (let j = 0; j < recent.length; j++) {
        const f = recent[j];
        for (let i = lo; i <= hi; i++) {
          const k = i - lo, d = cosd(i, f);
          if (j === 0) { cur[k] = d; continue; }
          const a = prev[k] + STEP, b = k > 0 ? prev[k - 1] : BIG, c = k > 1 ? prev[k - 2] + STEP : BIG;
          cur[k] = d + Math.min(a, b, c);
        }
        const t = prev; prev = cur; cur = t;
      }
      let best = BIG, bi = lo; for (let i = Math.max(lo, eLo); i <= Math.min(hi, eHi); i++) if (prev[i - lo] < best) { best = prev[i - lo]; bi = i; }
      return { at: bi, cost: best / recent.length };
    }
    let typical = null;                                 // how well the music usually matches where we are
    function relocate() {
      const here = matchEnd(Math.max(0, pos - 3 * L), Math.min(n - 1, pos + Math.round(FPS)), pos - Math.round(FPS), pos + Math.round(FPS));
      if (typical === null) typical = here.cost;
      // only look elsewhere when the current place has stopped fitting (repeats in the music
      // would otherwise tempt it away while it's following well)
      if (opts.debug) opts.debug({ live: liveFrames / FPS, pos: pos / FPS, here: here.cost, typical });
      if (here.cost < typical * 1.6) { typical = 0.9 * typical + 0.1 * here.cost; pending = null; return; }
      const far = matchEnd(Math.max(0, pos - RANGE), Math.min(n - 1, pos + RANGE));
      if (Math.abs(far.at - pos) < 3 * FPS) { pending = null; return; }
      if (opts.debug) opts.debug({ live: liveFrames / FPS, pos: pos / FPS, here: here.cost, typical, far: far.cost, farAt: far.at / FPS });
      if (far.cost < here.cost * 0.7 && far.cost < typical * 1.3) {
        if (pending && Math.abs(pending - far.at) < 2 * FPS) {  // confirmed: jump
          const keep = recent.slice(); anchor(far.at, 0.5); recent.push(...keep); jumps++;
        } else pending = far.at + Math.round(0.75 * FPS);         // where it should be by the next check
      } else pending = null;
    }
    let jumps = 0;
    anchor(opts.start || 0);

    function cosd(i, f) { let s = 0; const o = i * NB; for (let p = 0; p < 12; p++) s += ref[o + p] * f[p]; return 1 - s; }

    function step(f) {
      liveFrames++;
      // hold on silence, or on frames with no pitch content (flat chroma: applause, speech, noise)
      const flat = f[13] < TONAL;
      if (f[12] < quiet || flat) { held++; conf *= 0.97; return state(); }
      held = 0;
      recent.push(f); if (recent.length > L) recent.shift();
      const lo = Math.max(0, pos - BACK), hi = Math.min(n - 1, pos + AHEAD);
      let best = BIG, bi = pos, dsum = [], dBest = 1;
      for (let i = lo; i <= hi; i++) {
        const d = cosd(i, f);
        const a = D[i] + STEP, b = i > 0 ? D[i - 1] : BIG, c = i > 1 ? D[i - 2] + STEP : BIG;
        let m = a < b ? a : b; if (c < m) m = c;
        const v = m >= BIG ? BIG : LAMBDA * m + d;
        D2[i] = v; if (v < best) { best = v; bi = i; dBest = d; }
        dsum.push(d);
      }
      // cells that left the band are forgotten
      for (let i = Math.max(0, lo - 3); i < lo; i++) D2[i] = BIG;
      for (let i = hi + 1; i <= Math.min(n - 1, hi + 3); i++) D2[i] = BIG;
      const t = D; D = D2; D2 = t; for (let i = lo; i <= hi; i++) D2[i] = BIG;
      pos = bi;
      // confidence: how much better the best match is than a typical place in the band
      dsum.sort((a, b) => a - b); const med = dsum[dsum.length >> 1] || 1;
      conf = 0.9 * conf + 0.1 * Math.max(0, Math.min(1, 1 - dBest / (med + 1e-6)));
      hist.push([liveFrames, pos]); while (hist.length && hist[0][0] < liveFrames - 10 * FPS) hist.shift();
      if (recent.length === L && liveFrames % 16 === 0) relocate();
      return state();
    }
    function tempo() {                                  // reference frames per live frame, recent 10 s
      if (hist.length < 10) return 1;
      let sx = 0, sy = 0, sxx = 0, sxy = 0; const k = hist.length;
      for (const [x, y] of hist) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const den = k * sxx - sx * sx; if (!den) return 1;
      return Math.max(0.5, Math.min(2, (k * sxy - sx * sy) / den));
    }
    function state() { return { refTime: pos / FPS, confidence: conf, held: held / FPS, tempo: tempo(), jumps }; }
    return { step, anchor: (sec, spread) => anchor(sec * FPS, spread), state, get length() { return n / FPS; } };
  }

  return { SR, N, HOP, FPS, NB, extractor, featuresOf, pack, unpack, follower };
})();
if (typeof module !== 'undefined') module.exports = STCFollow;
