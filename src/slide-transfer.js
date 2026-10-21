// Portable clipboard payload, also embedded in HTML for native/browser clipboard interoperability.
const STCSlideTransfer = (() => {
  const MIME='application/x-supertitle-cuer-slides+json', APP='supertitle-cuer-clipboard';
  const color = x => typeof x==='string' && /^#[\da-f]{6}$/i.test(x);
  function base64(bytes){ let s=''; for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(s); }
  function bytes(s){ const raw=atob(s), out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i); return out; }
  const escape = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function slide(s){
    if(!s || typeof s.text!=='string' || s.text.length>1000000) throw new Error('Invalid slide text');
    const out={text:s.text, b:['hard','soft','split'].includes(s.b)?s.b:'hard', keepColors:true};
    if(color(s.color)) out.color=s.color;
    if(s.colorCue) out.colorCue=true;
    if(color(s.cueColorOverride)) out.cueColorOverride=s.cueColorOverride;
    if(s.screenColors && color(s.screenColors.fg) && color(s.screenColors.bg)) out.screenColors={fg:s.screenColors.fg,bg:s.screenColors.bg};
    return out;
  }
  function validate(p){
    if(!p || p.app!==APP || p.version!==1 || !['slides','section'].includes(p.kind) || !Array.isArray(p.slides) || p.slides.length>10000) throw new Error('Unsupported slide clipboard');
    const out={app:APP,version:1,kind:p.kind,slides:p.slides.map(slide)};
    if(p.kind==='section'){
      const s=p.section;
      if(!s || typeof s.name!=='string' || typeof s.title!=='string' || !Number.isInteger(s.pages) || s.pages<1 || s.pages>10000 || !Array.isArray(p.cues) || p.cues.length>p.slides.length || typeof p.pdf!=='string' || p.pdf.length>90*1024*1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.pdf)) throw new Error('Invalid score section');
      out.section={name:s.name.slice(0,1024),title:s.title.slice(0,1024),pages:s.pages}; if(color(s.color)) out.section.color=s.color;
      out.cues=p.cues.map(m=>{ if(!m || !Number.isInteger(m.page) || m.page<1 || m.page>s.pages || !Number.isFinite(m.x) || !Number.isFinite(m.y) || m.x<0 || m.x>1 || m.y<0 || m.y>1) throw new Error('Invalid section cues'); return {page:m.page,x:m.x,y:m.y}; });
      out.pdf=p.pdf;
    }
    return out;
  }
  function encode(payload){
    const p=validate(payload), json=JSON.stringify(p);
    const text=p.slides.map(s=>'"'+(s.text.trim()?s.text:'(blank)').replace(/"/g,'""').replace(/\r?\n/g,'|')+'"').join('\n');
    const html='<div data-stq-slides="'+base64(new TextEncoder().encode(json))+'">'+p.slides.map(s=>'<p>'+escape(s.text).replace(/\n/g,'<br>')+'</p>').join('')+'</div>';
    return {json,text,html};
  }
  function decode(data){
    let raw=data.json || (data.getData && data.getData(MIME));
    const html=data.html || (data.getData && data.getData('text/html'));
    if(!raw && html){ const el=new DOMParser().parseFromString(html,'text/html').querySelector('[data-stq-slides]'); if(el) raw=new TextDecoder().decode(bytes(el.getAttribute('data-stq-slides'))); }
    return raw ? validate(JSON.parse(raw)) : null;
  }
  return {APP,MIME,base64,bytes,validate,encode,decode};
})();
if(typeof module!=='undefined') module.exports=STCSlideTransfer;
