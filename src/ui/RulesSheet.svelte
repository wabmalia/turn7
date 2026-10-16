<script lang="ts">
  import Card from './Card.svelte';
  import type { Card as C } from '../engine/cards';

  let { onclose }: { onclose: () => void } = $props();

  type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;
  const ex = (c: NoId<C>) => ({ ...c, id: -1 }) as C;

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
  });
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="rules-title">
  <div class="head">
    <h2 id="rules-title">How to play</h2>
    <button class="ghost" onclick={() => dialog.close()} aria-label="Close">✕</button>
  </div>

  <p>Race to <b>200 points</b>. On your turn, <b>hit</b> (flip a card) or <b>stay</b> (bank your line). Flip a number you already have and you <b>bust</b>: zero for the round.</p>
  <p>Collect <b>7 different numbers</b> to Turn 7: the round ends at once and you get <b>+15</b>. Nothing is safe until the round ends.</p>
  <p class="muted">The deck has thirteen 13s, twelve 12s… down to one 1.</p>

  <h3>Special numbers</h3>
  <dl>
    <div><dt><Card small card={ex({ kind: 'num', value: 0, special: 'zero' })} /></dt><dd><b>The Zero.</b> Your round score is 0 unless you Turn 7. You can't stay: you hit automatically on your turn.</dd></div>
    <div><dt><Card small card={ex({ kind: 'num', value: 7, special: 'unlucky7' })} /></dt><dd><b>Unlucky 7.</b> Discard everything else in your line. Can't bust you when you get it.</dd></div>
    <div><dt><Card small card={ex({ kind: 'num', value: 13, special: 'lucky13' })} /></dt><dd><b>Lucky 13.</b> You may hold one other 13 without busting. A third busts.</dd></div>
  </dl>

  <h3>Modifiers</h3>
  <dl>
    <div><dt><Card small card={ex({ kind: 'mod', mod: 'm6' })} /></dt><dd><b>-2 to -10, ÷2.</b> Give it to any player who hasn't busted (or keep it). ÷2 halves numbers first, then minuses apply. Never below 0.</dd></div>
  </dl>

  <h3>Actions</h3>
  <p class="muted">Played straight away on anyone who hasn't busted, even yourself or someone who stayed.</p>
  <dl>
    <div><dt><Card small card={ex({ kind: 'act', act: 'justOneMore' })} /></dt><dd><b>Just One More!</b> They take one more card, then must stay.</dd></div>
    <div><dt><Card small card={ex({ kind: 'act', act: 'flipFour' })} /></dt><dd><b>Flip Four!</b> They flip four cards. Actions and modifiers flipped wait until after.</dd></div>
    <div><dt><Card small card={ex({ kind: 'act', act: 'swap' })} /></dt><dd><b>Swap.</b> Swap two face-up cards between two players.</dd></div>
    <div><dt><Card small card={ex({ kind: 'act', act: 'steal' })} /></dt><dd><b>Steal.</b> Take any face-up card into your line.</dd></div>
    <div><dt><Card small card={ex({ kind: 'act', act: 'discard' })} /></dt><dd><b>Discard.</b> Throw away any face-up card you choose.</dd></div>
  </dl>
  <p class="muted">Cards gained by Steal or Swap count as if flipped: a duplicate busts you.</p>
</dialog>

<style>
  dialog {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    max-width: min(520px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 1rem 1.25rem;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
  }
  h3 {
    margin: 1rem 0 0.4rem;
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  dl div {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  dt {
    flex: none;
  }
  dd {
    margin: 0;
  }
</style>
