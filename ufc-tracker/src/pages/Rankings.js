import React, { useState, useEffect } from 'react';
import { Crown, TrendingUp, TrendingDown, Calendar, MapPin, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import supabase from '../api/supabaseClient';

const Rankings = () => {
  const [selectedDivision, setSelectedDivision] = useState('Pound-for-Pound');
  const [showMoversOnly, setShowMoversOnly] = useState(false);
  const [rankedFighters, setRankedFighters] = useState([]);
  const [upcomingFights, setUpcomingFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const divisions = [
    'Pound-for-Pound',
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
    "Women's Bantamweight"
  ];

  useEffect(() => {
    fetchData();
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
    const { data, error } = await supabase
      .from('rankings')
      .select(`
        *,
        fighters:uuid (
          id,
          name,
          nickname,
          country,
          wins_total,
          losses_total,
          image_url
        )
      `)
      .not('rank', 'eq', 'NR')
      .order('division')
      .order('rank');

    if (error) throw error;

    return data.map(ranking => ({
      ...ranking.fighters,
      division: ranking.division,
      rank: ranking.rank,
      change: ranking.change,
      country_code: getCountryCode(ranking.fighters.country)
    }));
  };

  const fetchUpcomingFights = async () => {
    const { data, error } = await supabase
      .from('upcoming_fights')
      .select('*')
      .order('event_date');

    if (error) throw error;
    return data;
  };

  // Create a mapping for country codes - you should move this to a separate file
  const getCountryCode = (country) => {
    const countryCodeMap = {
      'United States': 'US',
      'Brazil': 'BR',
      'Russia': 'RU',
      'Armenia': 'AM',
      'United Kingdom': 'GB',
      'Canada': 'CA',
      'Mexico': 'MX',
      'Australia': 'AU',
      'Ireland': 'IE',
      'Poland': 'PL',
      'Sweden': 'SE',
      'Norway': 'NO',
      'Netherlands': 'NL',
      'Germany': 'DE',
      'France': 'FR',
      'Spain': 'ES',
      'Italy': 'IT',
      'Japan': 'JP',
      'South Korea': 'KR',
      'China': 'CN',
      'New Zealand': 'NZ',
      'Argentina': 'AR',
      'Chile': 'CL',
      'Venezuela': 'VE',
      'Colombia': 'CO',
      'Peru': 'PE',
      'Ecuador': 'EC',
      'Uruguay': 'UY',
      'Kazakhstan': 'KZ',
      'Georgia': 'GE',
      'Ukraine': 'UA',
      'Belarus': 'BY',
      'Lithuania': 'LT',
      'Latvia': 'LV',
      'Estonia': 'EE',
      'Finland': 'FI',
      'Denmark': 'DK',
      'Austria': 'AT',
      'Switzerland': 'CH',
      'Belgium': 'BE',
      'Czech Republic': 'CZ',
      'Slovakia': 'SK',
      'Hungary': 'HU',
      'Romania': 'RO',
      'Bulgaria': 'BG',
      'Serbia': 'RS',
      'Croatia': 'HR',
      'Slovenia': 'SI',
      'Bosnia and Herzegovina': 'BA',
      'Montenegro': 'ME',
      'North Macedonia': 'MK',
      'Albania': 'AL',
      'Greece': 'GR',
      'Turkey': 'TR',
      'Cyprus': 'CY',
      'Malta': 'MT',
      'Portugal': 'PT',
      'Israel': 'IL',
      'Lebanon': 'LB',
      'Jordan': 'JO',
      'Syria': 'SY',
      'Iraq': 'IQ',
      'Iran': 'IR',
      'Afghanistan': 'AF',
      'Pakistan': 'PK',
      'India': 'IN',
      'Bangladesh': 'BD',
      'Sri Lanka': 'LK',
      'Nepal': 'NP',
      'Bhutan': 'BT',
      'Myanmar': 'MM',
      'Thailand': 'TH',
      'Laos': 'LA',
      'Cambodia': 'KH',
      'Vietnam': 'VN',
      'Malaysia': 'MY',
      'Singapore': 'SG',
      'Indonesia': 'ID',
      'Philippines': 'PH',
      'Mongolia': 'MN',
      'Taiwan': 'TW',
      'Hong Kong': 'HK',
      'Macau': 'MO',
      'North Korea': 'KP',
      'South Africa': 'ZA',
      'Egypt': 'EG',
      'Morocco': 'MA',
      'Algeria': 'DZ',
      'Tunisia': 'TN',
      'Libya': 'LY',
      'Sudan': 'SD',
      'Ethiopia': 'ET',
      'Kenya': 'KE',
      'Uganda': 'UG',
      'Tanzania': 'TZ',
      'Rwanda': 'RW',
      'Burundi': 'BI',
      'Democratic Republic of the Congo': 'CD',
      'Republic of the Congo': 'CG',
      'Central African Republic': 'CF',
      'Chad': 'TD',
      'Niger': 'NE',
      'Mali': 'ML',
      'Burkina Faso': 'BF',
      'Senegal': 'SN',
      'Gambia': 'GM',
      'Guinea-Bissau': 'GW',
      'Guinea': 'GN',
      'Sierra Leone': 'SL',
      'Liberia': 'LR',
      'Ivory Coast': 'CI',
      'Ghana': 'GH',
      'Togo': 'TG',
      'Benin': 'BJ',
      'Nigeria': 'NG',
      'Cameroon': 'CM',
      'Equatorial Guinea': 'GQ',
      'Gabon': 'GA',
      'Sao Tome and Principe': 'ST',
      'Angola': 'AO',
      'Zambia': 'ZM',
      'Malawi': 'MW',
      'Mozambique': 'MZ',
      'Madagascar': 'MG',
      'Mauritius': 'MU',
      'Comoros': 'KM',
      'Seychelles': 'SC',
      'Djibouti': 'DJ',
      'Eritrea': 'ER',
      'Somalia': 'SO',
      'Botswana': 'BW',
      'Namibia': 'NA',
      'Lesotho': 'LS',
      'Swaziland': 'SZ',
      'Zimbabwe': 'ZW'
    };
    
    return countryCodeMap[country] || null;
  };

  const parseRankChange = (changeText) => {
    if (!changeText) return null;
    
    // Handle special cases
    if (changeText.toLowerCase().includes('new') || changeText.toLowerCase().includes('debut')) {
      return 'NEW';
    }
    if (changeText.toLowerCase().includes('return')) {
      return 'RET';
    }
    if (changeText.toLowerCase().includes('interim')) {
      return 'INTERIM';
    }
    
    // Extract numeric changes
    const increaseMatch = changeText.match(/increased by (\d+)/i);
    if (increaseMatch) {
      return parseInt(increaseMatch[1]);
    }
    
    const decreaseMatch = changeText.match(/decreased by (\d+)/i);
    if (decreaseMatch) {
      return -parseInt(decreaseMatch[1]);
    }
    
    // Look for +/- patterns
    const plusMatch = changeText.match(/\+(\d+)/);
    if (plusMatch) {
      return parseInt(plusMatch[1]);
    }
    
    const minusMatch = changeText.match(/-(\d+)/);
    if (minusMatch) {
      return -parseInt(minusMatch[1]);
    }
    
    return 0;
  };

  const getRankedFighters = () => {
    return rankedFighters
      .filter(fighter => fighter.division === selectedDivision)
      .map(fighter => {
        const upcomingFight = upcomingFights.find(
          fight => fight.fighter1_id === fighter.id || fight.fighter2_id === fighter.id
        );
        
        return {
          ...fighter,
          parsedChange: parseRankChange(fighter.change),
          upcomingFight
        };
      })
      .sort((a, b) => {
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank) - parseInt(b.rank);
      });
  };

  const getAllMovers = () => {
    return rankedFighters
      .filter(fighter => {
        const parsedChange = parseRankChange(fighter.change);
        return parsedChange !== null && parsedChange !== 0;
      })
      .map(fighter => {
        const upcomingFight = upcomingFights.find(
          fight => fight.fighter1_id === fighter.id || fight.fighter2_id === fighter.id
        );
        
        return {
          ...fighter,
          parsedChange: parseRankChange(fighter.change),
          upcomingFight
        };
      })
      .sort((a, b) => {
        // Sort by division order, then by rank
        const divisionOrder = divisions.indexOf(a.division) - divisions.indexOf(b.division);
        if (divisionOrder !== 0) return divisionOrder;
        
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank) - parseInt(b.rank);
      });
  };

  const getFilteredFighters = () => {
    if (showMoversOnly) return getAllMovers();
    return getRankedFighters();
  };

  const getCountryFlag = (countryCode) => {
    if (!countryCode) return null;
    return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;
  };

  const getRankChangeIcon = (change) => {
    if (!change || change === 0) return <Minus className="w-4 h-4 text-gray-400" />;
    if (change === 'NEW') return <span className="text-green-600 font-semibold text-sm">NEW</span>;
    if (change === 'RET') return <span className="text-blue-600 font-semibold text-sm">RET</span>;
    if (change === 'INTERIM') return <span className="text-purple-600 font-semibold text-sm">INT</span>;
    if (change > 0) return (
      <div className="flex items-center text-green-600">
        <ArrowUp className="w-4 h-4" />
        <span className="text-sm font-semibold">{change}</span>
      </div>
    );
    return (
      <div className="flex items-center text-red-600">
        <ArrowDown className="w-4 h-4" />
        <span className="text-sm font-semibold">{Math.abs(change)}</span>
      </div>
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredFighters = getFilteredFighters();

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-600 text-sm">{error}</div>
          <button
            onClick={fetchData}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">UFC Rankings</h1>
        <p className="text-gray-600">Official UFC fighter rankings updated weekly</p>
      </div>

      {/* Controls */}
      <div className="mb-6 space-y-4">
        {/* Division Selector */}
        <div className="overflow-x-auto">
          <div className="flex space-x-2 pb-2 min-w-max">
            {divisions.map(division => (
              <button
                key={division}
                onClick={() => setSelectedDivision(division)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedDivision === division
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {division}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowMoversOnly(!showMoversOnly)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showMoversOnly
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>{showMoversOnly ? 'All Movers' : 'Movers Only'}</span>
          </button>
          
          <div className="text-sm text-gray-500">
            {filteredFighters.length} {showMoversOnly ? 'movement' : 'fighter'}{filteredFighters.length !== 1 ? 's' : ''}
            {showMoversOnly && ' across all divisions'}
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rank
              </th>
              {showMoversOnly && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fighter
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Record
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Country
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Change
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Next Fight
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredFighters.map((fighter, index) => (
              <tr key={`${fighter.id}-${fighter.division}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {fighter.rank === 'C' ? (
                      <div className="flex items-center space-x-2">
                        <Crown className="w-5 h-5 text-yellow-500" />
                        <span className="font-bold text-yellow-600">C</span>
                      </div>
                    ) : (
                      <span className="text-lg font-semibold text-gray-900">
                        #{fighter.rank}
                      </span>
                    )}
                  </div>
                </td>
                {showMoversOnly && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {fighter.division}
                    </span>
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <img
                      src={fighter.image_url}
                      alt={fighter.name}
                      className="w-12 h-12 rounded-full object-cover mr-4"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/48x48/gray/white?text=' + fighter.name.charAt(0);
                      }}
                    />
                    <div>
                      <div className="text-base font-semibold text-gray-900">
                        {fighter.name}
                      </div>
                      {fighter.nickname && (
                        <div className="text-sm text-gray-500">
                          "{fighter.nickname}"
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">
                    {fighter.wins_total}-{fighter.losses_total}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    {fighter.country_code && (
                      <img
                        src={getCountryFlag(fighter.country_code)}
                        alt={fighter.country}
                        className="w-5 h-3 object-cover rounded-sm"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    <span className="text-sm text-gray-900">{fighter.country}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getRankChangeIcon(fighter.parsedChange)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {fighter.upcomingFight ? (
                    <div className="flex items-center space-x-2 text-sm">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      <div>
                        <div className="text-gray-900 font-medium">
                          {fighter.upcomingFight.event}
                        </div>
                        <div className="text-gray-500">
                          {formatDate(fighter.upcomingFight.event_date)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">No fight scheduled</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {filteredFighters.map((fighter, index) => (
          <div key={`${fighter.id}-${fighter.division}`} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                {fighter.rank === 'C' ? (
                  <div className="flex items-center space-x-1">
                    <Crown className="w-5 h-5 text-yellow-500" />
                    <span className="font-bold text-yellow-600 text-lg">C</span>
                  </div>
                ) : (
                  <span className="text-lg font-bold text-gray-900">
                    #{fighter.rank}
                  </span>
                )}
                <img
                  src={fighter.image_url}
                  alt={fighter.name}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/40x40/gray/white?text=' + fighter.name.charAt(0);
                  }}
                />
                {showMoversOnly && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                    {fighter.division}
                  </span>
                )}
              </div>
              {getRankChangeIcon(fighter.parsedChange)}
            </div>
            
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-gray-900">{fighter.name}</h3>
              {fighter.nickname && (
                <p className="text-sm text-gray-500">"{fighter.nickname}"</p>
              )}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-2">
                  {fighter.country_code && (
                    <img
                      src={getCountryFlag(fighter.country_code)}
                      alt={fighter.country}
                      className="w-4 h-3 object-cover rounded-sm"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <span className="text-sm text-gray-600">{fighter.country}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {fighter.wins_total}-{fighter.losses_total}
                </span>
              </div>
            </div>

            {fighter.upcomingFight && (
              <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
                <Calendar className="w-4 h-4 text-blue-500" />
                <div className="text-sm">
                  <div className="text-blue-900 font-medium">
                    {fighter.upcomingFight.event}
                  </div>
                  <div className="text-blue-700">
                    {formatDate(fighter.upcomingFight.event_date)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredFighters.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">
            {showMoversOnly 
              ? 'No ranking changes across all divisions' 
              : 'No ranked fighters found in this division'
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default Rankings;