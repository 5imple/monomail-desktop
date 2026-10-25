import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  cleanInlineStyle,
  collectHtmlClasses,
  finalizeInlineStyles,
  getRootVariables,
  parseStyleRules,
  requiredClassesOf,
  resolveVariables,
  selectCssForHtml,
  toLegacyColors
} from '@/renderer/app/lib/mime/emailCss';

// juice's browser build (package.json "browser"), as the renderer gets it.
// Loaded at runtime from node_modules: its cheerio can't be bundled as ESM.
const nodeRequire = createRequire(join(process.cwd(), 'package.json'));
const juice = nodeRequire('juice/client.js') as {
  inlineContent: (html: string, css: string) => string;
};

const tailwindCss = readFileSync(
  join(process.cwd(), 'src/renderer/app/assets/style/tailwind.css'),
  'utf8'
);

// What the compose editor emits (classes from textEditorExtensions.ts).
const EDITOR_HTML =
  '<div class="reset-selection">' +
  '<p style="margin: 1em 0; line-height: 1.5;">Hello <a class="text-blue-600 underline underline-offset-2" href="https://x.com">link</a> <strong>bold</strong></p>' +
  '<blockquote class="border-l-2 pl-4 border-muted-low"><p>quoted</p></blockquote>' +
  '<ul class="pl-4 list-disc ml-1"><li><p>one</p></li></ul>' +
  '<ol class="list-decimal pl-4 ml-1"><li><p>two</p></li></ol>' +
  '<h1 class="text-3xl font-semibold">Title</h1><h2 class="text-2xl font-semibold">Sub</h2>' +
  '<pre class="bg-muted border my-2 py-2 px-3 rounded-md"><code>x = 1</code></pre>' +
  '<p style="text-align: center"><img class="height-auto max-w-full inline-block" src="data:image/png;base64,AAAA"></p>' +
  '<p><mark data-color="#ffff00" style="background-color:#ffff00">hi</mark></p>' +
  '</div>';

const { window } = new JSDOM('');

const finalize = (html: string): string => {
  const container = window.document.createElement('div');
  container.innerHTML = html;
  finalizeInlineStyles(container, getRootVariables(tailwindCss));
  return container.innerHTML;
};

test('parseStyleRules keeps style rules in order and drops at-rules', () => {
  const rules = parseStyleRules(
    '@import url("x.css");.a{color:red}@media (min-width:1px){.b{color:blue}}' +
      '/* c */ p , .c{content:"{"}@font-face{font-family:x}.d:hover{color:green}'
  );
  assert.deepEqual(
    rules.map((rule) => rule.selector),
    ['.a', 'p , .c', '.d:hover']
  );
  assert.equal(rules[1].body, 'content:"{"');
});

test('requiredClassesOf unescapes Tailwind class names and ignores :not() / attributes', () => {
  assert.deepEqual(requiredClassesOf('.w-1\\/2'), ['w-1/2']);
  assert.deepEqual(requiredClassesOf('.hover\\:bg-muted:hover'), ['hover:bg-muted']);
  assert.deepEqual(requiredClassesOf('.dark .dark\\:text-white'), ['dark', 'dark:text-white']);
  assert.deepEqual(requiredClassesOf('.a:not(.b)>[href$=".pdf"]'), ['a']);
  assert.deepEqual(requiredClassesOf('blockquote, p'), []);
});

test('collectHtmlClasses reads every class attribute', () => {
  const classes = collectHtmlClasses(
    '<p class="a  b"><span class=\'c\'>x</span><i class=d></i></p>'
  );
  assert.deepEqual([...classes].sort(), ['a', 'b', 'c', 'd']);
});

test('selectCssForHtml keeps element rules and rules whose classes are all present', () => {
  const css =
    '*{margin:0}p{color:red}.a{color:blue}.b{color:green}.a.b{x:y}.dark .a{z:1}.w-1\\/2{width:50%}';
  const selected = selectCssForHtml(css, '<p class="a w-1/2">x</p>');
  assert.equal(selected, '*{margin:0}\np{color:red}\n.a{color:blue}\n.w-1\\/2{width:50%}');
});

test('the subset is a fraction of the stylesheet', () => {
  const subset = selectCssForHtml(tailwindCss, EDITOR_HTML);
  assert.ok(subset.length < tailwindCss.length / 4, `${subset.length} vs ${tailwindCss.length}`);
});

test('inlining the subset gives the same message as inlining the whole stylesheet', () => {
  const full = finalize(juice.inlineContent(EDITOR_HTML, `<style>${tailwindCss}</style>`));
  const subset = finalize(
    juice.inlineContent(EDITOR_HTML, `<style>${selectCssForHtml(tailwindCss, EDITOR_HTML)}</style>`)
  );
  assert.equal(subset, full);
});

test('the inlined message has no CSS variables, custom properties or UI-only styles', () => {
  const html = finalize(
    juice.inlineContent(EDITOR_HTML, `<style>${selectCssForHtml(tailwindCss, EDITOR_HTML)}</style>`)
  );
  assert.ok(!html.includes('var('), html);
  assert.ok(!/[\s;"]--[a-z]/i.test(html), html);
  assert.ok(!html.includes('user-select'), html);
  assert.ok(!html.includes('cursor'), html);
  // The formatting still arrives, in literal colours.
  const doc = new JSDOM(html).window.document;
  const link = doc.querySelector('a')!.getAttribute('style')!;
  assert.match(link, /color: #2563eb/);
  assert.match(link, /text-decoration-line: underline/);
  assert.match(doc.querySelector('ul')!.getAttribute('style')!, /list-style-type: disc/);
  assert.match(doc.querySelector('ol')!.getAttribute('style')!, /list-style-type: decimal/);
  const quote = doc.querySelector('blockquote')!.getAttribute('style')!;
  assert.match(quote, /border-left-width: 2px/);
  assert.match(quote, /border-color: #[0-9a-f]{6}/);
  assert.match(doc.querySelector('pre')!.getAttribute('style')!, /background-color: #[0-9a-f]{6}/);
  assert.match(doc.querySelector('h1')!.getAttribute('style')!, /font-size: 1\.875rem/);
  assert.match(doc.querySelector('mark')!.getAttribute('style')!, /background-color: #ffff00/);
});

test('resolveVariables uses the lookup, then the fallback, else gives up', () => {
  const vars: Record<string, string> = { '--a': '1', '--b': 'var(--a)', '--empty': ' ' };
  const lookup = (name: string) => vars[name];
  assert.equal(resolveVariables('rgb(1 2 3/var(--a))', lookup), 'rgb(1 2 3/1)');
  assert.equal(resolveVariables('var(--b)', lookup), '1');
  assert.equal(resolveVariables('var(--missing, 4px)', lookup), '4px');
  assert.equal(resolveVariables('var(--missing, var(--a))', lookup), '1');
  assert.equal(resolveVariables('var(--missing)', lookup), null);
  assert.equal(resolveVariables('var(--empty)', lookup), null);
  assert.equal(resolveVariables('calc(var(--a) - 2px)', lookup), 'calc(1 - 2px)');
});

test('toLegacyColors writes modern colour syntax as hex / rgba', () => {
  assert.equal(toLegacyColors('rgb(37 99 235/1)'), '#2563eb');
  assert.equal(toLegacyColors('rgb(37 99 235/.5)'), 'rgba(37, 99, 235, 0.5)');
  assert.equal(toLegacyColors('hsl(0 0% 100%)'), '#ffffff');
  assert.equal(toLegacyColors('hsl(0 100% 50%)'), '#ff0000');
  assert.equal(toLegacyColors('hsl(24 10% 10%/0.04)'), 'rgba(28, 25, 23, 0.04)');
  assert.equal(toLegacyColors('1px solid rgba(204, 204, 204, 1)'), '1px solid #cccccc');
  assert.equal(toLegacyColors('hsl(var(--x))'), 'hsl(var(--x))');
  assert.equal(toLegacyColors('#123'), '#123');
});

test('cleanInlineStyle resolves from the element, then inherited values', () => {
  const { style, variables } = cleanInlineStyle(
    '--tw-text-opacity: 1; color: rgb(37 99 235/var(--tw-text-opacity,1)); border-color: hsl(var(--border)); cursor: default; user-select: none; touch-action: var(--tw-pan-x); margin: 0 !important',
    { '--border': '20 6% 90%' }
  );
  assert.equal(style, 'color: #2563eb; border-color: #e7e5e4; margin: 0 !important;');
  assert.equal(variables['--tw-text-opacity'], '1');
});
