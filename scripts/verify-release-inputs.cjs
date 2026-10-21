/* Frozen 1.0.0 release evidence: source, rebuilt HTML, packed runtime and uploads.
 * STQ_VERIFY_ROOT permits read-only checks against an existing local build.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(process.env.STQ_VERIFY_ROOT || path.join(__dirname, '..'));
const manifest = require('../build/release-1.0.0-manifest.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [mode, ...args] = process.argv.slice(2);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function check(bytes, item) { assert.equal(hash(bytes), item.sha256, 'Audited bytes differ: ' + item.path); }
function disk(item) { check(fs.readFileSync(path.join(root, item.path)), item); }
function source() {
  assert.equal(pkg.version, manifest.version, 'Manifest version must match package');
  manifest.sourceInputs.forEach(disk);
  manifest.npmInlineLibraryInputs.forEach(disk);
  console.log('Verified frozen source and four inline dependency bundles');
}
function html() { source(); disk(manifest.standalone); console.log('Verified standalone HTML'); }
function packaged(target) {
  html();
  const asar = createRequire(path.join(root, 'package.json'))('@electron/asar');
  const targets = target === 'mac' ? [
    'release/mac-arm64/Supertitle Cuer.app/Contents/Resources/app.asar',
    'release/mac/Supertitle Cuer.app/Contents/Resources/app.asar',
  ] : target === 'win' ? ['release/win-unpacked/resources/app.asar'] : args;
  assert.ok(targets.length, 'Specify mac, win, or ASAR paths');
  const expected = manifest.packagedFiles.map(x => x.path);
  for (const file of targets) {
    const archive = path.resolve(root, file);
    for (const name of asar.listPackage(archive).map(x => x.replace(/^[/\\]/, '').replace(/\\/g, '/'))) {
      assert.ok(expected.includes(name) || expected.some(x => x.startsWith(name + '/')), 'Unexpected packaged entry: ' + name);
    }
    for (const item of manifest.packagedFiles) check(asar.extractFile(archive, item.path), item);
    console.log('Verified all seven packed runtime files: ' + file);
  }
}
function expectedNames() {
  return ['SHA256SUMS.txt', `Supertitle_Cuer-${pkg.version}-arm64.dmg`, `Supertitle_Cuer-${pkg.version}-x64.dmg`, `Supertitle_Cuer-Setup-${pkg.version}.exe`, 'Supertitle_Cuer.html', 'Supertitle_Cuer_Manual.pdf'].sort();
}
function assets(folder) {
  const dir = path.resolve(root, folder), names = fs.readdirSync(dir).sort();
  assert.deepEqual(names, expectedNames(), 'Release must contain exactly six expected filenames');
  const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
  const checks = new Map(sums.map(line => {
    const match = /^([a-f0-9]{64})  (\S+)$/.exec(line);
    assert.ok(match, 'Malformed checksum line'); return [match[2], match[1]];
  }));
  assert.equal(sums.length, 5); assert.equal(checks.size, 5);
  for (const name of names.filter(x => x !== 'SHA256SUMS.txt')) assert.equal(hash(fs.readFileSync(path.join(dir, name))), checks.get(name), 'Checksum mismatch: ' + name);
  if (pkg.version === manifest.version) {
    check(fs.readFileSync(path.join(dir, 'Supertitle_Cuer.html')), manifest.standalone);
    check(fs.readFileSync(path.join(dir, 'Supertitle_Cuer_Manual.pdf')), manifest.packagedFiles.find(x => x.path === 'docs/Supertitle_Cuer_Manual.pdf'));
  }
  return { dir, names };
}
function remote(folder, response, id) {
  const { dir, names } = assets(folder), release = JSON.parse(fs.readFileSync(response, 'utf8'));
  assert.equal(String(release.id), id, 'Must inspect the release just created');
  assert.equal(release.tag_name, 'v' + pkg.version);
  assert.equal(release.draft, true, 'Assets must be verified before public release');
  assert.deepEqual(release.assets.map(x => x.name).sort(), names, 'Remote release must contain exactly six assets');
  for (const asset of release.assets) {
    const bytes = fs.readFileSync(path.join(dir, asset.name));
    assert.equal(asset.state, 'uploaded', 'Asset upload incomplete: ' + asset.name);
    assert.equal(asset.size, bytes.length, 'Remote size mismatch: ' + asset.name);
    assert.equal(asset.digest, 'sha256:' + hash(bytes), 'Remote digest mismatch: ' + asset.name);
  }
  console.log('Verified six uploaded draft assets against local CI hashes');
}
if (mode === 'source') source();
else if (mode === 'html') html();
else if (mode === 'package') packaged(args[0]);
else if (mode === 'assets') { assets(args[0]); console.log('Verified six exact release assets and checksums'); }
else if (mode === 'remote') remote(...args);
else throw new Error('Expected source, html, package, assets, or remote mode');
