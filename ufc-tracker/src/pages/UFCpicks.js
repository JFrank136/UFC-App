import React, { useState, useEffect } from 'react';
import { Clock, Trophy, Users, Zap, Target, Shield, ChevronRight, CheckCircle, Lock } from 'lucide-react';
import supabase from '../api/supabaseClient';
import countryCodes from '../utils/countryCodes';

const UFCPicks = () => {
  const [currentStep, setCurrentStep] = useState('rps'); // rps, picking, results, history
  const [rpsWinner, setRpsWinner] = useState(null);
  const [pickOrder, setPickOrder] = useState(null); // 'first' (1,3,5) or 'second' (2,4)
  const [currentTurn, setCurrentTurn] = useState(null);
  const [currentPickNumber, setCurrentPickNumber] = useState(1);
  const [mainCardFights, setMainCardFights] = useState([]);
  const [gamePicks, setGamePicks] = useState({});
  const [truePicks, setTruePicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [upcomingPPVs, setUpcomingPPVs] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [picksLocked, setPicksLocked] = useState(false);

  // Theme colors
  const jaredColor = '#3b82f6';
  const marsColor = '#ef4444';
  
  const getPlayerColor = (player) => player === 'Jared' ? jaredColor : marsColor;

  useEffect(() => {
    fetchUpcomingPPVs();
    checkForActiveGame();
  }, []);

  const fetchUpcomingPPVs = async () => {
    try {
      const { data, error } = await supabase
        .from('upcoming_fights')
        .select(`
          *,
          fighter1_data:fighter1_id (
            id, name, image_url, nickname, country, wins_total, losses_total,
            wins_ko, wins_sub, wins_dec, losses_ko, losses_sub, losses_dec
          ),
          fighter2_data:fighter2_id (
            id, name, image_url, nickname, country, wins_total, losses_total,
            wins_ko, wins_sub, wins_dec, losses_ko, losses_sub, losses_dec
          )
        `)
        .or('event_type.ilike.%ppv%,event.ilike.%ufc [0-9]%')
        .eq('card_section', 'Main')
        .order('event_date')
        .order('fight_order', { ascending: false });

      if (error) throw error;

      // Group by event
      const eventGroups = {};
      data?.forEach(fight => {
        const key = `${fight.event}_${fight.event_date}`;
        if (!eventGroups[key]) {
          eventGroups[key] = {
            event: fight.event,
            date: fight.event_date,
            time: fight.event_time,
            fights: []
          };
        }
        eventGroups[key].fights.push(fight);
      });

      const events = Object.values(eventGroups).filter(event => event.fights.length === 5);
      setUpcomingPPVs(events);
      
      if (events.length > 0 && !selectedEvent) {
        setSelectedEvent(events[0]);
        setMainCardFights(events[0].fights);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching PPV events:', error);
      setLoading(false);
    }
  };

  const checkForActiveGame = async () => {
    // TODO: Check for existing game in progress
    // This would query your future ufc_games table
  };

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    return `${fighter.wins_total || 0}-${fighter.losses_total || 0}`;
  };

  const getFinishRate = (fighter) => {
    if (!fighter || !fighter.wins_total) return 0;
    const finishes = (fighter.wins_ko || 0) + (fighter.wins_sub || 0);
    return Math.round((finishes / fighter.wins_total) * 100);
  };

  const getFavoriteStatus = (fight) => {
    // Simple heuristic based on records - in real implementation you'd use betting odds
    const f1 = fight.fighter1_data;
    const f2 = fight.fighter2_data;
    
    if (!f1 || !f2) return 'even';
    
    const f1WinRate = f1.wins_total / ((f1.wins_total || 0) + (f1.losses_total || 0));
    const f2WinRate = f2.wins_total / ((f2.wins_total || 0) + (f2.losses_total || 0));
    
    if (Math.abs(f1WinRate - f2WinRate) < 0.1) return 'even';
    return f1WinRate > f2WinRate ? 'fighter1' : 'fighter2';
  };

  const handleRPSWinner = (winner) => {
    setRpsWinner(winner);
    setCurrentStep('chooseOrder');
  };

  const handleOrderChoice = (choice) => {
    setPickOrder(choice);
    setCurrentTurn(rpsWinner);
    setCurrentStep('picking');
    setGameStarted(true);
  };

  const getPickingOrder = () => {
    if (pickOrder === 'first') {
      // RPS winner chose (1,3) - gets 1st and 3rd picks
      return rpsWinner === 'Jared' 
        ? ['Jared', 'Mars', 'Jared', 'Mars', 'Mars']
        : ['Mars', 'Jared', 'Mars', 'Jared', 'Jared'];
    } else {
      // RPS winner chose (2,4,5) - gets 2nd, 4th, and 5th picks
      return rpsWinner === 'Jared'
        ? ['Mars', 'Jared', 'Mars', 'Jared', 'Jared']
        : ['Jared', 'Mars', 'Jared', 'Mars', 'Mars'];
    }
  };

  const getAvailableFights = () => {
    const pickedFightIds = Object.values(gamePicks).map(pick => pick.fightId);
    return mainCardFights.filter(fight => !pickedFightIds.includes(fight.id));
  };

  const handleFighterPick = (fight, fighterId, fighterName) => {
    const pickingOrder = getPickingOrder();
    const currentPlayer = pickingOrder[currentPickNumber - 1];
    
    const newPick = {
      fightId: fight.id,
      fighterSelected: fighterId,
      fighterName: fighterName,
      pickNumber: currentPickNumber,
      player: currentPlayer
    };

    setGamePicks(prev => ({
      ...prev,
      [currentPickNumber]: newPick
    }));

    // Handle true prediction for the opponent who gets "stuck"
    const nextPlayer = currentPlayer === 'Jared' ? 'Mars' : 'Jared';
    const opponentFighter = fight.fighter1_data?.id === fighterId ? fight.fighter2_data : fight.fighter1_data;
    
    if (currentPickNumber < 5) {
      setCurrentPickNumber(prev => prev + 1);
      setCurrentTurn(nextPlayer);
    } else {
      setCurrentStep('truePredictions');
    }
  };

  const handleTruePrediction = (pickNumber, trueFighterId, trueFighterName) => {
    setTruePicks(prev => ({
      ...prev,
      [pickNumber]: {
        fighterSelected: trueFighterId,
        fighterName: trueFighterName
      }
    }));
  };

  const completeTruePredictions = () => {
    // Auto-fill true predictions for picks where player agrees with their selection
    const completeTruePicks = { ...truePicks };
    
    Object.entries(gamePicks).forEach(([pickNum, pick]) => {
      if (!completeTruePicks[pickNum]) {
        completeTruePicks[pickNum] = {
          fighterSelected: pick.fighterSelected,
          fighterName: pick.fighterName
        };
      }
    });

    setTruePicks(completeTruePicks);
    setCurrentStep('summary');
  };

  const getStuckPicks = () => {
    const pickingOrder = getPickingOrder();
    const stuckPicks = [];
    
    Object.entries(gamePicks).forEach(([pickNum, pick]) => {
      const picker = pickingOrder[pickNum - 1];
      const opponent = picker === 'Jared' ? 'Mars' : 'Jared';
      
      // Find the fight and determine who got stuck
      const fight = mainCardFights.find(f => f.id === pick.fightId);
      const stuckFighter = fight.fighter1_data?.id === pick.fighterSelected ? fight.fighter2_data : fight.fighter1_data;
      
      stuckPicks.push({
        pickNumber: pickNum,
        stuckPlayer: opponent,
        fight: fight,
        stuckWith: stuckFighter,
        chosenFighter: fight.fighter1_data?.id === pick.fighterSelected ? fight.fighter1_data : fight.fighter2_data
      });
    });
    
    return stuckPicks;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="ufc-picks-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading UFC Events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ufc-picks-container">
      {/* Header */}
      <header className="picks-header">
        <div className="header-content">
          <h1>🥊 UFC PICKS</h1>
          <p>Strategic Fight Predictions Game</p>
        </div>
        
        {selectedEvent && (
          <div className="event-info">
            <h2>{selectedEvent.event}</h2>
            <p>{formatDate(selectedEvent.date)}</p>
          </div>
        )}
      </header>

      {/* Game Progress */}
      {gameStarted && (
        <div className="game-progress">
          <div className="progress-steps">
            <div className={`step ${currentStep === 'picking' ? 'active' : currentStep === 'truePredictions' || currentStep === 'summary' ? 'completed' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">Game Picks</span>
            </div>
            <ChevronRight size={20} className="step-arrow" />
            <div className={`step ${currentStep === 'truePredictions' ? 'active' : currentStep === 'summary' ? 'completed' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">True Predictions</span>
            </div>
            <ChevronRight size={20} className="step-arrow" />
            <div className={`step ${currentStep === 'summary' ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Summary</span>
            </div>
          </div>
        </div>
      )}

      {/* RPS Winner Input */}
      {currentStep === 'rps' && (
        <div className="game-section">
          <div className="section-header">
            <h3>Who Won Rock Paper Scissors?</h3>
            <p>Play RPS externally, then select the winner below</p>
          </div>
          
          <div className="rps-buttons">
            <button
              className="player-button jared"
              onClick={() => handleRPSWinner('Jared')}
            >
              <Users size={24} />
              <span>Jared Won</span>
            </button>
            
            <button
              className="player-button mars"
              onClick={() => handleRPSWinner('Mars')}
            >
              <Users size={24} />
              <span>Mars Won</span>
            </button>
          </div>
        </div>
      )}

      {/* Order Choice */}
      {currentStep === 'chooseOrder' && (
        <div className="game-section">
          <div className="section-header">
            <h3>{rpsWinner}'s Choice</h3>
            <p>Choose your pick order preference</p>
          </div>
          
          <div className="order-choice">
            <button
              className={`choice-button ${rpsWinner.toLowerCase()}`}
              onClick={() => handleOrderChoice('first')}
            >
              <div className="choice-content">
                <h4>Pick 1st & 3rd</h4>
                <p>2 picks total</p>
                <div className="pick-order">1 → 3</div>
              </div>
            </button>
            
            <button
              className={`choice-button ${rpsWinner.toLowerCase()}`}
              onClick={() => handleOrderChoice('second')}
            >
              <div className="choice-content">
                <h4>Pick 2nd, 4th & 5th</h4>
                <p>3 picks total</p>
                <div className="pick-order">2 → 4 → 5</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Fight Picking */}
      {currentStep === 'picking' && (
        <div className="game-section">
          <div className="turn-indicator">
            <div className={`player-turn ${currentTurn.toLowerCase()}`}>
              <h3>{currentTurn.toUpperCase()}'S TURN</h3>
              <p>Pick #{currentPickNumber} of 5</p>
            </div>
          </div>

          <div className="available-fights">
            <h4>Available Fights</h4>
            <div className="fights-grid">
              {getAvailableFights().map(fight => {
                const f1 = fight.fighter1_data;
                const f2 = fight.fighter2_data;
                const favorite = getFavoriteStatus(fight);
                
                return (
                  <div key={fight.id} className="fight-selection">
                    <div className="fight-header">
                      <span className="weight-class">{fight.weight_class} lbs</span>
                      <span className="fight-order">Fight {fight.fight_order}</span>
                    </div>
                    
                    <div className="fighters-choice">
                      <button
                        className={`fighter-pick-btn ${favorite === 'fighter1' ? 'favorite' : ''}`}
                        onClick={() => handleFighterPick(fight, f1?.id, f1?.name)}
                      >
                        <div className="fighter-image">
                          <img
                            src={f1?.image_url || '/placeholder.jpg'}
                            alt={f1?.name}
                            onError={(e) => {
                              e.target.src = `https://via.placeholder.com/80x80/cccccc/666666?text=${f1?.name?.charAt(0) || '?'}`;
                            }}
                          />
                          {favorite === 'fighter1' && <div className="favorite-badge">FAV</div>}
                        </div>
                        
                        <div className="fighter-details">
                          <h5>{f1?.name}</h5>
                          {f1?.nickname && <p className="nickname">"{f1.nickname}"</p>}
                          <div className="fighter-stats">
                            <span className="record">{formatRecord(f1)}</span>
                            <span className="country">{countryCodes[f1?.country]} {f1?.country}</span>
                          </div>
                          <div className="finish-rate">
                            <Zap size={14} />
                            <span>{getFinishRate(f1)}% finish rate</span>
                          </div>
                        </div>
                      </button>
                      
                      <div className="vs-section">
                        <span className="vs">VS</span>
                      </div>
                      
                      <button
                        className={`fighter-pick-btn ${favorite === 'fighter2' ? 'favorite' : ''}`}
                        onClick={() => handleFighterPick(fight, f2?.id, f2?.name)}
                      >
                        <div className="fighter-image">
                          <img
                            src={f2?.image_url || '/placeholder.jpg'}
                            alt={f2?.name}
                            onError={(e) => {
                              e.target.src = `https://via.placeholder.com/80x80/cccccc/666666?text=${f2?.name?.charAt(0) || '?'}`;
                            }}
                          />
                          {favorite === 'fighter2' && <div className="favorite-badge">FAV</div>}
                        </div>
                        
                        <div className="fighter-details">
                          <h5>{f2?.name}</h5>
                          {f2?.nickname && <p className="nickname">"{f2.nickname}"</p>}
                          <div className="fighter-stats">
                            <span className="record">{formatRecord(f2)}</span>
                            <span className="country">{countryCodes[f2?.country]} {f2?.country}</span>
                          </div>
                          <div className="finish-rate">
                            <Zap size={14} />
                            <span>{getFinishRate(f2)}% finish rate</span>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Picks Summary */}
          {Object.keys(gamePicks).length > 0 && (
            <div className="picks-summary">
              <h4>Picks So Far</h4>
              <div className="picks-list">
                {Object.entries(gamePicks).map(([pickNum, pick]) => {
                  const pickingOrder = getPickingOrder();
                  const picker = pickingOrder[pickNum - 1];
                  
                  return (
                    <div key={pickNum} className={`pick-item ${picker.toLowerCase()}`}>
                      <CheckCircle size={20} />
                      <span>Pick #{pickNum}: {picker} chose {pick.fighterName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* True Predictions */}
      {currentStep === 'truePredictions' && (
        <div className="game-section">
          <div className="section-header">
            <h3>True Predictions</h3>
            <p>For fights where you got "stuck" with a fighter, who do you actually think will win?</p>
          </div>

          <div className="true-predictions">
            {getStuckPicks().map(stuckPick => (
              <div key={stuckPick.pickNumber} className="true-prediction-item">
                <div className="stuck-info">
                  <h4>Fight {stuckPick.fight.fight_order}</h4>
                  <p>
                    <span className={stuckPick.stuckPlayer.toLowerCase()}>
                      {stuckPick.stuckPlayer}
                    </span> got stuck with{' '}
                    <strong>{stuckPick.stuckWith?.name}</strong>
                  </p>
                </div>

                <div className="true-choice">
                  <p>Who do you actually think will win?</p>
                  <div className="true-pick-buttons">
                    <button
                      className={`true-pick-btn ${truePicks[stuckPick.pickNumber]?.fighterSelected === stuckPick.stuckWith?.id ? 'selected' : ''}`}
                      onClick={() => handleTruePrediction(
                        stuckPick.pickNumber,
                        stuckPick.stuckWith?.id,
                        stuckPick.stuckWith?.name
                      )}
                    >
                      <span>Agree: {stuckPick.stuckWith?.name}</span>
                    </button>
                    
                    <button
                      className={`true-pick-btn ${truePicks[stuckPick.pickNumber]?.fighterSelected === stuckPick.chosenFighter?.id ? 'selected' : ''}`}
                      onClick={() => handleTruePrediction(
                        stuckPick.pickNumber,
                        stuckPick.chosenFighter?.id,
                        stuckPick.chosenFighter?.name
                      )}
                    >
                      <span>Disagree: {stuckPick.chosenFighter?.name}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="complete-btn"
            onClick={completeTruePredictions}
            disabled={getStuckPicks().length > 0 && Object.keys(truePicks).length < getStuckPicks().length}
          >
            Complete Predictions
          </button>
        </div>
      )}

      {/* Summary */}
      {currentStep === 'summary' && (
        <div className="game-section">
          <div className="section-header">
            <h3>Game Summary</h3>
            <p>All picks are locked in! Good luck!</p>
          </div>

          <div className="summary-content">
            <div className="game-picks-summary">
              <h4>Game Picks</h4>
              <div className="picks-grid">
                {Object.entries(gamePicks).map(([pickNum, pick]) => {
                  const pickingOrder = getPickingOrder();
                  const picker = pickingOrder[pickNum - 1];
                  const fight = mainCardFights.find(f => f.id === pick.fightId);
                  
                  return (
                    <div key={pickNum} className={`summary-pick ${picker.toLowerCase()}`}>
                      <div className="pick-info">
                        <span className="pick-number">#{pickNum}</span>
                        <span className="picker">{picker}</span>
                      </div>
                      <div className="pick-details">
                        <h5>{pick.fighterName}</h5>
                        <p>vs {fight?.fighter1_data?.name === pick.fighterName ? fight?.fighter2_data?.name : fight?.fighter1_data?.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="true-picks-summary">
              <h4>True Predictions</h4>
              <div className="true-picks-grid">
                {Object.entries(truePicks).map(([pickNum, truePick]) => {
                  const gamePick = gamePicks[pickNum];
                  const agrees = truePick.fighterSelected === gamePick.fighterSelected;
                  
                  return (
                    <div key={pickNum} className="true-pick-item">
                      <span className="fight-num">Fight {pickNum}</span>
                      <span className="true-pick">{truePick.fighterName}</span>
                      <span className={`agreement ${agrees ? 'agrees' : 'disagrees'}`}>
                        {agrees ? 'Agrees' : 'Disagrees'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="summary-actions">
            <button className="save-game-btn">
              <Trophy size={20} />
              Save Game
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .ufc-picks-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .picks-header {
          text-align: center;
          padding: 2rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%);
        }

        .header-content h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, ${jaredColor} 0%, ${marsColor} 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-content p {
          font-size: 1.1rem;
          margin: 0;
          opacity: 0.7;
        }

        .event-info {
          margin-top: 1.5rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .event-info h2 {
          margin: 0 0 0.5rem 0;
          color: #fbbf24;
        }

        .event-info p {
          margin: 0;
          opacity: 0.7;
        }

        .game-progress {
          padding: 2rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .progress-steps {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          max-width: 600px;
          margin: 0 auto;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .step-number {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
        }

        .step.active .step-number {
          background: ${jaredColor};
          border-color: ${jaredColor};
          color: #fff;
        }

        .step.completed .step-number {
          background: #10b981;
          border-color: #10b981;
          color: #fff;
        }

        .step-label {
          font-size: 0.85rem;
          opacity: 0.7;
          text-align: center;
        }

        .step.active .step-label {
          opacity: 1;
          color: ${jaredColor};
        }

        .step-arrow {
          opacity: 0.3;
        }

        .game-section {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .section-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .section-header h3 {
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
        }

        .section-header p {
          opacity: 0.7;
          margin: 0;
        }

        .rps-buttons {
          display: flex;
          gap: 2rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .player-button {
          padding: 2rem;
          border: 2px solid;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          min-width: 200px;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .player-button.jared {
          border-color: ${jaredColor};
        }

        .player-button.mars {
          border-color: ${marsColor};
        }

        .player-button:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .player-button.jared:hover {
          background: rgba(59, 130, 246, 0.1);
          box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
        }

        .player-button.mars:hover {
          background: rgba(239, 68, 68, 0.1);
          box-shadow: 0 8px 25px rgba(239, 68, 68, 0.3);
        }

        .order-choice {
          display: flex;
          gap: 2rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .choice-button {
          padding: 2rem;
          border: 2px solid;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          cursor: pointer;
          transition: all 0.3s ease;
          min-width: 250px;
        }

        .choice-button.jared {
          border-color: ${jaredColor};
        }

        .choice-button.mars {
          border-color: ${marsColor};
        }

        .choice-button:hover {
          transform: translateY(-4px);
        }

        .choice-button.jared:hover {
          background: rgba(59, 130, 246, 0.1);
          box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
        }

        .choice-button.mars:hover {
          background: rgba(239, 68, 68, 0.1);
          box-shadow: 0 8px 25px rgba(239, 68, 68, 0.3);
        }

        .choice-content h4 {
          margin: 0 0 0.5rem 0;
          font-size: 1.2rem;
        }

        .choice-content p {
          margin: 0 0 1rem 0;
          opacity: 0.7;
        }

        .pick-order {
          font-size: 1.5rem;
          font-weight: 700;
          color: #fbbf24;
        }

        .turn-indicator {
          text-align: center;
          margin-bottom: 2rem;
        }

        .player-turn {
          padding: 1.5rem;
          border-radius: 16px;
          border: 2px solid;
          background: rgba(255, 255, 255, 0.05);
        }

        .player-turn.jared {
          border-color: ${jaredColor};
          background: rgba(59, 130, 246, 0.1);
        }

        .player-turn.mars {
          border-color: ${marsColor};
          background: rgba(239, 68, 68, 0.1);
        }

        .player-turn h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
        }

        .player-turn p {
          margin: 0;
          opacity: 0.8;
        }

        .available-fights h4 {
          text-align: center;
          margin-bottom: 2rem;
          font-size: 1.3rem;
        }

        .fights-grid {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .fight-selection {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.5rem;
        }

        .fight-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .weight-class {
          font-weight: 600;
          color: #fbbf24;
        }

        .fight-order {
          opacity: 0.7;
          font-size: 0.9rem;
        }

        .fighters-choice {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 1rem;
          align-items: center;
        }

        .fighter-pick-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s ease;
          color: #fff;
          position: relative;
        }

        .fighter-pick-btn:hover {
          border-color: #fbbf24;
          background: rgba(251, 191, 36, 0.1);
          transform: translateY(-2px);
        }

        .fighter-pick-btn.favorite {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.1);
        }

        .fighter-image {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 0 auto 1rem;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .fighter-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }

        .favorite-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: #10b981;
          color: #fff;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 700;
        }

        .fighter-details {
          text-align: center;
        }

        .fighter-details h5 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .nickname {
          font-style: italic;
          opacity: 0.7;
          font-size: 0.9rem;
          margin: 0 0 0.75rem 0;
        }

        .fighter-stats {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
        }

        .record {
          font-weight: 600;
        }

        .country {
          opacity: 0.7;
        }

        .finish-rate {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          opacity: 0.8;
        }

        .finish-rate svg {
          color: #fbbf24;
        }

        .vs-section {
          text-align: center;
          padding: 1rem 0;
        }

        .vs {
          font-size: 1.2rem;
          font-weight: 700;
          color: #fbbf24;
        }

        .picks-summary {
          margin-top: 3rem;
          padding: 2rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .picks-summary h4 {
          margin: 0 0 1.5rem 0;
          text-align: center;
        }

        .picks-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .pick-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid;
        }

        .pick-item.jared {
          border-color: ${jaredColor};
          background: rgba(59, 130, 246, 0.1);
        }

        .pick-item.mars {
          border-color: ${marsColor};
          background: rgba(239, 68, 68, 0.1);
        }

        .pick-item svg {
          color: #10b981;
        }

        .true-predictions {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          margin-bottom: 2rem;
        }

        .true-prediction-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 2rem;
        }

        .stuck-info {
          text-align: center;
          margin-bottom: 2rem;
        }

        .stuck-info h4 {
          margin: 0 0 0.5rem 0;
          color: #fbbf24;
        }

        .stuck-info p {
          margin: 0;
        }

        .stuck-info .jared {
          color: ${jaredColor};
          font-weight: 600;
        }

        .stuck-info .mars {
          color: ${marsColor};
          font-weight: 600;
        }

        .true-choice p {
          text-align: center;
          margin-bottom: 1.5rem;
          opacity: 0.8;
        }

        .true-pick-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }

        .true-pick-btn {
          padding: 1rem 2rem;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .true-pick-btn:hover {
          border-color: #fbbf24;
          background: rgba(251, 191, 36, 0.1);
        }

        .true-pick-btn.selected {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }

        .complete-btn {
          display: block;
          margin: 0 auto;
          padding: 1rem 2rem;
          background: #10b981;
          border: none;
          border-radius: 12px;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 1rem;
        }

        .complete-btn:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-2px);
        }

        .complete-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .summary-content {
          display: flex;
          flex-direction: column;
          gap: 3rem;
        }

        .game-picks-summary h4,
        .true-picks-summary h4 {
          text-align: center;
          margin-bottom: 2rem;
          color: #fbbf24;
        }

        .picks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .summary-pick {
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid;
          border-radius: 12px;
          padding: 1.5rem;
        }

        .summary-pick.jared {
          border-color: ${jaredColor};
          background: rgba(59, 130, 246, 0.1);
        }

        .summary-pick.mars {
          border-color: ${marsColor};
          background: rgba(239, 68, 68, 0.1);
        }

        .pick-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .pick-number {
          font-weight: 700;
          color: #fbbf24;
        }

        .picker {
          font-weight: 600;
        }

        .pick-details h5 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
        }

        .pick-details p {
          margin: 0;
          opacity: 0.7;
          font-size: 0.9rem;
        }

        .true-picks-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .true-pick-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .fight-num {
          font-weight: 600;
          color: #fbbf24;
        }

        .true-pick {
          font-weight: 500;
        }

        .agreement {
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .agreement.agrees {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }

        .agreement.disagrees {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .summary-actions {
          text-align: center;
          margin-top: 2rem;
        }

        .save-game-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, ${jaredColor} 0%, ${marsColor} 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 1rem;
        }

        .save-game-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid rgba(255, 255, 255, 0.2);
          border-top-color: #fbbf24;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .picks-header {
            padding: 1.5rem 1rem;
          }

          .header-content h1 {
            font-size: 2rem;
          }

          .game-section {
            padding: 1rem;
          }

          .rps-buttons,
          .order-choice {
            flex-direction: column;
            align-items: center;
          }

          .player-button,
          .choice-button {
            min-width: 280px;
          }

          .fighters-choice {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .vs-section {
            order: -1;
            transform: rotate(90deg);
            margin: 1rem 0;
          }

          .progress-steps {
            flex-direction: column;
            gap: 1rem;
          }

          .step-arrow {
            transform: rotate(90deg);
          }

          .true-pick-buttons {
            flex-direction: column;
          }

          .picks-grid {
            grid-template-columns: 1fr;
          }

          .fighter-stats {
            flex-direction: column;
            gap: 0.5rem;
          }
        }

        @media (max-width: 480px) {
          .header-content h1 {
            font-size: 1.8rem;
          }

          .player-button,
          .choice-button {
            min-width: 240px;
            padding: 1.5rem;
          }

          .fighter-pick-btn {
            padding: 1rem;
          }

          .fighter-image {
            width: 60px;
            height: 60px;
          }

          .fight-selection {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default UFCPicks;