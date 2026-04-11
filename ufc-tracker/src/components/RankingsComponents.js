import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { formatDate } from '../utils/eventHelpers';

/**
 * Display rank change indicator with icon and value
 */
export const RankChangeIcon = ({ change }) => {
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

/**
 * Modal to display upcoming fight details
 */
export const FightModal = ({ fight, onClose }) => {
  if (!fight) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Fight Details</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-3">
          <div>
            <span className="font-medium text-gray-900">Event:</span>
            <span className="ml-2 text-gray-700">{fight.event}</span>
          </div>
          <div>
            <span className="font-medium text-gray-900">Date:</span>
            <span className="ml-2 text-gray-700">{formatDate(fight.event_date)}</span>
          </div>
          <div>
            <span className="font-medium text-gray-900">Fighters:</span>
            <span className="ml-2 text-gray-700">{fight.fighter1} vs {fight.fighter2}</span>
          </div>
          {fight.weight_class && (
            <div>
              <span className="font-medium text-gray-900">Weight Class:</span>
              <span className="ml-2 text-gray-700">{fight.weight_class}</span>
            </div>
          )}
          {fight.location && (
            <div>
              <span className="font-medium text-gray-900">Location:</span>
              <span className="ml-2 text-gray-700">{fight.location}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};