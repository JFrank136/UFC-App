import { groupFightsBySection } from './eventHelpers';

const fight = (card_section, fight_order) => ({ card_section, fight_order });

describe('groupFightsBySection', () => {
  const grouped = groupFightsBySection([
    fight('Main Event', 14),
    fight('Co-Main', 13),
    fight('Main Card', 12),
    fight('Prelim', 9),
    fight('Early Prelims', 4),
    fight('Early Prelims', 3),
  ]);

  it('keeps main event and co-main on the main card', () => {
    expect(grouped['Main Card'].map(f => f.card_section)).toEqual(['Main Event', 'Co-Main', 'Main Card']);
  });

  it('separates prelims from early prelims', () => {
    expect(grouped['Preliminary Card']).toHaveLength(1);
    expect(grouped['Early Prelims']).toHaveLength(2);
  });

  it('sorts each section with the later fight first', () => {
    expect(grouped['Early Prelims'].map(f => f.fight_order)).toEqual([4, 3]);
  });

  it('puts an unrecognised section in prelims rather than early prelims', () => {
    expect(groupFightsBySection([fight('Unknown', 1)])['Preliminary Card']).toHaveLength(1);
  });
});
