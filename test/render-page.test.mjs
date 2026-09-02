// The build-time renderer against small fixtures, one per construct the
// site's templates use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, evaluateComponent } from '../lib/render-page.mjs';

const page = (template, script = 'class Component { renderVals() { return {}; } }', head = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<title>Fixture</title>
<link rel="stylesheet" href="css/rail.css">
${head}<style>
  body { margin: 0; }
</style>
</head>
<body>
${template}
<script type="text/plain" data-page-script>
${script}
</script>
</body>
</html>
`;

test('a text binding is substituted from renderVals', () => {
  const out = renderPage(page('<p data-i18n="x.a">{{ copy.a }}</p>', `class Component {
  static COPY = { a: 'Hello there' };
  renderVals() { return { copy: Component.COPY }; }
}`));
  assert.match(out, /<p data-i18n="x.a">Hello there<\/p>/);
  assert.doesNotMatch(out, /\{\{/);
});

test('a loop expands with the loop variable and $index', () => {
  const out = renderPage(page('<ul><sc-for list="{{ items }}" as="it"><li class="row"><a href="{{ it.href }}">{{ it.name }}</a> {{ $index }}</li></sc-for></ul>'), {
    vals: { items: [{ name: 'One', href: '/one/' }, { name: 'Two', href: '/two/' }] },
  });
  assert.match(out, /<ul><li class="row"><a href="\/one\/">One<\/a> 0<\/li><li class="row"><a href="\/two\/">Two<\/a> 1<\/li><\/ul>/);
  assert.doesNotMatch(out, /sc-for/);
});

test('a conditional renders its children only when truthy', () => {
  const src = page('<div><sc-if value="{{ show }}"><b>shown</b></sc-if><sc-if value="{{ !show }}"><i>hidden</i></sc-if></div>');
  assert.match(renderPage(src, { vals: { show: true } }), /<div><b>shown<\/b><\/div>/);
  assert.match(renderPage(src, { vals: { show: false } }), /<div><i>hidden<\/i><\/div>/);
});

test('style-hover becomes a generated class and an !important rule', () => {
  const out = renderPage(page('<a class="nav" style="color:#000;" style-hover="color:#E17B3E; border-bottom-color:#E17B3E;">A</a><a style-hover="color:#E17B3E; border-bottom-color:#E17B3E;">B</a><span style-focus="left:8px;">C</span>'), { vals: {} });
  assert.match(out, /<a class="nav scp0" style="color:#000;">A<\/a>/);
  assert.match(out, /<a class="scp0">B<\/a>/, 'the same declaration reuses the class');
  assert.match(out, /<span class="scp1">C<\/span>/);
  assert.match(out, /\.scp0:hover\{color:#E17B3E !important;border-bottom-color:#E17B3E !important\}/);
  assert.match(out, /\.scp1:focus\{left:8px !important\}/);
  assert.ok(out.indexOf('.scp0:hover') < out.indexOf('</head>'), 'the rule lands in the head style block');
});

test('bound text and attributes are escaped, template markup is not', () => {
  const out = renderPage(page('<p title="{{ t }}">{{ t }} &amp; <em>kept</em></p>'), { vals: { t: '<b>"x" & y</b>' } });
  assert.match(out, /<p title="&lt;b&gt;&quot;x&quot; &amp; y&lt;\/b&gt;">&lt;b&gt;"x" &amp; y&lt;\/b&gt; &amp; <em>kept<\/em><\/p>/);
});

test('a mixed attribute keeps the template text and escapes only the bound value', () => {
  const out = renderPage(page('<img srcset="/.netlify/images?url=/{{ src }}&amp;w=480 480w" alt="{{ alt }} &amp; co">'), { vals: { src: 'a&b.jpg', alt: 'x' } });
  assert.match(out, /<img srcset="\/.netlify\/images\?url=\/a&amp;b.jpg&amp;w=480 480w" alt="x &amp; co">/);
});

test('the head is kept, the body is wrapped in #page and the page script is gone', () => {
  const out = renderPage(page('<div>body</div>', undefined, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<script src="js/x.js" defer></script>\n'), { vals: {} });
  const head = out.slice(0, out.indexOf('</head>'));
  assert.match(head, /<link rel="preconnect" href="https:\/\/fonts.gstatic.com" crossorigin>/);
  assert.match(head, /<script src="js\/x.js" defer><\/script>/);
  assert.match(head, /body \{ margin: 0; \}/);
  assert.match(head, /html,body\{height:100%;margin:0\}#page\{height:100%\}/);
  assert.doesNotMatch(out, /data-page-script|class Component/);
  assert.match(out, /<body>\n<div id="page"><div>body<\/div><\/div>\n<\/body>/);
});

test('a head without a style block gets one for the pseudo sheet', () => {
  const src = '<!DOCTYPE html>\n<html><head><title>x</title></head>\n<body>\n<a style-hover="color:#000;">A</a>\n</body>\n</html>\n';
  const out = renderPage(src, { vals: {} });
  assert.match(out, /<head><title>x<\/title><style>\n\.scp0:hover\{color:#000 !important\}\nhtml,body\{height:100%;margin:0\}#page\{height:100%\}\n<\/style>\n<\/head>/);
  assert.match(out, /<body>\n<div id="page"><a class="scp0">A<\/a><\/div>\n<\/body>/);
});

test('an unresolved binding or a function value fails the build', () => {
  assert.throws(() => renderPage(page('<p>{{ nope }}</p>'), { vals: {} }), /did not resolve/);
  assert.throws(() => renderPage(page('<button onClick="{{ go }}">x</button>'), { vals: { go: () => {} } }), /cannot be rendered statically/);
});

test('evaluateComponent runs the page script with nothing of the browser in scope', () => {
  const src = page('<p>{{ a }}</p>', `class Component {
  static COPY = { a: 'from the class' };
  renderVals() { return { a: Component.COPY.a, hasWindow: typeof window !== 'undefined' }; }
}`);
  assert.deepEqual(evaluateComponent(src), { a: 'from the class', hasWindow: false });
  assert.match(renderPage(src), /<p>from the class<\/p>/);
  assert.throws(() => evaluateComponent(page('<p></p>', 'var Component = 1;')), /does not define class Component/);
  assert.throws(() => evaluateComponent('<html><body></body></html>'), /no <script data-page-script>/);
});

test('null and false bind to nothing; an object bound as text fails the build', () => {
  const out = renderPage(page('<img src="{{ src }}" width="{{ w }}"><p>{{ none }}</p>'), { vals: { src: 'a.jpg', w: null, none: null } });
  assert.match(out, /<img src="a.jpg"><p><\/p>/);
  assert.throws(() => renderPage(page('<i>{{ x }}</i>'), { vals: { x: { type: () => {} } } }), /is not text/);
});
