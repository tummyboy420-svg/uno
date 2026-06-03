// src/components/PlayerHand.jsx
import React from 'react';
import UnoCard from './UnoCard';
import { canPlayCard } from '../utils/unoEngine';

export default function PlayerHand({
  hand,
  activeColor,
  activeValue,
  isMyTurn,
  onPlayCard,
  onDeclareUno,
  unoCalled,
}) {
  const needsUnoButton = hand.length === 2 || (hand.length === 1 && !unoCalled);

  return (
    <div className="player-hand-container">
      {needsUnoButton && isMyTurn && (
        <button
          className={`uno-call-btn ${unoCalled ? 'declared' : 'pulse'}`}
          onClick={onDeclareUno}
          disabled={unoCalled}
        >
          {unoCalled ? 'UNO DECLARED!' : 'DECLARE UNO!'}
        </button>
      )}

      <div className="player-hand-scroll-wrapper">
        <div className="player-hand-cards">
          {hand.map((card, index) => {
            const playable = isMyTurn && canPlayCard(card, activeColor, activeValue);
            
            // Fan calculation (slight rotational fan for realistic feel)
            const mid = (hand.length - 1) / 2;
            const idxFromMid = index - mid;
            const rotateDeg = idxFromMid * (hand.length > 10 ? 2 : 4);
            const translateY = Math.abs(idxFromMid) * (hand.length > 10 ? 1 : 2);

            return (
              <div
                key={card.id}
                className="hand-card-wrapper"
                style={{
                  '--card-fan-rotate': `${rotateDeg}deg`,
                  '--card-fan-translate-y': `${translateY}px`,
                  '--card-index': index,
                  zIndex: index,
                }}
              >
                <UnoCard
                  card={card}
                  isPlayable={playable}
                  onClick={() => playable && onPlayCard(card.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
      
      {hand.length === 0 && (
        <div className="player-hand-empty">Waiting for game to start...</div>
      )}
    </div>
  );
}
