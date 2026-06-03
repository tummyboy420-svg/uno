// src/components/GameBoard.jsx
import React, { useState, useEffect, useRef } from 'react';
import DrawPile from './DrawPile';
import DiscardPile from './DiscardPile';
import PlayerHand from './PlayerHand';
import OpponentHand from './OpponentHand';
import { sounds } from './SoundManager';
import { RotateCw, RotateCcw, AlertTriangle, ArrowLeft, Star, Bell } from 'lucide-react';

export default function GameBoard({
  gameState,
  localPlayerId,
  playCard,
  drawCard,
  declareUno,
  catchUno,
  restartGame,
  leaveRoom,
}) {
  const {
    players,
    currentPlayerIndex,
    direction,
    discardPile,
    deck,
    activeColor,
    activeValue,
    wildSelectUserId,
    status,
    winnerId,
    code,
    unoPenalties,
  } = gameState;

  const [toasts, setToasts] = useState([]);
  const prevGameStateRef = useRef(gameState);

  const addToast = (text, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    // Play a subtle sound cue for important events
    if (type === 'victory' || type === 'uno') {
      sounds.playTurnAlert();
    } else {
      sounds.playPlayCard();
    }
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  useEffect(() => {
    const prev = prevGameStateRef.current;
    if (!prev || !prev.status || prev.status === 'idle') {
      prevGameStateRef.current = gameState;
      return;
    }

    // 1. Detect game status change
    if (status === 'playing' && prev.status === 'lobby') {
      addToast('🎮 Match started! Good luck!', 'success');
    } else if (status === 'ended' && prev.status === 'playing') {
      const winnerName = players.find(p => p.id === winnerId || p.session_id === winnerId)?.name || 'Someone';
      addToast(`🏆 ${winnerName} won the match!`, 'victory');
    }

    // 2. Detect card play
    if (discardPile.length > prev.discardPile.length) {
      const playedCard = discardPile[discardPile.length - 1];
      const playerWhoPlayed = prev.players[prev.currentPlayerIndex];
      if (playerWhoPlayed && playedCard) {
        let cardName = playedCard.color !== 'wild' ? `${playedCard.color.toUpperCase()} ` : '';
        if (playedCard.type === 'number') cardName += playedCard.value;
        else if (playedCard.type === 'skip') cardName += 'SKIP 🚫';
        else if (playedCard.type === 'reverse') cardName += 'REVERSE 🔄';
        else if (playedCard.type === 'draw2') cardName += 'DRAW TWO 🎴';
        else if (playedCard.type === 'wild') cardName += 'WILD 🌈';
        else if (playedCard.type === 'wild4') cardName += 'WILD DRAW FOUR 🌈';

        addToast(`🎯 ${playerWhoPlayed.name} played ${cardName}`, 'play');

        if (playedCard.type === 'reverse') {
          addToast('🔄 Play direction reversed!', 'info');
        }
      }
    }

    // 3. Detect card draw
    const prevActivePlayer = prev.players[prev.currentPlayerIndex];
    if (deck.length < prev.deck.length && discardPile.length === prev.discardPile.length) {
      if (prevActivePlayer) {
        const currentVersion = players.find(p => p.id === prevActivePlayer.id || p.session_id === prevActivePlayer.session_id);
        if (currentVersion && currentVersion.hand.length > prevActivePlayer.hand.length) {
          const count = currentVersion.hand.length - prevActivePlayer.hand.length;
          addToast(`📥 ${prevActivePlayer.name} drew ${count} card${count > 1 ? 's' : ''}`, 'draw');
        }
      }
    }

    // 4. Detect UNO declarations
    players.forEach(p => {
      const prevP = prev.players.find(old => old.id === p.id || old.session_id === p.session_id);
      if (p.unoCalled && prevP && !prevP.unoCalled) {
        addToast(`📢 ${p.name} shouted UNO!`, 'uno');
      }
    });

    // 5. Detect disconnections
    players.forEach(p => {
      const prevP = prev.players.find(old => old.id === p.id || old.session_id === p.session_id);
      if (prevP) {
        if (!p.is_connected && prevP.is_connected) {
          addToast(`🔌 ${p.name} disconnected! Bot takeover active.`, 'warning');
        } else if (p.is_connected && !prevP.is_connected) {
          addToast(`🔌 ${p.name} reconnected!`, 'success');
        }
      }
    });

    prevGameStateRef.current = gameState;
  }, [gameState, players, discardPile, deck, winnerId, status]);

  // Retrieve current active player
  const localPlayerIdx = players.findIndex(
    (p) => p.session_id === localPlayerId || p.id === localPlayerId
  );
  const localPlayer = players[localPlayerIdx];
  const isMyTurn = currentPlayerIndex === localPlayerIdx;
  const isHost = localPlayer?.is_host || false;

  const localPlayerNeedsUno = localPlayer && (
    localPlayer.hand.length === 2 || 
    (localPlayer.hand.length === 1 && !localPlayer.unoCalled)
  );

  const catchableOpponentIds = Object.keys(unoPenalties || {}).filter(
    (sid) => sid !== localPlayerId
  );
  const canCatchOpponent = catchableOpponentIds.length > 0;

  // Alert player when it's their turn
  useEffect(() => {
    if (status === 'playing' && isMyTurn) {
      sounds.playTurnAlert();
    }
  }, [currentPlayerIndex, status, isMyTurn]);

  // Find winner details
  const winner = players.find((p) => p.id === winnerId || p.session_id === winnerId);

  // Wild color selector selection
  const handleColorSelect = (color) => {
    // Retrieve the wild card that was played (which would be the top card in discard, or we resolve on play)
    // In our hooks, playCard is called with (cardId, color)
    // We stored the cardId when the player clicked it, which triggered the select mode.
    // Wait, in our hooks, if card is wild and color is not selected, we set wildSelectUserId.
    // The player's last played card is actually not written to discard pile yet!
    // So we need to know WHICH card they wanted to play.
    // Since playCard is called with cardId, we can find the wild card in the player's hand.
    const wildCard = localPlayer.hand.find((c) => c.color === 'wild');
    if (wildCard) {
      playCard(wildCard.id, color);
    }
  };

  const isWaitingForColor = wildSelectUserId === localPlayerId;

  return (
    <div className="game-board-container">
      {/* Top Header Panel */}
      <div className="game-board-header">
        <button className="btn-back-lobby" onClick={leaveRoom}>
          <ArrowLeft size={16} /> EXIT GAME
        </button>
        <div className="game-info-badge">
          <span>ROOM: <b>{code}</b></span>
          <span className="info-dot">•</span>
          <span>DISCARD: {discardPile.length}</span>
          <span className="info-dot">•</span>
          <span>DRAW DECK: {deck.length}</span>
        </div>
        <div className="active-turn-indicator-bar">
          {isMyTurn ? (
            <span className="my-turn-glow">YOUR TURN! 🔥</span>
          ) : (
            <span>WAITING FOR: {players[currentPlayerIndex]?.name || '...'}</span>
          )}
        </div>
      </div>

      {/* Main Playing Arena */}
      <div className="play-arena">
        {/* Opponents seat positions */}
        <OpponentHand
          players={players}
          currentPlayerIndex={currentPlayerIndex}
          localPlayerId={localPlayerId}
          unoPenalties={unoPenalties}
          onCatchUno={catchUno}
        />

        {/* Center Table Board */}
        <div className="game-table">
          {/* Central direction indicators */}
          <div className={`direction-indicator-ring ${direction === 1 ? 'clockwise' : 'counter-clockwise'}`}>
            {direction === 1 ? <RotateCw size={120} /> : <RotateCcw size={120} />}
          </div>

          <div className="table-center-piles">
            {/* Draw Pile */}
            <DrawPile
              count={deck.length}
              isPlayable={isMyTurn && !isWaitingForColor}
              onClick={drawCard}
            />

            {/* Central UNO Button */}
            <button
              id="central-uno-button"
              className={`center-uno-btn ${
                localPlayerNeedsUno
                  ? 'active mode-declare pulse'
                  : canCatchOpponent
                  ? 'active mode-catch alert-pulse'
                  : 'inactive'
              }`}
              onClick={
                localPlayerNeedsUno
                  ? declareUno
                  : canCatchOpponent
                  ? () => catchUno(catchableOpponentIds[0])
                  : null
              }
              title={
                localPlayerNeedsUno
                  ? 'Declare UNO!'
                  : canCatchOpponent
                  ? 'Catch Opponent UNO!'
                  : 'UNO Button'
              }
              disabled={!localPlayerNeedsUno && !canCatchOpponent}
            >
              <div className="uno-btn-inner">
                <span className="uno-btn-text">
                  {canCatchOpponent ? 'CATCH!' : 'UNO!'}
                </span>
              </div>
            </button>

            {/* Discard Pile */}
            <DiscardPile
              pile={discardPile}
              activeColor={activeColor}
            />
          </div>
        </div>
      </div>

      {/* Wild Color Selection Overlay */}
      {isWaitingForColor && (
        <div className="wild-select-overlay-container modal-backdrop animate-fade-in">
          <div className="radial-wild-wheel glass-heavy">
            <div className="wheel-inner">
              <button 
                type="button" 
                className="wheel-segment segment-red" 
                onClick={() => handleColorSelect('red')}
                title="Select Red"
              >
                <span className="segment-label">RED</span>
              </button>
              <button 
                type="button" 
                className="wheel-segment segment-blue" 
                onClick={() => handleColorSelect('blue')}
                title="Select Blue"
              >
                <span className="segment-label">BLUE</span>
              </button>
              <button 
                type="button" 
                className="wheel-segment segment-yellow" 
                onClick={() => handleColorSelect('yellow')}
                title="Select Yellow"
              >
                <span className="segment-label">YELLOW</span>
              </button>
              <button 
                type="button" 
                className="wheel-segment segment-green" 
                onClick={() => handleColorSelect('green')}
                title="Select Green"
              >
                <span className="segment-label">GREEN</span>
              </button>
              <div className="wheel-center">
                <span className="wheel-title">CHOOSE</span>
                <span className="wheel-subtitle">COLOR</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active User Controls at bottom */}
      <div className={`active-player-station ${isMyTurn ? 'my-active-turn' : ''}`}>
        <div className="player-station-header">
          <span className="player-station-name">
            👤 {localPlayer?.name} {localPlayer?.is_host && '👑'} (You)
          </span>
          {localPlayer?.unoCalled && <span className="uno-safe-badge">UNO! SAFE</span>}
        </div>

        <PlayerHand
          hand={localPlayer?.hand || []}
          activeColor={activeColor}
          activeValue={activeValue}
          isMyTurn={isMyTurn && !isWaitingForColor}
          onPlayCard={playCard}
        />
      </div>

      {/* Game Over Screen Overlay */}
      {status === 'ended' && (
        <div className="game-over-overlay modal-backdrop">
          <div className="game-over-card glass pulse">
            <h2>🏆 VICTORY! 🏆</h2>
            <div className="winner-details">
              <div className="winner-avatar">{winner?.name?.charAt(0).toUpperCase()}</div>
              <h3>{winner?.name} WON THE GAME!</h3>
              <p>All cards cleared from hand.</p>
            </div>
            <div className="game-over-actions">
              {isHost ? (
                <button className="btn-restart-game pulse" onClick={restartGame}>
                  PLAY AGAIN
                </button>
              ) : (
                <p className="wait-host-text">Waiting for host to restart game...</p>
              )}
              <button className="btn-exit-lobby" onClick={leaveRoom}>
                EXIT TO LOBBY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Realtime Event Toasts */}
      <div className="game-toasts-container">
        {toasts.map((t) => (
          <div key={t.id} className={`game-toast toast-${t.type} glass animate-fade-in`}>
            {t.type === 'warning' && <AlertTriangle size={15} className="toast-icon-warn" />}
            {t.type === 'victory' && <Star size={15} className="toast-icon-victory" />}
            {t.type === 'uno' && <Bell size={15} className="toast-icon-uno" />}
            <span className="toast-text">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
