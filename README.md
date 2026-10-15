# yaflip7

A browser-based, peer-to-peer take on a push-your-luck card game (the
"Vengeance" ruleset). No backend: one player's browser hosts the room and
everyone else joins with a 5-letter code or invite link.

## How it works

- **Host-authoritative.** The host's tab runs the rules engine
  (`src/engine`), owns the shuffled deck and validates every move.
  Players send intents (hit, stay, pick a target) and receive the public
  state. The deck order and RNG seed never leave the host.
- **PeerJS for the handshake.** The room code maps to a PeerJS peer id
  on the free public broker (`0.peerjs.com`). After the WebRTC handshake
  all traffic is direct browser to browser.
- **Reconnects.** Players keep their seat across refreshes (per-tab id in
  `sessionStorage`). The host's room is saved in `localStorage`, so a
  refreshed host tab reopens the same room. If a player is disconnected
  when it's their decision, a simple bot plays for them after 30 s.
- **No chat.** Emoji reactions only, and nicknames are capped at 16 chars.

Rules spec, including rulings for gaps in the rulebook: [docs/RULES.md](docs/RULES.md).

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # engine + room tests
npm run check    # svelte-check / TypeScript
npm run build    # static site in dist/
```

To try multiplayer locally, open the dev URL in two browser windows (or
one normal and one private window): create a room in one, join with the
code in the other.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds
and publishes `dist/` to GitHub Pages. In the repo settings, set
**Pages → Source** to **GitHub Actions** once.

## Known limits

- If the host closes their tab, the game pauses until they reopen it.
- Some strict corporate or mobile networks block direct WebRTC
  connections. That needs a TURN relay, which isn't configured yet.
