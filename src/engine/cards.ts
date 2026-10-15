export type CardId = number;

export type Special = 'zero' | 'unlucky7' | 'lucky13';
export type Mod = 'm2' | 'm4' | 'm6' | 'm8' | 'm10' | 'half';
export type Act = 'justOneMore' | 'flipFour' | 'swap' | 'steal' | 'discard';

export type NumCard = { id: CardId; kind: 'num'; value: number; special?: Special };
export type ModCard = { id: CardId; kind: 'mod'; mod: Mod };
export type ActCard = { id: CardId; kind: 'act'; act: Act };
export type Card = NumCard | ModCard | ActCard;

export const MINUS: Record<Exclude<Mod, 'half'>, number> = { m2: 2, m4: 4, m6: 6, m8: 8, m10: 10 };

export const DECK_SIZE = 108;

/** The 108-card Vengeance deck, unshuffled. See docs/RULES.md. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  // Regular numbers: n copies of n, except 13 and 7 which have a special
  // replacing one copy.
  for (let v = 1; v <= 13; v++) {
    const copies = v === 13 || v === 7 ? v - 1 : v;
    for (let i = 0; i < copies; i++) cards.push({ id: id++, kind: 'num', value: v });
  }
  cards.push({ id: id++, kind: 'num', value: 0, special: 'zero' });
  cards.push({ id: id++, kind: 'num', value: 7, special: 'unlucky7' });
  cards.push({ id: id++, kind: 'num', value: 13, special: 'lucky13' });
  for (const mod of ['m2', 'm4', 'm6', 'm8', 'm10', 'half'] as const) {
    cards.push({ id: id++, kind: 'mod', mod });
  }
  for (const act of ['justOneMore', 'flipFour', 'swap', 'steal', 'discard'] as const) {
    for (let i = 0; i < 2; i++) cards.push({ id: id++, kind: 'act', act });
  }
  return cards;
}

export const ACT_NAMES: Record<Act, string> = {
  justOneMore: 'Just One More!',
  flipFour: 'Flip Four!',
  swap: 'Swap',
  steal: 'Steal',
  discard: 'Discard',
};

export function cardLabel(c: Card): string {
  switch (c.kind) {
    case 'num':
      if (c.special === 'zero') return 'The Zero';
      if (c.special === 'unlucky7') return 'Unlucky 7';
      if (c.special === 'lucky13') return 'Lucky 13';
      return String(c.value);
    case 'mod':
      return c.mod === 'half' ? '÷2' : `-${MINUS[c.mod]}`;
    case 'act':
      return ACT_NAMES[c.act];
  }
}
