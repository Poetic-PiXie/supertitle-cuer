// Recording identity and cue-timing transactions shared by Mac, Windows and HTML.
const STCRecordingReference = (() => {
  const CHUNK = 1024 * 1024;
  async function fileIdentity(file, cryptoApi = globalThis.crypto) {
    if (!cryptoApi?.subtle || !file?.slice || !Number.isSafeInteger(file.size)) return null;
    // Hash every byte with bounded memory. The final digest is a versioned digest
    // of the file size and ordered chunk digests, not the conventional file SHA.
    const header = new TextEncoder().encode(`STQ recording chunks v1\n${file.size}\n${CHUNK}\n`);
    const digests = [];
    for (let at = 0; at < file.size; at += CHUNK) {
      const bytes = await file.slice(at, at + CHUNK).arrayBuffer();
      digests.push(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes)));
    }
    const joined = new Uint8Array(header.length + digests.length * 32);
    joined.set(header);
    digests.forEach((digest, i) => joined.set(digest, header.length + i * 32));
    const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', joined));
    return 'stq-chunks-v1:' + Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  }
  function canReuse(reference, identity, duration) {
    return !!(reference?.source === 'file' && identity && reference.fileId === identity &&
      Number.isFinite(duration) && Math.abs(reference.duration - duration) < 1);
  }
  function commitTimes(run) {
    const cues = run.cues || [];
    if (!run.reuse) cues.forEach(marker => { delete marker.t; });
    for (const [marker, time] of run.times || []) {
      if (cues.includes(marker) && Number.isFinite(time) && time >= 0) marker.t = time;
    }
  }
  return { fileIdentity, canReuse, commitTimes };
})();
if (typeof module !== 'undefined') module.exports = STCRecordingReference;
