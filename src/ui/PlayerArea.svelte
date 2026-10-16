<script lang="ts">
  import type { Card as CardT, CardId } from '../engine/cards';
  import type { Player } from '../engine/game';
  import { scorePlayer } from '../engine/score';
  import type { Reaction } from '../net/session.svelte';
  import Card from './Card.svelte';

  let {
    player,
    isMe = false,
    isTurn = false,
    isDealer = false,
    connected = true,
    flip7 = false,
    roundOver = false,
    selectable = new Set<CardId>(),
    selected = [],
    aside = [],
    reactions = [],
    onpick,
  }: {
    player: Player;
    isMe?: boolean;
    isTurn?: boolean;
    isDealer?: boolean;
    connected?: boolean;
    flip7?: boolean;
    /** Totals already include this round's score, so hide the projection. */
    roundOver?: boolean;
    selectable?: Set<CardId>;
    selected?: CardId[];
    /** Flip Four cards waiting to resolve after the flips. */
    aside?: CardT[];
    reactions?: Reaction[];
    onpick?: (id: CardId) => void;
  } = $props();

  const nums = $derived(player.line.filter((c) => c.kind === 'num'));
  const mods = $derived(player.line.filter((c) => c.kind === 'mod'));
  const live = $derived(scorePlayer(player, flip7).score);
</script>

<section class="area panel {player.status}" class:turn={isTurn} class:me={isMe} aria-label="{player.name}'s line">
  <header>
    <span class="dot" class:off={!connected} title={connected ? 'Connected' : 'Disconnected, a bot will play for them'}></span>
    <span class="name">{player.name}{isMe ? ' (you)' : ''}</span>
    {#if isDealer}<span class="chip" title="Dealer">D</span>{/if}
    {#if player.status === 'stayed'}<span class="chip stayed">Stayed</span>{/if}
    {#if player.status === 'busted'}<span class="chip busted">Bust</span>{/if}
    {#if flip7}<span class="chip flip7">Turn 7!</span>{/if}
    <span class="score" title="Total score, this round, and the total if the round ended now">
      <b>{player.total}</b>
      {#if !roundOver && player.status !== 'busted'}
        <span class="muted">+{live} →</span>
        <b class="projected">{player.total + live}</b>
      {/if}
    </span>
  </header>

  {#if mods.length}
    <div class="row mods">
      {#each mods as c (c.id)}
        <Card small card={c} selectable={selectable.has(c.id)} selected={selected.includes(c.id)} onpick={() => onpick?.(c.id)} />
      {/each}
    </div>
  {/if}
  <div class="row">
    {#each nums as c (c.id)}
      <Card card={c} selectable={selectable.has(c.id)} selected={selected.includes(c.id)} onpick={() => onpick?.(c.id)} />
    {:else}
      <p class="empty muted">No cards</p>
    {/each}
  </div>

  {#if aside.length}
    <div class="row aside" aria-label="Waiting to resolve">
      <span class="muted small">Up next:</span>
      {#each aside as c (c.id)}
        <Card small card={c} />
      {/each}
    </div>
  {/if}

  <div class="reactions" aria-live="polite">
    {#each reactions as r (r.key)}
      <span class="float">{r.emoji}</span>
    {/each}
  </div>
</section>

<style>
  .area {
    position: relative;
    padding: 0.6rem 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  /* State borders: blue for stayed, red for bust. Turn (gold) wins over both. */
  .stayed {
    border-color: var(--stay);
    background: color-mix(in srgb, var(--stay) 7%, var(--surface));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--stay) 35%, transparent), var(--shadow);
  }
  .busted {
    border-color: var(--bad);
    background: color-mix(in srgb, var(--bad) 7%, var(--surface));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--bad) 35%, transparent), var(--shadow);
  }
  .turn {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 45%, transparent), var(--shadow);
  }
  .busted .row {
    opacity: 0.35;
    filter: grayscale(0.8);
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .score {
    margin-left: auto;
    display: flex;
    gap: 0.3rem;
    align-items: baseline;
    white-space: nowrap;
  }
  .score b {
    font-size: 1.1rem;
  }
  .score .projected {
    color: var(--accent);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--good);
    flex: none;
  }
  .dot.off {
    background: var(--muted);
  }
  .chip {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--surface-2);
    white-space: nowrap;
  }
  .chip.stayed {
    background: color-mix(in srgb, var(--stay) 20%, transparent);
    color: var(--stay);
  }
  .chip.busted {
    background: color-mix(in srgb, var(--bad) 20%, transparent);
    color: var(--bad);
  }
  .chip.flip7 {
    background: var(--gold);
    color: #1d2340;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-height: 74px;
    align-items: center;
  }
  .mods,
  .aside {
    min-height: 0;
  }
  .aside {
    padding-top: 0.4rem;
    border-top: 1px dashed var(--border);
  }
  .small {
    font-size: 0.8rem;
  }
  .empty {
    margin: 0;
    font-size: 0.85rem;
  }
  .reactions {
    position: absolute;
    top: 0;
    right: 1rem;
    pointer-events: none;
  }
  .float {
    position: absolute;
    right: 0;
    font-size: 2rem;
    animation: float 2.5s ease-out forwards;
  }
  @keyframes float {
    from {
      transform: translateY(0) scale(0.6);
      opacity: 0;
    }
    15% {
      transform: translateY(-10px) scale(1.1);
      opacity: 1;
    }
    to {
      transform: translateY(-60px) scale(1);
      opacity: 0;
    }
  }
</style>
