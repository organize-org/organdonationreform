#!/usr/bin/env node
// build.js — the whole build for organdonationreform.org.
//
// Reads content/*.md, wraps each in layout/page.html, writes _site/.
// No dependencies, by choice. A three-page reference site does not need a
// framework, and the one thing this site must still do in five years is build.
// Node's standard library is the only thing it asks for.
//
//   node build.js            build into _site/
//   node build.js --serve    build, then serve _site/ on :8080 and rebuild on change
//
// The markdown it understands is a deliberate subset: headings, paragraphs,
// links, bold, italic, lists, blockquotes, horizontal rules and raw HTML blocks.
// Anything it does not recognise is a BUILD FAILURE rather than text passed
// through to the page, because the failure that matters here is a citation that
// quietly renders as literal brackets on a site journalists quote from.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');

// ---------------------------------------------------------------- front matter

// `key: value` lines between --- fences. No nesting, no types: a page needs a
// title, a description and sometimes a permalink, and inventing more structure
// than that would be inventing a format nobody asked for.
function frontMatter(text, where) {
  if (!text.startsWith('---\n')) {
    throw new Error(`${where}: no front matter — every page needs at least a title and description`);
  }
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) throw new Error(`${where}: front matter is not closed with ---`);
  const meta = {};
  for (const line of text.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const at = line.indexOf(':');
    if (at === -1) throw new Error(`${where}: front matter line is not "key: value": ${line}`);
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const need of ['title', 'description']) {
    if (!meta[need]) throw new Error(`${where}: front matter is missing "${need}"`);
  }
  return { meta, body: text.slice(end + 5) };
}

// --------------------------------------------------------------------- inline

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline markdown, innermost first so a link's label can hold emphasis. Links
// are the whole reason this site exists, so an external one always carries
// rel="noopener" and is marked up as external for the stylesheet to show.
function inline(text, where) {
  let out = escapeHtml(text);

  // The href allows one level of balanced parentheses, because real government
  // URLs contain them: the Senate Finance hearing memo is published at a path
  // ending "(FOR%20RELEASE)%20on%20website.pdf", and a pattern that stopped at
  // the first ")" silently truncated it to a dead link.
  out = out.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href) && !href.includes('organdonationreform.org');
    const attrs = external ? ' class="ext" target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // A bracket left over is a citation that did not become a link.
  const stray = out.match(/\[[^\]]*\]\(/);
  if (stray) throw new Error(`${where}: a link did not parse: ${stray[0]}…`);
  return out;
}

// Inline markdown inside a block of hand-written HTML.
//
// The pages need a few structures markdown has no word for — the hero figure,
// the cards, a dated entry in the record — so those are written as HTML. Their
// TEXT is still markdown, and the first version of this build passed such blocks
// through untouched, which rendered 129 citations on the record page as literal
// square brackets. So: split the block on tags and treat only what lies between
// them as markdown. Tags and their attributes are never touched, which is what
// keeps an href from being escaped or parsed a second time.
function inlineInHtml(block, where) {
  return block
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') && part.endsWith('>') ? part : inline(part, where)))
    .join('');
}

// ---------------------------------------------------------------------- blocks

function render(body, where) {
  const lines = body.split('\n');
  const html = [];
  let i = 0;

  const flushList = (tag, items) =>
    html.push(`<${tag}>\n${items.map((t) => `  <li>${t}</li>`).join('\n')}\n</${tag}>`);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // raw HTML block: a line starting with < runs until a blank line. Its text is
    // still markdown — see inlineInHtml.
    if (line.startsWith('<')) {
      const block = [];
      while (i < lines.length && lines[i].trim()) block.push(lines[i++]);
      html.push(inlineInHtml(block.join('\n'), where));
      continue;
    }

    if (/^---+\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2], where);
      // Headings get a stable id so the jump navigation and inbound deep links
      // keep working when the surrounding text is edited.
      const id = heading[2].toLowerCase().replace(/<[^>]+>/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      html.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^[-*]\s+/, ''), where));
        i++;
      }
      flushList('ul', items);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\d+\.\s+/, ''), where));
        i++;
      }
      flushList('ol', items);
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('> ')) quote.push(lines[i++].slice(2));
      html.push(`<blockquote>${inline(quote.join(' '), where)}</blockquote>`);
      continue;
    }

    // paragraph: everything up to a blank line
    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('<') &&
           !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s|---+\s*$)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    html.push(`<p>${inline(para.join(' '), where)}</p>`);
  }

  return html.join('\n');
}

// ----------------------------------------------------------------------- pages

function build() {
  const layout = fs.readFileSync(path.join(ROOT, 'layout', 'page.html'), 'utf8');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(path.join(ROOT, 'content')).filter((f) => f.endsWith('.md'));
  const built = [];

  for (const file of files) {
    const where = `content/${file}`;
    const { meta, body } = frontMatter(fs.readFileSync(path.join(ROOT, 'content', file), 'utf8'), where);
    const slug = file.replace(/\.md$/, '');
    // index.md is the root; everything else is a directory with an index.html,
    // so the published URL has no .html in it and can be moved later.
    const dir = slug === 'index' ? OUT : path.join(OUT, meta.permalink || slug);
    fs.mkdirSync(dir, { recursive: true });

    const page = layout
      .replace(/\{\{title\}\}/g, escapeHtml(meta.title))
      .replace(/\{\{description\}\}/g, escapeHtml(meta.description))
      .replace(/\{\{canonical\}\}/g, slug === 'index' ? '/' : `/${meta.permalink || slug}/`)
      .replace(/\{\{class\}\}/g, meta.class || slug)
      .replace('{{content}}', render(body, where));

    if (page.includes('{{')) {
      throw new Error(`${where}: the layout still has an unfilled placeholder: ${page.match(/\{\{\w+\}\}/)[0]}`);
    }

    fs.writeFileSync(path.join(dir, 'index.html'), page);
    built.push(path.relative(OUT, path.join(dir, 'index.html')));
  }

  // static/ is copied verbatim: the stylesheet, 404.html, robots.txt, images.
  const copy = (from, to) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copy(src, dst); }
      else { fs.copyFileSync(src, dst); built.push(path.relative(OUT, dst)); }
    }
  };
  copy(path.join(ROOT, 'static'), OUT);

  console.log(`built ${built.length} files into _site/`);
  for (const f of built.sort()) console.log(`  ${f}`);
}

// ---------------------------------------------------------------------- serve

function serve() {
  const http = require('http');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
                  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
                  '.ico': 'image/x-icon', '.txt': 'text/plain', '.pdf': 'application/pdf' };
  http.createServer((req, res) => {
    let p = path.join(OUT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(OUT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) {
      // the same shape CloudFront serves: a missing path gets the 404 page
      p = path.join(OUT, '404.html');
      if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
      res.writeHead(404, { 'content-type': types['.html'] });
      res.end(fs.readFileSync(p));
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  }).listen(8080, () => console.log('serving _site/ on http://localhost:8080'));

  for (const dir of ['content', 'layout', 'static']) {
    fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
      try { build(); } catch (e) { console.error(`build failed: ${e.message}`); }
    });
  }
}

if (require.main === module) {
  try {
    build();
    if (process.argv.includes('--serve')) serve();
  } catch (e) {
    console.error(`build failed: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { inline, render, frontMatter };
