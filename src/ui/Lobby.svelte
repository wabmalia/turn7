<script lang="ts">
  import { MAX_PLAYERS } from '../engine/game';
  import type { RoomView } from '../net/protocol';
  import { session } from '../net/session.svelte';
  import RulesSheet from './RulesSheet.svelte';

  let { room }: { room: RoomView } = $props();
  let copied = $state(false);
  let showRules = $state(false);

  const isHost = $derived(session.role === 'host');
  const link = $derived(`${location.origin}${location.pathname}#/join/${room.code}`);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my game', url: link });
        return;
      } catch {
        /* fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      session.showToast('Copy failed, select the link manually');
    }
  }
</script>

<main>
  <section class="panel code-box">
    <p class="muted">Room code</p>
    <p class="code">{room.code}</p>
    <input readonly value={link} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()} />
    <button class="primary" onclick={share}>{copied ? 'Link copied!' : 'Share invite link'}</button>
  </section>

  <section class="panel">
    <h2>Players <span class="muted">{room.members.length}/{MAX_PLAYERS}</span></h2>
    <ul>
      {#each room.members as m (m.id)}
        <li>
          <span class="dot" class:off={!m.connected} title={m.connected ? 'Connected' : 'Disconnected'}></span>
          <span class="name">{m.name}</span>
          {#if m.id === room.hostId}<span class="tag">host</span>{/if}
          {#if m.id === session.me}<span class="tag">you</span>{/if}
          {#if isHost && m.id !== room.hostId}
            <button class="ghost kick" onclick={() => session.kick(m.id)} aria-label="Remove {m.name}">✕</button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if isHost}
    <button class="primary big" onclick={() => session.start()}>
      {room.members.length === 1 ? 'Start solo game' : 'Start game'}
    </button>
    {#if room.members.length === 1}
      <p class="muted center">Solo: how many rounds does it take you to reach 200?</p>
    {/if}
  {:else}
    <p class="muted center">Waiting for the host to start…</p>
    {#if !session.linked}<p class="center warn">Reconnecting to host…</p>{/if}
  {/if}

  <div class="footer">
    <button class="ghost" onclick={() => (showRules = true)}>How to play</button>
    <button class="ghost" onclick={() => session.leave()}>{isHost ? 'Close room' : 'Leave'}</button>
  </div>
</main>

{#if showRules}
  <RulesSheet onclose={() => (showRules = false)} />
{/if}

<style>
  main {
    max-width: 440px;
    margin: 0 auto;
    padding: 1.5rem 16px 3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel {
    padding: 1rem;
  }
  .code-box {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    text-align: center;
  }
  .code-box p {
    margin: 0;
  }
  .code {
    font-size: 2.6rem;
    font-weight: 900;
    letter-spacing: 0.25em;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
  }
  li:last-child {
    border-bottom: none;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--good);
    flex: none;
  }
  .dot.off {
    background: var(--muted);
  }
  .tag {
    font-size: 0.75rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .kick {
    margin-left: auto;
    padding: 0.2rem 0.5rem;
  }
  .big {
    padding: 0.9rem;
    font-size: 1.1rem;
  }
  .center {
    text-align: center;
    margin: 0;
  }
  .warn {
    color: var(--bad);
  }
  .footer {
    display: flex;
    justify-content: space-between;
  }
</style>
