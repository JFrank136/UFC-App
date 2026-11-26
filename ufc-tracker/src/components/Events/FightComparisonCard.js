import React, { useState } from 'react';
import { Star, Crown, ChevronRight } from 'lucide-react';
import styles from '../../styles/Events.module.css';
import { getCountryCode } from '../../utils/countryCodes';
import { getRecentFights, formatRecord } from '../../utils/eventHelpers';
import { getFinishRateBreakdown, getRankLabelForDivision } from '../../utils/eventsDesktopHelpers';

const formatStat = (value, decimals = 2, suffix = '') => {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'string' && (value.includes('(') || value.includes('%'))) return value;
  const num = parseFloat(value);
  return !isNaN(num) ? num.toFixed(decimals) + suffix : value.toString();
};

const FighterHeader = ({ fighter, favorites, fightDivision }) => {
  const code = fighter?.country ? getCountryCode(fighter.country) : null;
  const rank = getRankLabelForDivision(fighter, fightDivision);
  const isFavorited = (favorites || []).length > 0;

  return (
    <div className={styles.cmpSide}>
      <img
        className={styles.cmpPortrait}
        src={fighter?.image_url || '/static/images/placeholder.jpg'}
        alt={fighter?.name || 'Fighter'}
        onError={(e) => { e.target.src = `https://via.placeholder.com/160x210/1a2338/f5f7fa?text=${fighter?.name?.charAt(0) || '?'}`; }}
      />
      <div className={styles.cmpName}>
        {rank?.isChampion && <Crown className={styles.cmpChampionCrown} size={15} aria-label="Champion" />}
        {isFavorited && <Star className={styles.cmpFavoriteStar} size={13} aria-label="On your list" />}
        <span>{fighter?.name || 'Unknown fighter'}</span>
      </div>
      {fighter?.nickname && <div className={styles.cmpNick}>&quot;{fighter.nickname}&quot;</div>}
      <div className={styles.cmpRec}>
        <span>{formatRecord(fighter)}</span>
        {fighter?.age ? <span>&middot; {fighter.age}</span> : null}
        {code && (
          <img
            className={styles.cmpFlag}
            src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
            alt={fighter.country}
            title={fighter.country}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
      </div>
      {rank && !rank.isChampion && <div className={styles.cmpRank}>{rank.label}</div>}
    </div>
  );
};

const StatRow = ({ label, f1, f2 }) => (
  <div className={styles.cmpStatRow}>
    <div className={styles.cmpStatValue}>{f1}</div>
    <div className={styles.cmpStatLabel}>{label}</div>
    <div className={styles.cmpStatValueRight}>{f2}</div>
  </div>
);

const RecentFightsColumn = ({ fighter }) => {
  const recentFights = getRecentFights(fighter, 3);
  return (
  <div className={styles.cmpRfCol}>
    {recentFights.map((fight, i) => (
      <div key={i} className={styles.cmpRfItem}>
        <div className={`${styles.cmpRfChip} ${fight.result?.toLowerCase() === 'win' ? styles.cmpRfChipWin : styles.cmpRfChipLoss}`}>
          {fight.result?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <div className={styles.cmpRfOpp}>{fight.opponent}</div>
          <div className={styles.cmpRfMeta}>
            {fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}
            {fight.fight_date ? ` · ${new Date(`${fight.fight_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}` : ''}
          </div>
        </div>
      </div>
    ))}
    {recentFights.length === 0 && <div className={styles.cmpRfMeta}>No recent fights</div>}
  </div>
  );
};

const FightComparisonCard = ({ fight, fightDivision, onOpenBreakdown }) => {
  const [finishView, setFinishView] = useState('all');
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return <div className={styles.cmpCard}>Fighter data unavailable</div>;

  const f1Finish = getFinishRateBreakdown(f1, finishView);
  const f2Finish = getFinishRateBreakdown(f2, finishView);
  const denomLabel = finishView === 'all' ? 'fights' : finishView;

  return (
    <div className={styles.cmpCard}>
      <div className={styles.cmpGrid}>
        <FighterHeader fighter={f1} favorites={fight.fighter1_favorites} fightDivision={fightDivision} />
        <FighterHeader fighter={f2} favorites={fight.fighter2_favorites} fightDivision={fightDivision} />
        <div className={styles.cmpVs}>VS</div>

        <div className={styles.cmpSection}>Bio</div>
        <StatRow label="Height" f1={f1.height ? `${Math.floor(f1.height / 12)}'${f1.height % 12}"` : 'N/A'} f2={f2.height ? `${Math.floor(f2.height / 12)}'${f2.height % 12}"` : 'N/A'} />
        <StatRow label="Reach" f1={f1.reach ? `${f1.reach}"` : 'N/A'} f2={f2.reach ? `${f2.reach}"` : 'N/A'} />

        <div className={styles.cmpSection}>Striking</div>
        <StatRow label="Landed / Min" f1={formatStat(f1.sig_strikes_landed_per_min)} f2={formatStat(f2.sig_strikes_landed_per_min)} />
        <StatRow label="Absorbed / Min" f1={formatStat(f1.sig_strikes_absorbed_per_min)} f2={formatStat(f2.sig_strikes_absorbed_per_min)} />
        <StatRow label="Defense" f1={formatStat(f1.sig_str_defense)} f2={formatStat(f2.sig_str_defense)} />
        <StatRow label="Accuracy" f1={formatStat(f1.striking_accuracy)} f2={formatStat(f2.striking_accuracy)} />
        <StatRow label="Knockdown Avg" f1={formatStat(f1.knockdown_avg)} f2={formatStat(f2.knockdown_avg)} />

        <div className={styles.cmpSection}>Grappling</div>
        <StatRow label="TD Avg / 15" f1={formatStat(f1.takedown_avg_per_15min, 2)} f2={formatStat(f2.takedown_avg_per_15min, 2)} />
        <StatRow label="TD Defense" f1={formatStat(f1.takedown_defense)} f2={formatStat(f2.takedown_defense)} />
        <StatRow label="TD Accuracy" f1={formatStat(f1.takedown_accuracy)} f2={formatStat(f2.takedown_accuracy)} />
        <StatRow label="Sub Avg / 15" f1={formatStat(f1.submission_avg_per_15min, 2)} f2={formatStat(f2.submission_avg_per_15min, 2)} />

        <div className={styles.cmpFinishHead}>
          <div className={styles.cmpSection}>Finish rate</div>
          <div className={styles.cmpSegMiniGroup}>
            {['all', 'wins', 'losses'].map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={finishView === key}
                className={`${styles.cmpSegMini} ${finishView === key ? styles.cmpSegMiniActive : ''}`}
                onClick={() => setFinishView(key)}
              >
                {key === 'all' ? 'All' : key === 'wins' ? 'Wins' : 'Losses'}
              </button>
            ))}
          </div>
        </div>
        <StatRow label={denomLabel} f1={f1Finish.total} f2={f2Finish.total} />
        <StatRow label="KO / TKO" f1={`${f1Finish.ko}%`} f2={`${f2Finish.ko}%`} />
        <StatRow label="Submission" f1={`${f1Finish.sub}%`} f2={`${f2Finish.sub}%`} />
        <StatRow label="Decision" f1={`${f1Finish.dec}%`} f2={`${f2Finish.dec}%`} />

        <div className={styles.cmpSection}>Last 3 fights</div>
        <RecentFightsColumn fighter={f1} />
        <RecentFightsColumn fighter={f2} />

        <button type="button" className={styles.cmpBreakdownLink} onClick={onOpenBreakdown}>
          Full fight breakdown <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

export default FightComparisonCard;
