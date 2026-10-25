/**
 * CSS for outgoing mail.
 *
 * The compose editor marks its HTML up with Tailwind utility classes (lists,
 * quotes, code, headings, links), and Send inlines the app stylesheet so
 * recipients see the same formatting. Two problems with feeding juice the
 * whole compiled sheet: it parsed and matched ~1,500 rules on every send, and
 * what it inlined was the app's CSS variables (`hsl(var(--muted-low))`, plus
 * every `:root` token on the wrapper), which mail clients can't resolve, and
 * the app's own `cursor` / `user-select: none` (unselectable text in Apple
 * Mail).
 *
 * selectCssForHtml keeps only the rules that can match the message (rules
 * whose classes all occur in it, plus element rules), in source order, so the
 * inlined result is the same for every class the message uses.
 * finalizeInlineStyles then resolves var() to literal values (light theme),
 * writes colours in the rgb/hex syntax older clients understand, and drops
 * custom properties and the UI-only declarations.
 */

export interface StyleRule {
  selector: string;
  body: string;
}

interface ParsedRule extends StyleRule {
  /** Per selector in the list: the classes an element tree needs for it to match. */
  requiredClasses: string[][];
}

interface ParsedSheet {
  css: string;
  rules: ParsedRule[];
  rootVariables: Record<string, string>;
}

// Declarations that belong to the app's UI, never to a message.
const DROPPED_PROPERTIES = new Set([
  'cursor',
  'user-select',
  '-webkit-user-select',
  '-moz-user-select',
  '-ms-user-select'
]);

const stripComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, '');

/** Index just past a quoted string starting at `start` (which holds the quote). */
const skipString = (text: string, start: number): number => {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return text.length;
};

/**
 * Top-level style rules of a stylesheet, in source order. At-rules (@media,
 * @import, @font-face, @keyframes, @supports…) are left out: they can't be
 * inlined, and juice didn't inline them either.
 */
export function parseStyleRules(css: string): StyleRule[] {
  const rules: StyleRule[] = [];
  const n = css.length;
  let i = 0;
  while (i < n) {
    // Prelude: up to a '{' (rule / block at-rule) or ';' (statement at-rule).
    const start = i;
    let paren = 0;
    while (i < n) {
      const c = css[i];
      if (c === '"' || c === "'") {
        i = skipString(css, i);
        continue;
      }
      if (c === '/' && css[i + 1] === '*') {
        const end = css.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      if (c === '(') paren += 1;
      else if (c === ')') paren = Math.max(0, paren - 1);
      else if (paren === 0 && (c === '{' || c === ';' || c === '}')) break;
      i += 1;
    }
    if (i >= n) break;
    const prelude = stripComments(css.slice(start, i)).trim();
    if (css[i] !== '{') {
      // A statement at-rule (`@import …;`) or a stray brace.
      i += 1;
      continue;
    }
    // Block: to the matching close brace.
    const blockStart = i + 1;
    let depth = 1;
    i += 1;
    while (i < n && depth > 0) {
      const c = css[i];
      if (c === '"' || c === "'") {
        i = skipString(css, i);
        continue;
      }
      if (c === '/' && css[i + 1] === '*') {
        const end = css.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      i += 1;
    }
    const body = css.slice(blockStart, Math.max(blockStart, i - 1));
    if (prelude && !prelude.startsWith('@')) rules.push({ selector: prelude, body });
  }
  return rules;
}

/** Splits on `separator` outside parentheses, brackets and strings. */
export function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipString(value, i);
      continue;
    }
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === separator && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(value.slice(start));
  return parts;
}

const unescapeIdent = (ident: string): string =>
  ident.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_, hex: string, char: string) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : char
  );

// Functional pseudo-classes whose contents don't have to be present for the
// selector to match (:not(.x) matches without .x) — or that list
// alternatives. Their classes are not required.
const FUNCTIONAL_PSEUDO = /:(?:not|is|where|has|matches|-webkit-any|-moz-any)\(/i;

const removeFunctionalPseudos = (selector: string): string => {
  let result = selector;
  for (let guard = 0; guard < 50; guard += 1) {
    const match = FUNCTIONAL_PSEUDO.exec(result);
    if (!match) break;
    let depth = 0;
    let end = match.index + match[0].length - 1; // at '('
    for (; end < result.length; end += 1) {
      if (result[end] === '\\') {
        end += 1;
        continue;
      }
      if (result[end] === '(') depth += 1;
      else if (result[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    result = result.slice(0, match.index) + result.slice(end + 1);
  }
  return result;
};

// Attribute selectors can hold dots (`[href$=".pdf"]`); escaped brackets
// (`.\[\&\>p\]\:x`) are part of a class name and stay.
const removeAttributeSelectors = (selector: string): string => {
  let out = '';
  let i = 0;
  while (i < selector.length) {
    const c = selector[i];
    if (c === '\\') {
      out += selector.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '[') {
      i += 1;
      while (i < selector.length && selector[i] !== ']') {
        if (selector[i] === '\\') i += 1;
        else if (selector[i] === '"' || selector[i] === "'") {
          i = skipString(selector, i) - 1;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
};

/** The class names an element tree must contain for `selector` to match. */
export function requiredClassesOf(selector: string): string[] {
  const simplified = removeAttributeSelectors(removeFunctionalPseudos(selector));
  const classes: string[] = [];
  const pattern = /\.((?:\\[0-9a-fA-F]{1,6}\s?|\\[\s\S]|[A-Za-z0-9_-])+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(simplified))) classes.push(unescapeIdent(match[1]));
  return classes;
}

const decodeAttribute = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&');

/** Every class used by an HTML fragment. */
export function collectHtmlClasses(html: string): Set<string> {
  const classes = new Set<string>();
  const pattern = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const value = decodeAttribute(match[1] ?? match[2] ?? match[3] ?? '');
    value
      .split(/\s+/)
      .filter(Boolean)
      .forEach((name) => classes.add(name));
  }
  return classes;
}

export interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

export function parseDeclarations(style: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const part of splitTopLevel(stripComments(style), ';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const rawProperty = part.slice(0, colon).trim();
    if (!rawProperty) continue;
    // Custom property names are case-sensitive; standard ones aren't.
    const property = rawProperty.startsWith('--') ? rawProperty : rawProperty.toLowerCase();
    let value = part.slice(colon + 1);
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '');
    declarations.push({ property, value: value.trim(), important });
  }
  return declarations;
}

let cachedSheet: ParsedSheet | null = null;

const parseSheet = (css: string): ParsedSheet => {
  if (cachedSheet && cachedSheet.css === css) return cachedSheet;
  const rules: ParsedRule[] = [];
  const rootVariables: Record<string, string> = {};
  for (const rule of parseStyleRules(css)) {
    const selectors = splitTopLevel(rule.selector, ',').map((s) => s.trim());
    rules.push({ ...rule, requiredClasses: selectors.map(requiredClassesOf) });
    // The light theme's tokens: what a message on a white page needs.
    if (selectors.includes(':root')) {
      for (const { property, value } of parseDeclarations(rule.body)) {
        if (property.startsWith('--')) rootVariables[property] = value;
      }
    }
  }
  cachedSheet = { css, rules, rootVariables };
  return cachedSheet;
};

/** The `:root` custom properties of a stylesheet (the light theme). */
export function getRootVariables(css: string): Record<string, string> {
  return parseSheet(css).rootVariables;
}

/**
 * The rules of `css` that can apply to `html`, in source order: element rules
 * (no class in the selector) and rules whose every class occurs in the HTML.
 */
export function selectCssForHtml(css: string, html: string): string {
  const classes = collectHtmlClasses(html);
  return parseSheet(css)
    .rules.filter((rule) =>
      rule.requiredClasses.some((required) => required.every((name) => classes.has(name)))
    )
    .map((rule) => `${rule.selector}{${rule.body}}`)
    .join('\n');
}

const indexOfTopLevelComma = (value: string): number => {
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
};

/**
 * Replaces every var() in `value` from `lookup`, falling back to the var()'s
 * own fallback. Null when one can't be resolved (the declaration is then
 * dropped: a client would ignore it anyway).
 */
export function resolveVariables(
  value: string,
  lookup: (name: string) => string | undefined,
  depth = 0
): string | null {
  if (!value.includes('var(')) return value;
  if (depth > 10) return null;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    let parens = 0;
    let end = at + 3;
    for (; end < value.length; end += 1) {
      if (value[end] === '(') parens += 1;
      else if (value[end] === ')') {
        parens -= 1;
        if (parens === 0) break;
      }
    }
    if (end >= value.length) return null;
    const inner = value.slice(at + 4, end);
    const comma = indexOfTopLevelComma(inner);
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
    const raw = lookup(name);
    let replacement: string | null = null;
    if (raw !== undefined && raw.trim() !== '') {
      replacement = resolveVariables(raw.trim(), lookup, depth + 1);
    }
    if (replacement === null && fallback !== undefined) {
      replacement = resolveVariables(fallback, lookup, depth + 1);
    }
    if (replacement === null) return null;
    out += replacement;
    i = end + 1;
  }
  return out;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseNumber = (token: string): number | null => {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(token)) return null;
  return Number(token);
};

const parsePercentOrNumber = (token: string, scale: number): number | null => {
  if (token.endsWith('%')) {
    const n = parseNumber(token.slice(0, -1));
    return n === null ? null : (n / 100) * scale;
  }
  return parseNumber(token);
};

const parseAlpha = (token: string | undefined): number | null => {
  if (token === undefined) return 1;
  const value = parsePercentOrNumber(token.trim(), 1);
  return value === null ? null : clamp(value, 0, 1);
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const hue = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)].map((v) => Math.round(clamp(v, 0, 1) * 255)) as [
    number,
    number,
    number
  ];
};

const toHex = (rgb: [number, number, number]) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const roundAlpha = (alpha: number) => Math.round(alpha * 1000) / 1000;

/**
 * hsl()/rgb() in the space-separated CSS Color 4 syntax (`rgb(37 99 235/1)`,
 * `hsl(20 6% 90%)`), which Outlook and older clients don't parse, as `#hex`
 * or `rgba(r, g, b, a)`. Anything it can't read is left as is.
 */
export function toLegacyColors(value: string): string {
  return value.replace(/\b(hsla?|rgba?)\(([^()]*)\)/gi, (match, fn: string, args: string) => {
    const [main, alphaPart] = args.includes('/') ? args.split('/') : [args, undefined];
    const tokens = main.split(/[\s,]+/).filter(Boolean);
    let alphaToken = alphaPart?.trim();
    if (tokens.length === 4 && alphaToken === undefined) alphaToken = tokens.pop();
    if (tokens.length !== 3) return match;
    const alpha = parseAlpha(alphaToken);
    if (alpha === null) return match;

    let rgb: [number, number, number];
    if (fn.toLowerCase().startsWith('hsl')) {
      const hue = parseNumber(tokens[0].replace(/deg$/i, ''));
      const saturation = parsePercentOrNumber(tokens[1], 1);
      const lightness = parsePercentOrNumber(tokens[2], 1);
      if (hue === null || saturation === null || lightness === null) return match;
      // A bare number for s/l is a percentage in legacy-tolerant parsers.
      const s = tokens[1].endsWith('%') ? saturation : saturation / 100;
      const l = tokens[2].endsWith('%') ? lightness : lightness / 100;
      rgb = hslToRgb(hue, clamp(s, 0, 1), clamp(l, 0, 1));
    } else {
      const channels = tokens.map((token) => parsePercentOrNumber(token, 255));
      if (channels.some((channel) => channel === null)) return match;
      rgb = (channels as number[]).map((channel) => Math.round(clamp(channel, 0, 255))) as [
        number,
        number,
        number
      ];
    }
    return alpha >= 1 ? toHex(rgb) : `rgba(${rgb.join(', ')}, ${roundAlpha(alpha)})`;
  });
}

/**
 * One element's inline style made mail-safe: var() resolved against the
 * element's own custom properties, then `inherited` (its ancestors' and the
 * stylesheet's :root); custom properties and UI-only declarations dropped.
 * Also returns the custom properties its children inherit.
 */
export function cleanInlineStyle(
  style: string,
  inherited: Readonly<Record<string, string>>
): { style: string; variables: Record<string, string> } {
  const declarations = parseDeclarations(style);
  const variables: Record<string, string> = { ...inherited };
  for (const { property, value } of declarations) {
    if (property.startsWith('--')) variables[property] = value;
  }
  const kept: string[] = [];
  for (const { property, value, important } of declarations) {
    if (property.startsWith('--') || DROPPED_PROPERTIES.has(property)) continue;
    const resolved = resolveVariables(value, (name) => variables[name]);
    if (resolved === null || resolved.trim() === '') continue;
    kept.push(`${property}: ${toLegacyColors(resolved.trim())}${important ? ' !important' : ''}`);
  }
  return { style: kept.length > 0 ? `${kept.join('; ')};` : '', variables };
}

/** Applies cleanInlineStyle to every element under (and including) `root`. */
export function finalizeInlineStyles(
  root: Element,
  rootVariables: Readonly<Record<string, string>>
): void {
  const visit = (element: Element, inherited: Readonly<Record<string, string>>) => {
    let variables = inherited;
    const style = element.getAttribute('style');
    if (style !== null) {
      const cleaned = cleanInlineStyle(style, inherited);
      variables = cleaned.variables;
      if (cleaned.style) element.setAttribute('style', cleaned.style);
      else element.removeAttribute('style');
    }
    for (const child of Array.from(element.children)) visit(child, variables);
  };
  visit(root, rootVariables);
}
