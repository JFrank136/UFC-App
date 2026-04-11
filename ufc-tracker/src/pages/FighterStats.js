import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import styles from '../styles/FighterStats.module.css';
import countryCodes from '../utils/countryCodes';

// Weight class order for display (lightest to heaviest, women's after men's)
const WEIGHT_CLASS_ORDER = [
  'Flyweight',
  'Bantamweight',
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
  "Women's Featherweight",
];

// Stats where 0 means "no data" and should be excluded from results
const RATE_STATS = [
  'sig_strikes_landed_per_min',
  'sig_strikes_absorbed_per_min',
  'takedown_avg_per_15min',
  'submission_avg_per_15min',
  'sig_str_defense',
  'knockdown_avg',
  'avg_fight_time',
];

const statsConfig = {
  sig_strikes_landed_per_min:   { label: 'Strikes Landed/Min',    format: (v) => parseFloat(v)?.toFixed(2) ?? '—', higherBetter: true },
  sig_strikes_absorbed_per_min: { label: 'Strikes Absorbed/Min',  format: (v) => parseFloat(v)?.toFixed(2) ?? '—', higherBetter: false },
  takedown_avg_per_15min:       { label: 'Takedown Avg/15min',     format: (v) => parseFloat(v)?.toFixed(2) ?? '—', higherBetter: true },
  submission_avg_per_15min:     { label: 'Submission Avg/15min',   format: (v) => parseFloat(v)?.toFixed(2) ?? '—', higherBetter: true },
  sig_str_defense:              { label: 'Striking Defense',       format: (v) => v ? `${(parseFloat(v) * 100).toFixed(1)}%` : '—', higherBetter: true },
  knockdown_avg:                { label: 'Knockdown Average',      format: (v) => parseFloat(v)?.toFixed(2) ?? '—', higherBetter: true },
  avg_fight_time:               { label: 'Avg Fight Time (min)',   format: (v) => parseFloat(v)?.toFixed(1) ?? '—', higherBetter: true },
  ufc_wins_ko:                  { label: 'KO/TKO Wins',           format: (v) => v ?? 0, higherBetter: true },
  ufc_wins_sub:                 { label: 'Submission Wins',        format: (v) => v ?? 0, higherBetter: true },
  ufc_wins_dec:                 { label: 'Decision Wins',          format: (v) => v ?? 0, higherBetter: true },
  ufc_losses_ko:                { label: 'KO/TKO Losses',         format: (v) => v ?? 0, higherBetter: false },
  ufc_losses_sub:               { label: 'Submission Losses',      format: (v) => v ?? 0, higherBetter: false },
  ufc_losses_dec:               { label: 'Decision Losses',        format: (v) => v ?? 0, higherBetter: false },
};

const FighterStats = () => {
  const [fighters, setFighters] = useState([]);
  const [rankingsMap, setRankingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedStat, setSelectedStat] = useState('sig_strikes_landed_per_min');
  const [selectedGender, setSelectedGender] = useState('Male');
  const [minFights, setMinFights] = useState(3);
  const [activeTab, setActiveTab] = useState('overall'); // 'overall' | 'division'
  const [darkMode, setDarkMode] = useState(true);
  const [openDivisions, setOpenDivisions] = useState(new Set(['Lightweight', 'Welterweight']));
  const [imageErrors, setImageErrors] = useState(new Set());

  const themeClass = darkMode ? 'dark' : 'light';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [{ data: fightersData, error: fErr }, { data: rankingsData, error: rErr }] = await Promise.all([
        supabase.from('fighters').select('*'),
        supabase.from('rankings').select('*'),
      ]);
      if (fErr) throw fErr;
      if (rErr) throw rErr;

      setFighters(fightersData || []);

      // Build a map of fighter uuid -> ranking info
      const rMap = {};
      (rankingsData || []).forEach(r => {
        // A fighter may appear in multiple divisions; keep the best (lowest) rank
        if (!rMap[r.uuid] || r.rank < rMap[r.uuid].rank) {
          rMap[r.uuid] = r;
        }
      });
      setRankingsMap(rMap);
    } catch (err) {
      console.error('Error fetching fighter stats data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getStatValue = (fighter, stat) => {
    const raw = fighter[stat];
    if (raw === null || raw === undefined) return null;
    if (RATE_STATS.includes(stat)) {
      const parsed = parseFloat(raw);
      return isNaN(parsed) ? null : parsed;
    }
    return raw;
  };

  const getFilteredFighters = () => {
    return fighters.filter(fighter => {
      // Exclude unknown weight class
      if (!fighter.weight_class || fighter.weight_class.toLowerCase() === 'unknown') return false;

      // Minimum UFC fights
      const totalFights = (fighter.ufc_wins_total || 0) + (fighter.ufc_losses_total || 0);
      if (totalFights < minFights) return false;

      // Gender
      if (selectedGender !== 'All' && fighter.gender !== selectedGender) return false;

      // Stat availability
      const val = getStatValue(fighter, selectedStat);
      if (RATE_STATS.includes(selectedStat)) return val !== null && val > 0;
      return val !== null;
    });
  };

  const sortFighters = (list, invert = false) => {
    const config = statsConfig[selectedStat];
    const higherBetter = invert ? !config.higherBetter : config.higherBetter;
    return [...list].sort((a, b) => {
      const aVal = getStatValue(a, selectedStat) ?? 0;
      const bVal = getStatValue(b, selectedStat) ?? 0;
      return higherBetter ? bVal - aVal : aVal - bVal;
    });
  };

  const getTopN = (list, n = 5) => sortFighters(list).slice(0, n);
  const getBottomN = (list, n = 5) => sortFighters(list, true).slice(0, n);

  const getByDivision = (filteredFighters) => {
    const byDiv = {};
    filteredFighters.forEach(f => {
      const div = f.weight_class || 'Unknown';
      if (!byDiv[div]) byDiv[div] = [];
      byDiv[div].push(f);
    });
    // Return sorted by WEIGHT_CLASS_ORDER, skip unknown
    return WEIGHT_CLASS_ORDER
      .filter(div => byDiv[div]?.length > 0)
      .map(div => ({ division: div, fighters: byDiv[div] }));
  };

  const toggleDivision = (div) => {
    setOpenDivisions(prev => {
      const next = new Set(prev);
      next.has(div) ? next.delete(div) : next.add(div);
      return next;
    });
  };

  const handleImageError = (id) => {
    setImageErrors(prev => new Set(prev).add(id));
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const FighterCard = ({ fighter, rank }) => {
    const ranking = rankingsMap[fighter.id];
    const rankLabel = ranking
      ? (ranking.rank === 0 ? 'C' : `#${ranking.rank}`)
      : null;

    const flag = countryCodes[fighter.country] || '';
    const record = `${fighter.ufc_wins_total ?? 0}-${fighter.ufc_losses_total ?? 0}`;
    const showImage = fighter.image_url && !imageErrors.has(fighter.id);
    const initial = (fighter.name || '?')[0].toUpperCase();
    const statDisplay = statsConfig[selectedStat].format(fighter[selectedStat]);

    return (
      <div
        className={styles.fighterCard}
        onClick={() => fighter.profile_url_ufc && window.open(fighter.profile_url_ufc, '_blank')}
      >
        {/* Rank badge */}
        <div className={styles.rankBadge}>{rank}</div>

        {/* Fighter image */}
        <div className={styles.fighterImageWrap}>
          {showImage ? (
            <img
              src={fighter.image_url}
              alt={fighter.name}
              className={styles.fighterImage}
              onError={() => handleImageError(fighter.id)}
            />
          ) : (
            <div className={styles.fighterImageFallback}>{initial}</div>
          )}
          {rankLabel && (
            <span className={styles.rankedBadge}>{rankLabel}</span>
          )}
        </div>

        {/* Info */}
        <div className={styles.fighterInfo}>
          <div className={styles.fighterName}>{fighter.name}</div>
          <div className={styles.fighterMeta}>
            {flag && <span>{flag}</span>}
            <span className={styles.record}>{record}</span>
            <span>·</span>
            <span>{fighter.weight_class}</span>
          </div>
        </div>

        {/* Stat value */}
        <div className={styles.statValue}>{statDisplay}</div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.container} data-theme={themeClass}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading fighter stats...</p>
        </div>
      </div>
    );
  }

  const filteredFighters = getFilteredFighters();
  const overallTop = getTopN(filteredFighters);
  const overallBottom = getBottomN(filteredFighters);
  const divisionData = getByDivision(filteredFighters);

  return (
    <div className={styles.container} data-theme={themeClass}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>UFC Fighter Statistics</h1>
          <p>Analyze performance across divisions</p>
        </div>
        <button className={styles.themeToggle} onClick={() => setDarkMode(d => !d)}>
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* Controls */}
      <div className={styles.controls} data-theme={themeClass}>
        <div>
          <div className={styles.controlLabel}>Statistic</div>
          <select
            value={selectedStat}
            onChange={e => setSelectedStat(e.target.value)}
            className={styles.select}
          >
            {Object.entries(statsConfig).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className={styles.controlLabel}>Gender</div>
          <div className={styles.genderButtons}>
            {['Male', 'Female', 'All'].map(g => (
              <button
                key={g}
                onClick={() => setSelectedGender(g)}
                className={`${styles.genderBtn} ${selectedGender === g ? styles.genderBtnActive : ''}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.controlLabel}>Min Fights</div>
          <input
            type="number"
            value={minFights}
            onChange={e => setMinFights(parseInt(e.target.value) || 0)}
            min="0"
            max="30"
            className={styles.minFightsInput}
          />
        </div>
      </div>

      {/* Summary */}
      <div className={styles.summary} data-theme={themeClass}>
        {filteredFighters.length} fighters · {selectedGender} · min {minFights} UFC fights
      </div>

      {/* Tab Switcher */}
      <div className={styles.tabSwitcher}>
        {[['overall', 'Overall'], ['division', 'By Division']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`${styles.tab} ${activeTab === key ? styles.tabActive : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>

        {/* ── Overall Tab ── */}
        {activeTab === 'overall' && (
          <div className={styles.overallGrid}>
            {/* Top 5 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Top 5 — {statsConfig[selectedStat].label}
              </div>
              <div className={styles.fighterList}>
                {overallTop.length > 0
                  ? overallTop.map((f, i) => <FighterCard key={f.id} fighter={f} rank={i + 1} />)
                  : <p className={styles.emptyMessage}>No fighters match the current filters.</p>
                }
              </div>
            </div>

            {/* Bottom 5 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Bottom 5 — {statsConfig[selectedStat].label}
              </div>
              <div className={styles.fighterList}>
                {overallBottom.length > 0
                  ? overallBottom.map((f, i) => <FighterCard key={f.id} fighter={f} rank={i + 1} />)
                  : <p className={styles.emptyMessage}>No fighters match the current filters.</p>
                }
              </div>
            </div>
          </div>
        )}

        {/* ── By Division Tab ── */}
        {activeTab === 'division' && (
          <div className={styles.accordion}>
            {divisionData.length === 0 && (
              <p className={styles.emptyMessage}>No fighters match the current filters.</p>
            )}
            {divisionData.map(({ division, fighters: divFighters }) => {
              const isOpen = openDivisions.has(division);
              const top = getTopN(divFighters);
              const bottom = getBottomN(divFighters);
              return (
                <div key={division} className={styles.accordionItem}>
                  <button
                    className={styles.accordionHeader}
                    onClick={() => toggleDivision(division)}
                  >
                    <span>
                      <span className={styles.accordionTitle}>{division}</span>
                      <span className={styles.accordionMeta}>{divFighters.length} fighters</span>
                    </span>
                    <span className={`${styles.accordionChevron} ${isOpen ? styles.accordionChevronOpen : ''}`}>
                      ▼
                    </span>
                  </button>

                  {isOpen && (
                    <div className={styles.accordionBody}>
                      <div className={styles.divisionSubtitle}>Top 5</div>
                      {top.map((f, i) => <FighterCard key={f.id} fighter={f} rank={i + 1} />)}

                      {bottom.length > 0 && (
                        <>
                          <div className={styles.divisionSubtitle} style={{ marginTop: '0.75rem' }}>Bottom 5</div>
                          {bottom.map((f, i) => <FighterCard key={f.id} fighter={f} rank={i + 1} />)}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default FighterStats;