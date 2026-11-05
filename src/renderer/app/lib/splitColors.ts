/**
 * Split Inbox colours: each custom label (a split) has one, shown as a dot
 * beside its tab and as its underline when picked, so a split is recognised
 * by colour before its name is read. Tokens: --split-* in global.css.
 */

export const SPLIT_COLORS = ['violet', 'teal', 'amber', 'rose', 'green', 'blue'] as const;
export type SplitColor = (typeof SPLIT_COLORS)[number];

// Whole class names, so Tailwind finds them.
export const SPLIT_COLOR_BG: Record<SplitColor, string> = {
  violet: 'bg-split-violet',
  teal: 'bg-split-teal',
  amber: 'bg-split-amber',
  rose: 'bg-split-rose',
  green: 'bg-split-green',
  blue: 'bg-split-blue'
};

export const isSplitColor = (value: unknown): value is SplitColor =>
  typeof value === 'string' && (SPLIT_COLORS as readonly string[]).includes(value);

/** The first colour no label uses yet; when all are taken, the least used. */
export function nextSplitColor(labels: { color?: string }[]): SplitColor {
  const uses = new Map<SplitColor, number>(SPLIT_COLORS.map((c) => [c, 0]));
  for (const label of labels) {
    if (isSplitColor(label.color)) uses.set(label.color, (uses.get(label.color) ?? 0) + 1);
  }
  let best: SplitColor = SPLIT_COLORS[0];
  for (const color of SPLIT_COLORS) {
    if ((uses.get(color) ?? 0) < (uses.get(best) ?? 0)) best = color;
  }
  return best;
}

/**
 * Labels made before splits had colours get one each, in their order, so the
 * colours stay put when a label is later added or deleted. The same array
 * when every label already has a colour.
 */
export function withSplitColors<L extends { color?: string }>(labels: L[]): L[] {
  if (labels.every((l) => isSplitColor(l.color))) return labels;
  // Colours in use: the labels that have one, plus each one handed out here.
  const taken: { color?: string }[] = labels.filter((l) => isSplitColor(l.color));
  return labels.map((label) => {
    if (isSplitColor(label.color)) return label;
    const color = nextSplitColor(taken);
    taken.push({ color });
    return { ...label, color };
  });
}
