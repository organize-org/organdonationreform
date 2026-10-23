# organdonationreform.org

The main site. Three pages: the front page, **Timelines**, and **Website
Misinformation**.

Rebuilt from the Wix site in October 2026. **The words are the Wix site's own.**
Nothing was rewritten, summarised, or added — the rebuild changed the typography,
the structure and the hosting, and left the text alone. Two things were dropped:
Wix's "top of page" / "bottom of page" anchors, and the phrase "click here",
because each card is now itself the link.

## Editing

The content is in `content/`, one markdown file per page:

| file | published at |
|---|---|
| `content/index.md` | `/` |
| `content/timelines.md` | `/timelines/` |
| `content/website-misinformation.md` | `/website-misinformation/` |

Each starts with front matter — a `title` and a `description` (the sentence that
shows under the title in a search result), and a `permalink` where the URL is not
the filename.

**Adding an entry to a timeline.** Find the right section, copy the line above,
and change the date and the text. A citation is `[the words you see](the URL)`:

```html
<li><span class="when">October 2026</span><div class="what"><p>Senators
  [Wyden and Grassley](https://www.finance.senate.gov/...) write to HRSA
  about X. See [Washington Post](https://www.washingtonpost.com/...).</p></div></li>
```

Newest first within each section.

**Adding a myth and its fact check.** Copy a whole `<div class="check">` block
and replace the two pieces of text.

## Building

```sh
node build.js            # build into _site/
node build.js --serve    # build, serve on http://localhost:8080, rebuild on save
node --test              # run the tests
```

No dependencies, and nothing to install. Node's standard library is all it uses.
A three-page reference site does not need a framework, and the one thing this
site has to still do in five years is build.

The markdown it understands is a deliberate subset: headings, paragraphs, links,
bold, italic, lists, blockquotes, rules, and raw HTML blocks whose text is still
markdown. **Anything it does not recognise fails the build** rather than
appearing on the page as literal brackets. That is the point: the site's whole
claim on a reader is that assertions link to primary documents, so a citation
must never silently stop being a link. `node --test` checks that the number of
links on each finished page equals the number in its source.

## Publishing

The same path as the other two Organize sites: a merge to `main` builds in AWS
CodeBuild, writes `releases/<sha>/` to S3, and moves the CloudFront pointer. A
pull request publishes a preview and comments the link on the request. Rolling
back is the pointer moving the other way and takes about 25 seconds.

See `ship/README.md` in the `fleet/aws` registry repo for the operator detail.
