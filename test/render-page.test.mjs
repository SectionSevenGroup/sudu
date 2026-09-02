// The build-time renderer against small fixtures, one per construct the
// site's templates use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, evaluateComponent } from '../lib/render-page.mjs';

const page = (template, script = 'class Component extends DCLogic { renderVals() { return {}; } }', helmet = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<title>Fixture</title>
<script src="./js/support.js?v=abc"></script>
<link rel="stylesheet" href="css/rail.css">
</head>
<body>
<x-dc>
<helmet>
${helmet}<style>
  body { margin: 0; }
</style>
</helmet>
${template}
</x-dc>
<script type="text/x-dc" data-dc-script>
${script}
</script>
</body>
</html>
`;

test('a text binding is substituted from renderVals', () => {
  const out = renderPage(page('<p data-i18n="x.a">{{ copy.a }}</p>', `class Component extends DCLogic {
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
  const src = page('<div><sc-if value="{{ show }}" hint-placeholder-val="{{ false }}"><b>shown</b></sc-if><sc-if value="{{ !show }}"><i>hidden</i></sc-if></div>');
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

test('the helmet moves into the head and the runtime is gone', () => {
  const out = renderPage(page('<div>body</div>', undefined, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<script src="js/x.js" defer></script>\n'), { vals: {} });
  const head = out.slice(0, out.indexOf('</head>'));
  assert.match(head, /<link rel="preconnect" href="https:\/\/fonts.gstatic.com" crossorigin>/);
  assert.match(head, /<script src="js\/x.js" defer><\/script>/);
  assert.match(head, /body \{ margin: 0; \}/);
  assert.match(head, /html,body\{height:100%;margin:0\}#page\{height:100%\}/);
  assert.doesNotMatch(out, /support\.js|<x-dc|<\/x-dc>|<helmet|data-dc-script|dc-root/);
  assert.match(out, /<body>\n<div id="page"><div>body<\/div><\/div>\n<\/body>/);
});

test('an unresolved binding or a function value fails the build', () => {
  assert.throws(() => renderPage(page('<p>{{ nope }}</p>'), { vals: {} }), /did not resolve/);
  assert.throws(() => renderPage(page('<button onClick="{{ go }}">x</button>'), { vals: { go: () => {} } }), /cannot be rendered statically/);
});

test('evaluateComponent sees the stub document and data-props defaults', () => {
  const src = page('<p>{{ lang }} {{ accent }}</p>', `class Component extends DCLogic {
  state = { lang: (typeof document !== 'undefined' && document.documentElement.lang) || 'en' };
  renderVals() { return { lang: this.state.lang, accent: this.props.accent }; }
}`).replace('data-dc-script>', 'data-dc-script data-props="{&quot;accent&quot;:{&quot;default&quot;:&quot;#E17B3E&quot;}}">');
  assert.deepEqual(evaluateComponent(src, { lang: 'fr' }), { accent: '#E17B3E', lang: 'fr' });
  assert.match(renderPage(src), /<p>en #E17B3E<\/p>/);
});
