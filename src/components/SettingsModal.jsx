// src/components/SettingsModal.jsx
import React, { useState } from 'react';
import { X, Volume2, VolumeX, Database } from 'lucide-react';
import { sounds } from './SoundManager';

export default function SettingsModal({ isOpen, onClose }) {
  const [soundOn, setSoundOn] = useState(sounds.isEnabled());

  if (!isOpen) return null;

  const handleSoundToggle = () => {
    const nextState = !soundOn;
    setSoundOn(nextState);
    sounds.toggle(nextState);
    sounds.playPlayCard();
  };

  const copySql = () => {
    const sql = `-- Run this in your Supabase SQL Editor:
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Games Table (Active games)
CREATE TABLE IF NOT EXISTS uno_games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(6) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'lobby',
    deck JSONB NOT NULL,
    discard_pile JSONB NOT NULL,
    current_player_index INT DEFAULT 0,
    direction INT DEFAULT 1,
    active_color VARCHAR(10),
    active_value VARCHAR(15),
    winner_id VARCHAR(50),
    wild_select_user_id VARCHAR(50),
    pending_draw_count INT DEFAULT 0,
    last_action_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Players Table (Active player state per game)
CREATE TABLE IF NOT EXISTS uno_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES uno_games(id) ON DELETE CASCADE,
    session_id VARCHAR(50) NOT NULL,
    name VARCHAR(50) NOT NULL,
    hand JSONB NOT NULL DEFAULT '[]'::jsonb,
    play_order INT NOT NULL,
    is_host BOOLEAN DEFAULT false,
    is_bot BOOLEAN DEFAULT false,
    is_connected BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (game_id, session_id)
);

-- 3. Leaderboard Table (Stores player stats across matches)
CREATE TABLE IF NOT EXISTS uno_leaderboard (
    session_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    total_points INT DEFAULT 0,
    wins INT DEFAULT 0,
    games_played INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Match History Table (Stores logs of completed rounds)
CREATE TABLE IF NOT EXISTS uno_match_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL,
    code VARCHAR(6) NOT NULL,
    winner_session_id VARCHAR(50) NOT NULL,
    winner_name VARCHAR(50) NOT NULL,
    winner_points INT DEFAULT 0,
    player_scores JSONB NOT NULL,
    ended_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime replication
ALTER PUBLICATION supabase_realtime ADD TABLE uno_games;
ALTER PUBLICATION supabase_realtime ADD TABLE uno_players;
ALTER PUBLICATION supabase_realtime ADD TABLE uno_leaderboard;
ALTER PUBLICATION supabase_realtime ADD TABLE uno_match_history;`;
    navigator.clipboard.writeText(sql);
    alert('SQL Schema copied to clipboard!');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>GAME SETTINGS</h2>
          <button className="btn-close-modal" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Sound Settings */}
          <div className="settings-section">
            <h3>SOUND EFFECTS</h3>
            <div className="settings-row">
              <span>Enable Game Sounds</span>
              <button
                className={`btn-sound-toggle ${soundOn ? 'sound-active' : ''}`}
                onClick={handleSoundToggle}
              >
                {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
                {soundOn ? 'ON' : 'MUTED'}
              </button>
            </div>
          </div>

          {/* Database Setup Helper */}
          <div className="settings-section">
            <h3>DATABASE SETUP</h3>
            <div className="settings-row db-setup-row">
              <span className="db-setup-text">Copy the SQL schema to create required tables and enable Realtime sync in your Supabase dashboard.</span>
              <button
                type="button"
                className="btn-copy-sql"
                onClick={copySql}
                title="Copy database table SQL setup code"
              >
                <Database size={16} /> COPY SQL SCHEMA
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
