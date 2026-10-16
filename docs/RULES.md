# Rules spec

Source: *Flip 7: With a Vengeance* rulebook, Ruleset Edition 1 (2026).
This is the authoritative spec for the game engine. Sections marked
**Ruling** fill gaps the rulebook leaves open; they were decided with
the project owner and each one should have a unit test.

## Deck (108 cards)

| Card | Count |
|---|---|
| 13 | 12 (+ Lucky 13 = 13 total) |
| 12 | 12 |
| 11 | 11 |
| 10 | 10 |
| 9 | 9 |
| 8 | 8 |
| 7 | 6 (+ Unlucky 7 = 7 total) |
| 6 | 6 |
| 5 | 5 |
| 4 | 4 |
| 3 | 3 |
| 2 | 2 |
| 1 | 1 |
| Special numbers: The Zero, Unlucky 7, Lucky 13 | 1 each |
| Modifiers: -2, -4, -6, -8, -10, ÷2 | 1 each |
| Actions: Just One More, Flip Four, Swap, Steal, Discard | 2 each |

Numbers: 89 regular + 3 special = 92. Modifiers: 6. Actions: 10.

There are no positive modifiers, Freeze, Flip Three or Second Chance
in this deck.

The rulebook recommends a second deck above 18 players.
**Ruling:** the app caps rooms at 18 players (one deck).

## Terms

- **Line**: the cards in front of a player. Number cards in a row,
  modifiers above them.
- **Hit**: take a card. **Stay**: stop taking cards; your cards remain
  in the round.
- **Bust**: get a second card with the same number. Your cards go face
  down and are out of play; you score 0 for the round.
- **Active**: not stayed and not busted.
- **Face-up card**: any card in the line of a non-busted player
  (active or stayed). Busted lines are face down.

## Round flow

1. The dealer deals one face-up card to each player, starting left of
   the dealer and going clockwise. Action and modifier cards resolve
   immediately when dealt. Some players may end up with several cards,
   others with none.
   **Ruling:** a player who has already stayed (Just One More) or busted
   (Flip Four) by the time their deal comes round is skipped.
2. Starting left of the dealer, each active player in turn chooses hit
   or stay. This repeats clockwise until no active players remain.
3. Any action or modifier card that is revealed is resolved immediately.
4. The round ends when either:
   - every player has stayed or busted, or
   - a player has 7 different number values in their line (Flip 7). This
     ends the round **immediately**; anything still pending is dropped.

**Ruling:** the Flip 7 check runs whenever a line changes, not only on
flips. Reaching 7 via Steal or Swap also ends the round.

## Receiving a card

**Ruling:** every way a card enters a line (flip, deal, Just One More,
Flip Four, Steal, Swap) counts as *receiving* it, with the same effects:

- A duplicate number busts the receiver (subject to Lucky 13).
- Special number effects trigger (Unlucky 7 wipe, The Zero, Lucky 13).
- Receiving a card never changes stayed/active status by itself.

Special numbers affect a player while they hold the card and stop when
it leaves their line.

## Special number cards

### The Zero (value 0)
- While held, your round score is 0 unless you Flip 7.
- You must hit on your turn; Stay is not allowed. The app hits for you
  automatically after a short pause.
- Counts as a number card toward Flip 7.
- **Ruling:** a forced stay (Just One More) overrides "must hit".
- **Ruling:** a stayed player who receives The Zero stays stayed; it
  only zeroes their score.

### Unlucky 7 (value 7)
- On receipt, discard every number and modifier card in your line;
  keep only the Unlucky 7.
- You cannot bust when you receive it (an existing 7 is discarded).
- A regular 7 received *afterwards* is a duplicate and busts you.
- During Flip Four: discard previous cards first, then finish the
  remaining flips.
- **Ruling:** this also applies on Steal/Swap, so swapping the Unlucky 7
  to an opponent wipes their line.
- **Ruling:** during Flip Four, modifiers already set aside for later
  resolution are discarded too ("discard all previous cards"). Set-aside
  action cards still resolve.

### Lucky 13 (value 13)
- While held, you may have one other 13 without busting. Both score.
- A third 13 busts you.
- Order doesn't matter: regular 13 then Lucky 13 is also fine.
- **Ruling:** for Flip 7, the pair counts **once** (one distinct value).
  Flip 7 always means 7 distinct values.
- **Ruling:** if the Lucky 13 leaves a line holding Lucky 13 + 13, the
  remaining regular 13 is fine (only one left).

## Modifier cards

- The player who reveals a modifier gives it to any non-busted player,
  including themselves or a stayed player. If they're the only
  non-busted player, they keep it.
- Modifiers are not number cards: no bust, no Flip 7 count.
- Modifiers can be swapped, stolen and discarded.
- **-2 / -4 / -6 / -8 / -10**: subtract from the sum of number cards.
- **÷2**: halve the sum of number cards (round down) before subtracting.

## Action cards

General:
- Resolved immediately when revealed, by the player who revealed it
  (they choose targets).
- Can target any non-busted player, including yourself and stayed
  players. If you're the only non-busted player, target yourself.
- A stayed player who must resolve an action does so but does not
  re-enter the round.
- Single use: discarded after resolving.
- If there is no legal target (e.g. Swap/Steal/Discard with no
  face-up cards), discard the action with no effect.
  **Ruling:** this applies any time, not just at the start of a round.

### Just One More!
- Target receives the next card, then must stay.
- If that card is an action, the target resolves it (chooses its
  targets). If it's a modifier, the target gives it out.
- If the card busts them, they bust instead of staying.
- **Ruling:** this works on a stayed player too: they receive one card
  (and may bust).

### Flip Four!
- Target receives the next four cards one at a time.
- Stops early if the target busts or reaches Flip 7.
- Action, modifier and number cards all count toward the four.
- Revealed actions and modifiers are set aside and resolved, in order,
  after all four flips, and only if the target hasn't busted. The
  target resolves them.
- **Ruling:** if Flip 7 happens mid-Flip-Four, the round ends
  immediately and set-aside cards are dropped.
- **Ruling:** a stayed target can bust from these flips.
- **Ruling:** a Flip Four or Just One More set aside during a Flip Four
  is resolved after it like any other action (no nesting mid-sequence).

### Swap
- Swap any two face-up cards between two different players. One of
  them may be you, or both may be other players.
- Number, special number and modifier cards are all swappable.
- Both players receive their new card (duplicate bust, Unlucky 7 wipe,
  etc.).
- **Ruling:** both receipts happen at the same time; if both players
  would bust, both bust. Flip 7 is checked afterwards.

### Steal
- Take any face-up card from another player's line into yours.
- You receive it normally (you can bust, an Unlucky 7 wipes your line).

### Discard
- Choose any non-busted player (including yourself); you pick which of
  their cards is discarded.

## Deck exhaustion

- Cards from finished rounds go to the discard pile. They are **not**
  shuffled back between rounds.
- When the deck runs out, shuffle the discard pile into a new deck.
- Mid-round reshuffles leave all cards in front of players, including
  busted lines.
- **Ruling:** if the deck and discard pile are both empty, the
  remaining draws are skipped and the drawing player is forced to stay.

## Dealer rotation

The next dealer is the player to the left of the current dealer, and
the remaining deck carries over.

## Scoring (per round)

1. Sum the number cards.
2. If you have ÷2, halve it (round down).
3. Subtract the minus modifiers. The score can't go below 0.
4. If you Flipped 7, add 15.

- Busted: 0.
- Holding The Zero without Flip 7: 0.

Example: 3+11+5+7+10+8+4 = 48, ÷2 → 24, -4 → 20, Flip 7 → 35.

## End of game

- At the end of a round, if anyone has 200 or more, the highest total
  wins.
- **Ruling:** ties are a shared win.
- Solo play (just you, racing to 200 in as few rounds as possible) is
  supported.

## Not implemented

- Brutal mode.
