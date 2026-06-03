// src/App.jsx
import React, { useState } from 'react';
import { useGameRoom } from './hooks/useGameRoom';
import GameLobby from './components/GameLobby';
import GameBoard from './components/GameBoard';
import SettingsModal from './components/SettingsModal';
import { Settings, ShieldAlert, Database } from 'lucide-react';
import { getSupabaseCredentials } from './utils/supabaseClient';

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="app-viewport">
      {/* Top Navbar */}
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

      {/* Main content layer */}
      <main className="app-main-content">
        <GameContainer openSettings={() => setIsSettingsOpen(true)} />
      </main>

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
  const { url, key } = getSupabaseCredentials();

  // If Supabase url/key is missing, prompt setup
  if (!url || !key) {
    return (
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
            <button className="btn-setup" onClick={openSettings}>
              VIEW CONFIGURATION INFO
            </button>
          </div>
        </div>
      </div>
    );
  }

  const roomProps = useGameRoom();
  const { gameState } = roomProps;

  if (gameState.status === 'idle' || gameState.status === 'lobby') {
    return <GameLobby {...roomProps} />;
  }

  return <GameBoard {...roomProps} />;
}
