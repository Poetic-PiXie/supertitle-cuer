const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {archive,parseGhResponse}=require('../scripts/archive-legacy-release.cjs');
const s=require('../build/legacy-release-1.0.0.json'),repository='Poetic-PiXie/supertitle-cuer',prefix='repos/'+repository;
const clone=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha1').update(x).digest('hex');
const S={oldTree:sha('oldTree'),main:sha('main'),mainTree:sha('mainTree'),oldWf:sha('oldWf'),newWf:sha('newWf'),archive:sha('archive'),archiveTree:sha('archiveTree')};
const entry=(path,mode='100644',type='blob',hash=sha(path))=>({path,mode,type,sha:hash});
const wf=p=>p==='.github/workflows'||p.startsWith('.github/workflows/');
function model(){
 const oldTree=[entry('.github','040000','tree'),entry('.github/workflows','040000','tree',S.oldWf),entry('.github/workflows/release.yml'),entry('.github/ISSUE_TEMPLATE.md'),entry('src/app.html'),entry('package.json'),entry('docs/link','120000'),entry('vendor/submodule','160000','commit')];
 const mainTree=[...clone(oldTree).filter(x=>!wf(x.path)&&x.path!=='src/app.html'),entry('src/app.html','100644','blob',sha('newapp')),entry('.github/workflows','040000','tree',S.newWf),entry('.github/workflows/release.yml','100644','blob',sha('currentguards'))];
 return {main:S.main,release:{id:s.releaseId,tag_name:s.tag,target_commitish:s.commit,published_at:s.publishedAt,name:'Supertitle Cuer 1.0.0',draft:false,prerelease:false,immutable:false,body:s.originalBody,assets:s.assets.map(a=>({...a,state:'uploaded'}))},refs:{[s.tag]:{raw:s.commit,commit:s.commit}},trees:{[S.oldTree]:oldTree,[S.mainTree]:mainTree},commits:{[s.commit]:{sha:s.commit,tree:{sha:S.oldTree},parents:[]},[S.main]:{sha:S.main,tree:{sha:S.mainTree},parents:[{sha:s.commit}]}},writes:[]};
}
function execute(m){
 const api=(method,endpoint,body)=>{
  const route=endpoint.slice(prefix.length);
  if(m.apiError&&m.apiError(method,route))return{status:503,data:{}};
  if(method==='GET'&&route==='')return{status:200,data:{default_branch:'main'}};
  if(method==='GET'&&route==='/git/ref/heads/main')return{status:200,data:{ref:'refs/heads/main',object:{type:'commit',sha:m.main}}};
  if(method==='GET'&&route.startsWith('/git/commits/'))return{status:200,data:clone(m.commits[route.slice('/git/commits/'.length)])};
  if(method==='GET'&&route.startsWith('/git/trees/')){const id=route.slice('/git/trees/'.length).split('?')[0];return{status:200,data:{sha:id,truncated:!!m.truncated,tree:clone(m.trees[id])}};}
  if(method==='GET'&&route.startsWith('/compare/'))return{status:200,data:{merge_base_commit:{sha:S.main}}};
  if(method==='GET'&&route.startsWith('/releases/tags/')){const tag=decodeURIComponent(route.slice('/releases/tags/'.length)),r=m.foreign?.tag_name===tag?m.foreign:m.legacyForeign&&tag===s.legacyTag?m.legacyForeign:m.release.tag_name===tag?m.release:null;return{status:r?200:404,data:r&&clone(r)};}
  if(method==='GET'&&route==='/releases/'+s.releaseId)return{status:200,data:clone(m.release)};
  if(method==='GET'&&route.startsWith('/git/ref/tags/')){const tag=decodeURIComponent(route.slice('/git/ref/tags/'.length)),r=m.refs[tag];return{status:r?200:404,data:r?{ref:'refs/tags/'+tag,object:{type:r.raw===r.commit?'commit':'tag',sha:r.raw}}:null};}
  if(method==='GET'&&route.startsWith('/git/tags/')){const raw=route.slice('/git/tags/'.length),r=Object.values(m.refs).find(r=>r.raw===raw);return{status:r?200:404,data:r?{object:{type:'commit',sha:r.commit}}:null};}
  if(method==='POST'&&route==='/git/trees'){
   m.writes.push({method,route,body});assert.equal(body.base_tree,S.oldTree);assert.deepEqual(body.tree,[{path:'.github/workflows',mode:'040000',type:'tree',sha:S.newWf}]);
   const t=[...clone(m.trees[S.oldTree]).filter(x=>!wf(x.path)),...clone(m.trees[S.mainTree]).filter(x=>wf(x.path))];
   if(m.badSource)t.find(x=>x.path==='src/app.html').sha=sha('changed');if(m.badMode)t.find(x=>x.path==='docs/link').mode='100644';if(m.badGitlink)t.find(x=>x.path==='vendor/submodule').sha=sha('foreignsubmodule');if(m.badWorkflow)t.find(x=>x.path==='.github/workflows').sha=sha('badguards');
   m.trees[S.archiveTree]=t;return{status:201,data:{sha:S.archiveTree}};
  }
  if(method==='POST'&&route==='/git/commits'){
   m.writes.push({method,route,body});assert.deepEqual(body.parents,[S.main,s.commit]);
   m.commits[S.archive]={sha:S.archive,tree:{sha:body.tree},parents:body.parents.map(sha=>({sha}))};if(m.badParents)m.commits[S.archive].parents.reverse();
   if(m.moveDefault){m.main=sha('newmain');m.commits[m.main]={sha:m.main,tree:{sha:S.mainTree},parents:[{sha:S.main}]};}
   return{status:201,data:{sha:S.archive}};
  }
  if(method==='PATCH'&&route==='/releases/'+s.releaseId){
   m.writes.push({method,route,body});assert.equal(body.tag_name,s.legacyTag);assert.equal(body.target_commitish,S.archive,'Consistent actual archive target');assert.ok(body.body.endsWith(s.originalBody));assert.ok(body.body.includes(s.commit));assert.ok(body.body.includes('`.github/workflows/`'));
   assert.ok(!m.refs[s.legacyTag]||m.refs[s.legacyTag].commit===S.archive);m.refs[s.legacyTag]={raw:S.archive,commit:S.archive};Object.assign(m.release,body);
   if(m.freshDuringPatch){m.foreign={id:999,tag_name:s.tag};m.refs[s.tag]={raw:sha('fresh'),commit:sha('fresh')};}
   return{status:m.failAfterPatch?503:200,data:clone(m.release)};
  }
  throw Error('Unexpected '+method+' '+route);
 };
 const deleteRef=(tag,lease)=>{m.writes.push({method:'LEASE_DELETE',tag,lease});assert.equal(tag,s.tag);if(m.raceDelete){m.refs[tag]={raw:sha('fresh'),commit:sha('fresh')};return 1;}if(m.failDelete||m.refs[tag]?.raw!==lease)return 1;delete m.refs[tag];return 0;};
 return archive({repository,snapshot:s,api,deleteRef,log(){}});
}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
const preserved=m=>{assert.equal(m.release.id,s.releaseId);assert.deepEqual(m.release.assets.map(({state,...a})=>a),s.assets);assert.ok(m.writes.every(w=>w.method!=='DELETE'&&!(w.route||'').includes('/assets')));};
const archiveDone=()=>{const m=model();execute(m);m.writes=[];return m;};
test('normal creates real archive tree/commit, patches consistent target, preserves assets/notes, leases oldref',()=>{const m=model();assert.equal(execute(m),'archived');assert.equal(m.refs[s.legacyTag].commit,S.archive);assert.equal(m.release.target_commitish,S.archive);assert.equal(m.refs[s.tag],undefined);assert.ok(m.release.body.endsWith(s.originalBody));assert.deepEqual(m.writes.map(w=>w.method),['POST','POST','PATCH','LEASE_DELETE']);preserved(m);});
test('completed retry makes no writes or duplicate note',()=>{const m=archiveDone(),body=m.release.body;execute(m);assert.deepEqual(m.writes,[]);assert.equal(m.release.body,body);preserved(m);});
test('partial retag retry retires only remaining oldref',()=>{const m=archiveDone();m.refs[s.tag]={raw:s.commit,commit:s.commit};execute(m);assert.deepEqual(m.writes.map(w=>w.method),['LEASE_DELETE']);preserved(m);});
test('PATCH succeeded but responsefailed resumes serverstate',()=>{const m=model();m.failAfterPatch=true;assert.throws(()=>execute(m),/HTTP 503/);assert.equal(m.refs[s.tag].commit,s.commit);m.failAfterPatch=false;m.writes=[];execute(m);assert.deepEqual(m.writes.map(w=>w.method),['LEASE_DELETE']);preserved(m);});
test('existing valid archive tag validates before retag',()=>{const m=archiveDone();m.release={...model().release};m.refs[s.tag]={raw:s.commit,commit:s.commit};m.writes=[];execute(m);assert.deepEqual(m.writes.map(w=>w.method),['PATCH','LEASE_DELETE']);preserved(m);});
test('foreign fresh release remains untouched',()=>{const m=model();m.foreign={id:999,tag_name:s.tag};assert.equal(execute(m),'foreign-release-preserved');assert.deepEqual(m.writes,[]);});
test('foreign naked source tag stops without writes',()=>{const m=model();m.release.tag_name=s.legacyTag;m.refs[s.tag]={raw:sha('fresh'),commit:sha('fresh')};assert.throws(()=>execute(m),/another commit/);assert.deepEqual(m.writes,[]);});
test('changed asset fails before mutations',()=>{const m=model();m.release.assets[0].digest='bad';assert.throws(()=>execute(m),/asset identities/);assert.deepEqual(m.writes,[]);});
test('changed original notes fail before mutations',()=>{const m=model();m.release.body+='independent edit';assert.throws(()=>execute(m),/Original notes changed/);assert.deepEqual(m.writes,[]);});
test('changed archived notes never overwritten',()=>{const m=archiveDone();m.release.body+='independent edit';assert.throws(()=>execute(m),/notes changed independently/);assert.deepEqual(m.writes,[]);});
for(const [field,reason] of [['badSource','non-workflow'],['badMode','non-workflow'],['badGitlink','non-workflow'],['badWorkflow','workflows differ'],['badParents','']])test(field+' rejects archive before tag or release write',()=>{const m=model();m[field]=true;assert.throws(()=>execute(m),reason?new RegExp(reason):undefined);assert.ok(!m.writes.some(w=>w.method==='PATCH'||w.method==='LEASE_DELETE'));assert.equal(m.refs[s.legacyTag],undefined);});
test('truncated tree fails closed',()=>{const m=model();m.truncated=true;assert.throws(()=>execute(m),/Truncated/);assert.deepEqual(m.writes,[]);});
test('default move during construction stops before tag/retag',()=>{const m=model();m.moveDefault=true;assert.throws(()=>execute(m),/Default moved/);assert.ok(!m.writes.some(w=>w.method==='PATCH'||w.method==='LEASE_DELETE'));});
test('newer default with same workflow base allows idempotent no-write retry',()=>{const m=archiveDone();m.main=sha('latermain');m.commits[m.main]={sha:m.main,tree:{sha:S.mainTree},parents:[{sha:S.main}]};execute(m);assert.deepEqual(m.writes,[]);});
test('pending retag refuses workflows differing from current default',()=>{const m=archiveDone();m.release={...model().release};m.refs[s.tag]={raw:s.commit,commit:s.commit};const newTree=sha('newWorkflowTree');m.trees[newTree]=clone(m.trees[S.mainTree]);m.trees[newTree].find(x=>x.path==='.github/workflows').sha=sha('newguards');m.main=sha('latermain');m.commits[m.main]={sha:m.main,tree:{sha:newTree},parents:[{sha:S.main}]};assert.throws(()=>execute(m),/Current default workflows moved/);assert.deepEqual(m.writes,[]);});
test('annotated original tag uses raw object lease',()=>{const m=model();m.refs[s.tag]={raw:sha('annotated'),commit:s.commit};execute(m);assert.equal(m.writes.at(-1).lease,sha('annotated'));preserved(m);});
test('lease failure keeps source, retry retires safely',()=>{const m=model();m.failDelete=true;assert.throws(()=>execute(m),/Old source ref remains/);assert.equal(m.refs[s.tag].commit,s.commit);m.failDelete=false;execute(m);assert.equal(m.refs[s.tag],undefined);preserved(m);});
test('moving original ref at deletion is protected by lease',()=>{const m=model();m.raceDelete=true;assert.throws(()=>execute(m),/source moved during deletion/);assert.equal(m.refs[s.tag].commit,sha('fresh'));preserved(m);});
test('fresh release during archive preserves its source',()=>{const m=model();m.freshDuringPatch=true;assert.equal(execute(m),'fresh-release-preserved');assert.equal(m.refs[s.tag].commit,sha('fresh'));assert.ok(!m.writes.some(w=>w.method==='LEASE_DELETE'));preserved(m);});
test('API503 never treated as absence',()=>{const m=model();m.apiError=(method,route)=>route.startsWith('/releases/tags/');assert.throws(()=>execute(m),/HTTP 503/);assert.deepEqual(m.writes,[]);});
test('gh include200,404CRLF and failure fixtures',()=>{assert.deepEqual(parseGhResponse({status:0,stdout:'HTTP/2.0 200 OK\nContent-Type: application/json\n\n{"id":412437178}\n'}),{status:200,data:{id:412437178}});assert.equal(parseGhResponse({status:1,stdout:'HTTP/1.1 404 Not Found\r\nX: y\r\n\r\n{}'}).status,404);assert.throws(()=>parseGhResponse({status:1,stdout:''}));assert.throws(()=>parseGhResponse({status:1,stdout:'HTTP/2.0 200 OK\nX: y\n\n{}'}),/transport/);assert.throws(()=>parseGhResponse({status:0,stdout:'HTTP/2.0 200 OK\nX: y\n\nnot-json'}));});
console.log(count+' mocked guards passed; no actual API/Git writes.');
