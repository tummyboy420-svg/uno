// src/components/GameLobby.jsx
import React, { useState, useEffect } from 'react';
import { Copy, Plus, Play, LogOut, ArrowRight, User, Trophy, History, Gamepad2, Award, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { sounds } from './SoundManager';
import { getSupabaseClient } from '../utils/supabaseClient';

export default function GameLobby({
  gameState,
  localPlayerId,
  createRoom,
  joinRoom,
  addBot,
  removePlayer,
  startGame,
  leaveRoom,
  isConnecting = false,
  error = null,
}) {
  const [name, setName] = useState(() => localStorage.getItem('uno_player_name') || '');
  const [code, setCode] = useState('');
  const [activeTab, setActiveTab] = useState('play'); // 'play', 'leaderboard', 'history'
  const [leaderboard, setLeaderboard] = useState([]);
  const [matchHistory, setMatchHistory] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [expandedMatchId, setExpandedMatchId] = useState(null);

  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase || activeTab === 'play') return;

    let isMounted = true;

    const fetchData = async () => {
      setLoadingStats(true);
      try {
        if (activeTab === 'leaderboard') {
          const { data, error: err } = await supabase
            .from('uno_leaderboard')
            .select('*')
            .order('total_points', { ascending: false })
            .limit(50);
          if (!err && data && isMounted) {
            setLeaderboard(data);
          }
        } else if (activeTab === 'history') {
          const { data, error: err } = await supabase
            .from('uno_match_history')
            .select('*')
            .order('ended_at', { ascending: false })
            .limit(20);
          if (!err && data && isMounted) {
            setMatchHistory(data);
          }
        }
      } catch (err) {
        console.error('Error fetching lobby stats:', err);
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    };

    fetchData();

    // Subscribe to realtime database changes for live lobby updates
    const channel = supabase
      .channel(`lobby_stats_${activeTab}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: activeTab === 'leaderboard' ? 'uno_leaderboard' : 'uno_match_history',
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeTab, supabase]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      sounds.playError();
      alert('Please enter your name!');
      return;
    }
    localStorage.setItem('uno_player_name', name.trim());
    createRoom(name.trim());
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      sounds.playError();
      alert('Please enter your name!');
      return;
    }
    if (!code.trim() || code.trim().length < 4) {
      sounds.playError();
      alert('Please enter a valid room code!');
      return;
    }
    localStorage.setItem('uno_player_name', name.trim());
    joinRoom(code.trim().toUpperCase(), name.trim());
  };

  const copyCode = () => {
    navigator.clipboard.writeText(gameState.code);
    sounds.playPlayCard();
    alert('Room code copied to clipboard!');
  };

  // 1. Render CREATE / JOIN Form Screen
  if (gameState.status === 'idle') {
    return (
      <div className={`lobby-setup-container ${activeTab !== 'play' ? 'expanded-lobby-width' : ''}`}>
        <div className="lobby-card glass">
          <div className="lobby-header">
            <h1 className="lobby-title neon-text">UNO</h1>
            <p className="lobby-subtitle">REALTIME MULTIPLAYER</p>
          </div>

          {/* Navigation Tabs */}
          <div className="lobby-tabs">
            <button
              type="button"
              className={`lobby-tab-btn ${activeTab === 'play' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('play');
                sounds.playPlayCard();
              }}
            >
              <Gamepad2 size={16} /> PLAY
            </button>
            <button
              type="button"
              className={`lobby-tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('leaderboard');
                sounds.playPlayCard();
              }}
            >
              <Trophy size={16} /> LEADERBOARD
            </button>
            <button
              type="button"
              className={`lobby-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('history');
                sounds.playPlayCard();
              }}
            >
              <History size={16} /> RECENT MATCHES
            </button>
          </div>

          {activeTab === 'play' && (
            <form className="lobby-form">
              <div className="input-group">
                <label htmlFor="name-input">
                  <User size={16} /> PLAYER NAME
                </label>
                <input
                  id="name-input"
                  type="text"
                  maxLength={15}
                  placeholder="Enter nickname..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {error && <div className="lobby-error-alert">{error}</div>}

              <div className="lobby-actions-split">
                {/* Create Room */}
                <button
                  type="submit"
                  onClick={handleCreate}
                  disabled={isConnecting}
                  className="btn-create"
                >
                  {isConnecting ? 'Creating...' : 'CREATE ROOM'}
                </button>

                <div className="divider-or">OR</div>

                {/* Join Room */}
                <div className="join-group">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="ROOM CODE"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={isConnecting}
                    className="btn-join"
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            </form>
          )}

          {activeTab === 'leaderboard' && (
            <div className="stats-section animate-fade-in">
              {loadingStats ? (
                <div className="stats-loader">
                  <div className="spinner"></div>
                  <span>Fetching rankings...</span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="no-stats-placeholder">
                  <Award size={48} className="placeholder-icon" />
                  <p>No rankings recorded yet.</p>
                  <span>Play a game to start scoring points!</span>
                </div>
              ) : (
                <div className="stats-list-container">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>RANK</th>
                        <th>PLAYER</th>
                        <th>WINS</th>
                        <th className="text-right">POINTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((row, index) => {
                        const rank = index + 1;
                        const isSelf = row.session_id === localPlayerId;
                        return (
                          <tr key={row.session_id} className={`leaderboard-row ${isSelf ? 'row-self' : ''} rank-${rank}`}>
                            <td className="rank-cell">
                              {rank === 1 ? <Trophy size={18} className="trophy-gold" /> :
                               rank === 2 ? <Trophy size={18} className="trophy-silver" /> :
                               rank === 3 ? <Trophy size={18} className="trophy-bronze" /> :
                               <span className="rank-num">{rank}</span>}
                            </td>
                            <td className="name-cell font-bold">
                              {row.name} {isSelf && <span className="self-badge">YOU</span>}
                            </td>
                            <td>{row.wins}</td>
                            <td className="text-right points-cell">{row.total_points.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="stats-section animate-fade-in">
              {loadingStats ? (
                <div className="stats-loader">
                  <div className="spinner"></div>
                  <span>Fetching recent matches...</span>
                </div>
              ) : matchHistory.length === 0 ? (
                <div className="no-stats-placeholder">
                  <History size={48} className="placeholder-icon" />
                  <p>No matches recorded yet.</p>
                  <span>Complete an online or local game to log details!</span>
                </div>
              ) : (
                <div className="stats-list-container matches-list">
                  {matchHistory.map((match) => {
                    const isExpanded = expandedMatchId === match.id;
                    const dateStr = formatDate(match.ended_at);
                    const didSelfWin = match.winner_session_id === localPlayerId;
                    
                    return (
                      <div key={match.id} className={`match-card glass-subtle ${didSelfWin ? 'match-win' : ''}`}>
                        <div 
                          className="match-card-header"
                          onClick={() => {
                            setExpandedMatchId(isExpanded ? null : match.id);
                            sounds.playPlayCard();
                          }}
                        >
                          <div className="header-left">
                            <span className="match-code">ROOM: {match.code}</span>
                            <span className="match-date"><Calendar size={12} /> {dateStr}</span>
                          </div>
                          
                          <div className="header-right">
                            <div className="winner-pill">
                              👑 {match.winner_name}
                              <span className="pts-pill">+{match.winner_points} pts</span>
                            </div>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="match-card-details animate-slide-down">
                            <h4>PLAYER SCORES</h4>
                            <div className="players-scores-list">
                              {Array.isArray(match.player_scores) && 
                                match.player_scores.map((p, idx) => {
                                  const isPlayerWinner = p.session_id === match.winner_session_id;
                                  const isSelfPlayer = p.session_id === localPlayerId;
                                  return (
                                    <div key={idx} className={`player-score-row ${isPlayerWinner ? 'winner' : ''} ${isSelfPlayer ? 'self' : ''}`}>
                                      <div className="player-details">
                                        <span className="player-name">
                                          {p.name}
                                          {isSelfPlayer && ' (You)'}
                                          {p.is_bot && ' [BOT]'}
                                        </span>
                                      </div>
                                      <div className="player-stats">
                                        <span className="card-count">{p.card_count} {p.card_count === 1 ? 'card' : 'cards'} left</span>
                                        <span className={`points ${p.points > 0 ? 'points-penalty' : 'points-zero'}`}>
                                          {isPlayerWinner ? `+${match.winner_points} pts` : `+${p.points} pts`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Render ACTIVE LOBBY Screen
  const localPlayer = gameState.players.find(
    (p) => p.session_id === localPlayerId || p.id === localPlayerId
  );
  const isHost = localPlayer?.is_host || false;

  return (
    <div className="lobby-room-container">
      <div className="lobby-card glass room-view">
        <div className="room-header">
          <div>
            <span className="room-label">ROOM CODE</span>
            <div className="room-code-display" onClick={copyCode}>
              <span className="code-text">{gameState.code}</span>
              <Copy size={16} className="copy-icon" />
            </div>
          </div>
          <button className="btn-leave-lobby" onClick={leaveRoom}>
            <LogOut size={16} /> Leave
          </button>
        </div>

        <div className="players-list-section">
          <h3>PLAYERS ({gameState.players.length}/8)</h3>
          <div className="players-grid">
            {gameState.players.map((player) => (
              <div key={player.id} className="player-lobby-badge">
                <div className="badge-avatar">
                  {player.name.charAt(0).toUpperCase()}
                  {player.is_bot && <span className="bot-label">BOT</span>}
                </div>
                <div className="badge-info">
                  <span className="badge-name">
                    {player.name}
                    {player.session_id === localPlayerId && ' (You)'}
                  </span>
                  <span className="badge-role">
                    {player.is_host ? '👑 Game Host' : 'Player'}
                  </span>
                </div>
                {isHost && player.session_id !== localPlayerId && (
                  <button
                    className="btn-kick-player"
                    onClick={() => removePlayer(player.id)}
                    title="Kick player"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {gameState.players.length < 8 && isHost && (
              <button className="add-bot-placeholder" onClick={addBot}>
                <Plus size={20} />
                <span>ADD BOT</span>
              </button>
            )}
          </div>
        </div>

        <div className="room-footer-actions">
          {isHost ? (
            <button
              className="btn-start-game pulse"
              onClick={startGame}
              disabled={gameState.players.length < 2}
            >
              <Play size={18} fill="currentColor" /> START GAME
            </button>
          ) : (
            <div className="lobby-wait-status">
              <div className="loader-dots">
                <div />
                <div />
                <div />
              </div>
              Waiting for Host to start...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
