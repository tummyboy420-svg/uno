// src/components/OpponentHand.jsx
import React from 'react';
import UnoCard from './UnoCard';

export default function OpponentHand({
  players,
  currentPlayerIndex,
  localPlayerId,
  unoPenalties = {},
  onCatchUno,
}) {
  // Re-order players list starting from local player (who is index 0 in visual layout)
  // to position opponents around the table.
  const localIndex = players.findIndex(
    (p) => p.session_id === localPlayerId || p.id === localPlayerId
  );
  
  if (localIndex === -1 || players.length <= 1) {
    return null;
  }

  // Get opponents in clockwise order
  const opponents = [];
  const count = players.length;
  for (let i = 1; i < count; i++) {
    const opp = players[(localIndex + i) % count];
    opponents.push({
      ...opp,
      globalIndex: (localIndex + i) % count,
    });
  }

  // Assign CSS positioning classes based on opponent index relative to player count
  // This places them symmetrically around the top, left, and right sides of the table
  const getPositionClass = (idx, totalOpponents) => {
    if (totalOpponents === 1) return 'pos-top';
    
    if (totalOpponents === 2) {
      if (idx === 0) return 'pos-left-top';
      return 'pos-right-top';
    }

    if (totalOpponents === 3) {
      if (idx === 0) return 'pos-left';
      if (idx === 1) return 'pos-top';
      return 'pos-right';
    }

    // Default layout helper for 4-7 opponents
    const ratio = idx / (totalOpponents - 1);
    if (ratio < 0.3) return 'pos-left';
    if (ratio < 0.45) return 'pos-left-top';
    if (ratio < 0.55) return 'pos-top';
    if (ratio < 0.7) return 'pos-right-top';
    return 'pos-right';
  };

  return (
    <div className="opponents-layer">
      {opponents.map((opp, idx) => {
        const isCurrentTurn = currentPlayerIndex === opp.globalIndex;
        const cardCount = opp.hand ? opp.hand.length : 0;
        const isOffline = !opp.is_connected;
        const isVulnerable = !!unoPenalties[opp.id] || !!unoPenalties[opp.session_id];

        // Draw overlapping card backs to represent their hand
        const cardsToRender = Math.min(cardCount, 5); // render max 5 card back overlap
        
        return (
          <div
            key={opp.id}
            className={`opponent-seat ${getPositionClass(idx, opponents.length)} ${
              isCurrentTurn ? 'active-turn' : ''
            }`}
          >
            {/* Avatar & Player Info */}
            <div className="opponent-profile">
              <div className="opponent-avatar">
                {opp.name.charAt(0).toUpperCase()}
                {isOffline && <div className="offline-dot" title="Offline - Bot takeover active" />}
                {opp.is_bot && <div className="bot-badge">BOT</div>}
              </div>
              <div className="opponent-details">
                <span className="opponent-name">
                  {opp.name} {opp.is_host && <span className="host-crown">👑</span>}
                </span>
                <span className="opponent-cards-count">
                  🎴 {cardCount} {cardCount === 1 && <span className="uno-warning-text">UNO!</span>}
                </span>
              </div>

              {/* Catch UNO button */}
              {isVulnerable && onCatchUno && (
                <button
                  className="catch-uno-btn"
                  onClick={() => onCatchUno(opp.id || opp.session_id)}
                >
                  ⚡ CATCH UNO!
                </button>
              )}
            </div>

            {/* Overlapping Card Backs */}
            <div className="opponent-hand-cards">
              {Array.from({ length: cardsToRender }).map((_, cIdx) => (
                <div
                  key={cIdx}
                  className="opponent-card-overlap"
                  style={{
                    transform: `translateX(${cIdx * 10}px) rotate(${(cIdx - 2) * 2}deg)`,
                    zIndex: cIdx,
                  }}
                >
                  <div className="mini-card-back" />
                </div>
              ))}
              {cardCount > 5 && (
                <div 
                  className="opponent-cards-more"
                  style={{ transform: `translateX(${cardsToRender * 10 + 5}px)` }}
                >
                  +{cardCount - 5}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
