// src/App.jsx
import React, { useState } from 'react';
import { useGameRoom } from './hooks/useGameRoom';
import GameLobby from './components/GameLobby';
import GameBoard from './components/GameBoard';
import SettingsModal from './components/SettingsModal';
import { Settings, ShieldAlert, Database, LogOut } from 'lucide-react';
import { getSupabaseCredentials } from './utils/supabaseClient';

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { url, key } = getSupabaseCredentials();

  return (
    <div className="app-viewport">
      {!url || !key ? (
        <>
          {/* Fallback Static Top Navbar */}
          <header className="app-navbar">
            <div className="navbar-left">
              <span className="navbar-logo">UNO.io</span>
              <span className="mode-badge online">
                <Database size={12} /> ONLINE MULTIPLAYER
              </span>
            </div>
            <button className="btn-navbar-settings" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={20} />
            </button>
          </header>

          <main className="app-main-content">
            <div className="setup-fallback-container">
              <div className="fallback-card glass">
                <ShieldAlert size={48} className="warn-icon" />
                <h2>SUPABASE CONFIGURATION REQUIRED</h2>
                <p>
                  The game runs strictly on the Supabase Cloud backend. Please define your project credentials in your local <code>.env</code> file:
                </p>
                <pre className="env-help-box">
                  VITE_SUPABASE_URL=https://your-project.supabase.co<br/>
                  VITE_SUPABASE_ANON_KEY=your-anon-public-key
                </pre>
                <div className="fallback-buttons">
                  <button className="btn-setup" onClick={() => setIsSettingsOpen(true)}>
                    VIEW CONFIGURATION INFO
                  </button>
                </div>
              </div>
            </div>
          </main>
        </>
      ) : (
        <GameContainer openSettings={() => setIsSettingsOpen(true)} />
      )}

      {/* Global Settings overlay modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

// Wrapper for multiplayer room
function GameContainer({ openSettings }) {
  const roomProps = useGameRoom();
  const { gameState, leaveRoom, isConnecting, error } = roomProps;

  // Detect if user is "orphaned" — game state is active but the local player isn't in it
  const localSessionId = localStorage.getItem('uno_multiplayer_session_id');
  const isOrphaned =
    gameState.status !== 'idle' &&
    gameState.players.length > 0 &&
    !gameState.players.some(
      (p) => p.session_id === localSessionId || p.id === localSessionId
    );

  return (
    <div className="game-container-inner" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Dynamic Top Navbar */}
      <header className="app-navbar">
        <div className="navbar-left">
          <span className="navbar-logo">UNO.io</span>
          {gameState.status !== 'idle' ? (
            <div className="navbar-room-badge glass-subtle animate-fade-in">
              <span>ROOM: <b>{gameState.code}</b></span>
            </div>
          ) : (
            <span className="mode-badge online">
              <Database size={12} /> ONLINE MULTIPLAYER
            </span>
          )}
        </div>
        <div className="navbar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(gameState.status !== 'idle' || isConnecting) && (
            <button className="btn-navbar-exit animate-fade-in" onClick={leaveRoom} title="Exit current match">
              <LogOut size={14} /> EXIT MATCH
            </button>
          )}
          <button className="btn-navbar-settings" onClick={openSettings}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main content layer */}
      <main className="app-main-content">
        {/* Reconnecting spinner screen */}
        {isConnecting ? (
          <div className="reconnect-screen animate-fade-in">
            <div className="reconnect-card glass">
              <div className="reconnect-spinner" />
              <h2 className="reconnect-title">Reconnecting...</h2>
              <p className="reconnect-subtitle">Restoring your previous session</p>
              <button className="btn-reconnect-exit" onClick={leaveRoom}>
                <LogOut size={16} /> EXIT &amp; RETURN TO LOBBY
              </button>
            </div>
          </div>
        ) : error ? (
          /* Error / failed reconnect screen */
          <div className="reconnect-screen animate-fade-in">
            <div className="reconnect-card glass">
              <ShieldAlert size={48} className="warn-icon" />
              <h2 className="reconnect-title">Session Error</h2>
              <p className="reconnect-subtitle">{error}</p>
              <button className="btn-reconnect-exit" onClick={leaveRoom}>
                <LogOut size={16} /> RETURN TO LOBBY
              </button>
            </div>
          </div>
        ) : isOrphaned ? (
          /* Orphaned player — in a game they're no longer part of */
          <div className="reconnect-screen animate-fade-in">
            <div className="reconnect-card glass">
              <ShieldAlert size={48} className="warn-icon" style={{ color: '#f59e0b' }} />
              <h2 className="reconnect-title">Session Expired</h2>
              <p className="reconnect-subtitle">
                You are no longer part of this match. The game may have ended or you were removed.
              </p>
              <button className="btn-reconnect-exit" onClick={leaveRoom}>
                <LogOut size={16} /> EXIT TO LOBBY
              </button>
            </div>
          </div>
        ) : gameState.status === 'idle' || gameState.status === 'lobby' ? (
          <GameLobby {...roomProps} />
        ) : (
          <GameBoard {...roomProps} />
        )}
      </main>
    </div>
  );
}

