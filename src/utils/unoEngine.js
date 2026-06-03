// src/utils/unoEngine.js
// Official UNO Rules Implementation

export const COLORS = ['red', 'blue', 'green', 'yellow'];

export const TYPES = {
  NUMBER: 'number',
  SKIP: 'skip',
  REVERSE: 'reverse',
  DRAW2: 'draw2',
  WILD: 'wild',
  WILD4: 'wild4',
};

/**
 * Generates a standard 108-card UNO deck.
 * - 4 colors × (1×zero + 2×1-9 + 2×Skip + 2×Reverse + 2×Draw2) = 100 colored cards
 * - 4 Wild cards
 * - 4 Wild Draw Four cards
 * Total = 108 cards
 */
export function generateDeck() {
  const deck = [];

  COLORS.forEach((color) => {
    // One '0' card per color
    deck.push({ id: `${color}-0`, color, type: TYPES.NUMBER, value: '0' });

    // Two of each number 1–9 per color
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `${color}-${i}-a`, color, type: TYPES.NUMBER, value: String(i) });
      deck.push({ id: `${color}-${i}-b`, color, type: TYPES.NUMBER, value: String(i) });
    }

    // Two of each action card per color
    ['a', 'b'].forEach((suffix) => {
      deck.push({ id: `${color}-skip-${suffix}`, color, type: TYPES.SKIP, value: 'skip' });
      deck.push({ id: `${color}-reverse-${suffix}`, color, type: TYPES.REVERSE, value: 'reverse' });
      deck.push({ id: `${color}-draw2-${suffix}`, color, type: TYPES.DRAW2, value: 'draw2' });
    });
  });

  // Four Wild cards
  for (let i = 1; i <= 4; i++) {
    deck.push({ id: `wild-${i}`, color: 'wild', type: TYPES.WILD, value: 'wild' });
  }

  // Four Wild Draw Four cards
  for (let i = 1; i <= 4; i++) {
    deck.push({ id: `wild4-${i}`, color: 'wild', type: TYPES.WILD4, value: 'wild4' });
  }

  return deck; // 108 cards total
}

/**
 * Fisher-Yates shuffle.
 */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Checks whether a card can legally be played on the current discard.
 * Official rules:
 *   - Wild: always playable
 *   - Wild Draw Four: ONLY playable when player has NO card matching activeColor
 *     (This restriction is enforced at play time, not here, since we need the full hand)
 *   - Colored card: must match activeColor OR activeValue (number/symbol)
 */
export function canPlayCard(card, activeColor, activeValue) {
  if (card.type === TYPES.WILD) return true;
  if (card.type === TYPES.WILD4) return true; // legality enforced by canPlayWild4
  return card.color === activeColor || card.value === activeValue;
}

/**
 * Official Wild Draw Four legality check.
 * Wild Draw Four may ONLY be played when the player has no card that matches the active color.
 */
export function canPlayWild4(hand, activeColor) {
  return !hand.some(
    (c) => c.color === activeColor && c.color !== 'wild'
  );
}

/**
 * Calculates the score value of a single card per official UNO rules.
 */
export function getCardScore(card) {
  if (card.type === TYPES.NUMBER) return parseInt(card.value, 10);
  if (card.type === TYPES.SKIP) return 20;
  if (card.type === TYPES.REVERSE) return 20;
  if (card.type === TYPES.DRAW2) return 20;
  if (card.type === TYPES.WILD) return 50;
  if (card.type === TYPES.WILD4) return 50;
  return 0;
}

/**
 * Calculates total score from a player's remaining hand.
 */
export function calculateHandScore(hand) {
  return hand.reduce((total, card) => total + getCardScore(card), 0);
}

/**
 * Advanced AI card selection following official strategy priorities:
 * 1. Number cards matching active color (save actions)
 * 2. Number cards matching active value (color change opportunity)
 * 3. Action cards matching active color (Skip, Reverse, Draw2)
 * 4. Action cards matching active value (different color)
 * 5. Wild card (color selector)
 * 6. Wild Draw Four — LAST RESORT, only if legal
 */
export function getBotAction(hand, activeColor, activeValue) {
  // Filter initially playable cards (includes wild4 before legality check)
  const playable = hand.filter((c) => canPlayCard(c, activeColor, activeValue));
  if (playable.length === 0) return null;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 1. Number cards of active color
  const numSameColor = playable.filter((c) => c.color === activeColor && c.type === TYPES.NUMBER);
  if (numSameColor.length > 0) return pick(numSameColor);

  // 2. Number cards matching value (different color — changes color)
  const numSameValue = playable.filter((c) => c.color !== activeColor && c.type === TYPES.NUMBER && c.value === activeValue);
  if (numSameValue.length > 0) return pick(numSameValue);

  // 3. Action cards of active color
  const actionSameColor = playable.filter(
    (c) => c.color === activeColor && (c.type === TYPES.SKIP || c.type === TYPES.REVERSE || c.type === TYPES.DRAW2)
  );
  if (actionSameColor.length > 0) return pick(actionSameColor);

  // 4. Action cards of different color matching value
  const actionDiffColor = playable.filter(
    (c) => c.color !== activeColor && c.color !== 'wild' && c.value === activeValue
  );
  if (actionDiffColor.length > 0) return pick(actionDiffColor);

  // 5. Wild card (not Wild4)
  const wilds = playable.filter((c) => c.type === TYPES.WILD);
  if (wilds.length > 0) return pick(wilds);

  // 6. Wild Draw Four — only if legal (no matching color card in hand)
  const wild4s = playable.filter((c) => c.type === TYPES.WILD4);
  if (wild4s.length > 0 && canPlayWild4(hand, activeColor)) {
    return pick(wild4s);
  }

  // Fallback: play any non-wild4 valid card
  const nonWild4 = playable.filter((c) => c.type !== TYPES.WILD4);
  if (nonWild4.length > 0) return pick(nonWild4);

  return null; // Cannot legally play
}

/**
 * Decides color for a bot's wild card play.
 * Chooses the color the bot has the most of in its hand.
 * Falls back to random color if hand is empty.
 */
export function getBotColorChoice(hand) {
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  hand.forEach((card) => {
    if (counts[card.color] !== undefined) counts[card.color]++;
  });

  let bestColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  let maxCount = -1;
  COLORS.forEach((color) => {
    if (counts[color] > maxCount) {
      maxCount = counts[color];
      bestColor = color;
    }
  });
  return bestColor;
}

/**
 * Calculates the next player index after accounting for direction and skips.
 * @param {number} currentIndex  - current player's index
 * @param {number} direction     - 1 (clockwise) or -1 (counter-clockwise)
 * @param {number} playerCount   - total number of players
 * @param {number} skipCount     - how many steps to advance (1 = normal, 2 = skip next)
 */
export function getNextPlayerIndex(currentIndex, direction, playerCount, skipCount = 1) {
  let next = currentIndex;
  for (let i = 0; i < skipCount; i++) {
    next = (next + direction + playerCount) % playerCount;
  }
  return next;
}

/**
 * Sets up a fresh game:
 * - Generates and shuffles the deck
 * - Deals 7 cards to each player
 * - Flips one non-wild card as the starting discard
 * - Handles starter card effects (Skip/Reverse/Draw2)
 */
export function dealGame(playersList) {
  const deck = shuffle(generateDeck());
  const players = playersList.map((p) => ({ ...p, hand: [] }));

  // Deal 7 cards to each player (round-robin)
  for (let i = 0; i < 7; i++) {
    players.forEach((player) => {
      if (deck.length > 0) player.hand.push(deck.pop());
    });
  }

  // Pick a valid starter card — must NOT be a Wild or Wild Draw Four
  let starterIdx = deck.findIndex((c) => c.color !== 'wild');
  if (starterIdx === -1) starterIdx = deck.length - 1;
  const [starterCard] = deck.splice(starterIdx, 1);

  let currentPlayerIndex = 0;
  let direction = 1;
  let activeColor = starterCard.color;
  let activeValue = starterCard.value;

  // Apply starter card effects
  if (starterCard.type === TYPES.SKIP) {
    // First player is skipped
    currentPlayerIndex = getNextPlayerIndex(0, direction, players.length);
  } else if (starterCard.type === TYPES.REVERSE) {
    // Reverse direction; with 2 players acts like Skip
    direction = -1;
    if (players.length === 2) {
      currentPlayerIndex = getNextPlayerIndex(0, direction, players.length);
    } else {
      currentPlayerIndex = (0 + direction + players.length) % players.length;
    }
  } else if (starterCard.type === TYPES.DRAW2) {
    // First player draws 2 and is skipped
    const drawFor = players[0];
    const drawn = deck.splice(-2);
    drawFor.hand.push(...drawn);
    currentPlayerIndex = getNextPlayerIndex(0, direction, players.length);
  }

  return {
    deck,
    discardPile: [starterCard],
    activeColor,
    activeValue,
    currentPlayerIndex,
    direction,
    players,
  };
}
