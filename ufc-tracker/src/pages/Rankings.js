import React, { useState, useEffect, useRef } from 'react';
import { Crown, TrendingUp, Calendar, Sun, Moon, Search, X, Flame } from 'lucide-react';
import supabase from '../api/supabaseClient';
import countryCodes from '../utils/countryCodes';
import { parseRankChange, DIVISIONS, P4P_DIVISIONS } from '../utils/rankingsHelpers';
import { RankChangeIcon, FightModal } from '../components/RankingsComponents';

import styles from '../styles/Rankings.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const MEN_DIVISIONS = [
  'Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight',
  'Welterweight', 'Middleweight', 'Light Heavyweight', 'Heavyweight'
];

const WOMEN_DIVISIONS = [
  "Women's Strawweight", "Women's Flyweight",
  "Women's Bantamweight", "Women's Featherweight"
];

const STREAK_MIN = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const calculateStreak = (fightHistory = []) => {
  if (!fightHistory.length) return null;
  const sorted = [...fightHistory]
    .filter(f => f.result && f.fight_date)
    .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date));
  if (!sorted.length) return null;

  const first = sorted[0].result?.toLowerCase();
  if (first === 'draw') return null;

  let count = 0;
  for (const fight of sorted) {
    const r = fight.result?.toLowerCase();
    if (r === first) count++;
    else break;
  }

  if (count >= STREAK_MIN) {
    return { type: first === 'win' ? 'win' : 'loss', count };
  }
  return null;
};

const getLastFight = (fightHistory = []) => {
  if (!fightHistory.length) return null;
  // Sort: dated records first (most recent), undated last
  return [...fightHistory].sort((a, b) => {
    if (a.fight_date && b.fight_date) return new Date(b.fight_date) - new Date(a.fight_date);
    if (a.fight_date) return -1;
    if (b.fight_date) return 1;
    return 0;
  })[0] || null;
};

const shortenMethod = (method) => {
  if (!method) return null;
  const m = method.toLowerCase().trim();
  // Already short codes from DB
  if (m === 'dec') return 'Dec';
  if (m === 'tko') return 'TKO';
  if (m === 'ko') return 'KO';
  if (m === 'sub') return 'Sub';
  if (m === 'nc') return 'NC';
  if (m === 'dq') return 'DQ';
  // Full strings
  if (m.includes('unanimous')) return 'U-Dec';
  if (m.includes('majority')) return 'M-Dec';
  if (m.includes('split')) return 'S-Dec';
  if (m.includes('decision')) return 'Dec';
  if (m.includes('submission') || m.includes('sub')) return 'Sub';
  if (m.includes('tko') || m.includes('technical knockout')) return 'TKO';
  if (m.includes('ko') || m.includes('knockout')) return 'KO';
  if (m.includes('doctor') || m.includes('stoppage')) return 'TKO';
  if (m.includes('disqualif')) return 'DQ';
  if (m.includes('no contest')) return 'NC';
  return method.split(' ').slice(0, 2).join(' ');
};

const getFightCountdown = (eventDate) => {
  if (!eventDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(eventDate);
  target.setHours(0, 0, 0, 0);
  const diffMs = target - today;
  if (diffMs < 0) return null;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  const months = Math.floor(diffDays / 30);
  const days = diffDays % 30;
  if (months === 0) return `in ${days}d`;
  if (days === 0) return `in ${months}m`;
  return `in ${months}m ${days}d`;
};

const isValidNickname = (nickname) => {
  if (!nickname) return false;
  const t = nickname.trim().toLowerCase();
  return t !== '' && t !== 'n/a' && t !== '-';
};

// ─── Component ────────────────────────────────────────────────────────────────

const Rankings = () => {
  const [gender, setGender] = useState('Men');
  const [subTab, setSubTab] = useState('Division');

  const [selectedDivision, setSelectedDivision] = useState('Flyweight');
  const [divisionScrollIndex, setDivisionScrollIndex] = useState(0);

  // 'all' | 'rise' | 'drop'
  const [moverSort, setMoverSort] = useState('all');

  const [rankedFighters, setRankedFighters] = useState([]);
  const [upcomingFights, setUpcomingFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [selectedFight, setSelectedFight] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const searchInputRef = useRef(null);

  const genderDivisions = gender === 'Men' ? MEN_DIVISIONS : WOMEN_DIVISIONS;

  // ── Data fetching ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [rankingsData, upcomingFightsData] = await Promise.all([
        fetchRankingsWithFighters(),
        fetchUpcomingFights()
      ]);
      setRankedFighters(rankingsData);
      setUpcomingFights(upcomingFightsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRankingsWithFighters = async () => {
    const { data: rankings, error: rankingsError } = await supabase
      .from('rankings')
      .select('*')
      .not('rank', 'eq', 'NR')
      .order('division')
      .order('rank');

    if (rankingsError) throw rankingsError;

    const fighterIds = [...new Set(rankings.map(r => r.uuid).filter(Boolean))];

    const [
      { data: fighters, error: fightersError },
      { data: fightHistory, error: historyError }
    ] = await Promise.all([
      supabase.from('fighters')
        .select('id, name, nickname, country, wins_total, losses_total, image_url, sig_strikes_landed_per_min, sig_str_defense, takedown_avg_per_15min')
        .in('id', fighterIds),
      supabase.from('fight_history')
        .select('fighter_id, result, fight_date, opponent, method, round, time')
        .in('fighter_id', fighterIds)
        .order('fight_date', { ascending: false })
        .limit(5000)
    ]);

    if (fightersError) throw fightersError;
    if (historyError) throw historyError;

    const fightersMap = {};
    fighters?.forEach(f => { fightersMap[f.id] = f; });

    const historyMap = {};
    fightHistory?.forEach(h => {
      if (!historyMap[h.fighter_id]) historyMap[h.fighter_id] = [];
      historyMap[h.fighter_id].push(h);
    });

    return rankings.map(ranking => {
      const fighter = fightersMap[ranking.uuid] || {};
      const history = historyMap[ranking.uuid] || [];
      if (!history.length && ranking.uuid) {
        console.log(`[Rankings] No fight history for: ${fighter.name || ranking.uuid} (uuid: ${ranking.uuid})`);
      }
      return {
        ...fighter,
        division: ranking.division,
        rank: ranking.rank,
        change: ranking.change,
        country_code: fighter.country,
        streak: calculateStreak(history),
        lastFight: getLastFight(history)
      };
    });
  };

  const fetchUpcomingFights = async () => {
    const { data, error } = await supabase
      .from('upcoming_fights')
      .select('*')
      .order('event_date');
    if (error) throw error;
    return data;
  };

  // ── Derived data ──────────────────────────────────────────────────────────────

  const getFilteredAndSortedFighters = () => {
    let filtered = rankedFighters;

    if (searchQuery.trim()) {
      filtered = filtered.filter(fighter =>
        fighter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.country?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else if (subTab === 'P4P') {
      filtered = filtered.filter(f =>
        f.division === "Men's Pound-for-Pound" || f.division === "Women's Pound-for-Pound"
      );
    } else if (subTab === 'Champions') {
      filtered = filtered.filter(f => {
        const isRightGender = gender === 'Men'
          ? !f.division.startsWith("Women's")
          : f.division.startsWith("Women's");
        return f.rank === 'C' && isRightGender;
      });
    } else if (subTab === 'Movers') {
      filtered = filtered.filter(f => {
        const isRightGender = gender === 'Men'
          ? !f.division.startsWith("Women's")
          : f.division.startsWith("Women's");
        const parsedChange = parseRankChange(f.change);
        return isRightGender && parsedChange !== null && parsedChange !== 0;
      });
    } else {
      filtered = filtered.filter(f => f.division === selectedDivision);
    }

    filtered = filtered.map(fighter => {
      const upcomingFight = upcomingFights.find(
        fight => fight.fighter1_id === fighter.id || fight.fighter2_id === fighter.id
      );
      return {
        ...fighter,
        parsedChange: parseRankChange(fighter.change),
        upcomingFight,
        hasUpcomingFight: !!upcomingFight
      };
    });

    if (subTab === 'Movers') {
      filtered.sort((a, b) => {
        const aChange = a.parsedChange || 0;
        const bChange = b.parsedChange || 0;
        if (moverSort === 'rise') return bChange - aChange;
        if (moverSort === 'drop') return aChange - bChange;
        return Math.abs(bChange) - Math.abs(aChange);
      });
    } else if (subTab === 'Champions') {
      const allDivs = [...DIVISIONS, ...P4P_DIVISIONS];
      filtered.sort((a, b) => allDivs.indexOf(a.division) - allDivs.indexOf(b.division));
    } else {
      filtered.sort((a, b) => {
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank || 999) - parseInt(b.rank || 999);
      });
    }

    return filtered;
  };

  const getP4PFighters = (p4pGender) => {
    const divName = p4pGender === 'Men' ? "Men's Pound-for-Pound" : "Women's Pound-for-Pound";
    return rankedFighters
      .filter(f => f.division === divName)
      .map(f => {
        const upcomingFight = upcomingFights.find(
          fight => fight.fighter1_id === f.id || fight.fighter2_id === f.id
        );
        return { ...f, parsedChange: parseRankChange(f.change), upcomingFight };
      })
      .sort((a, b) => {
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank || 999) - parseInt(b.rank || 999);
      });
  };

  // ── Navigation ────────────────────────────────────────────────────────────────

  const handleGenderChange = (newGender) => {
    if (subTab === 'P4P') setSubTab('Division');
    setGender(newGender);
    const divs = newGender === 'Men' ? MEN_DIVISIONS : WOMEN_DIVISIONS;
    setSelectedDivision(divs[0]);
    setDivisionScrollIndex(0);
  };

  const navigateDivision = (direction) => {
    const total = genderDivisions.length;
    const newIndex = direction === 'next'
      ? (divisionScrollIndex + 1) % total
      : (divisionScrollIndex - 1 + total) % total;
    setDivisionScrollIndex(newIndex);
    setSelectedDivision(genderDivisions[newIndex]);
  };

  const handleDivisionSelect = (div) => {
    setSelectedDivision(div);
    setDivisionScrollIndex(genderDivisions.indexOf(div));
  };

  const handleSubTab = (tab) => {
    // Clicking active Champions or Movers tab toggles back to Division
    if (tab === subTab && (tab === 'Champions' || tab === 'Movers')) {
      setSubTab('Division');
      return;
    }
    setSubTab(tab);
    if (tab === 'Division') {
      setSelectedDivision(genderDivisions[0]);
      setDivisionScrollIndex(0);
    }
    setMoverSort('all');
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleMoverSortClick = () => {
    setMoverSort(prev => {
      if (prev === 'all') return 'rise';
      if (prev === 'rise') return 'drop';
      return 'all';
    });
  };

  const handleSearchOpen = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const handleTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd || subTab !== 'Division') return;
    const distance = touchStart - touchEnd;
    if (distance > 50) navigateDivision('next');
    if (distance < -50) navigateDivision('prev');
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const getCountryFlag = (country) => countryCodes[country] || '🏴';
  const showDivisionBadge = searchQuery.trim() || subTab === 'Movers' || subTab === 'Champions';
  const isMoversView = subTab === 'Movers';
  const isDivisionView = subTab === 'Division' && !searchQuery.trim();

  const filteredFighters = getFilteredAndSortedFighters();
  const championCard = isDivisionView ? filteredFighters.find(f => f.rank === 'C') : null;
  const nonChampionFighters = isDivisionView ? filteredFighters.filter(f => f.rank !== 'C') : [];

  // ── Fighter Card ──────────────────────────────────────────────────────────────

  const FighterCard = ({ fighter, showLastFight = false }) => {
    const isChampion = fighter.rank === 'C';
    const hasDefense = isChampion && fighter.upcomingFight;
    const countdown = fighter.upcomingFight ? getFightCountdown(fighter.upcomingFight.event_date) : null;
    const lastFight = showLastFight ? fighter.lastFight : null;

    return (
      <div className={[
        styles.fighterCard,
        isChampion ? styles.champion : '',
        hasDefense ? styles.championDefense : '',
        showLastFight ? styles.fighterCardMovers : ''
      ].filter(Boolean).join(' ')}>

        {isChampion && (
          <div className={styles.championBadge}>
            <Crown size={14} />
            <span>CHAMPION</span>
          </div>
        )}

        <div className={styles.rankNumber}>
          {isChampion ? 'C' : `#${fighter.rank}`}
        </div>

        {fighter.image_url ? (
          <img
            src={fighter.image_url}
            alt={fighter.name}
            className={styles.fighterImage}
            onError={(e) => {
              e.target.src = `https://via.placeholder.com/80x80/333/white?text=${fighter.name?.charAt(0) || '?'}`;
            }}
          />
        ) : (
          <div className={styles.fighterImagePlaceholder}>
            {fighter.name?.charAt(0) || '?'}
          </div>
        )}

        {/* Fighter identity */}
        <div className={styles.fighterInfo}>
          <h3 className={styles.fighterName}>{fighter.name}</h3>
          {isValidNickname(fighter.nickname) && (
            <p className={styles.fighterNickname}>"{fighter.nickname}"</p>
          )}
          <div className={styles.fighterStats}>
            <span>{getCountryFlag(fighter.country)} {fighter.country}</span>
            <span>•</span>
            <span>{fighter.wins_total}-{fighter.losses_total}</span>
            {showDivisionBadge && (
              <>
                <span>•</span>
                <span>{fighter.division}</span>
              </>
            )}
          </div>
        </div>

        {/* Last fight info — Movers only, fills the middle gap */}
        {showLastFight && lastFight && (
          <div className={styles.lastFightInfo}>
            <div className={styles.lastFightLabel}>Last Fight</div>
            <div className={styles.lastFightRow}>
              <span className={[
                styles.lastFightResult,
                lastFight.result?.toLowerCase() === 'win' ? styles.resultWin
                  : lastFight.result?.toLowerCase() === 'loss' ? styles.resultLoss
                  : styles.resultDraw
              ].join(' ')}>
                {lastFight.result?.charAt(0)?.toUpperCase() || '?'}
              </span>
              <span className={styles.lastFightOpponent}>{lastFight.opponent || '—'}</span>
            </div>
            <div className={styles.lastFightMeta}>
              {shortenMethod(lastFight.method) && <span>{shortenMethod(lastFight.method)}</span>}
              {lastFight.round && <span>R{lastFight.round}</span>}
              {lastFight.fight_date && (
                <span>
                  {new Date(lastFight.fight_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Right column */}
        <div className={styles.cardRight}>
          {/* Streak + rank change on same row, centered */}
          <div className={styles.rankRow}>
            {fighter.streak && (
              <div className={`${styles.streakBadge} ${fighter.streak.type === 'win' ? styles.winStreak : styles.lossStreak}`}>
                {fighter.streak.type === 'win' ? <Flame size={12} /> : '↓'}
                <span>{fighter.streak.count}</span>
              </div>
            )}
            {fighter.parsedChange !== null && fighter.parsedChange !== 0 && (
              <div
                className={`${styles.rankChange} ${isMoversView ? styles.rankChangeClickable : ''}`}
                onClick={isMoversView ? handleMoverSortClick : undefined}
                title={isMoversView
                  ? `Sort: ${moverSort === 'all' ? 'All movers' : moverSort === 'rise' ? '↑ Biggest rise' : '↓ Biggest drop'} — click to cycle`
                  : undefined}
              >
                <RankChangeIcon change={fighter.parsedChange} />
              </div>
            )}
          </div>

          {fighter.upcomingFight && countdown && (
            <button
              className={`${styles.upcomingFightBadge} ${hasDefense ? styles.defenseGlow : ''}`}
              onClick={() => setSelectedFight(fighter.upcomingFight)}
            >
              <Calendar size={13} />
              <span>{new Date(fighter.upcomingFight.event_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span className={styles.countdown}>{countdown}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── P4P View ──────────────────────────────────────────────────────────────────

  const P4PView = () => {
    const menP4P = getP4PFighters('Men');
    const womenP4P = getP4PFighters('Women');
    return (
      <div className={styles.p4pGrid}>
        <div className={styles.p4pColumn}>
          <h2 className={styles.p4pColumnTitle}>Men's P4P</h2>
          <div className={styles.fighterList}>
            {menP4P.map(f => <FighterCard key={`${f.id}-${f.division}`} fighter={f} />)}
          </div>
        </div>
        <div className={styles.p4pColumn}>
          <h2 className={styles.p4pColumnTitle}>Women's P4P</h2>
          <div className={styles.fighterList}>
            {womenP4P.map(f => <FighterCard key={`${f.id}-${f.division}`} fighter={f} />)}
          </div>
        </div>
      </div>
    );
  };

  // ── Mover sort hint ───────────────────────────────────────────────────────────

  const moverSortLabels = { all: 'All movers', rise: '↑ Biggest rise', drop: '↓ Biggest drop' };

  // ── Loading / Error ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`${styles.rankingsContainer} ${darkMode ? styles.dark : styles.light}`}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading rankings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.rankingsContainer} ${darkMode ? styles.dark : styles.light}`}>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3>Error Loading Rankings</h3>
          <p className={styles.errorMessage}>{error}</p>
          <button onClick={fetchData} className={styles.retryBtn}>Try Again</button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className={`${styles.rankingsContainer} ${darkMode ? styles.dark : styles.light}`}>

      {/* ── HEADER ── */}
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <div className={styles.titleSection}>
            <h1>🏆 UFC Rankings</h1>
            <p>Official UFC fighter rankings updated weekly</p>
          </div>

          <div className={styles.headerControls}>
            <div className={`${styles.headerSearch} ${searchOpen ? styles.headerSearchOpen : ''}`}>
              <button className={styles.searchIconBtn} onClick={handleSearchOpen} aria-label="Search">
                <Search size={18} />
              </button>
              {searchOpen && (
                <>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search all fighters..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.headerSearchInput}
                  />
                  <button className={styles.clearSearch} onClick={handleSearchClear}>
                    <X size={15} />
                  </button>
                </>
              )}
            </div>

            <button
              className={styles.themeToggle}
              onClick={() => setDarkMode(!darkMode)}
              title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── CONTROLS ── */}
      <div className={styles.controlsSection}>

        <div className={styles.topNav}>
          <div className={`${styles.genderToggle} ${subTab === 'P4P' ? styles.genderToggleP4P : ''}`}>
            <button
              className={`${styles.genderBtn} ${gender === 'Men' && subTab !== 'P4P' ? styles.genderActive : ''}`}
              onClick={() => handleGenderChange('Men')}
            >
              Men
            </button>
            <button
              className={`${styles.genderBtn} ${gender === 'Women' && subTab !== 'P4P' ? styles.genderActive : ''}`}
              onClick={() => handleGenderChange('Women')}
            >
              Women
            </button>
          </div>

          <div className={styles.subTabs}>
            <button
              className={`${styles.subTab} ${subTab === 'Champions' ? styles.subTabActive : ''}`}
              onClick={() => handleSubTab('Champions')}
            >
              <Crown size={15} />
              <span>Champions</span>
            </button>
            <button
              className={`${styles.subTab} ${subTab === 'Movers' ? styles.subTabActive : ''}`}
              onClick={() => handleSubTab('Movers')}
            >
              <TrendingUp size={15} />
              <span>Movers</span>
            </button>
            <button
              className={`${styles.subTab} ${subTab === 'P4P' ? styles.subTabActive : ''}`}
              onClick={() => handleSubTab('P4P')}
            >
              <span>P4P</span>
            </button>
          </div>
        </div>

        {subTab !== 'Champions' && subTab !== 'Movers' && subTab !== 'P4P' && !searchQuery.trim() && (
          <div className={styles.divisionRow}>
            <div className={styles.controlGroup}>
              <label>DIVISION</label>
              <select
                value={selectedDivision}
                onChange={(e) => handleDivisionSelect(e.target.value)}
                className={styles.divisionSelect}
              >
                {genderDivisions.map(div => (
                  <option key={div} value={div}>{div}</option>
                ))}
              </select>
            </div>
            <div className={styles.divisionNav}>
              <button className={styles.navButton} onClick={() => navigateDivision('prev')}>←</button>
              <span className={styles.currentDivision}>
                {divisionScrollIndex + 1} / {genderDivisions.length}
              </span>
              <button className={styles.navButton} onClick={() => navigateDivision('next')}>→</button>
            </div>
          </div>
        )}

        {/* Mover sort hint */}
        {isMoversView && filteredFighters.length > 0 && (
          <div className={styles.moverSortHint}>
            <span>Sorted by: <strong>{moverSortLabels[moverSort]}</strong></span>
            <span className={styles.moverSortHintSub}>Tap any rank change to cycle sort</span>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div
        className={styles.mainContent}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {subTab === 'P4P' && !searchQuery.trim() ? (
          <P4PView />
        ) : filteredFighters.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🥊</div>
            <h3>No fighters found</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        ) : isDivisionView ? (
          <div className={styles.divisionLayout}>
            {championCard && (
              <div className={styles.championRow}>
                <FighterCard fighter={championCard} />
              </div>
            )}
            {nonChampionFighters.length > 0 && (
              <div className={styles.twoColumnList}>
                {nonChampionFighters.map(fighter => (
                  <FighterCard key={`${fighter.id}-${fighter.division}`} fighter={fighter} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.fighterList}>
            {filteredFighters.map(fighter => (
              <FighterCard
                key={`${fighter.id}-${fighter.division}`}
                fighter={fighter}
                showLastFight={isMoversView}
              />
            ))}
          </div>
        )}
      </div>

      {selectedFight && (
        <FightModal fight={selectedFight} onClose={() => setSelectedFight(null)} />
      )}
    </div>
  );
};

export default Rankings;