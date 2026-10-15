<script lang="ts">
  import { cardLabel, type Card } from '../engine/cards';

  let {
    card,
    selectable = false,
    selected = false,
    small = false,
    onpick,
  }: {
    card: Card;
    selectable?: boolean;
    selected?: boolean;
    small?: boolean;
    onpick?: () => void;
  } = $props();

  const face = $derived.by(() => {
    if (card.kind === 'num') {
      if (card.special === 'zero') return { big: '0', sub: 'ZERO' };
      if (card.special === 'unlucky7') return { big: '7', sub: 'UNLUCKY' };
      if (card.special === 'lucky13') return { big: '13', sub: 'LUCKY' };
      return { big: String(card.value), sub: '' };
    }
    if (card.kind === 'mod') return { big: cardLabel(card), sub: '' };
    const words: Record<string, [string, string]> = {
      justOneMore: ['+1', 'JUST ONE MORE'],
      flipFour: ['×4', 'FLIP FOUR'],
      swap: ['⇄', 'SWAP'],
      steal: ['✋', 'STEAL'],
      discard: ['🗑', 'DISCARD'],
    };
    const [big, sub] = words[card.act]!;
    return { big, sub };
  });

  const tone = $derived(
    card.kind === 'num'
      ? (card.special ?? `n${card.value}`)
      : card.kind === 'mod'
        ? 'mod'
        : card.act,
  );
</script>

<button
  class="card {tone}"
  class:small
  class:selectable
  class:selected
  disabled={!selectable}
  aria-pressed={selectable ? selected : undefined}
  aria-label={cardLabel(card)}
  title={cardLabel(card)}
  onclick={onpick}
>
  <span class="big">{face.big}</span>
  {#if face.sub}<span class="sub">{face.sub}</span>{/if}
</button>

<style>
  .card {
    --c: #1d2340;
    position: relative;
    width: 52px;
    height: 74px;
    padding: 0;
    border-radius: 8px;
    border: 2px solid var(--c);
    background: var(--card-face);
    color: var(--c);
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    box-shadow: var(--shadow);
    flex: none;
    transition: transform 120ms ease;
    animation: flip-in 260ms ease;
  }
  .card:disabled {
    opacity: 1;
    cursor: default;
  }
  .card.small {
    width: 40px;
    height: 56px;
  }
  .big {
    font-size: 1.5rem;
    font-weight: 800;
    line-height: 1;
  }
  .small .big {
    font-size: 1.15rem;
  }
  .sub {
    font-size: 0.45rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-align: center;
    padding: 0 2px;
  }
  .selectable {
    cursor: pointer;
    outline: 2px dashed var(--focus);
    outline-offset: 2px;
  }
  .selectable:hover {
    transform: translateY(-3px);
  }
  .selected {
    outline: 3px solid var(--focus);
    transform: translateY(-6px);
  }
  @keyframes flip-in {
    from {
      transform: rotateY(90deg);
    }
    to {
      transform: rotateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
      transition: none;
    }
  }

  /* Number colours, one hue per value. */
  .n1 { --c: #6b6b6b; }
  .n2 { --c: #7a9a1f; }
  .n3 { --c: #c23b5a; }
  .n4 { --c: #1f8f8f; }
  .n5 { --c: #2a8a3a; }
  .n6 { --c: #8a3fb0; }
  .n7 { --c: #c0563a; }
  .n8 { --c: #5a9a2a; }
  .n9 { --c: #d07a1a; }
  .n10 { --c: #c42a2a; }
  .n11 { --c: #3a6ac0; }
  .n12 { --c: #555a78; }
  .n13 { --c: #1a6ac0; }
  .zero { --c: #fff; background: #23263f; }
  .unlucky7 { --c: #e8e8f0; background: #3b2a4a; }
  .lucky13 { --c: #1d2340; background: var(--gold); }
  .mod { --c: #fff; background: #d64a35; border-color: #8f2a1c; }
  .justOneMore { --c: #0f5f8a; background: #bfe6f7; }
  .flipFour { --c: #6a5300; background: #ffe36b; }
  .swap { --c: #2d5f12; background: #c4ea8f; }
  .steal { --c: #7a3a00; background: #ffc27a; }
  .discard { --c: #43307a; background: #cfc2f2; }
</style>
