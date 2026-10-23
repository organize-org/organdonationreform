// Tests for the build. `node --test` — no framework, same reasoning as build.js.
//
// The thing worth testing here is not that markdown becomes HTML. It is that a
// CITATION cannot silently stop being a link, because this site's only claim on a
// reader is that every assertion goes back to a primary document.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { inline, render, frontMatter } = require('./build.js');

const W = 'test';

test('a link becomes a link', () => {
  assert.equal(inline('see [the letter](https://example.gov/a)', W),
    'see <a href="https://example.gov/a" class="ext" target="_blank" rel="noopener noreferrer">the letter</a>');
});

test('an internal link is not marked external and does not open a new tab', () => {
  const out = inline('[the record](/timelines/)', W);
  assert.equal(out, '<a href="/timelines/">the record</a>');
  assert.ok(!out.includes('target='));
});

test('a link to our own subdomain counts as internal', () => {
  const out = inline('[the report](https://costlyeffects.organdonationreform.org/)', W);
  assert.ok(!out.includes('class="ext"'), 'our own report is not an outside source');
});

// This is the regression that matters: the first version of the build passed HTML
// blocks through untouched and 129 citations on the record page rendered as
// literal square brackets. The build must now refuse to do that quietly.
test('a citation that failed to parse fails the build', () => {
  assert.throws(() => inline('see [the letter](', W), /a link did not parse/);
});

test('markdown inside a hand-written HTML block still renders', () => {
  const out = render(
    '<ul class="entries">\n  <li><span class="when">July 2025</span>' +
    '<div class="what"><p>The committee [held a hearing](https://example.gov/h).</p></div></li>\n</ul>', W);
  assert.ok(out.includes('<a href="https://example.gov/h"'), 'the citation became a link');
  assert.ok(out.includes('class="entries"'), 'the structural markup survived');
  assert.ok(!out.includes(']('), 'no raw markdown is left on the page');
});

test('a tag attribute is never escaped or re-parsed', () => {
  const out = render('<a href="/x?a=1&b=2" class="card">a [link](https://e.gov/1)</a>', W);
  assert.ok(out.includes('href="/x?a=1&b=2"'), 'the attribute is untouched');
  assert.ok(out.includes('<a href="https://e.gov/1"'));
});

test('text is escaped but markup is not', () => {
  assert.equal(inline('Wyden & Grassley <ital>', W), 'Wyden &amp; Grassley &lt;ital&gt;');
});

test('emphasis renders, and does not eat a link', () => {
  assert.equal(inline('**bold** and *italic*', W), '<strong>bold</strong> and <em>italic</em>');
});

test('headings get a stable id for deep links', () => {
  assert.ok(render('## Senate Finance Committee', W)
    .includes('<h2 id="senate-finance-committee">'));
});

test('lists, quotes and rules render', () => {
  assert.ok(render('- one\n- two', W).startsWith('<ul>'));
  assert.ok(render('1. one\n2. two', W).startsWith('<ol>'));
  assert.ok(render('> quoted', W).includes('<blockquote>quoted</blockquote>'));
  assert.ok(render('---', W).includes('<hr>'));
});

test('a paragraph joins its wrapped lines', () => {
  assert.equal(render('one line\nand the next', W), '<p>one line and the next</p>');
});

test('front matter is required, closed, and carries a title and description', () => {
  assert.throws(() => frontMatter('no front matter', W), /no front matter/);
  assert.throws(() => frontMatter('---\ntitle: a\n', W), /not closed/);
  assert.throws(() => frontMatter('---\ntitle: a\n---\nbody', W), /missing "description"/);
  const { meta, body } = frontMatter('---\ntitle: A\ndescription: B\n---\nthe body', W);
  assert.deepEqual(meta, { title: 'A', description: 'B' });
  assert.equal(body, 'the body');
});

// Every page the site publishes, checked as the build actually renders it.
//
// A source link is written either as markdown or, inside the hand-written blocks,
// as an anchor already. Both count: the invariant is that the number of links on
// the finished page equals the number in the source, so none can be dropped by a
// change to the renderer.
test('every published page keeps all of its citations', () => {
  const fs = require('fs');
  const files = fs.readdirSync('./content').filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 3, 'the three pages of the site are present');

  for (const file of files) {
    const src = fs.readFileSync(`./content/${file}`, 'utf8');
    const { body } = frontMatter(src, file);
    // `<a\s[^>]*href=` and not `<a href=`: the cards carry a class before the
    // href, and a pattern that missed them reported a page of sources as a page
    // with none.
    const anchors = /<a\s[^>]*href=/g;
    const wanted = (body.match(/\]\(/g) || []).length + (body.match(anchors) || []).length;
    const out = render(body, file);
    const got = (out.match(anchors) || []).length;
    assert.equal(got, wanted,
      `${file}: ${wanted} links in the source, ${got} on the page`);
    assert.ok(!out.includes(']('), `${file}: raw markdown left on the page`);
    assert.ok(wanted > 0, `${file}: a page of this site with no sources at all is a mistake`);
  }
});
