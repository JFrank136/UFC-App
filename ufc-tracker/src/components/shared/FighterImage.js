import React from 'react';

const FighterImage = ({
  fighter,
  size = 'medium',
  className = '',
  showP4PBadge = false
}) => {
  const getSizeClass = () => {
    const sizes = {
      small: 'w-12 h-12',
      medium: 'w-24 h-24',
      large: 'w-32 h-32'
    };
    return sizes[size] || sizes.medium;
  };

  const getPlaceholder = () => {
    const initial = fighter?.name?.charAt(0) || '?';
    return `https://via.placeholder.com/120x120/cccccc/666666?text=${encodeURIComponent(initial)}`;
  };

  const hasP4PRank = () => {
    if (!showP4PBadge || !fighter?.rankings) return false;
    return fighter.rankings.some(r => r.division?.toLowerCase().includes('pound-for-pound'));
  };

  return (
    <div className={`fighter-image-wrapper ${className}`}>
      <img
        src={fighter?.image_url || fighter?.image_local_path || getPlaceholder()}
        alt={fighter?.name || 'Fighter'}
        className={`fighter-image ${getSizeClass()}`}
        onError={(e) => {
          e.target.src = getPlaceholder();
        }}
      />
      {hasP4PRank() && (
        <div className="p4p-badge">🥇</div>
      )}

      <style jsx>{`
        .fighter-image-wrapper {
          position: relative;
          display: inline-block;
        }

        .fighter-image {
          border-radius: 50%;
          object-fit: cover;
          object-position: center top;
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .p4p-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          font-size: 1.2rem;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }
      `}</style>
    </div>
  );
};

export default FighterImage;
