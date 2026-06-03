// src/hooks/useGameRoom.js
import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';
import {
  dealGame,
  canPlayCard,
  canPlayWild4,
  calculateHandScore,
  getBotAction,
  getBotColorChoice,
  getNextPlayerIndex,
  shuffle,
  TYPES,
} from '../utils/unoEngine';
import { sounds } from '../components/SoundManager';
import confetti from 'canvas-confetti';

export function useGameRoom() {
  const [gameState, setGameState] = useState({
    code: '',
    status: 'idle', // 'idle', 'lobby', 'playing', 'ended'
    players: [],
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    activeColor: '',
    activeValue: '',
    winnerId: null,
    wildSelectUserId: null,
    pendingDrawCount: 0,
    unoPenalties: {},
    justDrew: false, // true when player just drew and may optionally play drawn card
  });

  const [localPlayerId] = useState(() => {
    let id = localStorage.getItem('uno_multiplayer_session_id');
    if (!id) {
      id = 'user-' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('uno_multiplayer_session_id', id);
    }
    return id;
  });

  const [activeGameId, setActiveGameId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const gameIdRef = useRef(activeGameId);
  gameIdRef.current = activeGameId;

  const channelRef = useRef(null);

  // Retrieve current active user player object
  const localPlayer = gameState.players.find((p) => p.session_id === localPlayerId);
  const isHost = localPlayer?.is_host || false;

  // Auto recovery on load if game code is in URL or localStorage
  useEffect(() => {
    const savedGameId = localStorage.getItem('uno_active_game_id');
    if (savedGameId) {
      reconnectToGame(savedGameId);
    }
  }, []);

  // Listen to network changes for connection recovery
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network back online. Reconnecting game...');
      if (gameIdRef.current) {
        reconnectToGame(gameIdRef.current);
      }
    };
    const handleOffline = () => {
      console.warn('Network offline.');
      // Update local state, database will detect disconnection via Presence
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Presence & Bot Takeover Logic
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const activePlayerConnected = activePlayer?.is_connected;
  const activePlayerIsBot = activePlayer?.is_bot;

  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;

    let timer;

    // Turn automation for Bots OR Disconnected Players OR Idling Players
    if (currentPlayer.is_bot || !currentPlayer.is_connected || true) {
      const delay = currentPlayer.is_bot ? 1500 : 15000; // Bots move in 1.5s, idling/disconnected players in 15s
      timer = setTimeout(() => {
        executeBotOrOfflineTurn(currentPlayer);
      }, delay);
    }

    return () => clearTimeout(timer);
  }, [gameState.status, gameState.currentPlayerIndex, isHost, activePlayerConnected, activePlayerIsBot]);

  // Bot auto-catching logic
  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost) return;

    const penalizedSessionIds = Object.keys(gameState.unoPenalties || {});
    if (penalizedSessionIds.length === 0) return;

    // Check if there are any bots in the game to catch the penalized players
    const botPlayer = gameState.players.find((p) => p.is_bot && p.is_connected);
    if (!botPlayer) return;

    // Select a penalized player
    const targetSessionId = penalizedSessionIds[Math.floor(Math.random() * penalizedSessionIds.length)];

    // Wait 2.5 to 4.5 seconds to give humans a chance to press the UNO button or catch first
    const delay = 2500 + Math.random() * 2000;

    const timer = setTimeout(() => {
      // Re-verify they are still penalized before executing catch
      if (stateRef.current.unoPenalties && stateRef.current.unoPenalties[targetSessionId]) {
        console.log(`Bot catches player: ${targetSessionId}`);
        catchUno(targetSessionId);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState.status, gameState.unoPenalties, gameState.players, isHost]);
  useEffect(() => {
    if (!activeGameId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Subscribe to DB changes
    const channel = supabase
      .channel(`game_room:${activeGameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'uno_games',
          filter: `id=eq.${activeGameId}`,
        },
        (payload) => {
          handleGameUpdate(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'uno_players',
          filter: `game_id=eq.${activeGameId}`,
        },
        () => {
          fetchPlayers(activeGameId);
        }
      )
      // Track Presence to mark users offline/online
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineSessionIds = Object.values(state)
          .flat()
          .map((user) => user.session_id);

        syncPresenceWithDb(onlineSessionIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track self
          await channel.track({ session_id: localPlayerId, name: localStorage.getItem('uno_player_name') || 'Player' });
          // Mark self connected in DB
          updatePlayerConnection(true);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [activeGameId]);

  const updatePlayerConnection = async (connected) => {
    const supabase = getSupabaseClient();
    if (!supabase || !gameIdRef.current) return;

    await supabase
      .from('uno_players')
      .update({ is_connected: connected })
      .match({ game_id: gameIdRef.current, session_id: localPlayerId });
  };

  const syncPresenceWithDb = async (onlineSessionIds) => {
    // Only host writes presence sync back to DB to prevent write race conditions
    if (!isHost) return;

    const supabase = getSupabaseClient();
    if (!supabase || !gameIdRef.current) return;

    const offlinePlayers = stateRef.current.players.filter(
      (p) => !p.is_bot && p.is_connected && !onlineSessionIds.includes(p.session_id)
    );

    const onlinePlayers = stateRef.current.players.filter(
      (p) => !p.is_bot && !p.is_connected && onlineSessionIds.includes(p.session_id)
    );

    // Update offline status
    for (const p of offlinePlayers) {
      await supabase
        .from('uno_players')
        .update({ is_connected: false })
        .match({ game_id: gameIdRef.current, session_id: p.session_id });
    }

    // Update online status
    for (const p of onlinePlayers) {
      await supabase
        .from('uno_players')
        .update({ is_connected: true })
        .match({ game_id: gameIdRef.current, session_id: p.session_id });
    }
  };

  // Reconnection helper
  const reconnectToGame = async (gameId) => {
    setIsConnecting(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      localStorage.removeItem('uno_active_game_id');
      setIsConnecting(false);
      return;
    }

    try {
      const { data: game, error: gameError } = await supabase
        .from('uno_games')
        .select('*')
        .eq('id', gameId)
        .single();

      // Game not found or already ended — don't reconnect
      if (gameError || !game || game.status === 'ended') {
        console.log('[Reconnect] Game ended or not found. Clearing saved session.');
        localStorage.removeItem('uno_active_game_id');
        setActiveGameId(null);
        setIsConnecting(false);
        return;
      }

      // Fetch players to verify this user is still in the game
      const { data: players, error: playersError } = await supabase
        .from('uno_players')
        .select('*')
        .eq('game_id', gameId)
        .order('play_order', { ascending: true });

      if (playersError || !players) {
        localStorage.removeItem('uno_active_game_id');
        setActiveGameId(null);
        setIsConnecting(false);
        return;
      }

      // If local player is NOT in the game, abort — they were kicked or game cleaned up
      const localSessionId = localStorage.getItem('uno_multiplayer_session_id');
      const isMember = players.some(
        (p) => p.session_id === localSessionId
      );

      if (!isMember) {
        console.log('[Reconnect] Player not in game. Clearing saved session.');
        localStorage.removeItem('uno_active_game_id');
        setActiveGameId(null);
        setIsConnecting(false);
        return;
      }

      // All checks passed — reconnect properly
      handleGameUpdate(game);
      setGameState((prev) => ({
        ...prev,
        players: players.map((p) => ({
          id: p.id,
          session_id: p.session_id,
          name: p.name,
          hand: p.hand,
          play_order: p.play_order,
          is_host: p.is_host,
          is_bot: p.is_bot,
          is_connected: p.is_connected,
          unoCalled: p.uno_called || false,
        })),
      }));
      setActiveGameId(gameId);
      localStorage.setItem('uno_active_game_id', gameId);
    } catch (e) {
      console.error('[Reconnect] Error:', e);
      localStorage.removeItem('uno_active_game_id');
      setActiveGameId(null);
      setError('Failed to reconnect. Please create or join a new room.');
    } finally {
      setIsConnecting(false);
    }
  };

  const fetchPlayers = async (gameId) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: players, error } = await supabase
      .from('uno_players')
      .select('*')
      .eq('game_id', gameId)
      .order('play_order', { ascending: true });

    if (!error && players) {
      // Determine if active host is connected. If current host is disconnected, promote the first connected player to host.
      const host = players.find((p) => p.is_host);
      if (host && !host.is_connected && players.some((p) => p.is_connected && !p.is_bot)) {
        migrateHost(players);
      }

      setGameState((prev) => ({
        ...prev,
        players: players.map((p) => ({
          id: p.id,
          session_id: p.session_id,
          name: p.name,
          hand: p.hand,
          play_order: p.play_order,
          is_host: p.is_host,
          is_bot: p.is_bot,
          is_connected: p.is_connected,
          unoCalled: p.uno_called || false,
        })),
      }));
    }
  };

  const migrateHost = async (players) => {
    const nextHost = players.find((p) => p.is_connected && !p.is_bot);
    if (!nextHost) return;

    const supabase = getSupabaseClient();
    if (!supabase || !gameIdRef.current) return;

    // Strip host from old and give to new
    await supabase
      .from('uno_players')
      .update({ is_host: false })
      .match({ game_id: gameIdRef.current, is_host: true });

    await supabase
      .from('uno_players')
      .update({ is_host: true })
      .match({ game_id: gameIdRef.current, session_id: nextHost.session_id });
  };

  const recordMatchEnd = async (game) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      // Fetch latest players directly from DB to get the final hands
      const { data: players, error: fetchErr } = await supabase
        .from('uno_players')
        .select('*')
        .eq('game_id', game.id);

      if (fetchErr || !players || players.length === 0) {
        console.error('Failed to fetch players for scoring:', fetchErr);
        return;
      }

      const winnerId = game.winner_id;
      const winnerPlayer = players.find((p) => p.session_id === winnerId);
      if (!winnerPlayer) return;

      // Calculate points using official scoring: Numbers=face value, Actions=20, Wilds=50
      let pointsScored = 0;
      const playerScores = players.map((p) => {
        let handPoints = 0;
        if (p.session_id !== winnerId) {
          handPoints = calculateHandScore(p.hand || []);
          pointsScored += handPoints;
        }
        return {
          session_id: p.session_id,
          name: p.name,
          is_bot: p.is_bot,
          points: handPoints,
          card_count: (p.hand || []).length,
        };
      });

      // 1. Insert into match history
      const { error: historyErr } = await supabase.from('uno_match_history').insert({
        game_id: game.id,
        code: game.code,
        winner_session_id: winnerId,
        winner_name: winnerPlayer.name,
        winner_points: pointsScored,
        player_scores: playerScores,
      });

      if (historyErr) {
        console.error('Failed to log match history:', historyErr);
      }

      // 2. Update Leaderboard stats for human players
      for (const player of players) {
        if (player.is_bot) continue;

        const isWinner = player.session_id === winnerId;
        const addPoints = isWinner ? pointsScored : 0;
        const addWin = isWinner ? 1 : 0;

        // Fetch current stats to accumulate points and wins
        const { data: currentStats } = await supabase
          .from('uno_leaderboard')
          .select('*')
          .eq('session_id', player.session_id)
          .maybeSingle();

        const totalPoints = (currentStats?.total_points || 0) + addPoints;
        const wins = (currentStats?.wins || 0) + addWin;
        const gamesPlayed = (currentStats?.games_played || 0) + 1;

        const { error: leaderboardErr } = await supabase.from('uno_leaderboard').upsert({
          session_id: player.session_id,
          name: player.name,
          total_points: totalPoints,
          wins: wins,
          games_played: gamesPlayed,
          updated_at: new Date().toISOString(),
        });

        if (leaderboardErr) {
          console.error(`Failed to update leaderboard for ${player.name}:`, leaderboardErr);
        }
      }
    } catch (e) {
      console.error('Error recording match end:', e);
    }
  };

  const handleGameUpdate = (game) => {
    if (!game) return;

    setGameState((prev) => {
      // Sound cues based on changes
      if (prev.discardPile.length < game.discard_pile?.length) {
        sounds.playPlayCard();
      }

      if (game.status === 'ended' && prev.status !== 'ended') {
        const localWin = game.winner_id === localPlayerId;
        if (localWin) {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
          sounds.playVictory();
        } else {
          sounds.playLoss();
        }

        // Record points and match details in Supabase if host
        if (isHost) {
          recordMatchEnd(game);
        }
      }

      return {
        ...prev,
        code: game.code,
        status: game.status,
        deck: game.deck || [],
        discardPile: game.discard_pile || [],
        currentPlayerIndex: game.current_player_index,
        direction: game.direction,
        activeColor: game.active_color,
        activeValue: game.active_value,
        winnerId: game.winner_id,
        wildSelectUserId: game.wild_select_user_id,
        pendingDrawCount: game.pending_draw_count,
        unoPenalties: game.uno_penalties || {},
        justDrew: game.just_drew || false,
      };
    });
  };

  // Create Multiplayer game
  const createRoom = async (playerName) => {
    setIsConnecting(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase client not initialized.');
      setIsConnecting(false);
      return;
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      const { data: game, error: gameError } = await supabase
        .from('uno_games')
        .insert({
          code,
          status: 'lobby',
          deck: [],
          discard_pile: [],
          current_player_index: 0,
          direction: 1,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      const { error: playerError } = await supabase.from('uno_players').insert({
        game_id: game.id,
        session_id: localPlayerId,
        name: playerName || 'Host Player',
        hand: [],
        play_order: 0,
        is_host: true,
        is_bot: false,
        is_connected: true,
      });

      if (playerError) throw playerError;

      localStorage.setItem('uno_active_game_id', game.id);
      setActiveGameId(game.id);
      handleGameUpdate(game);
      await fetchPlayers(game.id);
    } catch (e) {
      console.error('Create room error:', e);
      setError(`Failed to create room: ${e.message || e.details || JSON.stringify(e)}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Join Multiplayer game
  const joinRoom = async (roomCode, playerName) => {
    setIsConnecting(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase client not initialized.');
      setIsConnecting(false);
      return;
    }

    try {
      const { data: game, error: gameError } = await supabase
        .from('uno_games')
        .select('*')
        .eq('code', roomCode.toUpperCase())
        .single();

      if (gameError || !game) {
        setError('Room not found.');
        setIsConnecting(false);
        return;
      }

      if (game.status !== 'lobby') {
        setError('Game already started.');
        setIsConnecting(false);
        return;
      }

      // Check current players count
      const { data: currentPlayers } = await supabase
        .from('uno_players')
        .select('*')
        .eq('game_id', game.id);

      if (currentPlayers && currentPlayers.length >= 8) {
        setError('Room is full (max 8 players).');
        setIsConnecting(false);
        return;
      }

      // Check if session ID already exists in this game (reconnection)
      const existingPlayer = currentPlayers?.find((p) => p.session_id === localPlayerId);

      if (!existingPlayer) {
        const { error: joinError } = await supabase.from('uno_players').insert({
          game_id: game.id,
          session_id: localPlayerId,
          name: playerName || 'Player',
          hand: [],
          play_order: currentPlayers?.length || 0,
          is_host: false,
          is_bot: false,
          is_connected: true,
        });

        if (joinError) throw joinError;
      } else {
        // Reconnect update connection status
        await supabase
          .from('uno_players')
          .update({ is_connected: true })
          .match({ game_id: game.id, session_id: localPlayerId });
      }

      localStorage.setItem('uno_active_game_id', game.id);
      setActiveGameId(game.id);
      handleGameUpdate(game);
      await fetchPlayers(game.id);
    } catch (e) {
      console.error('Join room error:', e);
      setError(`Failed to join room: ${e.message || e.details || JSON.stringify(e)}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Add a bot
  const addBot = async () => {
    if (!isHost || gameState.status !== 'lobby') return;
    if (gameState.players.length >= 8) return;

    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const botNames = ['UnoBot Alpha', 'V8 Engine', 'Card Shark', 'Byte Sized', 'Algorhythm', 'StackBot'];
    const usedNames = gameState.players.map((p) => p.name);
    const availableNames = botNames.filter((n) => !usedNames.includes(n));
    const name = availableNames[Math.floor(Math.random() * availableNames.length)] || `Bot ${gameState.players.length}`;

    const botSessionId = 'bot-' + Math.random().toString(36).substring(2, 9);

    await supabase.from('uno_players').insert({
      game_id: activeGameId,
      session_id: botSessionId,
      name,
      hand: [],
      play_order: gameState.players.length,
      is_host: false,
      is_bot: true,
      is_connected: true,
    });
  };

  const removePlayer = async (playerId) => {
    if (!isHost || gameState.status !== 'lobby') return;

    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    await supabase.from('uno_players').delete().eq('id', playerId);
    await fetchPlayers(activeGameId);
  };

  const startGame = async () => {
    if (!isHost || gameState.status !== 'lobby') return;
    if (gameState.players.length < 2) {
      sounds.playError();
      alert('Need at least 2 players to start!');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const initial = dealGame(gameState.players);

    let nextIndex = initial.currentPlayerIndex;
    let nextDirection = initial.direction;
    let initialActiveColor = initial.activeColor;
    let initialActiveValue = initial.activeValue;
    let starterCard = initial.discardPile[initial.discardPile.length - 1];

    if (starterCard.type === TYPES.SKIP) {
      nextIndex = getNextPlayerIndex(nextIndex, nextDirection, initial.players.length);
    } else if (starterCard.type === TYPES.REVERSE) {
      nextDirection = -nextDirection;
      if (initial.players.length === 2) {
        nextIndex = getNextPlayerIndex(nextIndex, nextDirection, initial.players.length);
      } else {
        nextIndex = (0 + nextDirection + initial.players.length) % initial.players.length;
      }
    } else if (starterCard.type === TYPES.DRAW2) {
      const targetPlayer = initial.players[nextIndex];
      const extraCards = initial.deck.splice(-2);
      targetPlayer.hand.push(...extraCards);
      nextIndex = getNextPlayerIndex(nextIndex, nextDirection, initial.players.length);
    }

    // Write hands to uno_players
    for (const player of initial.players) {
      await supabase
        .from('uno_players')
        .update({ hand: player.hand })
        .eq('id', player.id);
    }

    // Write game settings to uno_games
    await supabase
      .from('uno_games')
      .update({
        status: 'playing',
        deck: initial.deck,
        discard_pile: initial.discardPile,
        current_player_index: nextIndex,
        direction: nextDirection,
        active_color: initialActiveColor,
        active_value: initialActiveValue,
        last_action_at: new Date().toISOString(),
      })
      .eq('id', activeGameId);
  };

  const playCard = async (cardId, wildColor = null) => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const state = stateRef.current;
    if (state.status !== 'playing') return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.session_id !== localPlayerId) return; // Not your turn

    const card = currentPlayer.hand.find((c) => c.id === cardId);
    if (!card || !canPlayCard(card, state.activeColor, state.activeValue)) {
      sounds.playError();
      return;
    }

    // Official rule: Wild Draw Four can ONLY be played if player has no card matching active color
    if (card.type === TYPES.WILD4 && !canPlayWild4(currentPlayer.hand, state.activeColor)) {
      sounds.playError();
      console.warn('[RULE] Wild Draw Four is illegal — player has a matching color card.');
      return;
    }

    if (card.color === 'wild' && !wildColor) {
      // Waiting for client color selection
      await supabase
        .from('uno_games')
        .update({ wild_select_user_id: localPlayerId })
        .eq('id', activeGameId);
      return;
    }

    await performPlayAction(currentPlayer, card, wildColor);
  };

  const performPlayAction = async (player, card, wildColor) => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const state = stateRef.current;
    const newHand = player.hand.filter((c) => c.id !== card.id);
    const discardPile = [...state.discardPile, card];

    const nextActiveColor = card.color === 'wild' ? wildColor : card.color;
    const nextActiveValue = card.color === 'wild' ? card.value : card.value;

    let nextDirection = state.direction;
    let skipCount = 1;
    let nextPendingDraw = state.pendingDrawCount;

    if (card.type === TYPES.REVERSE) {
      nextDirection = -state.direction;
      if (state.players.length === 2) {
        skipCount = 2;
      }
    } else if (card.type === TYPES.SKIP) {
      skipCount = 2;
    } else if (card.type === TYPES.DRAW2) {
      nextPendingDraw += 2;
      skipCount = 2;
    } else if (card.type === TYPES.WILD4) {
      nextPendingDraw += 4;
      skipCount = 2;
    }

    // Check Win
    if (newHand.length === 0) {
      // Update player hand
      await supabase.from('uno_players').update({ hand: [], uno_called: false }).eq('id', player.id);
      // Update game
      await supabase
        .from('uno_games')
        .update({
          status: 'ended',
          winner_id: localPlayerId,
          discard_pile: discardPile,
          active_color: nextActiveColor,
          active_value: nextActiveValue,
          wild_select_user_id: null,
          uno_penalties: {},
        })
        .eq('id', activeGameId);
      return;
    }

    let nextUnoPenalties = { ...(state.unoPenalties || {}) };
    let playerUnoCalled = player.unoCalled;

    if (newHand.length === 1) {
      if (!playerUnoCalled) {
        nextUnoPenalties[player.session_id] = true;
      }
    } else {
      delete nextUnoPenalties[player.session_id];
      playerUnoCalled = false;
    }

    // Write updated player hand and unoCalled to DB
    await supabase.from('uno_players').update({ hand: newHand, uno_called: playerUnoCalled }).eq('id', player.id);

    // Resolve drawing cards for target player (next player)
    let updatedDeck = [...state.deck];
    if (nextPendingDraw > 0) {
      const nextPlayerIdx = getNextPlayerIndex(state.currentPlayerIndex, nextDirection, state.players.length);
      const victimPlayer = state.players[nextPlayerIdx];

      const drawnCards = [];
      for (let i = 0; i < nextPendingDraw; i++) {
        if (updatedDeck.length === 0) {
          const top = discardPile.pop();
          updatedDeck = shuffle(discardPile);
          discardPile.length = 0;
          discardPile.push(top);
        }
        if (updatedDeck.length > 0) {
          drawnCards.push(updatedDeck.pop());
        }
      }

      // When victim player draws cards, their uno_called must be reset to false and penalty cleared
      let nextVictimUnoPenalties = { ...nextUnoPenalties };
      delete nextVictimUnoPenalties[victimPlayer.session_id];
      nextUnoPenalties = nextVictimUnoPenalties;

      const updatedVictimHand = [...victimPlayer.hand, ...drawnCards];
      await supabase
        .from('uno_players')
        .update({ hand: updatedVictimHand, uno_called: false })
        .eq('id', victimPlayer.id);

      nextPendingDraw = 0; // reset
    }

    const nextPlayerIndex = getNextPlayerIndex(
      state.currentPlayerIndex,
      nextDirection,
      state.players.length,
      skipCount
    );

    // Write state back to DB
    await supabase
      .from('uno_games')
      .update({
        deck: updatedDeck,
        discard_pile: discardPile,
        active_color: nextActiveColor,
        active_value: nextActiveValue,
        current_player_index: nextPlayerIndex,
        direction: nextDirection,
        wild_select_user_id: null,
        pending_draw_count: nextPendingDraw,
        last_action_at: new Date().toISOString(),
        uno_penalties: nextUnoPenalties,
      })
      .eq('id', activeGameId);
  };

  const drawCard = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const state = stateRef.current;
    if (state.status !== 'playing' || state.wildSelectUserId) return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.session_id !== localPlayerId) return;

    sounds.playDrawCard();

    let deck = [...state.deck];
    const discardPile = [...state.discardPile];

    // Reshuffle discard pile into deck if empty
    if (deck.length === 0) {
      const top = discardPile.pop();
      deck = shuffle(discardPile);
      discardPile.length = 0;
      discardPile.push(top);
    }

    let drawnCard = null;
    if (deck.length > 0) drawnCard = deck.pop();

    let nextUnoPenalties = { ...(state.unoPenalties || {}) };
    delete nextUnoPenalties[currentPlayer.session_id];

    const updatedHand = drawnCard
      ? [...currentPlayer.hand, drawnCard]
      : [...currentPlayer.hand];

    // Official rule: if drawn card is immediately playable, player MAY play it right away.
    // We store the drawn card in the player's hand and check if it can be played.
    // The UI will allow them to play it if it matches (since it's now in their hand).
    // If NOT playable, we advance the turn automatically.
    const drawnCardIsPlayable =
      drawnCard && canPlayCard(drawnCard, state.activeColor, state.activeValue);

    // Update player hand
    await supabase
      .from('uno_players')
      .update({ hand: updatedHand, uno_called: false })
      .eq('id', currentPlayer.id);

    if (drawnCardIsPlayable) {
      // Keep turn with the same player so they can choose to play or skip
      // Mark a special flag so the UI knows they just drew
      await supabase
        .from('uno_games')
        .update({
          deck,
          discard_pile: discardPile,
          // Stay on same player index — they may now play the drawn card
          last_action_at: new Date().toISOString(),
          uno_penalties: nextUnoPenalties,
          just_drew: true,  // signals UI the player drew and may play
        })
        .eq('id', activeGameId);
    } else {
      // Drawn card not playable — advance turn
      const nextPlayerIdx = getNextPlayerIndex(
        state.currentPlayerIndex,
        state.direction,
        state.players.length
      );
      await supabase
        .from('uno_games')
        .update({
          deck,
          discard_pile: discardPile,
          current_player_index: nextPlayerIdx,
          last_action_at: new Date().toISOString(),
          uno_penalties: nextUnoPenalties,
          just_drew: false,
        })
        .eq('id', activeGameId);
    }
  };

  // Called when a player chose to PASS after drawing an unplayable card
  const passTurn = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const state = stateRef.current;
    if (state.status !== 'playing') return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.session_id !== localPlayerId) return;

    const nextPlayerIdx = getNextPlayerIndex(
      state.currentPlayerIndex,
      state.direction,
      state.players.length
    );
    await supabase
      .from('uno_games')
      .update({
        current_player_index: nextPlayerIdx,
        last_action_at: new Date().toISOString(),
        just_drew: false,
      })
      .eq('id', activeGameId);
  };

  // Bot actions & Offline player actions driver
  const executeBotOrOfflineTurn = async (player) => {
    console.log(`[BOT ENGINE] Starting turn for ${player.name} (${player.session_id})`);
    
    try {
      const supabase = getSupabaseClient();
      const state = stateRef.current;
      const gameId = gameIdRef.current;

      if (!supabase || !gameId) {
        console.warn("[BOT ENGINE] Supabase client or gameId missing.");
        return;
      }

      console.log(`[BOT ENGINE] Active Color: ${state.activeColor}, Active Value: ${state.activeValue}, Hand size: ${player.hand?.length}`);
      const cardToPlay = getBotAction(player.hand || [], state.activeColor, state.activeValue);

      if (cardToPlay) {
        console.log(`[BOT ENGINE] Bot decides to play card:`, cardToPlay);
        let botColor = null;
        if (cardToPlay.color === 'wild') {
          botColor = getBotColorChoice(player.hand || []);
          console.log(`[BOT ENGINE] Bot chose wild color: ${botColor}`);
        }

        const newHand = player.hand.filter((c) => c.id !== cardToPlay.id);
        const discardPile = [...state.discardPile, cardToPlay];
        const nextActiveColor = cardToPlay.color === 'wild' ? botColor : cardToPlay.color;
        const nextActiveValue = cardToPlay.color === 'wild' ? cardToPlay.value : cardToPlay.value;

        let nextDirection = state.direction;
        let skipCount = 1;
        let nextPendingDraw = state.pendingDrawCount;

        if (cardToPlay.type === TYPES.REVERSE) {
          nextDirection = -state.direction;
          if (state.players.length === 2) {
            skipCount = 2;
          }
        } else if (cardToPlay.type === TYPES.SKIP) {
          skipCount = 2;
        } else if (cardToPlay.type === TYPES.DRAW2) {
          nextPendingDraw += 2;
          skipCount = 2;
        } else if (cardToPlay.type === TYPES.WILD4) {
          nextPendingDraw += 4;
          skipCount = 2;
        }

        // Check Win
        if (newHand.length === 0) {
          console.log(`[BOT ENGINE] Bot wins the round!`);
          const { error: pErr } = await supabase.from('uno_players').update({ hand: [], uno_called: false }).eq('id', player.id);
          if (pErr) console.error("[BOT ENGINE] Error updating bot hand for win:", pErr);
          
          const { error: gErr } = await supabase
            .from('uno_games')
            .update({
              status: 'ended',
              winner_id: player.session_id,
              discard_pile: discardPile,
              active_color: nextActiveColor,
              active_value: nextActiveValue,
              wild_select_user_id: null,
              uno_penalties: {},
            })
            .eq('id', gameId);
          if (gErr) console.error("[BOT ENGINE] Error updating game status for bot win:", gErr);
          return;
        }

        const botDeclaresUno = Math.random() < 0.90;
        let nextUnoPenalties = { ...(state.unoPenalties || {}) };
        let botUnoCalled = false;

        if (newHand.length === 1) {
          if (botDeclaresUno) {
            botUnoCalled = true;
            sounds.playUno();
            console.log(`[BOT ENGINE] Bot calls UNO!`);
          } else {
            nextUnoPenalties[player.session_id] = true;
            console.log(`[BOT ENGINE] Bot forgot to call UNO!`);
          }
        } else {
          delete nextUnoPenalties[player.session_id];
        }

        console.log(`[BOT ENGINE] Updating bot hand in database...`);
        const { error: pErr } = await supabase.from('uno_players').update({ hand: newHand, uno_called: botUnoCalled }).eq('id', player.id);
        if (pErr) console.error("[BOT ENGINE] Error updating bot hand:", pErr);

        let updatedDeck = [...state.deck];
        if (nextPendingDraw > 0) {
          const nextPlayerIdx = getNextPlayerIndex(state.currentPlayerIndex, nextDirection, state.players.length);
          const victimPlayer = state.players[nextPlayerIdx];
          console.log(`[BOT ENGINE] Next player ${victimPlayer.name} draws ${nextPendingDraw} penalty cards`);

          const drawnCards = [];
          for (let i = 0; i < nextPendingDraw; i++) {
            if (updatedDeck.length === 0) {
              const top = discardPile.pop();
              updatedDeck = shuffle(discardPile);
              discardPile.length = 0;
              discardPile.push(top);
            }
            if (updatedDeck.length > 0) {
              drawnCards.push(updatedDeck.pop());
            }
          }

          let nextVictimUnoPenalties = { ...nextUnoPenalties };
          delete nextVictimUnoPenalties[victimPlayer.session_id];
          nextUnoPenalties = nextVictimUnoPenalties;

          const updatedVictimHand = [...victimPlayer.hand, ...drawnCards];
          const { error: vicErr } = await supabase
            .from('uno_players')
            .update({ hand: updatedVictimHand, uno_called: false })
            .eq('id', victimPlayer.id);
          if (vicErr) console.error("[BOT ENGINE] Error updating victim hand:", vicErr);

          nextPendingDraw = 0;
        }

        const nextPlayerIndex = getNextPlayerIndex(
          state.currentPlayerIndex,
          nextDirection,
          state.players.length,
          skipCount
        );

        console.log(`[BOT ENGINE] Advancing turn to player index ${nextPlayerIndex}`);
        const { error: gErr } = await supabase
          .from('uno_games')
          .update({
            deck: updatedDeck,
            discard_pile: discardPile,
            active_color: nextActiveColor,
            active_value: nextActiveValue,
            current_player_index: nextPlayerIndex,
            direction: nextDirection,
            wild_select_user_id: null,
            pending_draw_count: nextPendingDraw,
            last_action_at: new Date().toISOString(),
            uno_penalties: nextUnoPenalties,
          })
          .eq('id', gameId);
        if (gErr) console.error("[BOT ENGINE] Error updating game state:", gErr);
      } else {
        console.log(`[BOT ENGINE] No playable card. Bot draws a card.`);
        const deck = [...state.deck];
        const discardPile = [...state.discardPile];

        let drawnCard = null;
        if (deck.length === 0) {
          const top = discardPile.pop();
          deck.push(...shuffle(discardPile));
          discardPile.length = 0;
          discardPile.push(top);
        }

        if (deck.length > 0) {
          drawnCard = deck.pop();
        }

        let nextUnoPenalties = { ...(state.unoPenalties || {}) };
        delete nextUnoPenalties[player.session_id];

        if (drawnCard) {
          console.log(`[BOT ENGINE] Bot drew card:`, drawnCard);
          const updatedHand = [...player.hand, drawnCard];
          const { error: pErr } = await supabase
            .from('uno_players')
            .update({ hand: updatedHand, uno_called: false })
            .eq('id', player.id);
          if (pErr) console.error("[BOT ENGINE] Error updating bot hand after draw:", pErr);
        } else {
          const { error: pErr } = await supabase
            .from('uno_players')
            .update({ uno_called: false })
            .eq('id', player.id);
          if (pErr) console.error("[BOT ENGINE] Error updating bot hand after draw (no card):", pErr);
        }

        const nextPlayerIdx = getNextPlayerIndex(state.currentPlayerIndex, state.direction, state.players.length);

        console.log(`[BOT ENGINE] Advancing turn to player index ${nextPlayerIdx}`);
        const { error: gErr } = await supabase
          .from('uno_games')
          .update({
            deck,
            discard_pile: discardPile,
            current_player_index: nextPlayerIdx,
            last_action_at: new Date().toISOString(),
            uno_penalties: nextUnoPenalties,
          })
          .eq('id', gameId);
        if (gErr) console.error("[BOT ENGINE] Error updating game state after draw:", gErr);
      }
    } catch (err) {
      console.error("[BOT ENGINE] Uncaught exception in executeBotOrOfflineTurn:", err);
    }
  };

  const restartGame = async () => {
    if (!isHost || !activeGameId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase
      .from('uno_games')
      .update({
        status: 'lobby',
        winner_id: null,
        current_player_index: 0,
        discard_pile: [],
        deck: [],
        wild_select_user_id: null,
      })
      .eq('id', activeGameId);

    // Reset player hands
    const { data: players } = await supabase
      .from('uno_players')
      .select('id')
      .eq('game_id', activeGameId);

    if (players) {
      for (const p of players) {
        await supabase.from('uno_players').update({ hand: [] }).eq('id', p.id);
      }
    }
  };

  const leaveRoom = async () => {
    const supabase = getSupabaseClient();
    if (supabase && activeGameId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      // Delete player or mark disconnected
      await supabase
        .from('uno_players')
        .delete()
        .match({ game_id: activeGameId, session_id: localPlayerId });
    }

    localStorage.removeItem('uno_active_game_id');
    setActiveGameId(null);
    setGameState({
      code: '',
      status: 'idle',
      players: [],
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      direction: 1,
      activeColor: '',
      activeValue: '',
      winnerId: null,
      wildSelectUserId: null,
      pendingDrawCount: 0,
      unoPenalties: {},
    });
  };

  const declareUno = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const state = stateRef.current;
    if (state.status !== 'playing') return;

    const player = state.players.find((p) => p.session_id === localPlayerId);
    if (!player) return;

    if (player.unoCalled) return;

    sounds.playUno();

    await supabase
      .from('uno_players')
      .update({ uno_called: true })
      .eq('id', player.id);

    let nextUnoPenalties = { ...(state.unoPenalties || {}) };
    if (nextUnoPenalties[localPlayerId]) {
      delete nextUnoPenalties[localPlayerId];
      await supabase
        .from('uno_games')
        .update({ uno_penalties: nextUnoPenalties })
        .eq('id', activeGameId);
    }
  };

  const catchUno = async (targetSessionId) => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeGameId) return;

    const state = stateRef.current;
    if (state.status !== 'playing') return;

    const targetPlayer = state.players.find((p) => p.session_id === targetSessionId);
    if (!targetPlayer || !(state.unoPenalties && state.unoPenalties[targetSessionId])) {
      sounds.playError();
      return;
    }

    sounds.playError();

    const deck = [...state.deck];
    const discardPile = [...state.discardPile];
    const drawnCards = [];

    for (let i = 0; i < 2; i++) {
      if (deck.length === 0) {
        const top = discardPile.pop();
        deck.push(...shuffle(discardPile));
        discardPile.length = 0;
        discardPile.push(top);
      }
      if (deck.length > 0) {
        drawnCards.push(deck.pop());
      }
    }

    const updatedHand = [...targetPlayer.hand, ...drawnCards];

    await supabase
      .from('uno_players')
      .update({ hand: updatedHand, uno_called: false })
      .eq('id', targetPlayer.id);

    let nextUnoPenalties = { ...(state.unoPenalties || {}) };
    delete nextUnoPenalties[targetSessionId];

    await supabase
      .from('uno_games')
      .update({
        deck,
        discard_pile: discardPile,
        uno_penalties: nextUnoPenalties,
      })
      .eq('id', activeGameId);
  };

  return {
    gameState,
    localPlayerId,
    createRoom,
    joinRoom,
    addBot,
    removePlayer,
    startGame,
    playCard,
    drawCard,
    declareUno,
    catchUno,
    restartGame,
    leaveRoom,
    passTurn,
    isConnecting,
    error,
  };
}
