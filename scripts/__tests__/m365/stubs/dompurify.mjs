// Test stub: graphTransforms transitively imports dompurify via MonoMessage's
// body-parsing util, but the transforms under test never call sanitize(). This
// keeps the bundle DOM-free for `node --test`.
export default { sanitize: (html) => html, addHook: () => {}, setConfig: () => {} };
