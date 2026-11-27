import React from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from '../../styles/Events.module.css';
import { getRecentFights } from '../../utils/eventHelpers';
import { getStrikePlacement, POSITION_LABELS, TARGET_LABELS } from '../../utils/eventsDesktopHelpers';

const SILHOUETTE_SHAPES = [
  { tag: 'circle', props: { cx: 30, cy: 14, r: 11 } },
  { tag: 'rect', props: { x: 12, y: 28, width: 36, height: 44, rx: 8 } },
  { tag: 'rect', props: { x: 2, y: 30, width: 10, height: 34, rx: 5 } },
  { tag: 'rect', props: { x: 48, y: 30, width: 10, height: 34, rx: 5 } },
  { tag: 'rect', props: { x: 14, y: 72, width: 14, height: 58, rx: 6 } },
  { tag: 'rect', props: { x: 32, y: 72, width: 14, height: 58, rx: 6 } },
];

// Maps each silhouette shape above to the target-placement region it
// represents, so its fill-opacity can reflect that region's share of
// total strikes (darker = more concentrated), matching the reference
// UFC.com "sig. str. by target" graphic.
const SHAPE_REGION_INDEX = [0, 1, 1, 1, 2, 2]; // head, body, body, body (torso+arms), leg, leg

const BodySilhouette = ({ targetPlacement, fillClass }) => (
  <svg viewBox="0 0 60 150" aria-hidden="true">
    <g className={styles.silBase}>
      {SILHOUETTE_SHAPES.map((shape, i) => React.createElement(shape.tag, { key: i, ...shape.props }))}
    </g>
    <g className={fillClass}>
      {SILHOUETTE_SHAPES.map((shape, i) => {
        const region = targetPlacement[SHAPE_REGION_INDEX[i]];
        const opacity = Math.max((region?.pct || 0) / 100, 0.08);
        return React.createElement(shape.tag, { key: i, ...shape.props, fillOpacity: opacity });
      })}
    </g>
  </svg>
);

const PositionColumn = ({ fighter, barFillClass }) => {
  const position = getStrikePlacement(fighter, 'sig_strikes_by_position', POSITION_LABELS);
  return (
    <div className={styles.placementCol}>
      {position.map((item) => (
        <div key={item.label}>
          <div className={styles.placementItemTop}><span>{item.label}</span><b>{item.pct}%</b></div>
          <div className={styles.placementBar}>
            <div className={barFillClass} style={{ width: `${item.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const TargetColumn = ({ fighter, silhouetteFillClass }) => {
  const target = getStrikePlacement(fighter, 'sig_strikes_by_target', TARGET_LABELS);
  return (
    <div className={styles.silhouetteCol}>
      <BodySilhouette targetPlacement={target} fillClass={silhouetteFillClass} />
      <div className={styles.targetList}>
        {target.map((item) => (
          <div key={item.label} className={styles.targetRow}>
            <span className={styles.targetRegion}>{item.label}</span>
            <span className={styles.targetLeader} />
            <span className={styles.targetCount}>{item.count}</span>
            <span className={styles.targetPct}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const LastFightsColumn = ({ fighter }) => {
  const recentFights = getRecentFights(fighter, 5);
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

const FightBreakdownPanel = ({ fight, onBack }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;

  return (
    <div className={styles.cmpCard}>
      <button type="button" className={styles.breakdownBack} onClick={onBack}>
        <ArrowLeft size={14} /> Back to comparison
      </button>
      <div className={styles.cmpGrid}>
        <div className={styles.cmpName}>{f1.name}</div>
        <div className={styles.cmpName}>{f2.name}</div>

        <div className={styles.cmpSection}>Where strikes land · position</div>
        <div className={styles.placementWrap}>
          <PositionColumn fighter={f1} barFillClass={styles.placementBarFill} />
          <PositionColumn fighter={f2} barFillClass={styles.placementBarFillAlt} />
        </div>

        <div className={styles.cmpSection}>Where strikes land · target</div>
        <div className={styles.placementWrap}>
          <TargetColumn fighter={f1} silhouetteFillClass={styles.silFillGold} />
          <TargetColumn fighter={f2} silhouetteFillClass={styles.silFillPersonal} />
        </div>

        <div className={styles.cmpSection}>Last 5 fights</div>
        <LastFightsColumn fighter={f1} />
        <LastFightsColumn fighter={f2} />
      </div>
    </div>
  );
};

export default FightBreakdownPanel;
