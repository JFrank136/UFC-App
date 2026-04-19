import React, { useEffect, useState, useMemo } from 'react';
import { Clock, Calendar, Search, X, Target, Shield, Zap, AlertCircle, ChevronDown, ChevronUp, BarChart2, Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getFullUpcomingFights } from '../api/supabaseQueries';
import countryCodes from '../utils/countryCodes';
import styles from '../styles/UpcomingFights.module.css';

const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFights, setExpandedFights] = useState(new Set());
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [comparingFighters, setComparingFighters] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const fetchFightsWithFavorites = async () => {
      try {
        setLoading(true);
        setError(null);
        const upcomingFights = await getFullUpcomingFights();
        const { data: userFavorites, error: favError } = await supabase
          .from('user_favorites')
          .select('*');
        if (favError) throw favError;

        const fightsWithFavorites = upcomingFights.filter(fight => {
          const f1Favs = userFavorites.filter(fav => fav.fighter_id === fight.fighter1_id);
          const f2Favs = userFavorites.filter(fav => fav.fighter_id === fight.fighter2_id);
          return f1Favs.length > 0 || f2Favs.length > 0;
        }).map(fight => ({
          ...fight,
          fighter1_favorites: userFavorites.filter(fav => fav.fighter_id === fight.fighter1_id),
          fighter2_favorites: userFavorites.filter(fav => fav.fighter_id === fight.fighter2_id),
          fighter1_data: fight.fighter1_data || {},
          fighter2_data: fight.fighter2_data || {}
        }));

        setFights(fightsWithFavorites);
      } catch (err) {
        console.error('Error fetching fights:', err);
        setError('Failed to load upcoming fights. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchFightsWithFavorites();
  }, []);

  const nextEventCountdown = useMemo(() => {
    if (fights.length === 0) return null;
    const now = new Date();
    const nextEvent = fights
      .map(f => new Date(f.event_date + 'T' + (f.event_time || '00:00')))
      .filter(date => date > now)
      .sort((a, b) => a - b)[0];
    if (!nextEvent) return null;
    const diff = nextEvent - now;
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      eventDate: nextEvent
    };
  }, [fights]);

  // Date filter: show events within 3 days before today through future
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const filteredFights = useMemo(() => {
    let filtered = fights.filter(fight => {
      const eventDate = new Date(fight.event_date + 'T00:00:00');
      return eventDate >= cutoff;
    });

    if (searchQuery.trim()) {
      filtered = filtered.filter(fight =>
        fight.fighter1_data?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.fighter2_data?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.fighter1_data?.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.fighter2_data?.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.event?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (priorityFilter !== 'All') {
      filtered = filtered.filter(fight =>
        fight.fighter1_favorites?.some(f => f.priority === priorityFilter.toLowerCase()) ||
        fight.fighter2_favorites?.some(f => f.priority === priorityFilter.toLowerCase())
      );
    }

    return filtered;
  }, [fights, searchQuery, priorityFilter, cutoff]);

  const groupedFights = useMemo(() => {
    const groups = {};
    filteredFights.forEach(fight => {
      const key = fight.event;
      if (!groups[key]) {
        groups[key] = { date: fight.event_date, time: fight.event_time, type: fight.event_type, fights: [] };
      }
      groups[key].fights.push(fight);
    });
    Object.values(groups).forEach(group => {
      group.fights.sort((a, b) => {
        // Priority score: fights with a 'favorite' fighter rank highest
        const getPriorityScore = (fight) => {
          const allFavs = [...(fight.fighter1_favorites || []), ...(fight.fighter2_favorites || [])];
          if (allFavs.some(f => f.priority === 'favorite')) return 2;
          if (allFavs.some(f => f.priority === 'interested')) return 1;
          return 0;
        };
        const pDiff = getPriorityScore(b) - getPriorityScore(a);
        if (pDiff !== 0) return pDiff;
        return (b.fight_order || 0) - (a.fight_order || 0);
      });
    });
    return groups;
  }, [filteredFights]);

  useEffect(() => {
    if (Object.keys(groupedFights).length > 0) {
      setExpandedEvents(new Set(Object.keys(groupedFights)));
    }
  }, [groupedFights]);

  const toggleFightExpansion = (fightId) => {
    setExpandedFights(prev => {
      const s = new Set(prev);
      s.has(fightId) ? s.delete(fightId) : s.add(fightId);
      return s;
    });
  };

  const toggleCardExpansion = (fightId) => {
    setExpandedCards(prev => {
      const s = new Set(prev);
      s.has(fightId) ? s.delete(fightId) : s.add(fightId);
      return s;
    });
  };

  const toggleEventExpansion = (eventName) => {
    setExpandedEvents(prev => {
      const s = new Set(prev);
      s.has(eventName) ? s.delete(eventName) : s.add(eventName);
      return s;
    });
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const formatTime = (timeString) => {
    if (!timeString) return 'Time TBA';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm} EST`;
  };

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.ufc_wins_total ?? fighter.wins_total ?? 0;
    const losses = fighter.ufc_losses_total ?? fighter.losses_total ?? 0;
    const draws = fighter.ufc_draws_total ?? fighter.draws_total ?? 0;
    return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
  };

  const formatStat = (value, decimals = 2, suffix = '') => {
    if (!value) return 'N/A';
    if (typeof value === 'string' && value.includes('(')) return value;
    const num = parseFloat(value);
    return !isNaN(num) ? num.toFixed(decimals) + suffix : value.toString();
  };

  const getRecentFights = (fighter, limit = 3) => {
    if (!fighter?.fight_history) return [];
    return fighter.fight_history
      .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date))
      .slice(0, limit);
  };

  const getRankDisplay = (fighter) => {
    if (!fighter?.rankings || fighter.rankings.length === 0) return { divisional: null, p4p: null };
    const p4p = fighter.rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
    return { divisional: divRank, p4p };
  };

  const getUserLabels = (favorites) => {
    if (!favorites || favorites.length === 0) return [];
    return favorites.map(fav => ({ priority: fav.priority, color: '#FFD700' }));
  };

  // Returns breakdown of favorites/interested for an event's fights
  const getEventPriority = (fights) => {
    let favorites = 0;
    let interested = 0;
    fights.forEach(fight => {
      [...(fight.fighter1_favorites || []), ...(fight.fighter2_favorites || [])].forEach(fav => {
        if (fav.priority === 'favorite') favorites++;
        else if (fav.priority === 'interested') interested++;
      });
    });
    return { favorites, interested };
  };

  // Returns display label and whether it's a main card fight
  const getCardSectionInfo = (cardSection) => {
    const raw = cardSection || '';
    if (raw === 'Main Event') return { label: 'Main Event', isMainCard: true };
    if (raw === 'Co-Main') return { label: 'Co-Main', isMainCard: true };
    if (raw === 'Main Card' || raw === 'Main') return { label: 'Main Card', isMainCard: true };
    if (raw === 'Preliminary Card' || raw === 'Prelim' || raw === 'Prelims') return { label: 'Prelims', isMainCard: false };
    if (raw === 'Early Prelims') return { label: 'Early Prelims', isMainCard: false };
    return { label: raw || 'TBA', isMainCard: false };
  };

  const getFightOutcomeStats = (fighter, type = 'all') => {
    if (!fighter?.fight_history || fighter.fight_history.length === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    let fightList = fighter.fight_history;
    if (type === 'wins') fightList = fightList.filter(f => f.result?.toLowerCase() === 'win');
    else if (type === 'losses') fightList = fightList.filter(f => f.result?.toLowerCase() === 'loss');
    const total = fightList.length;
    if (total === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    const ko = fightList.filter(f => f.method?.toLowerCase().match(/ko|tko|knockout/)).length;
    const sub = fightList.filter(f => f.method?.toLowerCase().match(/sub|submission|tap/)).length;
    const dec = fightList.filter(f => f.method?.toLowerCase().match(/decision|unanimous|majority|split/)).length;
    return {
      ko: Math.round((ko / total) * 100),
      sub: Math.round((sub / total) * 100),
      dec: Math.round((dec / total) * 100),
      total
    };
  };

  const getDivisionFromRankings = (fighter) => {
    if (!fighter?.rankings || fighter.rankings.length === 0) return null;
    return fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'))?.division || null;
  };

  const getWeightClassName = (weightClass, f1, f2) => {
    if (!weightClass || weightClass === 'TBA') return 'TBA';
    const f1Div = getDivisionFromRankings(f1);
    const f2Div = getDivisionFromRankings(f2);
    if (f1Div && f2Div && f1Div === f2Div) return f1Div;
    if (f1Div && !f2Div) return f1Div;
    if (f2Div && !f1Div) return f2Div;
    const weightMap = {
      '125': 'Flyweight', '135': 'Bantamweight', '145': 'Featherweight',
      '155': 'Lightweight', '170': 'Welterweight', '185': 'Middleweight',
      '205': 'Light Heavyweight', '265': 'Heavyweight', '115': "Women's Strawweight"
    };
    let division = weightMap[weightClass] || weightClass;
    const hasWomens = (f1Div?.toLowerCase().includes("women's")) || (f2Div?.toLowerCase().includes("women's"));
    if (hasWomens && !division.toLowerCase().includes("women's")) {
      const womensMap = { 'Flyweight': "Women's Flyweight", 'Bantamweight': "Women's Bantamweight", 'Featherweight': "Women's Featherweight" };
      division = womensMap[division] || `Women's ${division}`;
    }
    return division;
  };

  const ComparisonModal = ({ fight, onClose }) => {
    if (!fight) return null;
    const f1 = fight.fighter1_data;
    const f2 = fight.fighter2_data;
    if (!f1 || !f2) return null;

    const statComparisons = [
      { label: 'Age', f1: f1.age || 'N/A', f2: f2.age || 'N/A', inverse: true },
      { label: 'Height', f1: f1.height ? f1.height + '"' : 'N/A', f2: f2.height ? f2.height + '"' : 'N/A' },
      { label: 'Reach', f1: f1.reach ? f1.reach + '"' : 'N/A', f2: f2.reach ? f2.reach + '"' : 'N/A' },
      { label: 'Fight Finishes',
        f1: (() => { const s = getFightOutcomeStats(f1); return s.total > 0 ? `${s.ko}% KO, ${s.dec}% Dec, ${s.sub}% Sub` : 'N/A'; })(),
        f2: (() => { const s = getFightOutcomeStats(f2); return s.total > 0 ? `${s.ko}% KO, ${s.dec}% Dec, ${s.sub}% Sub` : 'N/A'; })()
      },
      { label: 'Strikes/Min', f1: formatStat(f1.strikes_landed_per_min), f2: formatStat(f2.strikes_landed_per_min) },
      { label: 'Strike Defense', f1: formatStat(f1.striking_defense), f2: formatStat(f2.striking_defense) },
      { label: 'Takedowns/15min', f1: formatStat(f1.takedown_avg, 1), f2: formatStat(f2.takedown_avg, 1) },
      { label: 'KO/TKO Wins', f1: f1.wins_ko || 0, f2: f2.wins_ko || 0 },
      { label: 'Submission Wins', f1: f1.wins_sub || 0, f2: f2.wins_sub || 0 }
    ];

    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.comparisonModal} onClick={e => e.stopPropagation()}>
          <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
          <h2 className={styles.comparisonTitle}>Fighter Comparison</h2>
          <div className={styles.comparisonHeader}>
            {[f1, f2].map((fighter, idx) => (
              <div key={idx} className={styles.fighterSummaryModal}>
                <div className={styles.comparisonImageContainer}>
                  <img src={fighter.image_url || '/static/images/placeholder.jpg'} alt={fighter.name}
                    onError={e => { e.target.src = `https://via.placeholder.com/100x100/333/gold?text=${fighter.name?.charAt(0) || '?'}`; }} />
                </div>
                <h3>{fighter.name}</h3>
                <p>{fighter.nickname || ''}</p>
                <div className={styles.modalRecord}>{formatRecord(fighter)}</div>
              </div>
            )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <div key="vs" className={styles.vsDivider}>VS</div>, el], [])}
          </div>
          <div className={styles.comparisonStats}>
            {statComparisons.map((stat, idx) => {
              const f1Val = parseFloat(stat.f1) || 0;
              const f2Val = parseFloat(stat.f2) || 0;
              const f1Better = stat.inverse ? f1Val < f2Val && f1Val > 0 : f1Val > f2Val;
              const f2Better = stat.inverse ? f2Val < f1Val && f2Val > 0 : f2Val > f1Val;
              return (
                <div key={idx} className={styles.statComparison}>
                  <div className={`${styles.statValue} ${f1Better ? styles.better : ''}`}>{stat.f1}</div>
                  <div className={styles.statLabel}>{stat.label}</div>
                  <div className={`${styles.statValue} ${f2Better ? styles.better : ''}`}>{stat.f2}</div>
                </div>
              );
            })}
          </div>
          <div className={styles.recentFightsComparison}>
            {[f1, f2].map((fighter, idx) => (
              <div key={idx} className={styles.recentFightsCol}>
                <h4>{fighter.name} Recent Fights</h4>
                {getRecentFights(fighter).map((fight, i) => (
                  <div key={i} className={`${styles.fightResult} ${styles[fight.result?.toLowerCase() || '']}`}>
                    <span className={styles.resultIndicator}>{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
                    <span>{fight.opponent || 'Unknown'}</span>
                    <span className={styles.method}>{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                  </div>
                ))}
                {getRecentFights(fighter).length === 0 && <div className={styles.noFights}>No recent fights</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const FighterCard = ({ fight, isExpanded }) => {
    const f1 = fight.fighter1_data;
    const f2 = fight.fighter2_data;
    const isCardExpanded = expandedCards.has(fight.id);

    if (!f1 || !f2) return (
      <div className={`${styles.fightCard} ${styles.errorCard}`}>
        <p>Fighter data unavailable for this fight</p>
      </div>
    );

    const isChampionshipFight =
      (f1.rankings?.some(r => r.rank === 'C')) ||
      (f2.rankings?.some(r => r.rank === 'C')) ||
      fight.event?.toLowerCase().includes('title');

    const actualDivision = getDivisionFromRankings(f1) || getDivisionFromRankings(f2);
    const f1Rankings = getRankDisplay(f1);
    const f2Rankings = getRankDisplay(f2);
    const f1Labels = getUserLabels(fight.fighter1_favorites);
    const f2Labels = getUserLabels(fight.fighter2_favorites);

    const { label: sectionLabel, isMainCard } = getCardSectionInfo(fight.card_section);

    return (
      <div className={`${styles.fightCard} ${isChampionshipFight ? styles.championshipFight : ''} ${isMainCard ? styles.mainCardFight : ''}`}>
        <div className={styles.fightCardHeader}>
          <div className={`${styles.cardSectionBadge} ${isMainCard ? styles.mainCardBadge : styles.prelimBadge}`}>
            {sectionLabel}
          </div>
          <div className={styles.weightClass}>{actualDivision || getWeightClassName(fight.weight_class, f1, f2)}</div>
          <div className={styles.fightTime}>{fight.event_time ? formatTime(fight.event_time) : 'Time TBA'}</div>
          <button className={styles.cardExpandBtn} onClick={() => toggleCardExpansion(fight.id)}>
            {isCardExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        <div className={styles.fightMatchup}>
          {[{ fighter: f1, labels: f1Labels, rankings: f1Rankings }, { fighter: f2, labels: f2Labels, rankings: f2Rankings }].map(({ fighter, labels, rankings }, idx) => (
            <React.Fragment key={idx}>
              {idx === 1 && (
                <div className={styles.vsSection}>
                  {isChampionshipFight && <div className={styles.championshipCrown}>👑</div>}
                  <div className={styles.vs}>VS</div>
                  <button className={styles.compareBtn} onClick={() => setComparingFighters(fight)} title="Compare Fighters">
                    <BarChart2 size={20} />
                  </button>
                </div>
              )}
              <div className={styles.fighterPreview}>
                <div className={styles.fighterImageContainer}>
                  <img src={fighter.image_url || '/static/images/placeholder.jpg'} alt={fighter.name || 'Fighter'}
                    onError={e => { e.target.src = `https://via.placeholder.com/120x120/333/gold?text=${fighter.name?.charAt(0) || '?'}`; }} />
                  {rankings.p4p && <div className={styles.p4pMedalBadge}>🥇</div>}
                </div>
                <div className={styles.fighterInfo}>
                  <h3>{fighter.name || 'Unknown Fighter'}</h3>
                  {fighter.nickname && <p className={styles.nickname}>"{fighter.nickname}"</p>}
                  <div className={styles.country}>{countryCodes[fighter.country] || '🏴'} {fighter.country || 'Unknown'}</div>
                  <div className={styles.record}>{formatRecord(fighter)}</div>
                  <div className={styles.rankingsContainer}>
                    {rankings.divisional && <div className={styles.rankBadgeDivisional}>#{rankings.divisional.rank} {rankings.divisional.division}</div>}
                    {rankings.p4p && <div className={styles.rankBadgeP4p}>P4P #{rankings.p4p.rank}</div>}
                  </div>
                  {labels.length > 0 && (
                    <div className={styles.userLabels}>
                      {labels.map((label, i) => (
                        <span key={i} className={styles.userLabel}>{label.priority}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        <button className={styles.expandBtn} onClick={() => toggleFightExpansion(fight.id)}>
          <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {isExpanded && (
          <div className={styles.fightDetails}>
            <div className={styles.detailedStats}>
              {[f1, f2].map((fighter, idx) => (
                <div key={idx} className={styles.fighterDetails}>
                  <h4>{fighter.name} Stats</h4>
                  <div className={styles.statsGrid}>
                    <div className={styles.stat}><Zap size={16} /><span>Strikes/min: {formatStat(fighter.strikes_landed_per_min)}</span></div>
                    <div className={styles.stat}><Shield size={16} /><span>Defense: {formatStat(fighter.striking_defense)}</span></div>
                    <div className={styles.stat}><Target size={16} /><span>Takedowns: {formatStat(fighter.takedown_avg, 1)}/15min</span></div>
                  </div>
                  <h5>Recent Performance</h5>
                  <div className={styles.recentFights}>
                    {getRecentFights(fighter).map((result, i) => (
                      <div key={i} className={`${styles.fightResult} ${styles[result.result?.toLowerCase() || '']}`}>
                        <span className={styles.resultIndicator}>{result.result?.charAt(0)?.toUpperCase() || '?'}</span>
                        <span>{result.opponent || 'Unknown'}</span>
                        <span className={styles.method}>{result.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                      </div>
                    ))}
                    {getRecentFights(fighter).length === 0 && <div className={styles.noFights}>No recent fights available</div>}
                  </div>
                </div>
              ))}
            </div>
            <button className={`${styles.expandBtn} ${styles.collapse}`} onClick={() => toggleFightExpansion(fight.id)}>
              <span>Hide Details</span><ChevronUp size={20} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const theme = darkMode ? 'dark' : 'light';

  if (loading) return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading upcoming fights...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.errorContainer}>
        <AlertCircle size={48} />
        <h3>Error Loading Fights</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    </div>
  );

  return (
    <div className={styles.pageContainer} data-theme={theme}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>⚔️ Upcoming UFC Fights</h1>
          <p>Track your favorite fighters and never miss a match</p>
        </div>
        <div className={styles.headerControls}>
          <button className={styles.themeToggle} onClick={() => setDarkMode(!darkMode)}
            title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {nextEventCountdown && (
            <div className={styles.countdownTimer}>
              <Clock size={24} />
              <div className={styles.countdownContent}>
                <p>Next Event In</p>
                <div className={styles.timeUnits}>
                  {[['Days', nextEventCountdown.days], ['Hours', nextEventCountdown.hours], ['Min', nextEventCountdown.minutes]].map(([label, val]) => (
                    <div key={label} className={styles.timeUnit}>
                      <span className={styles.timeValue}>{val}</span>
                      <span className={styles.timeLabel}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className={styles.controlsSection}>
        <div className={styles.searchAndFilters}>
          <div className={styles.searchBar}>
            <Search size={18} />
            <input type="text" placeholder="Search fighters or events..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button className={styles.clearSearch} onClick={() => setSearchQuery('')}><X size={16} /></button>
            )}
          </div>
          <div className={styles.filtersPanel}>
            <div className={styles.filterGroup}>
              <label>Priority</label>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                <option value="All">All Priorities</option>
                <option value="Favorite">Favorites Only</option>
                <option value="Interested">Interested Only</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.resultsSummary}>
        {Object.keys(groupedFights).length === 0 ? (
          <p>No upcoming fights found for your selected criteria</p>
        ) : (
          <p><strong>{filteredFights.length}</strong> fights across <strong>{Object.keys(groupedFights).length}</strong> events featuring your favorite fighters
            {searchQuery && <span> · Showing results for "{searchQuery}"</span>}
          </p>
        )}
      </div>

      <div className={styles.eventsContainer}>
        {Object.entries(groupedFights)
          .sort(([, a], [, b]) => new Date(a.date) - new Date(b.date))
          .map(([eventName, eventData]) => {
            const isPPV = eventData.type?.toLowerCase().includes('ppv') ||
              (eventName.toLowerCase().includes('ufc ') && /ufc \d+/.test(eventName.toLowerCase()));
            const { favorites, interested } = getEventPriority(eventData.fights);
            const breakdownParts = [];
            if (favorites > 0) breakdownParts.push(`${favorites} favorite${favorites > 1 ? 's' : ''}`);
            if (interested > 0) breakdownParts.push(`${interested} interested`);
            const breakdown = breakdownParts.join(' · ');
            return (
              <div key={eventName} className={styles.eventSection}>
                <div className={`${styles.eventHeader} ${isPPV ? styles.ppvEvent : styles.fightNightEvent}`}
                  onClick={() => toggleEventExpansion(eventName)}>
                  <div className={styles.eventInfo}>
                    <div className={styles.eventTitleContainer}>
                      <h2>{eventName}</h2>
                      {isPPV && <span className={styles.ppvBadge}>PPV</span>}
                    </div>
                    <div className={styles.eventMeta}>
                      <Calendar size={16} />
                      <span>{formatDate(eventData.date)}</span>
                      <span className={styles.separator}>·</span>
                      <Clock size={16} />
                      <span>{formatTime(eventData.time)}</span>
                    </div>
                    {breakdown && (
                      <div className={styles.eventBreakdown}>{breakdown}</div>
                    )}
                  </div>
                  <div className={styles.eventStats}>
                    <span className={styles.fightCount}>{eventData.fights.length} fights</span>
                    <span className={styles.expandIcon}>{expandedEvents.has(eventName) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
                  </div>
                </div>
                {expandedEvents.has(eventName) && (
                  <div className={styles.fightsGrid}>
                    {eventData.fights.map(fight => (
                      <FighterCard key={fight.id} fight={fight} isExpanded={expandedFights.has(fight.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {comparingFighters && <ComparisonModal fight={comparingFighters} onClose={() => setComparingFighters(null)} />}
    </div>
  );
};

export default UpcomingFights;
