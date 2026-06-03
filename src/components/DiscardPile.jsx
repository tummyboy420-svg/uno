// src/components/DiscardPile.jsx
import React from 'react';
import UnoCard from './UnoCard';

// Helper to get deterministic rotation/offsets
function getCardStyle(cardId) {
  if (!cardId) return {};
  const seed = cardId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rotation = (seed % 20) - 10; // -10deg to 10deg
  const x = (seed % 12) - 6; // -6px to 6px
  const y = ((seed >> 2) % 12) - 6; // -6px to 6px
  return {
    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)`,
  };
}

export default function DiscardPile({ pile, activeColor }) {
  if (!pile || pile.length === 0) {
    return <div className="discard-pile-empty">Discard Pile Empty</div>;
  }

  // Render top 3 cards for layering effect
  const visibleCards = pile.slice(-3);

  return (
    <div className="discard-pile-container">
      {visibleCards.map((card, index) => {
        const isTop = index === visibleCards.length - 1;
        const style = isTop ? {} : getCardStyle(card.id);
        
        return (
          <div
            key={card.id}
            className={`discard-pile-stacked-card ${isTop ? 'top-card' : ''}`}
            style={{
              ...style,
              zIndex: index,
            }}
          >
            <UnoCard card={card} />
          </div>
        );
      })}

      {/* Active Color indicator ring if the top card is a Wild card */}
      {activeColor && (
        <div 
          className={`active-color-indicator color-${activeColor}`}
          title={`Active color: ${activeColor}`}
        />
      )}
    </div>
  );
}
