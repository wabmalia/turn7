<script lang="ts">
  import type { PublicState } from '../engine/view';
  import { session } from '../net/session.svelte';

  let { game }: { game: PublicState } = $props();

  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? '?';
  const total = (id: string) => game.players.find((p) => p.id === id)?.total ?? 0;
  const over = $derived(game.phase === 'gameOver');
  const rows = $derived([...(game.results ?? [])].sort((a, b) => total(b.player) - total(a.player)));
</script>

<section class="panel results" aria-label="Round results">
  {#if over}
    <h2>🏆 {game.winners!.map(name).join(' & ')} {game.winners!.length > 1 ? 'win' : 'wins'}!</h2>
    {#if game.players.length === 1}<p class="muted">Reached {game.target} in {game.round} rounds.</p>{/if}
  {:else}
    <h2>Round {game.round} scores</h2>
  {/if}

  <div class="scroll">
    <table>
      <thead>
        <tr><th>Player</th><th>Cards</th><th>Round</th><th>Total</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.player)}
          <tr class:me={r.player === session.me}>
            <td class="who">{name(r.player)}</td>
            <td class="muted">
              {#if r.busted}bust
              {:else if r.zero && !r.flip7}The Zero
              {:else}
                {r.numbers}{r.half ? ' ÷2' : ''}{r.minus ? ` -${r.minus}` : ''}{r.flip7 ? ' +15' : ''}
              {/if}
            </td>
            <td><b>+{r.score}</b></td>
            <td><b>{total(r.player)}</b></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if over}
    {#if session.role === 'host'}
      <button class="primary" onclick={() => session.backToLobby()}>Back to lobby</button>
    {:else}
      <p class="muted">Waiting for the host…</p>
    {/if}
  {:else}
    <button class="primary" onclick={() => session.act({ t: 'nextRound' })}>Next round</button>
  {/if}
</section>

<style>
  .results {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  p {
    margin: 0;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  th {
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 600;
  }
  .who {
    font-weight: 600;
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  tr.me td {
    background: color-mix(in srgb, var(--gold) 15%, transparent);
  }
</style>
