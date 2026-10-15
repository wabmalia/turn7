<script lang="ts">
  import { cardLabel, type CardId } from '../engine/cards';
  import type { Prompt } from '../engine/game';
  import { REACTIONS, type RoomView } from '../net/protocol';
  import { session } from '../net/session.svelte';
  import Card from './Card.svelte';
  import PlayerArea from './PlayerArea.svelte';
  import RoundResults from './RoundResults.svelte';
  import RulesSheet from './RulesSheet.svelte';

  let { room }: { room: RoomView } = $props();

  const g = $derived(room.game!);
  const prompt = $derived(g.prompt);
  const mine = $derived(prompt && prompt.player === session.me ? prompt : null);
  const roundOver = $derived(g.phase === 'roundEnd' || g.phase === 'gameOver');
  const isPlayer = $derived(g.players.some((p) => p.id === session.me));

  // Me at the bottom, everyone else in seat order starting after me.
  const others = $derived.by(() => {
    const i = g.players.findIndex((p) => p.id === session.me);
    if (i < 0) return g.players;
    return [...g.players.slice(i + 1), ...g.players.slice(0, i)];
  });
  const me = $derived(g.players.find((p) => p.id === session.me));

  let selected = $state<CardId[]>([]);
  let showRules = $state(false);

  // Fresh selection for every new decision. Keyed by content, since every
  // room update from the host is a brand new object.
  const promptKey = $derived(JSON.stringify(prompt));
  $effect(() => {
    void promptKey;
    selected = [];
  });

  const name = (id: string) => g.players.find((p) => p.id === id)?.name ?? '?';
  const connected = (id: string) => room.members.find((m) => m.id === id)?.connected ?? false;
  const owner = (card: CardId) => g.players.find((p) => p.line.some((c) => c.id === card))?.id;

  const selectable = $derived(new Set(mine?.kind === 'cards' ? mine.options : []));

  function pick(id: CardId) {
    if (mine?.kind !== 'cards') return;
    if (selected.includes(id)) {
      selected = selected.filter((x) => x !== id);
    } else if (mine.count === 1) {
      selected = [id];
    } else {
      // Swap: keep at most one card per player.
      const kept = selected.filter((x) => owner(x) !== owner(id));
      selected = [...kept, id].slice(-2);
    }
  }

  const ready = $derived(mine?.kind === 'cards' && selected.length === mine.count);

  function describe(p: Prompt): string {
    const who = name(p.player);
    if (p.kind === 'ack') return p.text;
    if (p.kind === 'turn') return `${who} is deciding: hit or stay`;
    if (p.kind === 'player') {
      if (p.card.kind === 'mod') return `${who} is choosing who gets ${cardLabel(p.card)}`;
      return `${who} is choosing a target for ${cardLabel(p.card)}`;
    }
    const verb = { steal: 'to steal', discard: 'to discard', swap: 'to swap' }[p.card.act as 'steal'];
    return `${who} is picking ${p.count === 2 ? 'two cards' : 'a card'} ${verb}`;
  }

  function cardsPromptText(p: Extract<Prompt, { kind: 'cards' }>): string {
    if (p.card.act === 'swap') return 'Pick two face-up cards from two different players to swap';
    if (p.card.act === 'steal') return 'Pick a card to steal into your line';
    return 'Pick any face-up card to discard';
  }

  // Flip Four in progress: the top-most flipFour task on the stack.
  const flipping = $derived([...g.stack].reverse().find((t) => t.t === 'flipFour'));

  /** Cards set aside during Flip Four, waiting to resolve, per player. */
  function asideOf(id: string) {
    return g.stack.flatMap((t) =>
      t.player !== id ? [] : t.t === 'flipFour' ? t.aside : t.t === 'aside' ? t.cards : [],
    );
  }

  const recentLog = $derived(g.log.slice(-40).reverse());
</script>

<div class="table">
  <header class="bar">
    <span class="code" title="Room code">{room.code}</span>
    <span class="muted">Round {g.round}</span>
    <span class="muted deck" title="Cards left in the deck">🂠 {g.deckCount}</span>
    <span class="spacer"></span>
    <button class="ghost" onclick={() => (showRules = true)}>Rules</button>
    <button class="ghost" onclick={() => confirm(session.role === 'host' ? 'Close the room for everyone?' : 'Leave the game?') && session.leave()}>Leave</button>
  </header>

  {#if !session.linked}
    <p class="banner" role="alert">Lost connection to the host. Reconnecting…</p>
  {/if}

  <div class="layout">
    <div class="opponents">
      {#each others as p (p.id)}
        <PlayerArea
          player={p}
          isTurn={prompt?.player === p.id}
          isDealer={g.players[g.dealer]?.id === p.id}
          connected={connected(p.id)}
          flip7={g.flip7.includes(p.id)}
          {selectable}
          {selected}
          aside={asideOf(p.id)}
          reactions={session.reactions.filter((r) => r.from === p.id)}
          onpick={pick}
        />
      {/each}
    </div>
  </div>

  <div class="dock">
    {#if me}
      <PlayerArea
        player={me}
        isMe
        isTurn={prompt?.player === me.id}
        isDealer={g.players[g.dealer]?.id === me.id}
        flip7={g.flip7.includes(me.id)}
        {selectable}
        {selected}
        aside={asideOf(me.id)}
        reactions={session.reactions.filter((r) => r.from === me.id)}
        onpick={pick}
      />
    {/if}

    <div class="console">
    {#if roundOver}
      <div class="main"><RoundResults game={g} /></div>
    {:else}
      <div class="panel actions main" aria-live="polite">
        {#if mine?.kind === 'turn'}
          <p class="title">Your turn</p>
          <div class="buttons">
            <button class="primary big" onclick={() => session.act({ t: 'hit' })}>Hit</button>
            <button class="big" disabled={!mine.canStay} onclick={() => session.act({ t: 'stay' })}>Stay</button>
          </div>
          {#if !mine.canStay}<p class="muted small">You hold The Zero: you must keep hitting.</p>{/if}
        {:else if mine?.kind === 'player'}
          <div class="pending">
            <Card card={mine.card} />
            <p class="title">
              {mine.card.kind === 'mod' ? `Who gets ${cardLabel(mine.card)}?` : `Who do you play ${cardLabel(mine.card)} on?`}
            </p>
          </div>
          <div class="buttons wrap">
            {#each mine.options as id (id)}
              <button onclick={() => session.act({ t: 'player', target: id })}>
                {id === session.me ? 'Me' : name(id)}
              </button>
            {/each}
          </div>
        {:else if mine?.kind === 'cards'}
          <div class="pending">
            <Card card={mine.card} />
            <p class="title">{cardsPromptText(mine)}</p>
          </div>
          <div class="buttons">
            <button class="primary" disabled={!ready} onclick={() => session.act({ t: 'cards', cards: selected })}>
              Confirm
            </button>
            {#if selected.length}<button class="ghost" onclick={() => (selected = [])}>Clear</button>{/if}
          </div>
        {:else if mine?.kind === 'ack'}
          <div class="pending">
            <Card card={mine.card} />
            <p class="title">{mine.text}</p>
          </div>
          <button class="primary" onclick={() => session.act({ t: 'ack' })}>OK</button>
        {:else if prompt?.kind === 'ack'}
          <div class="pending">
            <Card card={prompt.card} />
            <p class="title">{prompt.text}</p>
          </div>
          <p class="muted small">Waiting for {name(prompt.player)} to continue…</p>
        {:else if g.paused && flipping?.t === 'flipFour'}
          <p class="title">{name(flipping.player)} is flipping four… {4 - flipping.left}/4</p>
        {:else if prompt && prompt.kind !== 'turn'}
          <div class="pending">
            <Card card={prompt.card} />
            <p class="title">{describe(prompt)}…</p>
          </div>
        {:else if prompt}
          <p class="muted">{describe(prompt)}…</p>
        {/if}
      </div>
    {/if}
      <aside class="panel log" aria-label="Game log">
        <ol>
          {#each recentLog as line, i (g.log.length - i)}
            <li class:latest={i === 0}>{line}</li>
          {/each}
        </ol>
      </aside>
    </div>

    {#if isPlayer}
      <div class="emojis" role="group" aria-label="Reactions">
        {#each REACTIONS as e (e)}
          <button class="ghost" onclick={() => session.react(e)} aria-label="React {e}">{e}</button>
        {/each}
      </div>
    {:else}
      <p class="muted small center">You're watching. You can join the next game from the lobby.</p>
    {/if}
  </div>
</div>

{#if showRules}
  <RulesSheet onclose={() => (showRules = false)} />
{/if}

<style>
  .table {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 16px calc(1rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 100dvh;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 5;
  }
  .bar button {
    padding: 0.4rem 0.6rem;
  }
  .code {
    font-weight: 900;
    letter-spacing: 0.15em;
  }
  .spacer {
    flex: 1;
  }
  .banner {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bad) 18%, transparent);
    color: var(--bad);
    font-weight: 600;
  }
  .layout {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    flex: 1;
  }
  .opponents {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 0.75rem;
    min-width: 0;
  }
  .console {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 0.5rem;
    align-items: stretch;
  }
  .main {
    min-width: 0;
  }
  .log {
    height: 12rem;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
  }
  .log li.latest {
    font-weight: 700;
  }
  .log ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .log li {
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--border);
  }
  .dock {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
    background: linear-gradient(to bottom, transparent, var(--bg) 1rem);
  }
  .actions {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .actions p {
    margin: 0;
  }
  .title {
    font-weight: 700;
  }
  .pending {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  .buttons.wrap {
    flex-wrap: wrap;
  }
  .big {
    flex: 1;
    padding: 0.9rem;
    font-size: 1.15rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .emojis {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
  }
  .emojis button {
    font-size: 1.3rem;
    padding: 0.25rem 0.45rem;
  }
  .center {
    text-align: center;
    margin: 0;
  }
  @media (max-width: 700px) {
    .layout {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .console {
      grid-template-columns: 1fr;
    }
    .log {
      height: 7rem;
    }
    .deck {
      display: none;
    }
  }
</style>
