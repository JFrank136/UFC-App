import React from 'react';
import countryCodes from '../../utils/countryCodes';
import { formatRecord } from '../../utils/formatters';

const FighterInfo = ({
  fighter,
  showNickname = true,
  showCountry = true,
  showRecord = true,
  className = '',
  align = 'center'
}) => {
  if (!fighter) return null;

  const getCountryFlag = (country) => {
    return countryCodes[country] || '🏴';
  };

  return (
    <div className={`fighter-info ${align} ${className}`}>
      <h3 className="fighter-name">{fighter.name || 'Unknown Fighter'}</h3>

      {showNickname && fighter.nickname && (
        <p className="fighter-nickname">"{fighter.nickname}"</p>
      )}

      {showCountry && fighter.country && (
        <div className="fighter-country">
          <span className="flag">{getCountryFlag(fighter.country)}</span>
          <span className="country-name">{fighter.country}</span>
        </div>
      )}

      {showRecord && (
        <div className="fighter-record">{formatRecord(fighter)}</div>
      )}

      <style jsx>{`
        .fighter-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .fighter-info.center {
          text-align: center;
          align-items: center;
        }

        .fighter-info.left {
          text-align: left;
          align-items: flex-start;
        }

        .fighter-info.right {
          text-align: right;
          align-items: flex-end;
        }

        .fighter-name {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 0;
          line-height: 1.2;
        }

        .fighter-nickname {
          font-style: italic;
          opacity: 0.6;
          font-size: 0.85rem;
          margin: 0;
        }

        .fighter-country {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.7;
          font-size: 0.85rem;
        }

        .flag {
          font-size: 1.1rem;
        }

        .country-name {
          font-weight: 500;
        }

        .fighter-record {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  );
};

export default FighterInfo;
