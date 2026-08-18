import React from 'react';
import { Star, Flame, ChevronRight } from 'lucide-react';
import styles from '../styles/UpcomingFights.module.css';
import { formatFightDate } from '../utils/upcomingFightsHelpers';
import { useCountdown } from '../hooks/useCountdown';
import { FighterColumn } from './UpcomingFightsComponents';

export const CountdownDisplay = ({ targetDate, eventName }) => {
  const parts = useCountdown(targetDate);
  if (!parts) return null;

  return (
    <div className={styles.desktopCountdown}>
      <div className={styles.desktopCountdownRow}>
        <span className={styles.desktopCountdownDays}>
          {parts.isPast ? 'Fight time' : `${parts.days}d`}
        </span>
        {!parts.isPast && (
          <span className={styles.desktopCountdownHms}>
            {String(parts.hours).padStart(2, '0')}h {String(parts.minutes).padStart(2, '0')}m {String(parts.seconds).padStart(2, '0')}s
          </span>
        )}
      </div>
      {!parts.isPast && <div className={styles.desktopCountdownCaption}>until {eventName}</div>}
    </div>
  );
};

const starColor = (favorites) => {
  if (!favorites || favorites.length === 0) return null;
  if (favorites.some((f) => f.priority === 'favorite')) return 'var(--gold)';
  if (favorites.some((f) => f.priority === 'interested')) return 'var(--accent)';
  return null;
};

const DesktopFightRow = ({ fight, isSelected, onSelect }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;
  const f1Color = starColor(fight.fighter1_favorites);
  const f2Color = starColor(fight.fighter2_favorites);

  return (
    <button
      className={`${styles.desktopFightRow} ${isSelected ? styles.desktopFightRowSelected : ''}`}
      onClick={onSelect}
    >
      <img
        className={styles.desktopFightRowAvatar}
        src={f1.image_url || '/static/images/placeholder.jpg'}
        alt=""
        onError={(e) => { e.target.src = `https://via.placeholder.com/60x60/1a2338/f5f7fa?text=${f1.name?.charAt(0) || '?'}`; }}
      />
      <span className={styles.desktopFightRowName}>
        {f1.name}
        {f1Color && <Star className={styles.followedStar} style={{ color: f1Color }} size={11} aria-label="On your list" />}
        {' '}<span className={styles.vsWord}>vs</span>{' '}
        {f2.name}
        {f2Color && <Star className={styles.followedStar} style={{ color: f2Color }} size={11} aria-label="On your list" />}
      </span>
      <ChevronRight className={styles.compactRowChevron} size={14} aria-hidden="true" />
    </button>
  );
};

export const EventListGroup = ({ eventName, eventData, dayLabel, selectedFightId, onSelectFight }) => {
  const count = eventData.fights.length;
  const isBusy = count >= 3;

  return (
    <div className={styles.desktopEventGroup}>
      <div className={styles.desktopEventHead}>
        <div className={styles.desktopEventName}>{eventName}</div>
        <div className={styles.desktopEventMeta}>
          <span className={styles.desktopEventWhen}>{dayLabel}</span>
          <span className={`${styles.desktopEventCount} ${isBusy ? styles.desktopEventCountBusy : ''}`}>
            {isBusy && <Flame size={13} aria-hidden="true" />}
            {count} fight{count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {eventData.fights.map((fight) => (
        <DesktopFightRow
          key={fight.id}
          fight={fight}
          isSelected={fight.id === selectedFightId}
          onSelect={() => onSelectFight(fight.id)}
        />
      ))}
    </div>
  );
};

const betterValue = (a, b) => {
  const av = parseFloat(a) || 0;
  const bv = parseFloat(b) || 0;
  return { aBetter: av > bv, bBetter: bv > av };
};

export const FightDetailPane = ({ fight, eventName, eventWhen, f1Rank, f2Rank, formatRecord, formatStat, getRecentFights, onOpenFullComparison }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;

  const stats = [
    { label: 'Reach', f1: f1.reach ? `${f1.reach}"` : 'N/A', f2: f2.reach ? `${f2.reach}"` : 'N/A' },
    { label: 'Strikes/min', f1: formatStat(f1.strikes_landed_per_min), f2: formatStat(f2.strikes_landed_per_min) },
    { label: 'TD/15min', f1: formatStat(f1.takedown_avg, 1), f2: formatStat(f2.takedown_avg, 1) },
    { label: 'Str. defense', f1: formatStat(f1.striking_defense), f2: formatStat(f2.striking_defense) },
  ];

  const recentF1 = getRecentFights(f1);
  const recentF2 = getRecentFights(f2);

  return (
    <div className={styles.desktopDetail}>
      <div className={styles.desktopDetailContext}>{eventName} &middot; {eventWhen}</div>

      <div className={styles.desktopMatchup}>
        <div className={styles.matchup}>
          <FighterColumn fighter={f1} favorites={fight.fighter1_favorites} rankInfo={f1Rank} formatRecord={formatRecord} />
          <div className={styles.vsColumn}><span className={styles.vsMark}>VS</span></div>
          <FighterColumn fighter={f2} favorites={fight.fighter2_favorites} rankInfo={f2Rank} formatRecord={formatRecord} />
        </div>
      </div>

      <div className={styles.desktopStatStrip}>
        {stats.map((stat, idx) => {
          const { aBetter, bBetter } = betterValue(stat.f1, stat.f2);
          return (
            <div key={idx} className={styles.desktopStatItem}>
              <div className={styles.desktopStatLabel}>{stat.label}</div>
              <div className={styles.desktopStatValue}>
                <span className={aBetter ? styles.better : ''}>{stat.f1}</span>
                <span className={styles.desktopStatSep}>&middot;</span>
                <span className={bBetter ? styles.better : ''}>{stat.f2}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.desktopHistoryGrid}>
        {[{ fighter: f1, fights: recentF1 }, { fighter: f2, fights: recentF2 }].map(({ fighter, fights }, idx) => (
          <div key={idx}>
            <div className={styles.desktopHistoryLabel}>{fighter.name}, last 3</div>
            {fights.map((f, i) => (
              <div key={i} className={`${styles.fightResult} ${styles[f.result?.toLowerCase() || '']}`}>
                <span className={styles.resultIndicator}>{f.result?.charAt(0)?.toUpperCase() || '?'}</span>
                <span>{f.opponent || 'Unknown'}</span>
                <span className={styles.method}>{f.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                <span className={styles.fightDate}>{formatFightDate(f.fight_date)}</span>
              </div>
            ))}
            {fights.length === 0 && <div className={styles.noFights}>No recent fights</div>}
          </div>
        ))}
      </div>

      <button className={styles.compareLink} onClick={() => onOpenFullComparison(fight)}>
        Full stat breakdown &rarr;
      </button>
    </div>
  );
};
