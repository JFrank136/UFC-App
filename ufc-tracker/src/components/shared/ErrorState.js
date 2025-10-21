import React from 'react';
import { AlertCircle } from 'lucide-react';

const ErrorState = ({
  title = 'Error Loading Data',
  message = 'Something went wrong. Please try again.',
  onRetry,
  darkMode = true
}) => {
  return (
    <div className={`error-container ${darkMode ? 'dark' : 'light'}`}>
      <div className="error-icon">
        <AlertCircle size={48} />
      </div>
      <h3 className="error-title">{title}</h3>
      <p className="error-message">{message}</p>
      {onRetry && (
        <button className="retry-btn" onClick={onRetry}>
          Try Again
        </button>
      )}

      <style jsx>{`
        .error-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          padding: 2rem;
        }

        .error-container.dark {
          background: linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #2d2d2d 100%);
          color: #ffffff;
        }

        .error-container.light {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%);
          color: #1a1a1a;
        }

        .error-icon {
          color: #ef4444;
          margin-bottom: 1rem;
        }

        .error-title {
          color: #ef4444;
          margin-bottom: 1rem;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .error-message {
          opacity: 0.7;
          margin-bottom: 2rem;
          max-width: 500px;
        }

        .retry-btn {
          background: #ef4444;
          color: #fff;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .retry-btn:hover {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
      `}</style>
    </div>
  );
};

export default ErrorState;
