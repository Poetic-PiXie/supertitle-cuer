# Builds electron/thesaurus-en.txt.gz (English synonyms for the desktop app's right-click menu)
# from WordNet 3.1 (npm package wordnet-db). Usage: python3 scripts/build-thesaurus.py <wordnet-db>/dict electron/thesaurus-en.txt.gz
# WordNet 3.1 Copyright 2011 by Princeton University. All rights reserved. (WordNet license: https://wordnet.princeton.edu/license-and-commercial-use)
import sys, os, gzip, re
D=sys.argv[1]; out=sys.argv[2]
syn={}  # (pos, offset) -> words
for pos in ['noun','verb','adj','adv']:
    for line in open(os.path.join(D,'data.'+pos), encoding='latin-1'):
        if line.startswith('  '): continue
        f=line.split(); off=f[0]; n=int(f[3],16)
        words=[re.sub(r'\(.*\)$','',f[4+2*i]).replace('_',' ') for i in range(n)]
        k=4+2*n; pc=int(f[k]); sim=[]
        for j in range(pc):
            sym,o,pp=f[k+1+4*j],f[k+2+4*j],f[k+3+4*j]
            if sym=='&' and pos=='adj': sim.append(('adj',o))
        syn[(pos,off)]=(words,sim)
res={}; ranks={}
for pos in ['noun','verb','adj','adv']:
    for line in open(os.path.join(D,'index.'+pos), encoding='latin-1'):
        if line.startswith('  '): continue
        f=line.split(); lemma=f[0].replace('_',' ')
        if ' ' in lemma or not re.fullmatch(r"[a-z][a-z'-]*", lemma): continue
        sc=int(f[2]); pc=int(f[3]); offs=f[4+pc+2:]   # synset_cnt, p_cnt, ptrs..., sense_cnt, tagsense_cnt, offsets
        lst=res.setdefault(lemma,[]); groups=[]
        for o in offs:
            ws,sim=syn.get((pos,o),([],[]))
            g=[w for w in ws]
            for so in sim: g+= syn.get(so,([],[]))[0][:2]
            groups.append([w for w in g if w.lower()!=lemma and len(w.split())<=2])
        tagged=int(f[4+pc+1])  # how often this word's senses in this part of speech occur in real text
        ranks.setdefault(lemma,[]).append((tagged, groups))
for lemma, pg in ranks.items():
    # interleave senses across parts of speech, the most common part of speech first
    pg.sort(key=lambda x:-x[0]); groups=[g for _,gs in pg for g in gs]; order=[]
    for r in range(max(len(gs) for _,gs in pg)):
        for _,gs in pg:
            if r<len(gs): order.append(gs[r])
    lst=res[lemma]; r=0
    while any(order) and r<20:
        for g in order:
            if g:
                w=g.pop(0)
                if w not in lst: lst.append(w)
        r+=1
res={k:v[:12] for k,v in res.items() if v}
with gzip.open(out,'wt',encoding='utf-8') as g:
    for k in sorted(res): g.write(k+'\t'+'|'.join(res[k])+'\n')
print(len(res),'words', os.path.getsize(out)//1024,'KB')
for w in ['happy','strength','drink','courage','love','sing']: print(w, res.get(w))
