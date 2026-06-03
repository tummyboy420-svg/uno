// src/components/UnoCard.jsx
import React from 'react';

// Color mapping for HSL codes
export const COLOR_MAP = {
  red: 'var(--uno-red)',
  blue: 'var(--uno-blue)',
  green: 'var(--uno-green)',
  yellow: 'var(--uno-yellow)',
  wild: 'var(--uno-wild)',
};

export default function UnoCard({ card, onClick, isPlayable = false, isHidden = false }) {
  if (isHidden) {
    // Render Card Back
    return (
      <div className="uno-card card-back">
        <div className="card-back-outer">
          <div className="card-back-inner">
            <div className="card-back-logo">UNO</div>
          </div>
        </div>
      </div>
    );
  }

  const { color, type, value } = card;

  // Render Card Front
  const renderSymbol = (val, sizeClass) => {
    switch (val) {
      case 'skip':
        return (
          <svg className={`card-svg ${sizeClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        );
      case 'reverse':
        return (
          <svg className={`card-svg ${sizeClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        );
      case 'draw2':
        return (
          <div className={`draw2-symbol ${sizeClass}`}>
            <div className="mini-card-shape first-card"></div>
            <div className="mini-card-shape second-card">+2</div>
          </div>
        );
      case 'wild':
        return (
          <div className={`wild-quadrant ${sizeClass}`}>
            <div className="quad q-red"></div>
            <div className="quad q-blue"></div>
            <div className="quad q-yellow"></div>
            <div className="quad q-green"></div>
          </div>
        );
      case 'wild4':
        return (
          <div className={`wild4-symbol ${sizeClass}`}>
            <div className="mini-card-stacked stack-1 red-s"></div>
            <div className="mini-card-stacked stack-2 blue-s"></div>
            <div className="mini-card-stacked stack-3 yellow-s"></div>
            <div className="mini-card-stacked stack-4 green-s">+4</div>
          </div>
        );
      default:
        return <span className={`card-number-text ${sizeClass}`}>{val}</span>;
    }
  };

  const getCardClasses = () => {
    let classes = `uno-card card-color-${color}`;
    if (isPlayable) classes += ' is-playable';
    if (color === 'wild') classes += ' is-wild-card';
    return classes;
  };

  return (
    <div
      className={getCardClasses()}
      onClick={onClick}
      style={{
        '--card-theme-color': COLOR_MAP[color],
      }}
    >
      <div className="card-border">
        {/* Top Left Corner */}
        <div className="card-corner corner-top-left">
          {renderSymbol(value, 'corner-size')}
        </div>

        {/* Center Section */}
        <div className="card-center">
          <div className="card-center-ellipse">
            {renderSymbol(value, 'center-size')}
          </div>
        </div>

        {/* Bottom Right Corner */}
        <div className="card-corner corner-bottom-right">
          {renderSymbol(value, 'corner-size')}
        </div>
      </div>
    </div>
  );
}
