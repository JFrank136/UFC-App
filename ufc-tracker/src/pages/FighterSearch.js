import React, { useState, useEffect } from "react";

function FighterSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState("");

  const API_BASE = "https://ufc-app-58c5.onrender.com";

  useEffect(() => {
    fetch("/api/favorites")
      .then(res => res.json())
      .then(data => setFavorites(data))
      .catch(err => console.error("Error fetching favorites:", err));
  }, []);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setSearchLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/search?query=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("Network response was not OK");

      const data = await res.json();
      // dedupe by stringifying
      const uniqueResults = Array.from(
        new Set(data.map((f) => JSON.stringify(f)))
      ).map((str) => JSON.parse(str));

      setResults(uniqueResults);
    } catch (err) {
      console.error("Search error:", err);
      setError("Failed to fetch fighters.");
    } finally {
      setSearchLoading(false);
    }
  };

  function addToFavorites(fighter) {
    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fighter.name }),
    })
      .then(res => res.json())
      .then(data => setFavorites(data))
      .catch(err => console.error("Error adding favorite:", err));
  }

  function removeFromFavorites(name) {
    fetch("/api/favorites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then(res => res.json())
      .then(data => setFavorites(data))
      .catch(err => console.error("Error removing favorite:", err));
  }

  const formatFighterName = (fullName) => {
    const nicknameMatch = fullName.match(/"([^"]+)"/);
    const nickname = nicknameMatch ? nicknameMatch[1] : null;
    const nameWithoutNickname = fullName.replace(/"[^"]+"/, "").trim();
    return nickname ? `${nameWithoutNickname} (${nickname})` : nameWithoutNickname;
  };

  const getLastName = (fullName) => {
    const nameWithoutNickname = fullName.replace(/"[^"]+"/, "").trim();
    const nameParts = nameWithoutNickname.split(" ");
    return nameParts.length > 1
      ? nameParts[nameParts.length - 1].toLowerCase()
      : nameWithoutNickname.toLowerCase();
  };

  const isFavorite = (name) => {
    return favorites.some(fav => fav.name === name);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Simple CSS styles as an object
  const styles = {
    container: {
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
    },
    pageTitle: {
      fontSize: "26px",
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: "25px",
      color: "#333"
    },
    contentWrapper: {
      display: "flex",
      flexDirection: "row",
      gap: "20px",
      flexWrap: "wrap"
    },
    searchColumn: {
      flex: "2",
      minWidth: "300px",
      padding: "20px",
      backgroundColor: "white",
      borderRadius: "8px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    },
    favoritesColumn: {
      flex: "1",
      minWidth: "250px",
      padding: "20px",
      backgroundColor: "white",
      borderRadius: "8px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    },
    sectionTitle: {
      fontSize: "20px",
      fontWeight: "600",
      marginBottom: "15px",
      color: "#444",
      display: "flex",
      alignItems: "center"
    },
    searchForm: {
      marginBottom: "20px",
      display: "flex"
    },
    searchInput: {
      flex: "1",
      padding: "10px 12px",
      fontSize: "16px",
      border: "1px solid #ccc",
      borderRight: "none",
      borderRadius: "4px 0 0 4px",
      outline: "none"
    },
    button: {
      padding: "10px 16px",
      backgroundColor: "#3b82f6",
      color: "white",
      border: "none",
      borderRadius: "0 4px 4px 0",
      cursor: "pointer",
      fontSize: "16px",
      fontWeight: "500",
      transition: "background-color 0.2s"
    },
    disabledButton: {
      backgroundColor: "#93c5fd",
      cursor: "not-allowed"
    },
    removeButton: {
      padding: "5px 10px",
      backgroundColor: "#fee2e2",
      color: "#dc2626",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      transition: "background-color 0.2s"
    },
    favoritedButton: {
      padding: "5px 10px",
      backgroundColor: "#d1fae5",
      color: "#059669",
      border: "none",
      borderRadius: "4px",
      cursor: "not-allowed",
      fontSize: "14px"
    },
    addButton: {
      padding: "5px 10px",
      backgroundColor: "#f3f4f6",
      color: "#4b5563",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      transition: "background-color 0.2s"
    },
    resultsTitle: {
      fontSize: "18px",
      fontWeight: "500",
      marginBottom: "10px",
      marginTop: "20px",
      color: "#444"
    },
    listItem: {
      padding: "12px 0",
      borderBottom: "1px solid #e5e7eb",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    link: {
      color: "#2563eb",
      textDecoration: "none",
      fontWeight: "500"
    },
    errorMessage: {
      padding: "10px",
      backgroundColor: "#fee2e2",
      color: "#dc2626",
      borderRadius: "4px",
      marginBottom: "15px"
    },
    emptyText: {
      color: "#6b7280",
      fontStyle: "italic"
    },
    heartIcon: {
      marginRight: "5px"
    },
    favoriteName: {
      color: "#1f2937"
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>UFC Fighter Search</h1>
      
      <div style={styles.contentWrapper}>
        {/* Search & Results Column */}
        <div style={styles.searchColumn}>
          <h2 style={styles.sectionTitle}>Search Fighters</h2>
          
          <div style={styles.searchForm}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter fighter name"
              style={styles.searchInput}
            />
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              style={{
                ...styles.button,
                ...(searchLoading ? styles.disabledButton : {})
              }}
            >
              {searchLoading ? "Searching..." : "Search"}
            </button>
          </div>
          
          {error && (
            <div style={styles.errorMessage}>
              {error}
            </div>
          )}

          <h3 style={styles.resultsTitle}>Results</h3>
          {results.length === 0 ? (
            <p style={styles.emptyText}>No results to display</p>
          ) : (
            <ul style={{ padding: 0, listStyle: "none", margin: 0 }}>
              {results.map((fighter, idx) => (
                <li key={idx} style={styles.listItem}>
                  <a 
                    href={fighter.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    {formatFighterName(fighter.name)}
                  </a>
                  <button
                    onClick={() => addToFavorites(fighter)}
                    disabled={isFavorite(fighter.name)}
                    style={isFavorite(fighter.name) ? styles.favoritedButton : styles.addButton}
                  >
                    <span style={styles.heartIcon}>♥</span>
                    {isFavorite(fighter.name) ? "Favorited" : "Add to Favorites"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Favorites Column */}
        <div style={styles.favoritesColumn}>
          <h2 style={styles.sectionTitle}>Favorite Fighters</h2>
          
          {favorites.length === 0 ? (
            <p style={styles.emptyText}>No favorites added yet</p>
          ) : (
            <ul style={{ padding: 0, listStyle: "none", margin: 0 }}>
              {[...favorites]
                .sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)))
                .map((fav) => (
                  <li key={fav.name} style={styles.listItem}>
                    <span style={styles.favoriteName}>{formatFighterName(fav.name)}</span>
                    <button
                      onClick={() => removeFromFavorites(fav.name)}
                      style={styles.removeButton}
                    >
                      ✕ Remove
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default FighterSearch;