// Fold the whole game into one .html file with nothing external in it.
//
//   node tools/bundle.js                 -> HEIRLOOM.html, a standalone page
//   node tools/bundle.js --artifact      -> HEIRLOOM.artifact.html
//
// The standalone build exists for phones and tablets that will open a single
// self-contained .html out of a file manager. The artifact build is the same
// page with its <!doctype>, <html>, <head> and <body> removed, because the
// Artifact host supplies those - it wants the page content on its own, with
// the <title> and <style> at the top.
//
// The folder-and-index.html build is still the real one. Both of these are
// copies of it, so neither can drift.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const artifact = process.argv.includes('--artifact');
const named = process.argv.slice(2).filter(function (a) { return a.charAt(0) !== '-'; })[0];
const out = named || path.join(root, artifact ? 'HEIRLOOM.artifact.html' : 'HEIRLOOM.html');

const HOST = "/* Published as a Claude Artifact. The host supplies the document head, so\n   everything index.html would have set there is re-asserted here: the page is\n   a dark, full-bleed canvas, not a document on the light ground the host\n   paints by default, and the map has to own its own touch gestures. */\nhtml{color-scheme:dark}\nhtml,body{height:100%;margin:0;background:#14120f;overscroll-behavior:none}\nbody{touch-action:manipulation}\n#world{touch-action:none}\n";

const took = [];

function read(rel) {
  const s = fs.readFileSync(path.join(root, rel), 'utf8');
  // An inline <script> ends at the first </script> in the source wherever it
  // appears, including inside a string. Nothing here has one, but if that ever
  // changes the bundle would break in a way that is very hard to see.
  if (/<\/script/i.test(s)) throw new Error(rel + ' contains </script - it cannot be inlined as-is');
  if (/<!--/.test(s)) throw new Error(rel + ' contains <!-- which changes meaning inside a script tag');
  took.push(rel);
  return s;
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// The Artifact host owns the document shell, so hand it the body only.
if (artifact) {
  const body = html.match(/<body>([\s\S]*)<\/body>/);
  if (!body) throw new Error('index.html has no <body> to lift out');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'HEIRLOOM'])[1];
  html = '<title>' + title + '</title>\n' +
         '<style>\n' + read('css/style.css') + '</style>\n' +
         '<style>\n' + HOST + '</style>\n' +
         body[1].replace(/^\s*\n/, '');
} else {
  html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">/g, function (m, href) {
    return '<style>' + read(href) + '</style>';
  });
}

html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\r?\n?/g, function (m, src) {
  return '<script>' + read(src) + '\n</script>\n';
});

const left = html.match(/(src|href)="(?!data:|https?:)[^"]+"/g);
if (left) throw new Error('still referring to files: ' + left.join(', '));

fs.writeFileSync(out, html, 'utf8');
console.log('inlined ' + took.length + ' files' + (artifact ? ' (artifact build)' : ''));
console.log('wrote ' + out + '  (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
