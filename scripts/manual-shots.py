"""Screenshots for the manual (docs/manual/shots/*.webp).

Replays a real project step by step in the built app (dist/Supertitle_Cuer.html):
the titles pasted into Import, the score added, the cues placed — then every panel.
Needs Python with Playwright + Pillow. Usage:
  python3 scripts/manual-shots.py <project.json> <score.pdf> [<reference.wav>]
where project.json holds {markers, slides, settings} of the example project.
"""
import asyncio, json, os, sys, io
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = 'file://' + os.path.join(ROOT, 'dist', 'Supertitle_Cuer.html')
OUT = os.path.join(ROOT, 'docs', 'manual', 'shots')
PROJ, SCORE = sys.argv[1], sys.argv[2]
WAV = sys.argv[3] if len(sys.argv) > 3 else None
W, H, DSF = 1440, 900, 1.5

def save(png, name, max_w=None):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    if max_w and im.width > max_w: im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=80, method=6)
    print('  ', name, im.size)

BADGES_JS = """(list)=>{ document.querySelectorAll('.__badge').forEach(b=>b.remove());
  for(let [sel, n, side] of list){ const el=document.querySelector(sel); if(!el) { console.log('no '+sel); continue; } let r=el.getBoundingClientRect(); if(side==='txt'){ const rg=document.createRange(); rg.selectNodeContents(el); r=rg.getBoundingClientRect(); side='l'; }
    const b=document.createElement('div'); b.className='__badge'; b.textContent=n;
    Object.assign(b.style,{position:'fixed', zIndex:99999, width:'26px', height:'26px', borderRadius:'50%', background:'#e5484d', color:'#fff',
      font:'700 14px/26px system-ui', textAlign:'center', boxShadow:'0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,.6)', pointerEvents:'none'});
    const pos = side==='l' ? [r.left-16, r.top+r.height/2-13] : side==='r' ? [r.right-10, r.top+r.height/2-13] : side==='t' ? [r.left+r.width/2-13, r.top-12] : side==='b' ? [r.left+r.width/2-13, r.bottom-14] : side==='below' ? [r.left+r.width*0.35, r.bottom+2] : [r.left+6, r.top+6];
    b.style.left=Math.max(2,pos[0])+'px'; b.style.top=Math.max(2,pos[1])+'px'; document.body.append(b); } }"""

async def main():
    proj = json.load(open(PROJ))
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        args = ['--autoplay-policy=no-user-gesture-required']
        if WAV: args += ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + os.path.abspath(WAV)]
        br = await p.chromium.launch(args=args)
        ctx = await br.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DSF)
        await ctx.add_init_script("Object.defineProperty(navigator,'platform',{get:()=>'MacIntel'}); Object.defineProperty(navigator,'userAgentData',{get:()=>({platform:'macOS'})});")  # pictures show Mac keys (⌘)
        pg = await ctx.new_page()
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        pg.on('pageerror', lambda e: print('PAGE ERROR', e))
        await pg.goto(APP); await pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('supertitle-cuer')"); await pg.reload(); await pg.wait_for_timeout(600)
        await pg.evaluate("(s)=>{ Object.assign(state.settings, s, {lockCues:false, lockOrder:false, flow:false, view:'width', zoomPct:100}); applyAlign(); updateLocks(); updateOutput(); save(); }", proj['settings'])
        shot = lambda **kw: pg.screenshot(**kw)
        async def clip(sel, pad=0):
            r = await pg.evaluate("(s)=>{ const r=document.querySelector(s).getBoundingClientRect(); return [r.left,r.top,r.width,r.height]; }", sel)
            return {'x': max(0, r[0]-pad), 'y': max(0, r[1]-pad), 'width': min(W, r[2]+2*pad), 'height': min(H, r[3]+2*pad)}
        async def toast_off(): await pg.evaluate("(()=>{ clearTimeout(toastT); const t=document.getElementById('toast'); if(t) t.classList.remove('on'); })()"); await pg.wait_for_timeout(350)
        badges = lambda lst: pg.evaluate(BADGES_JS, lst)
        nobadges = lambda: pg.evaluate("document.querySelectorAll('.__badge').forEach(b=>b.remove())")

        print('quick start')
        save(await shot(), 'qs-1-empty', 1600)
        # 2. paste all the titles into Import (CSV, | for line breaks)
        csv = ','.join('"' + s['text'].replace('\n', '|').replace('"', '""') + '"' for s in proj['slides'])
        await pg.click('.slidehead [data-act="importSlides"]'); await pg.wait_for_timeout(300)
        await pg.fill('#impText', csv); await pg.select_option('#impFmt', 'csv'); await pg.evaluate("updateImpInfo()"); await pg.wait_for_timeout(200)
        save(await shot(), 'qs-2-import', 1600)
        save(await shot(clip=await clip('#importDlg')), 'import', 1100)
        await pg.click('#impGo'); await pg.wait_for_timeout(500); await toast_off()
        save(await shot(), 'qs-3-slides', 1600)
        # 2b. the other way: plain text pasted in Flow mode
        plain = '\n'.join(s_['text'].replace('\n', ' ') for s_ in proj['slides'])
        await pg.evaluate("state.slides=[]; changed(true); setFlow(true)"); await pg.wait_for_timeout(200)
        await pg.click('[data-a="append"]'); await pg.wait_for_timeout(200)
        await pg.evaluate("(t)=>{ const ta=document.querySelector('.slide textarea'); ta.focus(); document.execCommand('insertText', false, t); }", plain)
        await pg.wait_for_timeout(1500); await pg.evaluate("document.activeElement.blur(); document.getElementById('slides').scrollTop=0"); await toast_off()
        save(await shot(), 'qs-2b-flow', 1600)
        await pg.evaluate("(sl)=>{ setFlow(false); state.slides=sl.map(x=>({text:x.text})); changed(true); }", proj['slides']); await toast_off()
        # 4. add the score
        await pg.set_input_files('#fPdf', files=[{'name': proj.get('pdfName') or os.path.basename(SCORE), 'mimeType': 'application/pdf', 'buffer': open(SCORE, 'rb').read()}]); await pg.wait_for_selector('.page'); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.querySelector('.page[data-page=\"2\"]').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(700); await toast_off()
        save(await shot(), 'qs-4-score', 1600)
        # 5. the first cues, clicked onto the score where the original project has them
        async def click_cue(m):
            box = await (await pg.query_selector(f'.page[data-page="{m["page"]}"]')).bounding_box()
            await pg.mouse.click(box['x'] + m['x'] * box['width'], box['y'] + m['y'] * box['height'])
        for m in proj['markers'][:3]:
            await click_cue(m); await pg.wait_for_timeout(150)
        await toast_off(); save(await shot(), 'qs-5-cues', 1600)
        await pg.evaluate("(ms)=>{ state.markers=ms.map(m=>({page:m.page,x:m.x,y:m.y})); sortMarkers(); changed(true); goTo(2,false); docName='Verdi Anvil Chorus.supertitles'; setDirty(false); state.settings.view='width'; layoutPages(); const z=curZoomPct(); state.settings.view='pct'; state.settings.zoomPct=Math.round(z*0.8); layoutPages(); }", proj['markers'])
        await pg.evaluate("document.querySelector('.page[data-page=\"2\"]').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(700); await toast_off()

        print('overview')
        save(await shot(), 'overview', 1600)
        await badges([['#fileMenu', 1, 'b'], ['#helpBtn', 2, 'b'], ['#saveBtn', 3, 'b'], ['#modeSeg', 4, 'b'], ['#followBtn', 5, 'b'],
                      ['#settingsBtn', 6, 'b'], ['#themeSw', 7, 'b'], ['#counts', 8, 'b'], ['#hint', 9, 'txt'], ['#lockCues', 10, 'l'], ['#projBtn', 11, 'r'], ['.slidehead', 12, 'l']])
        save(await shot(), 'overview-callouts', 1600); await nobadges()
        save(await shot(clip={'x': 0, 'y': 0, 'width': W, 'height': 80}), 'toolbar', 1600)
        # the Edit/Show switch and the Projector switch, side by side (they live in different places now)
        ims = [Image.open(io.BytesIO(await shot(clip=await clip(sel, 5)))).convert('RGB') for sel in ('#modeSeg', '#projBtn')]
        gap = 30; comp = Image.new('RGB', (ims[0].width + gap + ims[1].width, max(i.height for i in ims)), ims[0].getpixel((2, 2)))
        comp.paste(ims[0], (0, (comp.height - ims[0].height)//2)); comp.paste(ims[1], (ims[0].width + gap, (comp.height - ims[1].height)//2))
        b = io.BytesIO(); comp.save(b, 'PNG'); save(b.getvalue(), 'modes-projector', 700)
        save(await shot(clip=await clip('.scorebar' if await pg.query_selector('.scorebar') else '#lockCues', 6)), 'score-toolbar-x', 700)
        # score toolbar (the buttons above the score)
        r = await pg.evaluate("(()=>{ const a=document.getElementById('lockCues').getBoundingClientRect(), b=document.querySelector('#zoomCtl .zbox').getBoundingClientRect(); return [a.left-8,a.top-8,b.right-a.left+16,a.height+16]; })()")
        save(await shot(clip={'x': r[0], 'y': r[1], 'width': r[2], 'height': r[3]}), 'score-toolbar', 800)
        os.remove(os.path.join(OUT, 'score-toolbar-x.webp'))
        # cues: current (gold), next (pulsing), a new one (blue ring), and a dashed one without a slide
        await pg.evaluate("goTo(1,false)"); await pg.evaluate("document.querySelector('.page[data-page=\"2\"]').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(600); await toast_off()
        pr = await pg.evaluate("(()=>{ const r=document.querySelector('#score').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]; })()")
        save(await shot(clip={'x': pr[0], 'y': pr[1] + 30, 'width': pr[2], 'height': min(H - pr[1] - 30, 780)}), 'cues', 1300)
        await pg.evaluate("goTo(2,false)")

        print('slides')
        await pg.evaluate("document.querySelector('.slide[data-i=\"3\"]').scrollIntoView({block:'center'})")
        card = await pg.query_selector('.slide[data-i="3"]'); await card.hover(); await pg.wait_for_timeout(300)
        await badges([['.slide[data-i="3"] .grip', 1, 'l'], ['.slide[data-i="3"] .num', 2, 't'], ['.slide[data-i="3"] textarea', 3, 'below'], ['.slide[data-i="3"] .tools', 4, 't'], ['.slide[data-i="3"] .trash', 5, 't']])
        save(await shot(clip=await clip('.slide[data-i="3"]', 32)), 'slide-card', 1000); await nobadges()
        # states: a too-long slide and slides without cues (cues 7-11 taken off for the picture)
        await pg.evaluate("(()=>{ window.__mk=state.markers.slice(); state.slides[4].text='THE GYPSY LADY! The gypsy lady with her dark and shining eyes, who sings by the fire all the night long until dawn'; state.markers=state.markers.slice(0,6); changed(true); goTo(5,false); })()")
        await pg.evaluate("document.querySelector('.slide[data-i=\"4\"]').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(300); await toast_off()
        r = await pg.evaluate("(()=>{ const a=document.querySelector('.slide[data-i=\"4\"]').getBoundingClientRect(), b=document.querySelector('.slide[data-i=\"7\"]').getBoundingClientRect(); return [a.left-10,a.top-10,a.width+20,b.bottom-a.top+20]; })()")
        save(await shot(clip={'x': r[0], 'y': r[1], 'width': r[2], 'height': r[3]}), 'slides-states', 900)
        await pg.evaluate("(t)=>{ state.slides[4].text=t; state.markers=window.__mk; changed(true); goTo(2,false); }", proj['slides'][4]['text'])
        await pg.click('.slide[data-i="5"] .num'); await pg.click('.slide[data-i="7"] .num', modifiers=['Shift']); await pg.wait_for_timeout(300)
        await pg.evaluate("document.querySelector('#pickbar').scrollIntoView({block:'start'}); document.querySelector('.slide[data-i=\"5\"]').scrollIntoView({block:'nearest'})"); await pg.wait_for_timeout(300); await toast_off()
        r = await pg.evaluate("(()=>{ const a=document.querySelector('.slidehead').getBoundingClientRect(), b=document.querySelector('.slide[data-i=\"8\"]').getBoundingClientRect(); return [a.left-6,a.top-4,a.width+12,Math.min(b.bottom,900)-a.top+10]; })()")
        save(await shot(clip={'x': r[0], 'y': r[1], 'width': r[2], 'height': r[3]}), 'slides-range', 900)
        await pg.evaluate("clearPicks(); goTo(2,false)")

        print('slide colors')
        await pg.evaluate("""(()=>{ const c={2:'#15B0C1',3:'#15B0C1',5:'#C115C1',7:'#579C11'}; for(const k in c){ state.slides[k].color=c[k]; if(state.markers[k]) state.markers[k].color=c[k]; } renderSlides(); renderMarkers(); goTo(4,false); document.querySelector('.slide[data-i="4"]').scrollIntoView({block:'center'}); const sc=document.getElementById('score'), mk=document.querySelector('.mk[data-i="2"]'); sc.scrollTop += mk.getBoundingClientRect().top - sc.getBoundingClientRect().top - 60; })()""")
        await pg.wait_for_timeout(700); await toast_off()
        await pg.click('.slide[data-i="6"] .sring'); await pg.wait_for_timeout(400)
        save(await shot(), 'slide-colors', 1600)
        await pg.keyboard.press('Escape'); await pg.evaluate("state.slides.forEach(s=>delete s.color); state.markers.forEach(m=>delete m.color); renderSlides(); renderMarkers(); goTo(2,false)"); await pg.wait_for_timeout(300)

        print('exports')
        await pg.click('#fileMenu [data-menu]'); await pg.wait_for_timeout(300)
        save(await shot(clip=await clip('#fileMenu .items', 10)), 'file-menu', 700)
        await pg.keyboard.press('Escape'); await pg.mouse.click(700, 60); await pg.wait_for_timeout(200)
        import subprocess, tempfile
        pdfb = bytes(await pg.evaluate("buildPrintablePdf().then(b=>Array.from(b))"))
        with tempfile.TemporaryDirectory() as td:
            open(td + '/p.pdf', 'wb').write(pdfb)
            n = int([l for l in subprocess.run(['pdfinfo', td + '/p.pdf'], capture_output=True, text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[-1])
            for pgno, nm in [(2, 'a'), (n, 'b')]:
                subprocess.run(['pdftoppm', '-r', '90', '-f', str(pgno), '-l', str(pgno), '-png', td + '/p.pdf', td + '/' + nm], check=True)
            import glob as _g
            pa, pb = [Image.open(sorted(_g.glob(td + f'/{nm}*.png'))[0]).convert('RGB') for nm in 'ab']
        hh = max(pa.height, pb.height); comp = Image.new('RGB', (pa.width + pb.width + 40, hh + 40), (60, 62, 68))
        comp.paste(pa, (14, 20)); comp.paste(pb, (pa.width + 26, 20))
        b = io.BytesIO(); comp.save(b, 'PNG'); save(b.getvalue(), 'exports', 1400)

        print('spreadsheet')
        sp = await ctx.new_page()
        rows = ''.join(f'<tr><th>{i+1}</th><td>{x["text"].replace(chr(10), "<br>")}</td></tr>' for i, x in enumerate(proj['slides'][:7]))
        await sp.set_content('''<html><body style="margin:0;background:#fff;font:14px Calibri,Carlito,Arial,sans-serif">
<div style="background:#1e7145;color:#fff;padding:6px 10px;font:600 13px Arial">Anvil Chorus titles.xlsx</div>
<table style="border-collapse:collapse;margin:0"><tr><th style="width:34px"></th><th style="width:560px">A</th></tr>''' + rows + '''</table>
<style>th{background:#f3f3f3;color:#555;font-weight:400;border:1px solid #d4d4d4;padding:3px 6px;font-size:12px}
td{border:1px solid #d4d4d4;padding:4px 8px;vertical-align:top;line-height:1.35}
tr:nth-child(4) td{outline:2px solid #1e7145;outline-offset:-2px}</style></body></html>''')
        await sp.set_viewport_size({'width': 620, 'height': 400})
        save(await sp.locator('body').screenshot(), 'spreadsheet', 760); await sp.close()

        print('dialogs')
        await pg.click('#settingsBtn'); await pg.wait_for_timeout(300)
        save(await shot(clip=await clip('#setDlg')), 'settings', 1100); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.evaluate("applyTheme('day'); goTo(5,false); document.activeElement && document.activeElement.blur(); document.querySelector('.slide[data-i=\"5\"]').scrollIntoView({block:'center'})"); await pg.mouse.move(5, H-5); await pg.wait_for_timeout(300); save(await shot(), 'theme-day', 1600)
        await pg.evaluate("applyTheme('night')"); await pg.wait_for_timeout(200)
        await pg.click('#partsBtn'); await pg.wait_for_timeout(1200)
        save(await shot(clip=await clip('#partsDlg')), 'pdfs', 1300)
        await pg.hover('#tkLink'); await pg.wait_for_timeout(700)
        r = await pg.evaluate("(()=>{ const b=document.getElementById('tkLink').getBoundingClientRect(); return [b.right-330, b.top-120, 350, b.height+132]; })()")
        save(await shot(clip={'x': r[0], 'y': r[1], 'width': r[2], 'height': r[3]}), 'toolkit-button', 700)
        await pg.mouse.move(10, 10); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)

        print('projector and show')
        async with pg.expect_popup() as pi: await pg.click('#projBtn')
        pj = await pi.value; await pj.set_viewport_size({'width': 1280, 'height': 720}); await pg.wait_for_timeout(500)
        await pg.evaluate("setMode('show'); goTo(5,false); scrollToCue()"); await pg.wait_for_timeout(1500); await toast_off()
        save(await shot(), 'show', 1600)
        await pg.evaluate("toggleBlackout()"); await pg.mouse.move(5, H-5); await pg.wait_for_timeout(400); await toast_off()
        r = await pg.evaluate("(()=>{ const a=document.querySelector('.pvwrap').getBoundingClientRect(); return [a.left, a.top, a.width, Math.min(a.height, 200)]; })()")
        save(await shot(clip={'x': r[0], 'y': r[1], 'width': r[2], 'height': r[3]}), 'blackout', 800)
        await pg.evaluate("toggleBlackout()"); await pg.wait_for_timeout(300); await toast_off()
        await pj.evaluate("document.getElementById('hint').style.display='none'")
        save(await pj.screenshot(), 'projector', 1280)
        # the three screen shapes, as the preview shows them with the projector on
        tiles = []
        for sh in ['16/9', '4/3', '6/1']:
            await pg.evaluate(f"state.settings.shape='{sh}'; updateOutput()"); await pg.wait_for_timeout(400)
            tiles.append(Image.open(io.BytesIO(await shot(clip=await clip('#pv')))).convert('RGB'))
        await pg.evaluate("(s)=>{ state.settings.shape=s; updateOutput(); }", proj['settings']['shape'])
        gap = 24; tw = sum(t.width for t in tiles) + gap * 2; th = max(t.height for t in tiles)
        from PIL import ImageDraw, ImageFont
        try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
        except Exception: font = ImageFont.load_default()
        comp = Image.new('RGB', (tw, th + 50), (22, 23, 27)); x = 0; d = ImageDraw.Draw(comp)
        for t, lab in zip(tiles, ['16:9', '4:3', '6:1 Strip']): comp.paste(t, (x, 50)); d.text((x + 4, 6), lab, fill=(230, 230, 235), font=font); x += t.width + gap
        b = io.BytesIO(); comp.save(b, 'PNG'); save(b.getvalue(), 'shapes', 1600)
        await pj.close(); await pg.wait_for_timeout(1300)

        print('follow')
        await pg.evaluate("setMode('edit')")
        # an example reference run for the score (cue times spread over the music) — for the pictures only
        await pg.evaluate("""(()=>{ const id=state.parts[0].id, n=Math.round(251*STCFollow.FPS), f=new Float32Array(n*STCFollow.NB);
          state.markers.forEach((m,i)=>m.t=8+i*21.5); setRun(id,{feat:STCFollow.pack(f), audio:null, name:'Anvil Chorus - dress rehearsal.m4a', source:'file', duration:251}); })()""")
        await pg.click('#followBtn'); await pg.wait_for_timeout(500)
        save(await shot(clip=await clip('#followDlg')), 'follow-dialog', 1100); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # the countdown (a stand-in follower showing a typical moment)
        await pg.evaluate("""(()=>{ setMode('show'); goTo(5,false); follow={stream:{getTracks:()=>[]}, tap:null, part:state.parts[0].id, f:{anchor(){}}, st:{refTime:state.markers[6].t-4.2, confidence:.8, tempo:.97, held:0}};
          paintFollow(); updateFollowBtn(); })()"""); await pg.wait_for_timeout(300); await toast_off()
        fb = await clip('.pvwrap')
        save(await shot(clip=fb), 'followbar', 1000)
        await pg.evaluate("clearInterval(follow.timer); follow=null; $('#followBar').hidden=true; updateFollowBtn();")
        if WAV:
            bars = []
            await pg.evaluate("startRecording(state.parts[0].id)"); await pg.wait_for_timeout(2500); await pg.evaluate("next(); next()"); await pg.wait_for_timeout(1200); await toast_off()
            bars.append(Image.open(io.BytesIO(await shot(clip=await clip('#runBar', 1)))).convert('RGB'))
            await pg.evaluate("stopRun(false)"); await pg.wait_for_timeout(600)
            async with pg.expect_file_chooser() as fc: await pg.evaluate("loadFor=state.parts[0].id; $('#fAudio').click()")
            await (await fc.value).set_files(os.path.abspath(WAV)); await pg.wait_for_selector('#runBar:not([hidden])')
            await pg.evaluate("run.media.currentTime=42; paintRun()"); await pg.wait_for_timeout(600); await toast_off()
            bars.append(Image.open(io.BytesIO(await shot(clip=await clip('#runBar', 1)))).convert('RGB'))
            await pg.evaluate("stopRun(false)")
            tw = max(b.width for b in bars); th = sum(b.height for b in bars) + 20
            comp = Image.new('RGB', (tw, th), (22, 23, 27)); y = 0
            for bb in bars: comp.paste(bb, (0, y)); y += bb.height + 20
            b = io.BytesIO(); comp.save(b, 'PNG'); save(b.getvalue(), 'runbars', 1300)

        print('flow mode')
        await pg.evaluate("(()=>{ setMode('edit'); state.markers=[]; state.slides=state.slides.slice(0,5).map(s=>({...s, b:'soft'})); changed(true); setFlow(true); goTo(1,false); })()")
        await pg.wait_for_timeout(600); await toast_off()
        save(await shot(clip=await clip('aside')), 'flow', 900)

        print('example: several PDFs, one printable score')
        import subprocess, tempfile, glob as _g
        from PIL import ImageDraw, ImageFont
        def font(sz, bold=False):
            for f in (['/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'] if bold else []) + ['/usr/share/fonts/opentype/inter/Inter-Regular.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
                if os.path.exists(f): return ImageFont.truetype(f, sz)
            return ImageFont.load_default()
        ex = await ctx.new_page(); ex.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await ex.goto(APP); await ex.evaluate("localStorage.clear(); indexedDB.deleteDatabase('supertitle-cuer')"); await ex.reload(); await ex.wait_for_timeout(600)
        await ex.evaluate("(s)=>{ Object.assign(state.settings, s, {lockCues:false, lockOrder:false, flow:false, view:'width', zoomPct:100}); applyAlign(); updateLocks(); updateOutput(); save(); }", proj['settings'])
        with tempfile.TemporaryDirectory() as td:
            n_all = int([l for l in subprocess.run(['pdfinfo', SCORE], capture_output=True, text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[-1])
            cut = (n_all + 1) // 2 - 1 or 1
            p1, p2 = td + '/a.pdf', td + '/b.pdf'
            subprocess.run(['qpdf', SCORE, '--pages', '.', f'1-{cut}', '--', p1], check=True)
            subprocess.run(['qpdf', SCORE, '--pages', '.', f'{cut+1}-{n_all}', '--', p2], check=True)
            await ex.set_input_files('#fPdf', files=[{'name': 'Anvil Chorus - part 1.pdf', 'mimeType': 'application/pdf', 'buffer': open(p1, 'rb').read()}]); await ex.wait_for_selector('.page'); await ex.wait_for_timeout(800)
            await ex.evaluate("partInsertAt=state.parts.length")
            await ex.set_input_files('#fPart', files=[{'name': 'Anvil Chorus - part 2.pdf', 'mimeType': 'application/pdf', 'buffer': open(p2, 'rb').read()}])
            await ex.wait_for_function("state.parts && state.parts.length===2"); await ex.wait_for_timeout(1200)
        await ex.evaluate("(p)=>{ state.slides=p.slides.map(s=>({text:s.text})); state.markers=p.markers.map(m=>({page:m.page,x:m.x,y:m.y})); renderSlides(); sortMarkers(); changed(true); goTo(-1,false); docName='Anvil Chorus.supertitles'; setDirty(false); }", proj)
        await ex.evaluate("(()=>{ clearTimeout(toastT); const t=document.getElementById('toast'); if(t) t.classList.remove('on'); })()")
        await ex.click('#partsBtn'); await ex.wait_for_timeout(1500)
        r = await ex.evaluate("(()=>{ const r=document.querySelector('#partsDlg').getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()")
        save(await ex.screenshot(clip=r), 'example-parts', 1300)
        await ex.keyboard.press('Escape'); await ex.wait_for_timeout(200)
        pdfb = bytes(await ex.evaluate("buildPrintablePdf().then(b=>Array.from(b))"))
        with tempfile.TemporaryDirectory() as td:
            open(td + '/p.pdf', 'wb').write(pdfb)
            n = int([l for l in subprocess.run(['pdfinfo', td + '/p.pdf'], capture_output=True, text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[-1])
            subprocess.run(['pdftoppm', '-r', '60', '-png', td + '/p.pdf', td + '/t'], check=True)
            thumbs = [Image.open(f).convert('RGB') for f in sorted(_g.glob(td + '/t*.png'))]
        tw = max(i.width for i in thumbs); th = max(i.height for i in thumbs); gap = 26; top = 64; lab_h = 44
        per = len(thumbs); cols = (per + 1) // 2; rows = 2
        W2 = cols * tw + (cols + 1) * gap; H2 = top + rows * (th + lab_h) + gap
        sheet = Image.new('RGB', (W2, H2), (44, 46, 53)); d = ImageDraw.Draw(sheet)
        fl, fs = font(24, True), font(21)
        C1, C2, C3 = (143, 182, 255), (126, 214, 160), (242, 177, 52)
        lx = gap
        for col, name in ((C1, 'Anvil Chorus - part 1.pdf'), (C2, 'Anvil Chorus - part 2.pdf'), (C3, 'added by STQ: the cue sheet')):
            d.rounded_rectangle([lx, 20, lx + 22, 42], 5, fill=col); d.text((lx + 32, 31), name, fill=col, font=fl, anchor='lm'); lx += 44 + d.textlength(name, font=fl) + 30
        for k, im in enumerate(thumbs):
            r_, c_ = divmod(k, cols); x = gap + c_ * (tw + gap); y = top + r_ * (th + lab_h)
            col = C1 if k < cut else C2 if k < n_all else C3
            sheet.paste(im, (x, y)); d.rectangle([x - 3, y - 3, x + im.width + 2, y + im.height + 2], outline=col, width=3)
            lab = 'cue sheet' if k >= n_all else f'page {k+1}'
            d.text((x + im.width / 2, y + im.height + 10), lab, fill=col, font=fs, anchor='ma')
        b = io.BytesIO(); sheet.save(b, 'PNG'); save(b.getvalue(), 'example-printable', 1500)
        await ex.close()

        print('help')
        await pg.evaluate("setFlow(false); openHelp('slides')"); await pg.wait_for_timeout(600)
        await pg.fill('#helpQ', 'blackout'); await pg.wait_for_timeout(400)
        save(await shot(clip=await clip('#helpDlg')), 'help', 1300)
        await br.close()

asyncio.run(main())
