// Run with: node tests/import-regression.js
// Exercises the app's actual delimiter parser and file-import path without launching Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.html'), 'utf8');
function between(a, b) {
  const start = html.indexOf(a), end = html.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, `Source block: ${a}`);
  return html.slice(start, end);
}
const elements = new Map([
  ['#impText', {value:''}], ['#impFmt', {value:''}], ['#importDlg', {open:true}],
]);
const ctx = vm.createContext({
  $: selector => elements.get(selector),
  toast: () => {}, updateImpInfo: () => {}, console,
});
vm.runInContext(`
  ${between('function csvDelimiter(', 'function parsedImport(')}
  ${between('const slidesToCsv =', 'async function loadImportFile(')}
  ${between('async function loadImportFile(', "$('#importDlg').addEventListener('close'")}
  globalThis.api={csvDelimiter,parseCSV,csvToSlides,loadImportFile};
`, ctx);
const { api } = ctx;
const plain = value => JSON.parse(JSON.stringify(value));
const slides = (text, delimiter) => plain(api.csvToSlides(text, delimiter));

assert.deepEqual(slides('1,Bonjour\n2,Adieu'), ['Bonjour','Adieu']);
assert.deepEqual(slides('1\tBonjour\n2\tAdieu'), ['Bonjour','Adieu']);
assert.deepEqual(slides('\ufeffNumber\tText\r\n1\tHello, world!\r\n2\tGoodbye, my love,'), ['Hello, world!','Goodbye, my love,']);
assert.deepEqual(slides('"Bonjour, monde"\n"Line 1\nLine 2"\n"(blank)"'), ['Bonjour, monde','Line 1\nLine 2','']);
assert.deepEqual(slides('1\t"He said ""yes""."\n2\t"Line 1\nLine 2"'), ['He said "yes".','Line 1\nLine 2']);
assert.deepEqual(slides('"One,\twith a tab",Two\nThree,Four'), ['One,\twith a tab','Two','Three','Four']);
assert.deepEqual(slides('"Oh,"\n"Stay,"'), ['Oh,','Stay,'], 'Title punctuation is not a trailing separator');
assert.deepEqual(slides('First,\nSecond,'), ['First','Second'], 'Empty trailing CSV columns do not become slides');
assert.deepEqual(slides('First\tSecond\nThird\t(blank)'), ['First','Second','Third','']);
assert.equal(api.csvDelimiter('"First\tinside quotes",Second'), ',');

(async () => {
  async function importFile(name, text) {
    await api.loadImportFile({name, text:async()=>text});
    assert.equal(elements.get('#impFmt').value, /\.txt$/i.test(name) ? 'text' : 'csv');
    return slides(elements.get('#impText').value);
  }
  assert.deepEqual(await importFile('titles.tsv', '1\tHello, world\n2\tStay, my love,'), ['Hello, world','Stay, my love,']);
  assert.deepEqual(await importFile('one-column.tsv', 'Hello, world\nStay, my love,'), ['Hello, world','Stay, my love,'], 'The TSV filename disambiguates one-column text containing commas');
  assert.deepEqual(await importFile('titles.csv', '1,Hello\tworld\n2,Goodbye'), ['Hello\tworld','Goodbye'], 'A tab in a CSV text field is preserved');
  assert.deepEqual(await importFile('accents.tsv', '1\tÈ lui!\n2\tПой, моя душа\n3\t(blank)'), ['È lui!','Пой, моя душа','']);
  assert.deepEqual(await importFile('multiline.tsv', '1\t"Line 1\r\nLine 2"\n2\tA|B'), ['Line 1\nLine 2','A\nB']);
  console.log('Import regression checks passed: CSV/TSV, file delimiters, quotes, multiline, blanks, accents and punctuation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
