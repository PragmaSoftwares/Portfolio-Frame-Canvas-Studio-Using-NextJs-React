// A short, fixed palette of card accent gradients, picked deterministically
// from an item's own id — gives each card a distinct identity color at a
// glance (project cards, board cards, ...) without needing per-item config,
// and stays stable across reloads since it's derived, not random.
const CARD_ACCENTS = [
  "from-indigo-500 to-violet-500",
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

export function accentFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_ACCENTS[hash % CARD_ACCENTS.length];
}
