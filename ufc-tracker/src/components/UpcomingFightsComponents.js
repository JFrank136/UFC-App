import React from 'react';
import { Crown, Star, ChevronRight } from 'lucide-react';
import styles from '../styles/UpcomingFights.module.css';
import { getCountryCode } from '../utils/countryCodes';

export const DateChip = ({ day, month }) => (
  <div className={styles.dateChip}>
    <span className={styles.dateChipDay}>{day}</span>
    <span className={styles.dateChipMonth}>{month}</span>
  </div>
);

export const FighterColumn = ({ fighter, favorites, rankInfo, formatRecord }) => {
  const countryLabel = fighter.country ? getCountryCode(fighter.country) || fighter.country : null;
  const metaParts = [];
  if (rankInfo.label) metaParts.push(rankInfo.label);
  metaParts.push(formatRecord(fighter));
  if (countryLabel) metaParts.push(countryLabel);

  return (
    <div className={styles.fighterColumn}>
      <img
        className={styles.portrait}
        src={fighter.image_url || '/static/images/placeholder.jpg'}
        alt={fighter.name || 'Fighter'}
        onError={(e) => { e.target.src = `https://via.placeholder.com/160x200/1a2338/f5f7fa?text=${fighter.name?.charAt(0) || '?'}`; }}
      />
      <div className={`${styles.fighterName} ${rankInfo.isChampion ? styles.champion : ''}`}>
        {fighter.name || 'Unknown fighter'}
        {favorites?.length > 0 && <Star className={styles.followedStar} size={11} aria-label="On your list" />}
      </div>
      <div className={styles.fighterMeta}>
        {rankInfo.isChampion && <Crown size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} aria-hidden="true" />}
        {metaParts.join(' · ')}
      </div>
    </div>
  );
};

export const HeadlineFightCard = ({ fight, f1Rank, f2Rank, formatRecord, onCompare }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;

  return (
    <div className={styles.headline}>
      <div className={styles.matchup}>
        <FighterColumn fighter={f1} favorites={fight.fighter1_favorites} rankInfo={f1Rank} formatRecord={formatRecord} />
        <div className={styles.vsColumn}><span className={styles.vsMark}>VS</span></div>
        <FighterColumn fighter={f2} favorites={fight.fighter2_favorites} rankInfo={f2Rank} formatRecord={formatRecord} />
      </div>
      <button className={styles.compareLink} onClick={() => onCompare(fight)}>
        View full comparison &rarr;
      </button>
    </div>
  );
};

export const CompactFightRow = ({ fight, sectionLabel, onCompare }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;
  const f1Followed = fight.fighter1_favorites?.length > 0;
  const f2Followed = fight.fighter2_favorites?.length > 0;

  return (
    <button className={styles.compactRow} onClick={() => onCompare(fight)}>
      <span className={styles.compactRowTag}>{sectionLabel}</span>
      <img
        className={styles.compactRowAvatar}
        src={f1.image_url || '/static/images/placeholder.jpg'}
        alt=""
        onError={(e) => { e.target.src = `https://via.placeholder.com/60x60/1a2338/f5f7fa?text=${f1.name?.charAt(0) || '?'}`; }}
      />
      <span className={styles.compactRowName}>
        {f1.name}
        {f1Followed && <Star className={styles.followedStar} size={10} aria-label="On your list" />}
        {' '}<span className={styles.vsWord}>vs</span>{' '}
        {f2.name}
        {f2Followed && <Star className={styles.followedStar} size={10} aria-label="On your list" />}
      </span>
      <ChevronRight className={styles.compactRowChevron} size={14} aria-hidden="true" />
    </button>
  );
};
