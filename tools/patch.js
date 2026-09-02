// Exact-string patcher. node tools/patch.js <file> <jsonPatchFile>
// Patch file: [{ find: "...", replace: "...", count: 1 }]
// Fails loudly if a `find` does not appear exactly `count` times.
const fs = require('fs');
const [, , file, patchFile] = process.argv;
let src = fs.readFileSync(file, 'utf8');
const patches = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
let ok = true;
for (const p of patches) {
  const want = p.count === undefined ? 1 : p.count;
  const parts = src.split(p.find);
  const found = parts.length - 1;
  if (found !== want) {
    console.error('FAIL x' + found + ' (wanted ' + want + '): ' + JSON.stringify(p.find.slice(0, 70)));
    ok = false; continue;
  }
  src = parts.join(p.replace);
  console.log('ok  ' + JSON.stringify(p.find.slice(0, 60)));
}
if (!ok) { console.error('NO CHANGES WRITTEN'); process.exit(1); }
fs.writeFileSync(file, src, 'utf8');
console.log('wrote ' + file);
