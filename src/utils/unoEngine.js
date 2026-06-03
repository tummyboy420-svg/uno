// src/utils/unoEngine.js

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
 */
export function generateDeck() {
  const deck = [];

  COLORS.forEach((color) => {
    // One '0' card per color
    deck.push({
      id: `${color}-number-0`,
      color,
      type: TYPES.NUMBER,
      value: '0',
    });

    // Two of each number 1-9 per color
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `${color}-number-${i}-a`, color, type: TYPES.NUMBER, value: String(i) });
      deck.push({ id: `${color}-number-${i}-b`, color, type: TYPES.NUMBER, value: String(i) });
    }

    // Two of each action card per color (Skip, Reverse, Draw 2)
    deck.push({ id: `${color}-skip-a`, color, type: TYPES.SKIP, value: 'skip' });
    deck.push({ id: `${color}-skip-b`, color, type: TYPES.SKIP, value: 'skip' });

    deck.push({ id: `${color}-reverse-a`, color, type: TYPES.REVERSE, value: 'reverse' });
    deck.push({ id: `${color}-reverse-b`, color, type: TYPES.REVERSE, value: 'reverse' });

    deck.push({ id: `${color}-draw2-a`, color, type: TYPES.DRAW2, value: 'draw2' });
    deck.push({ id: `${color}-draw2-b`, color, type: TYPES.DRAW2, value: 'draw2' });
  });

  // Four Wild cards
  for (let i = 1; i <= 4; i++) {
    deck.push({ id: `wild-${i}`, color: 'wild', type: TYPES.WILD, value: 'wild' });
  }

  // Four Wild Draw 4 cards
  for (let i = 1; i <= 4; i++) {
    deck.push({ id: `wild4-${i}`, color: 'wild', type: TYPES.WILD4, value: 'wild4' });
  }

  return deck;
}

/**
 * Shuffles an array of cards using Fisher-Yates algorithm.
 */
export function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Checks if a card is valid to play on the current discard pile.
 */
export function canPlayCard(card, activeColor, activeValue) {
  // Wild cards can always be played
  if (card.color === 'wild') {
    return true;
  }

  // Match by color or value/type
  return card.color === activeColor || card.value === activeValue;
}

/**
 * Selects a valid card to play from hand, or returns null if none are playable.
 * Prioritizes: Number matching color > Action matching color > Wilds > Wild Draw 4.
 */
export function getBotAction(hand, activeColor, activeValue) {
  const validCards = hand.filter((card) => canPlayCard(card, activeColor, activeValue));
  if (validCards.length === 0) return null;

  // Prefer number cards of active color to save action/wild cards
  const activeColorNumbers = validCards.filter(
    (c) => c.color === activeColor && c.type === TYPES.NUMBER
  );
  if (activeColorNumbers.length > 0) {
    return activeColorNumbers[Math.floor(Math.random() * activeColorNumbers.length)];
  }

  // Prefer matching number of different color
  const sameValueDifferentColor = validCards.filter(
    (c) => c.color !== activeColor && c.type === TYPES.NUMBER
  );
  if (sameValueDifferentColor.length > 0) {
    return sameValueDifferentColor[Math.floor(Math.random() * sameValueDifferentColor.length)];
  }

  // Try action cards of matching color
  const activeColorActions = validCards.filter(
    (c) => c.color === activeColor && c.type !== TYPES.NUMBER
  );
  if (activeColorActions.length > 0) {
    return activeColorActions[Math.floor(Math.random() * activeColorActions.length)];
  }

  // Try matching actions of different colors
  const sameActionDifferentColor = validCards.filter(
    (c) => c.color !== activeColor && c.type !== TYPES.NUMBER && c.color !== 'wild'
  );
  if (sameActionDifferentColor.length > 0) {
    return sameActionDifferentColor[Math.floor(Math.random() * sameActionDifferentColor.length)];
  }

  // Use wildcards as a fallback
  const wildCards = validCards.filter((c) => c.type === TYPES.WILD);
  if (wildCards.length > 0) {
    return wildCards[0];
  }

  // Wild4 as last resort
  const wild4Cards = validCards.filter((c) => c.type === TYPES.WILD4);
  if (wild4Cards.length > 0) {
    return wild4Cards[0];
  }

  return validCards[Math.floor(Math.random() * validCards.length)];
}

/**
 * Decides a random color for bot wild plays.
 * Chooses the color the bot has the most of in its hand.
 */
export function getBotColorChoice(hand) {
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  hand.forEach((card) => {
    if (counts[card.color] !== undefined) {
      counts[card.color]++;
    }
  });

  let bestColor = COLORS[0];
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
 * Calculates next player index based on play order, current player, and direction.
 */
export function getNextPlayerIndex(currentIndex, direction, playerCount, skipCount = 1) {
  let nextIndex = currentIndex;
  for (let i = 0; i < skipCount; i++) {
    nextIndex = (nextIndex + direction + playerCount) % playerCount;
  }
  return nextIndex;
}

/**
 * Sets up a fresh game: shuffles deck, deals cards, determines starter card.
 */
export function dealGame(playersList) {
  const rawDeck = generateDeck();
  const shuffled = shuffle(rawDeck);

  // Deal 7 cards to each player
  const players = playersList.map((player) => ({
    ...player,
    hand: [],
  }));

  for (let i = 0; i < 7; i++) {
    players.forEach((player) => {
      if (shuffled.length > 0) {
        player.hand.push(shuffled.pop());
      }
    });
  }

  // Find a valid starter card (must not be wild/wild4)
  let starterCardIndex = shuffled.findIndex((c) => c.color !== 'wild');
  if (starterCardIndex === -1) {
    // fallback in case of emergency
    starterCardIndex = shuffled.length - 1;
  }
  const [starterCard] = shuffled.splice(starterCardIndex, 1);

  return {
    deck: shuffled,
    discardPile: [starterCard],
    activeColor: starterCard.color,
    activeValue: starterCard.value,
    currentPlayerIndex: 0,
    direction: 1,
    players,
  };
}
