// src/components/DrawPile.jsx
import React from 'react';
import UnoCard from './UnoCard';

export default function DrawPile({ count, onClick, isPlayable = false }) {
  // We render a stacked card deck look
  const stackOffsets = [
    { x: 0, y: 0 },
    { x: -2, y: -2 },
    { x: -4, y: -4 },
    { x: -6, y: -6 },
  ];

  return (
    <div 
      className={`draw-pile-container ${isPlayable ? 'is-turn-to-draw' : ''}`}
      onClick={isPlayable ? onClick : undefined}
    >
      {stackOffsets.map((offset, idx) => (
        <div
          key={idx}
          className="draw-pile-stack-card"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            zIndex: idx,
          }}
        >
          <UnoCard isHidden={true} />
        </div>
      ))}
      <div className="draw-pile-badge" style={{ zIndex: 10 }}>
        {count > 0 ? count : 'Re-shuffling'}
      </div>
      <div className="draw-pile-label">DRAW DECK</div>
    </div>
  );
}
