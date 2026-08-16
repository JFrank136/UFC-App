import React, { useEffect, useState, useMemo } from 'react';
import { Search, X, AlertCircle, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getFullUpcomingFights } from '../api/supabaseQueries';
import { getFightPriorityScore, selectHeadlineFight, getDateParts } from '../utils/upcomingFightsHelpers';
import { DateChip, HeadlineFightCard, CompactFightRow } from '../components/UpcomingFightsComponents';
import styles from '../styles/UpcomingFights.module.css';

const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const nextEvent = useMemo(() => {
    if (fights.length === 0) return null;
    const now = new Date();
    const upcoming = fights
      .map(f => ({ date: new Date(f.event_date + 'T' + (f.event_time || '00:00')), event: f.event }))
      .filter(f => f.date > now)
      .sort((a, b) => a.date - b.date)[0];
    if (!upcoming) return null;
    const days = Math.max(1, Math.ceil((upcoming.date - now) / (1000 * 60 * 60 * 24)));
    return { days, event: upcoming.event };
  }, [fights]);

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
        groups[key] = { date: fight.event_date, time: fight.event_time, fights: [] };
      }
      groups[key].fights.push(fight);
    });
    Object.values(groups).forEach(group => {
      group.fights.sort((a, b) => {
        const pDiff = getFightPriorityScore(b) - getFightPriorityScore(a);
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

  const toggleEventExpansion = (eventName) => {
    setExpandedEvents(prev => {
      const s = new Set(prev);
      s.has(eventName) ? s.delete(eventName) : s.add(eventName);
      return s;
    });
  };

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

  const getFighterRankInfo = (fighter) => {
    const { divisional, p4p } = getRankDisplay(fighter);
    if (divisional?.rank === 'C') return { isChampion: true, label: 'Champion' };
    if (divisional) return { isChampion: false, label: `Rank ${divisional.rank}` };
    if (p4p) return { isChampion: false, label: `P4P #${p4p.rank}` };
    return { isChampion: false, label: null };
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

  const getCardSectionInfo = (cardSection) => {
    const raw = cardSection || '';
    if (raw === 'Main Event') return 'Main event';
    if (raw === 'Co-Main') return 'Co-main';
    if (raw === 'Main Card' || raw === 'Main') return 'Main card';
    if (raw === 'Preliminary Card' || raw === 'Prelim' || raw === 'Prelims') return 'Prelim';
    if (raw === 'Early Prelims') return 'Early prelims';
    return raw || 'TBA';
  };

  const getEventPriority = (eventFights) => {
    let favorites = 0;
    let interested = 0;
    eventFights.forEach(fight => {
      [...(fight.fighter1_favorites || []), ...(fight.fighter2_favorites || [])].forEach(fav => {
        if (fav.priority === 'favorite') favorites++;
        else if (fav.priority === 'interested') interested++;
      });
    });
    return { favorites, interested };
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
          <h2 className={styles.comparisonTitle}>Fighter comparison</h2>
          <div className={styles.comparisonHeader}>
            {[f1, f2].map((fighter, idx) => (
              <div key={idx} className={styles.fighterSummaryModal}>
                <div className={styles.comparisonImageContainer}>
                  <img src={fighter.image_url || '/static/images/placeholder.jpg'} alt={fighter.name}
                    onError={e => { e.target.src = `https://via.placeholder.com/100x100/1a2338/f5f7fa?text=${fighter.name?.charAt(0) || '?'}`; }} />
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
                <h4>{fighter.name} recent fights</h4>
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
        <h3>Error loading fights</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  );

  return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.content}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Upcoming fights</h1>
            <p className={styles.pageSub}>
              {filteredFights.length} fights across {Object.keys(groupedFights).length} events you follow
            </p>
          </div>
          <button className={styles.themeToggle} onClick={() => setDarkMode(!darkMode)}
            title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        {nextEvent && (
          <div className={styles.countdown}>
            <span className={styles.countdownNumber}>{nextEvent.days} day{nextEvent.days !== 1 ? 's' : ''}</span>
            <span className={styles.countdownCaption}>until {nextEvent.event}</span>
          </div>
        )}

        <div className={styles.searchBar}>
          <Search size={16} aria-hidden="true" />
          <input type="text" placeholder="Search fighters or events"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={14} /></button>
          )}
        </div>

        <div className={styles.filterChips}>
          {['All', 'Favorite', 'Interested'].map(option => (
            <button
              key={option}
              className={`${styles.chip} ${priorityFilter === option ? styles.chipOn : ''}`}
              onClick={() => setPriorityFilter(option)}
            >
              {option === 'Favorite' ? 'Favorites' : option}
            </button>
          ))}
        </div>

        {Object.keys(groupedFights).length === 0 ? (
          <p className={styles.pageSub}>No upcoming fights found for your selected criteria</p>
        ) : (
          <div className={styles.eventsContainer}>
            {Object.entries(groupedFights)
              .sort(([, a], [, b]) => new Date(a.date) - new Date(b.date))
              .map(([eventName, eventData]) => {
                const { day, month, weekday } = getDateParts(eventData.date);
                const { favorites, interested } = getEventPriority(eventData.fights);
                const breakdownParts = [];
                if (favorites > 0) breakdownParts.push(`${favorites} favorite${favorites > 1 ? 's' : ''}`);
                if (interested > 0) breakdownParts.push(`${interested} interested`);
                const isExpanded = expandedEvents.has(eventName);
                const headline = selectHeadlineFight(eventData.fights);
                const otherFights = eventData.fights.filter(f => f !== headline);

                return (
                  <div key={eventName} className={styles.eventCard}>
                    <button className={styles.eventHeader} onClick={() => toggleEventExpansion(eventName)}>
                      <DateChip day={day} month={month} />
                      <div className={styles.eventInfo}>
                        <div className={styles.eventName}>{eventName}</div>
                        <div className={styles.eventWhen}>{weekday} &middot; {formatTime(eventData.time)}</div>
                        {breakdownParts.length > 0 && (
                          <div className={styles.eventBreakdown}>{breakdownParts.join(' · ')}</div>
                        )}
                      </div>
                      <span className={styles.eventExpandIcon}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className={styles.eventBody}>
                        {headline && (
                          <HeadlineFightCard
                            fight={headline}
                            f1Rank={getFighterRankInfo(headline.fighter1_data)}
                            f2Rank={getFighterRankInfo(headline.fighter2_data)}
                            formatRecord={formatRecord}
                            onCompare={setComparingFighters}
                          />
                        )}
                        {otherFights.map(fight => (
                          <CompactFightRow
                            key={fight.id}
                            fight={fight}
                            sectionLabel={getCardSectionInfo(fight.card_section)}
                            onCompare={setComparingFighters}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {comparingFighters && <ComparisonModal fight={comparingFighters} onClose={() => setComparingFighters(null)} />}
    </div>
  );
};

export default UpcomingFights;
