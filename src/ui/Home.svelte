<script lang="ts">
  import { session } from '../net/session.svelte';
  import { NAME_MAX, normalizeCode } from '../net/protocol';
  import RulesSheet from './RulesSheet.svelte';

  const codeInLink = () => (location.hash.startsWith('#/join/') ? normalizeCode(location.hash.slice(7)) : '');
  let linkCode = $state(codeInLink());
  let name = $state(session.name);
  let code = $state(codeInLink());

  // An invite link opened in a tab already on this screen: the browser only
  // changes the hash, without reloading, so pick the code up now.
  function linkChanged() {
    linkCode = codeInLink();
    if (linkCode) code = linkCode;
  }
  let showRules = $state(false);

  const busy = $derived(session.status === 'connecting');

  function create(e: Event) {
    e.preventDefault();
    session.setName(name);
    session.hostRoom();
  }
  function solo(e: Event) {
    e.preventDefault();
    session.setName(name);
    session.playSolo();
  }
  function join(e: Event) {
    e.preventDefault();
    session.setName(name);
    session.joinRoom(normalizeCode(code));
  }
</script>

<svelte:window onhashchange={linkChanged} />

<a class="arcade-back" href="/"><svg class="arcade-icon" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#12152a"/><rect x="16" y="8" width="32" height="9" rx="2" fill="#f2b134"/><rect x="16" y="17" width="32" height="39" fill="#272c52"/><rect x="21" y="21" width="22" height="17" rx="2" fill="#0a0c1d" stroke="#5b93f0" stroke-width="1.5"/><rect x="26" y="27" width="6" height="6" rx="1" fill="#f2b134"/><path d="M14 42h36l2 7H12z" fill="#353b66"/><circle cx="24" cy="45" r="2.5" fill="#e2553f"/><circle cx="38" cy="45.5" r="1.8" fill="#f2b134"/><circle cx="43" cy="45.5" r="1.8" fill="#5b93f0"/></svg>Arcade</a>

<main>
  <header>
    <h1 aria-label="Turn 7">Turn<svg class="seven" viewBox="0 0 64 84" aria-hidden="true"
        ><g transform="rotate(10 32 42)"
          ><rect x="10" y="8" width="44" height="66" rx="7" fill="#f2b134" stroke="#1d2340" stroke-width="3.5" /><text
            x="32"
            y="55"
            text-anchor="middle"
            font-size="40"
            font-weight="900"
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            fill="#1d2340">7</text
          ></g
        ></svg
      ></h1>
    <p class="muted">Push your luck, turn seven, wreck your friends. No accounts, no server: one browser hosts, everyone joins.</p>
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

    {#if !linkCode}
      <form class="panel" onsubmit={solo}>
        <h2>Play solo</h2>
        <p class="muted">Just you: how many rounds does it take you to reach 200?</p>
        <button class="primary">Play solo</button>
      </form>
    {/if}

    <section class="panel">
      <h2>{linkCode ? 'Join a room' : 'Multiplayer'}</h2>
      <form class="row" onsubmit={join}>
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
      </form>
      {#if !linkCode}
        <p class="or muted">or host a room</p>
        <form class="host" onsubmit={create}>
          <p class="muted">Your browser runs the game. Keep this tab open while you play.</p>
          <button class="primary" disabled={!name.trim()}>Create room</button>
        </form>
      {/if}
    </section>
  {/if}

  <button class="ghost rules" onclick={() => (showRules = true)}>How to play</button>
</main>

{#if showRules}
  <RulesSheet onclose={() => (showRules = false)} />
{/if}

<style>
  /* Back out to the arcade (arcade.wabmalia.eu): top left of the page, like a
     small button. */
  .arcade-back {
    position: absolute;
    top: max(12px, env(safe-area-inset-top));
    left: max(16px, env(safe-area-inset-left));
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.8rem 0.3rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    touch-action: manipulation;
  }
  .arcade-icon {
    width: 1.35rem;
    height: 1.35rem;
    flex: none;
  }
  .arcade-back:hover {
    background: var(--surface-2);
  }
  .arcade-back:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
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
  h1 {
    margin: 0.5rem 0 0.25rem;
    font-size: 3.2rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  /* The superscript 7 is drawn as a playing card (SVG, so it rotates cleanly). */
  .seven {
    height: 0.8em;
    width: auto;
    margin-left: 0.02em;
    vertical-align: 0.45em;
    overflow: visible;
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.25));
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .panel p {
    margin: 0;
  }
  .host {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  /* A rule either side: "—— or host a room ——". */
  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--border);
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
