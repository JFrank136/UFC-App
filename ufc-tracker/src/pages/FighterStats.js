import React, { useState, useEffect } from 'react';
import supabase from '../api/supabaseClient';

const FighterStats = () => {
  const [fighters, setFighters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStat, setSelectedStat] = useState('strikes_landed_per_min');
  const [selectedGender, setSelectedGender] = useState('Male');
  const [minFights, setMinFights] = useState(3);

  const statsConfig = {
    strikes_landed_per_min: { label: 'Strikes Landed/Min', format: (val) => val?.toFixed(2) || '0.00', higherBetter: true },
    absorbed_per_min: { label: 'Strikes Absorbed/Min', format: (val) => val?.toFixed(2) || '0.00', higherBetter: false },
    takedown_avg: { label: 'Takedown Average', format: (val) => val?.toFixed(2) || '0.00', higherBetter: true },
    submission_avg: { label: 'Submission Average', format: (val) => val?.toFixed(2) || '0.00', higherBetter: true },
    striking_defense: { label: 'Striking Defense', format: (val) => val ? `${(val * 100).toFixed(1)}%` : '0.0%', higherBetter: true },
    knockdown_avg: { label: 'Knockdown Average', format: (val) => val?.toFixed(2) || '0.00', higherBetter: true },
    avg_fight_time: { label: 'Avg Fight Time (min)', format: (val) => val?.toFixed(1) || '0.0', higherBetter: true },
    wins_ko: { label: 'KO/TKO Wins', format: (val) => val || 0, higherBetter: true },
    wins_sub: { label: 'Submission Wins', format: (val) => val || 0, higherBetter: true },
    wins_dec: { label: 'Decision Wins', format: (val) => val || 0, higherBetter: true },
    losses_ko: { label: 'KO/TKO Losses', format: (val) => val || 0, higherBetter: false },
    losses_sub: { label: 'Submission Losses', format: (val) => val || 0, higherBetter: false },
    losses_dec: { label: 'Decision Losses', format: (val) => val || 0, higherBetter: false }
  };

  useEffect(() => {
    fetchFighters();
  }, []);

  const fetchFighters = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('fighters')
        .select('*');
      
      if (error) throw error;
      setFighters(data || []);
    } catch (error) {
      console.error('Error fetching fighters:', error);
    } finally {
      setLoading(false);
    }
  };

  const inferGender = (weightClass) => {
    if (!weightClass) return 'Unknown';
    return weightClass.toLowerCase().includes("women's") || weightClass.toLowerCase().includes('women') ? 'Female' : 'Male';
  };

  const getFilteredFighters = () => {
    return fighters.filter(fighter => {
      // Filter by minimum fights
      const totalFights = (fighter.wins_total || 0) + (fighter.losses_total || 0);
      if (totalFights < minFights) return false;

      // Filter by gender
      if (selectedGender !== 'All') {
        const fighterGender = inferGender(fighter.weight_class);
        if (fighterGender !== selectedGender) return false;
      }

      // Filter by valid stat value
      const statValue = fighter[selectedStat];
      return statValue !== null && statValue !== undefined && statValue !== 0;
    });
  };

  const getTopFighters = (filteredFighters, count = 5) => {
    const config = statsConfig[selectedStat];
    return [...filteredFighters]
      .sort((a, b) => {
        const aVal = a[selectedStat] || 0;
        const bVal = b[selectedStat] || 0;
        return config.higherBetter ? bVal - aVal : aVal - bVal;
      })
      .slice(0, count);
  };

  const getBottomFighters = (filteredFighters, count = 5) => {
    const config = statsConfig[selectedStat];
    return [...filteredFighters]
      .sort((a, b) => {
        const aVal = a[selectedStat] || 0;
        const bVal = b[selectedStat] || 0;
        return config.higherBetter ? aVal - bVal : bVal - aVal;
      })
      .slice(0, count);
  };

  const getTopByDivision = (filteredFighters) => {
    const byDivision = {};
    filteredFighters.forEach(fighter => {
      const division = fighter.weight_class || 'Unknown';
      if (!byDivision[division]) byDivision[division] = [];
      byDivision[division].push(fighter);
    });

    const result = {};
    Object.keys(byDivision).forEach(division => {
      result[division] = getTopFighters(byDivision[division], 5);
    });

    return result;
  };

  const getBottomByDivision = (filteredFighters) => {
    const byDivision = {};
    filteredFighters.forEach(fighter => {
      const division = fighter.weight_class || 'Unknown';
      if (!byDivision[division]) byDivision[division] = [];
      byDivision[division].push(fighter);
    });

    const result = {};
    Object.keys(byDivision).forEach(division => {
      if (byDivision[division].length >= 5) { // Only show bottom 5 if division has enough fighters
        result[division] = getBottomFighters(byDivision[division], 5);
      }
    });

    return result;
  };

  const FighterCard = ({ fighter, rank, showRank = true }) => (
    <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer"
         onClick={() => fighter.profile_url_ufc && window.open(fighter.profile_url_ufc, '_blank')}>
      <div className="flex items-center space-x-3">
        {showRank && (
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
            {rank}
          </div>
        )}
        {fighter.image_url && (
          <img 
            src={fighter.image_url} 
            alt={fighter.name}
            className="w-12 h-12 rounded-full object-cover"
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {fighter.name}
            {fighter.nickname && <span className="text-gray-500 text-sm ml-1">"{fighter.nickname}"</span>}
          </h3>
          <p className="text-sm text-gray-600">{fighter.weight_class}</p>
          <p className="text-lg font-bold text-blue-600">
            {statsConfig[selectedStat].format(fighter[selectedStat])}
          </p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading fighter stats...</p>
        </div>
      </div>
    );
  }

  const filteredFighters = getFilteredFighters();
  const overallTop = getTopFighters(filteredFighters);
  const overallBottom = getBottomFighters(filteredFighters);
  const topByDivision = getTopByDivision(filteredFighters);
  const bottomByDivision = getBottomByDivision(filteredFighters);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">UFC Fighter Statistics</h1>
          <p className="text-gray-600">Analyze performance across divisions</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadows-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Stat Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Statistic</label>
              <select
                value={selectedStat}
                onChange={(e) => setSelectedStat(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(statsConfig).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>

            {/* Gender Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <div className="flex space-x-2">
                {['Male', 'Female', 'All'].map(gender => (
                  <button
                    key={gender}
                    onClick={() => setSelectedGender(gender)}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      selectedGender === gender
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>

            {/* Min Fights Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Fights</label>
              <input
                type="number"
                value={minFights}
                onChange={(e) => setMinFights(parseInt(e.target.value) || 0)}
                min="0"
                max="20"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Overall Top 5 */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Overall Top 5 - {statsConfig[selectedStat].label}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {overallTop.map((fighter, index) => (
              <FighterCard key={fighter.id} fighter={fighter} rank={index + 1} />
            ))}
          </div>
        </div>

        {/* Overall Bottom 5 */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Overall Bottom 5 - {statsConfig[selectedStat].label}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {overallBottom.map((fighter, index) => (
              <FighterCard key={fighter.id} fighter={fighter} rank={index + 1} />
            ))}
          </div>
        </div>

        {/* Top 5 by Division */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Top 5 by Division</h2>
          {Object.entries(topByDivision).map(([division, divisionFighters]) => (
            <div key={division} className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">{division}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {divisionFighters.map((fighter, index) => (
                  <FighterCard key={fighter.id} fighter={fighter} rank={index + 1} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom 5 by Division */}
        {Object.keys(bottomByDivision).length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Bottom 5 by Division</h2>
            {Object.entries(bottomByDivision).map(([division, divisionFighters]) => (
              <div key={division} className="mb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-3">{division}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {divisionFighters.map((fighter, index) => (
                    <FighterCard key={fighter.id} fighter={fighter} rank={index + 1} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Statistics Summary</h3>
          <p className="text-gray-600">
            Showing {filteredFighters.length} fighters with at least {minFights} fights for {selectedGender.toLowerCase()} divisions
          </p>
        </div>
      </div>
    </div>
  );
};

export default FighterStats;