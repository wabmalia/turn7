<script lang="ts">
  import { session } from '../net/session.svelte';
  import { NAME_MAX, normalizeCode } from '../net/protocol';
  import { GAME_NAME } from './brand';
  import RulesSheet from './RulesSheet.svelte';

  const linkCode = location.hash.startsWith('#/join/') ? normalizeCode(location.hash.slice(7)) : '';
  let name = $state(session.name);
  let code = $state(linkCode);
  let showRules = $state(false);

  const busy = $derived(session.status === 'connecting');

  function create(e: Event) {
    e.preventDefault();
    session.setName(name);
    session.hostRoom();
  }
  function join(e: Event) {
    e.preventDefault();
    session.setName(name);
    session.joinRoom(normalizeCode(code));
  }
</script>

<main>
  <header>
    <div class="logo" aria-hidden="true">7</div>
    <h1>{GAME_NAME}</h1>
    <p class="muted">Push your luck, flip seven, wreck your friends. No accounts, no server: one browser hosts, everyone joins.</p>
  </header>

  <section class="panel">
    <label for="name">Nickname</label>
    <input id="name" bind:value={name} maxlength={NAME_MAX} placeholder="Pick a nickname" autocomplete="off" />
    <p class="hint muted">Just a nickname, no real names or contact details needed.</p>
  </section>

  {#if busy}
    <section class="panel status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>{session.message}</p>
      <button onclick={() => session.leave()}>Cancel</button>
    </section>
  {:else}
    {#if session.status === 'error'}
      <p class="error" role="alert">{session.message}</p>
    {/if}

    <form class="panel" onsubmit={join}>
      <h2>Join a room</h2>
      <div class="row">
        <input
          aria-label="Room code"
          bind:value={code}
          placeholder="CODE"
          maxlength="5"
          autocapitalize="characters"
          autocomplete="off"
          class="code"
        />
        <button class="primary" disabled={!name.trim() || normalizeCode(code).length !== 5}>Join</button>
      </div>
    </form>

    {#if !linkCode}
      <form class="panel" onsubmit={create}>
        <h2>Host a game</h2>
        <p class="muted">Your browser runs the game. Keep this tab open while you play.</p>
        <button class="primary" disabled={!name.trim()}>Create room</button>
      </form>
    {/if}
  {/if}

  <button class="ghost rules" onclick={() => (showRules = true)}>How to play</button>
</main>

{#if showRules}
  <RulesSheet onclose={() => (showRules = false)} />
{/if}

<style>
  main {
    max-width: 440px;
    margin: 0 auto;
    padding: 2rem 16px 3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  header {
    text-align: center;
  }
  .logo {
    width: 64px;
    height: 88px;
    margin: 0 auto 0.5rem;
    border-radius: 10px;
    background: var(--gold);
    color: #1d2340;
    font-size: 3rem;
    font-weight: 900;
    display: grid;
    place-items: center;
    transform: rotate(-6deg);
    box-shadow: var(--shadow);
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  .panel {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  label {
    font-weight: 600;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row input {
    flex: 1;
  }
  .code {
    text-transform: uppercase;
    letter-spacing: 0.3em;
    font-weight: 700;
    text-align: center;
  }
  .status {
    align-items: center;
    text-align: center;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .error {
    margin: 0;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bad) 15%, transparent);
    color: var(--bad);
    font-weight: 600;
  }
  .rules {
    align-self: center;
  }
</style>
