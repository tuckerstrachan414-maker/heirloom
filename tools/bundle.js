// Fold the whole game into one .html file with nothing external in it.
//
// This exists for phones and tablets: iOS will not serve a folder of files to
// Safari, but it will open a single self-contained .html out of the Files app.
// The folder-and-index.html build stays the real one - this is a copy of it.
//
//   node tools/bundle.js [outfile]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'HEIRLOOM.html');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const took = [];

html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">/g, function (m, href) {
  took.push(href);
  return '<style>' + read(href) + '</style>';
});

html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\r?\n?/g, function (m, src) {
  took.push(src);
  return '<script>' + read(src) + '\n</script>\n';
});

function read(rel) {
  const f = path.join(root, rel);
  const s = fs.readFileSync(f, 'utf8');
  // An inline <script> ends at the first </script> in the source, wherever it
  // appears - including inside a string. Nothing here has one, but if that ever
  // changes the bundle would break in a way that is very hard to see.
  if (/<\/script/i.test(s)) throw new Error(rel + ' contains </script - it cannot be inlined as-is');
  if (/<!--/.test(s)) throw new Error(rel + ' contains <!-- which changes meaning inside a script tag');
  return s;
}

const left = html.match(/(src|href)="(?!data:|https?:)[^"]+"/g);
if (left) throw new Error('still referring to files: ' + left.join(', '));

fs.writeFileSync(out, html, 'utf8');
console.log('inlined ' + took.length + ' files:');
console.log('  ' + took.join('\n  '));
console.log('wrote ' + out + '  (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
