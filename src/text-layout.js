// Measure once at a fixed size, then scale: window size never changes a break.
// The same Chromium wrapping feeds cards, overflow, preview, projector and exports.
const STCTextLayout = (() => {
  const cache = new Map();
  let box = null, segmenter = null;
  function layout(text, options) {
    text = String(text);
    const key = JSON.stringify([text, options.width, options.fontSize, options.font, options.bold, options.italic]);
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0;box-sizing:content-box;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;line-height:1.35;letter-spacing:normal;tab-size:4;text-align:left;';
      document.body.append(box);
    }
    Object.assign(box.style, {width: options.width + 'px', fontSize: options.fontSize + 'px', fontFamily: options.font, fontWeight: options.bold ? '700' : '400', fontStyle: options.italic ? 'italic' : 'normal'});
    // The sentinel measures an empty last line after a deliberate newline.
    box.textContent = text + '\u200b';
    const node = box.firstChild, range = document.createRange();
    if (!segmenter && typeof Intl.Segmenter === 'function') segmenter = new Intl.Segmenter(undefined, {granularity:'grapheme'});
    const boundaries = segmenter ? Array.from(segmenter.segment(text + '\u200b'), s => s.index) : [];
    if (!boundaries.length) { let i=0; for (const ch of text + '\u200b') { boundaries.push(i); i+=ch.length; } }
    const top = i => {
      range.setStart(node, boundaries[i]); range.setEnd(node, i+1 < boundaries.length ? boundaries[i+1] : node.length);
      return range.getBoundingClientRect().top;
    };
    const origin=top(0), pitch=options.fontSize*1.35, row=i=>Math.round((top(i)-origin)/pitch);
    const starts = [0];
    for (let at=0; at<boundaries.length;) {
      const y=row(at); let lo=at+1, hi=boundaries.length;
      while (lo<hi) { const mid=(lo+hi)>>1; if (row(mid)===y) lo=mid+1; else hi=mid; }
      if (lo<boundaries.length) starts.push(Math.min(text.length, boundaries[lo]));
      at=lo;
    }
    const lines=starts.map((start,i) => {
      const end=i+1<starts.length ? starts[i+1] : text.length;
      return {start, end, text:text.slice(start,end).replace(/\r?\n$/, '')};
    });
    const result={lines};
    cache.set(key,result);
    while(cache.size>256) cache.delete(cache.keys().next().value);
    return result;
  }
  return {layout, clear:()=>cache.clear()};
})();
if(typeof module!=='undefined') module.exports=STCTextLayout;
