// src/components/NavBar.js - FINAL CLEAN VERSION
import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";

const NavBar = () => {
  const [isUFCDropdownOpen, setIsUFCDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const [buttonPosition, setButtonPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update button position when dropdown opens
  useEffect(() => {
    if (isUFCDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonPosition({
        top: rect.bottom + window.scrollY,
        left: rect.right - 160 + window.scrollX, // Align to right edge
        width: rect.width
      });
    }
  }, [isUFCDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && 
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsUFCDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleDropdownToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsUFCDropdownOpen(!isUFCDropdownOpen);
  };

  const handleMouseEnter = () => {
    if (window.innerWidth > 768) {
      setIsUFCDropdownOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (window.innerWidth > 768) {
      // Add a small delay to prevent flicker
      setTimeout(() => {
        if (!dropdownRef.current?.matches(':hover') && !buttonRef.current?.matches(':hover')) {
          setIsUFCDropdownOpen(false);
        }
      }, 100);
    }
  };

  // Portal dropdown component
  const DropdownPortal = () => {
    if (!isUFCDropdownOpen) return null;

    const dropdownMenuStyle = {
      position: 'absolute',
      top: `${buttonPosition.top + 8}px`,
      left: `${buttonPosition.left}px`,
      background: '#1f2937',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
      minWidth: '160px',
      width: '160px',
      zIndex: 999999,
      whiteSpace: 'nowrap',
      opacity: 1,
      visibility: 'visible',
      transform: 'translateY(0)',
      transition: 'all 0.2s ease',
      pointerEvents: 'auto',
      padding: '0.5rem 0',
      backdropFilter: 'blur(10px)'
    };

    const dropdownLinkStyle = {
      display: 'block',
      padding: '0.75rem 1rem',
      color: '#ffffff',
      textDecoration: 'none',
      fontWeight: '500',
      fontSize: '0.9rem',
      transition: 'all 0.2s ease',
      borderRadius: '6px',
      margin: '0.25rem',
      background: 'transparent'
    };

    return createPortal(
      <div 
        ref={dropdownRef}
        style={dropdownMenuStyle}
        onMouseEnter={() => {
          if (window.innerWidth > 768) {
            setIsUFCDropdownOpen(true);
          }
        }}
        onMouseLeave={handleMouseLeave}
      >
        <Link 
          to="/rankings" 
          style={dropdownLinkStyle}
          onClick={() => setIsUFCDropdownOpen(false)}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.1)';
            e.target.style.color = '#60a5fa';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#ffffff';
          }}
        >
          Rankings
        </Link>
        
        <Link 
          to="/stats" 
          style={dropdownLinkStyle}
          onClick={() => setIsUFCDropdownOpen(false)}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.1)';
            e.target.style.color = '#60a5fa';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#ffffff';
          }}
        >
          Stats
        </Link>
      </div>,
      document.body
    );
  };

  // Mobile backdrop portal
  const BackdropPortal = () => {
    if (!isUFCDropdownOpen || window.innerWidth > 768) return null;

    const mobileDropdownStyle = {
      position: 'fixed',
      top: '60px',
      left: '1rem',
      right: '1rem',
      background: '#1f2937',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
      zIndex: 999999,
      maxHeight: '250px',
      overflowY: 'auto',
      animation: 'slideUp 0.3s ease-out'
    };

    const mobileDropdownLinkStyle = {
      display: 'block',
      padding: '1rem',
      color: '#ffffff',
      textDecoration: 'none',
      fontWeight: '500',
      fontSize: '1rem',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      margin: 0,
      borderRadius: 0,
      background: 'transparent'
    };

    return createPortal(
      <>
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999998
          }}
          onClick={() => setIsUFCDropdownOpen(false)}
        />
        <div ref={dropdownRef} style={mobileDropdownStyle}>
          <Link 
            to="/rankings" 
            style={{...mobileDropdownLinkStyle, borderRadius: '12px 12px 0 0'}}
            onClick={() => setIsUFCDropdownOpen(false)}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
            }}
          >
            Rankings
          </Link>
          
          <Link 
            to="/stats" 
            style={{...mobileDropdownLinkStyle, borderRadius: '0 0 12px 12px', borderBottom: 'none'}}
            onClick={() => setIsUFCDropdownOpen(false)}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
            }}
          >
            Stats
          </Link>
        </div>
      </>,
      document.body
    );
  };

  return (
    <>
      <nav style={{
        width: '100%',
        margin: 0,
        background: 'linear-gradient(to right, #1f2937, #111827)',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        zIndex: 1000,
        overflow: 'visible',
        minHeight: '60px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          padding: '1rem',
          overflowX: 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          position: 'relative',
          minHeight: '44px'
        }}>
          <Link to="/" style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            transition: 'all 0.3s ease',
            textDecoration: 'none',
            fontWeight: '500',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: 'fit-content',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}>Search</Link>
          
          <Link to="/favorites" style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            transition: 'all 0.3s ease',
            textDecoration: 'none',
            fontWeight: '500',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: 'fit-content',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}>Favorites</Link>
          
          <Link to="/upcoming" style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            transition: 'all 0.3s ease',
            textDecoration: 'none',
            fontWeight: '500',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: 'fit-content',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}>Upcoming</Link>
          
          <Link to="/events" style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            transition: 'all 0.3s ease',
            textDecoration: 'none',
            fontWeight: '500',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: 'fit-content',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}>Events</Link>
          
          <Link to="/picks" style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            transition: 'all 0.3s ease',
            textDecoration: 'none',
            fontWeight: '500',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: 'fit-content',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}>🎯 Picks</Link>
          
          <div 
            style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button 
              ref={buttonRef}
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: '8px',
                transition: 'all 0.3s ease',
                textDecoration: 'none',
                fontWeight: '500',
                color: '#ffffff',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: 'fit-content',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.95rem'
              }}
              onClick={handleDropdownToggle}
              type="button"
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'none';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              UFC
              <svg 
                style={{
                  transition: 'transform 0.3s ease',
                  transform: isUFCDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                }}
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <polyline points="6,9 12,15 18,9"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Desktop dropdown portal */}
      {window.innerWidth > 768 && <DropdownPortal />}
      
      {/* Mobile dropdown portal */}
      {window.innerWidth <= 768 && <BackdropPortal />}

      {/* CSS for mobile animation */}
      <style>
        {`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </>
  );
};

export default NavBar;