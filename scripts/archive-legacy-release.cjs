/* One-time historical-release migration. Run only after successful builds,
 * using the Actions GITHUB_TOKEN. Never deletes a release or an asset.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function parseGhResponse(r) {
  const headers = /^(HTTP\/\S+\s+(\d{3})[^\n]*\r?\n[\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(r.stdout || '');
  assert.ok(headers, 'GitHub API did not return an HTTP response; no further archive changes');
  const status = Number(headers[2]);
  assert.ok(r.status === 0 || status >= 400, 'GitHub CLI transport failed');
  return { status, data: headers[3].trim() ? JSON.parse(headers[3]) : null };
}
function archive({ repository, snapshot: s, api, deleteRef, log = console.log }) {
  assert.equal(repository.toLowerCase(), 'poetic-pixie/supertitle-cuer');
  assert.equal(s.releaseId, 412437178);
  assert.equal(s.commit, '24f8f00d4d6f454420f31d3a8d1a1c731dee4c3a');
  assert.equal(s.tag, 'v1.0.0'); assert.match(s.legacyTag, /^legacy-v1\.0\.0-\d{8}$/);
  assert.equal(s.assets.length, 5); assert.equal(typeof s.originalBody, 'string', 'Original notes must be frozen');
  const prefix = 'repos/' + repository;
  const call = (method, route, body, allowed = [200]) => {
    const r = api(method, prefix + route, body);
    assert.ok(allowed.includes(r.status), `${method} ${route}: unexpected HTTP ${r.status}`); return r;
  };
  const read = route => { const r = call('GET', route, undefined, [200, 404]); return r.status === 404 ? null : r.data; };
  const byTag = tag => read('/releases/tags/' + encodeURIComponent(tag));
  const commit = sha => { const c = call('GET', '/git/commits/' + sha).data; assert.equal(c.sha, sha); return c; };
  function fullTree(sha) {
    const t = call('GET', '/git/trees/' + sha + '?recursive=1').data;
    assert.equal(t.sha, sha); assert.equal(t.truncated, false, 'Truncated Git tree is unsafe'); return t.tree;
  }
  const workflowPath = p => p === '.github/workflows' || p.startsWith('.github/workflows/');
  const entries = (t, wf) => t.filter(e => e.type !== 'tree' && workflowPath(e.path) === wf)
    .map(({path,mode,type,sha}) => ({path,mode,type,sha})).sort((a,b) => a.path.localeCompare(b.path));
  function workflows(t) { const w=t.find(e=>e.path==='.github/workflows'); assert.ok(w&&w.type==='tree'&&w.mode==='040000','Workflow subtree missing'); return w; }
  function defaultState() {
    assert.equal(call('GET','').data.default_branch,'main','Default branch changed');
    const r=call('GET','/git/ref/heads/main').data; assert.equal(r.ref,'refs/heads/main'); assert.equal(r.object.type,'commit');
    const c=commit(r.object.sha),tree=fullTree(c.tree.sha); return {sha:c.sha,tree,workflow:workflows(tree)};
  }
  function tagRef(tag) {
    const r=read('/git/ref/tags/'+encodeURIComponent(tag)); if(!r)return null;
    assert.equal(r.ref,'refs/tags/'+tag); const raw=r.object.sha;let o=r.object;
    for(let depth=0;o.type==='tag';depth++){assert.ok(depth<8,'Too many annotated tags');o=call('GET','/git/tags/'+o.sha).data.object;}
    assert.equal(o.type,'commit');assert.match(raw,/^[a-f0-9]{40}$/);return {raw,commit:o.sha};
  }
  const assetKey = a => a.map(({id,name,size,digest})=>({id,name,size,digest})).sort((a,b)=>a.id-b.id);
  function verify(r) {
    assert.ok(r,'Historical release missing');assert.equal(r.id,s.releaseId);
    assert.ok([s.tag,s.legacyTag].includes(r.tag_name),'Unexpected historical release tag');
    assert.equal(r.published_at,s.publishedAt);assert.equal(r.draft,false);assert.notEqual(r.immutable,true);
    assert.deepEqual(assetKey(r.assets),assetKey(s.assets),'Historical asset identities changed');
    assert.ok(r.assets.every(a=>a.state==='uploaded'),'Historical asset upload state changed');
  }
  const current=byTag(s.tag);
  if(current&&current.id!==s.releaseId){log('Preserving a different/fresh 1.0.0 release.');return 'foreign-release-preserved';}
  const oldRef=tagRef(s.tag);
  if(oldRef&&oldRef.commit!==s.commit){
    if(current){log('Preserving moved 1.0.0 source and release.');return 'foreign-ref-preserved';}
    throw Error('1.0.0 tag points to another commit without a release; refusing to change or publish it');
  }
  let historical=call('GET','/releases/'+s.releaseId).data;verify(historical);
  if(historical.tag_name===s.tag){assert.ok(current&&oldRef,'Historical release/tag inconsistent');assert.equal(historical.body,s.originalBody,'Original notes changed');}
  const existing=byTag(s.legacyTag);if(existing){verify(existing);assert.equal(existing.tag_name,s.legacyTag);}
  const oldCommit=commit(s.commit),oldTree=fullTree(oldCommit.tree.sha),main=defaultState();
  let legacy=tagRef(s.legacyTag);
  if(!legacy){
    // Historical source, replacing only its workflows with current default guards.
    const t=call('POST','/git/trees',{base_tree:oldCommit.tree.sha,tree:[{path:'.github/workflows',mode:'040000',type:'tree',sha:main.workflow.sha}]},[201]).data;
    const tree=fullTree(t.sha);
    assert.deepEqual(entries(tree,false),entries(oldTree,false),'Archive changed historical non-workflow source');
    assert.equal(workflows(tree).sha,main.workflow.sha,'Archive workflows differ from default');
    assert.deepEqual(entries(tree,true),entries(main.tree,true));
    const made=call('POST','/git/commits',{message:'Archive historical 1.0.0 app source '+s.commit+' with current default workflow guards; retain both histories',tree:t.sha,parents:[main.sha,s.commit]},[201]).data;
    const c=commit(made.sha);assert.equal(c.tree.sha,t.sha);assert.deepEqual(c.parents.map(p=>p.sha),[main.sha,s.commit]);
    assert.equal(defaultState().sha,main.sha,'Default moved during archive construction; retry safely');
    // Built-in GITHUB_TOKEN and the non-v prefix prevent historical workflows.
    // PATCH will create the absent legacy tag at this actual verified commit.
    legacy={raw:c.sha,commit:c.sha};
  }
  assert.ok(legacy,'Legacy source tag was not created');
  const archiveCommit=commit(legacy.commit),parents=archiveCommit.parents.map(p=>p.sha);
  assert.equal(parents.length,2);assert.equal(parents[1],s.commit);assert.notEqual(parents[0],s.commit);
  const base=commit(parents[0]),baseTree=fullTree(base.tree.sha),archiveTree=fullTree(archiveCommit.tree.sha);
  assert.deepEqual(entries(archiveTree,false),entries(oldTree,false),'Archive changed historical non-workflow source');
  assert.equal(workflows(archiveTree).sha,workflows(baseTree).sha,'Archive workflows differ from recorded default parent');
  assert.deepEqual(entries(archiveTree,true),entries(baseTree,true));
  if(parents[0]!==main.sha){const comparison=call('GET','/compare/'+parents[0]+'...'+main.sha).data;assert.equal(comparison.merge_base_commit.sha,parents[0],'Recorded workflow base is not in default history');}
  const name='Supertitle Cuer 1.0.0 (legacy - October 14, 2026)';
  const note='> **Historical archive.** These original October 14, 2026 binaries are unchanged. Original app/source commit: `'+s.commit+'`. The archive source retains that app/source verbatim; only `.github/workflows/` was updated to the workflow guards from default-branch commit `'+parents[0]+'`. The original commit remains the archive commit\'s second parent.\n\n---\n\n';
  const body=note+s.originalBody;
  if(historical.tag_name===s.legacyTag){
    assert.equal(historical.body,body,'Archived notes changed independently; refusing to overwrite');
    assert.equal(historical.target_commitish,archiveCommit.sha,'Archived target changed independently');
    assert.equal(historical.name,name);assert.equal(historical.prerelease,true);
  }
  const needsPatch=historical.tag_name!==s.legacyTag||historical.target_commitish!==archiveCommit.sha||historical.name!==name||!historical.prerelease||historical.body!==body;
  if(needsPatch){
    const latest=defaultState();assert.equal(workflows(archiveTree).sha,latest.workflow.sha,'Current default workflows moved; archive target cannot be published');
    // Actual legacy tag and consistent release target are the verified archive commit.
    call('PATCH','/releases/'+s.releaseId,{tag_name:s.legacyTag,target_commitish:archiveCommit.sha,name,body,prerelease:true,make_latest:'false'});
  }
  historical=call('GET','/releases/'+s.releaseId).data;const archived=byTag(s.legacyTag);verify(historical);verify(archived);
  for(const r of [historical,archived]){assert.equal(r.tag_name,s.legacyTag);assert.equal(r.target_commitish,archiveCommit.sha);assert.equal(r.name,name);assert.equal(r.prerelease,true);assert.equal(r.body,body);}
  assert.equal(tagRef(s.legacyTag)?.commit,archiveCommit.sha);
  const occupied=byTag(s.tag);if(occupied){assert.notEqual(occupied.id,s.releaseId);log('Archive retained; a fresh 1.0.0 release already exists.');return 'fresh-release-preserved';}
  const remaining=tagRef(s.tag);
  if(remaining){
    assert.equal(remaining.commit,s.commit,'1.0.0 source moved; preserving it and stopping publication');
    const removed=deleteRef(s.tag,remaining.raw),after=tagRef(s.tag);
    if(after){assert.equal(after.raw,remaining.raw,'1.0.0 source moved during deletion; foreign ref preserved');throw Error('Old source ref remains; safe to retry archive after Git push failure: '+removed);}
  }
  log('Historical release and all five assets retained at '+s.legacyTag+', archive commit '+archiveCommit.sha+'; old 1.0.0 ref retired.');return 'archived';
}
function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Only run from the guarded Actions release job');
  assert.ok(process.env.GH_TOKEN, 'Actions GITHUB_TOKEN must be supplied as GH_TOKEN');
  const root = path.resolve(__dirname, '..');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, '1.0.0');
  const repository = process.env.GITHUB_REPOSITORY;
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'build/legacy-release-1.0.0.json'), 'utf8'));
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  assert.equal(remote.status, 0);
  assert.equal(remote.stdout.trim().replace(/\.git$/, '').toLowerCase(), 'https://github.com/' + repository.toLowerCase());
  const api = (method, endpoint, body) => {
    const args = ['api', '--include', '--method', method, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint];
    if (body !== undefined) args.push('--input', '-');
    const r = spawnSync('gh', args, { encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body), maxBuffer: 4 * 1024 * 1024 });
    return parseGhResponse(r);
  };
  const deleteRef = (tag, raw) => {
    const r = spawnSync('git', ['push', '--porcelain', '--force-with-lease=refs/tags/' + tag + ':' + raw, 'origin', ':refs/tags/' + tag], { encoding: 'utf8' });
    return r.status;
  };
  archive({ repository, snapshot, api, deleteRef });
}
module.exports = { archive, parseGhResponse };
if (require.main === module) { try { main(); } catch (e) { console.error('Legacy archive stopped: ' + e.message); process.exitCode = 1; } }
