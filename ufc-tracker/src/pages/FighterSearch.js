import React, { useState, useEffect } from "react";

function FighterSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState([]);

  const API_BASE = "https://ufc-app-58c5.onrender.com";

  useEffect(() => {
    fetch(`${API_BASE}/api/favorites`)
      .then(res => res.json())
      .then(data => setFavorites(data))
      .catch(err => console.error("Failed to load favorites:", err));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/api/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();

      const uniqueResults = Array.from(
        new Map(data.map(fighter => [fighter.name, fighter])).values()
      );

      setResults(uniqueResults);
    } catch (error) {
      console.error("Error during search:", error);
    }
  };

  const addToFavorites = async (fighter) => {
    const alreadyFavorite = favorites.some(fav => fav.name === fighter.name);
    if (alreadyFavorite) return;

    try {
      const res = await fetch(`${API_BASE}/api/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fighter),
      });

      if (res.ok) {
        setFavorites(prev => [...prev, fighter]);
      }
    } catch (err) {
      console.error("Error adding favorite:", err);
    }
  };

  const removeFromFavorites = async (fighter) => {
    try {
      const res = await fetch(`${API_BASE}/api/favorites`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fighter.name }),
      });

      if (res.ok) {
        setFavorites(prev => prev.filter(fav => fav.name !== fighter.name));
      }
    } catch (err) {
      console.error("Error removing favorite:", err);
    }
  };

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

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "40px" }}>
      {/* Favorites Column */}
      <div style={{ width: "30%" }}>
        <h1>Favorite Fighters</h1>
        <ul>
          {[...favorites]
            .sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)))
            .map((fav) => (
              <li key={fav.name}>
                <span style={{ marginRight: "10px" }}>{formatFighterName(fav.name)}</span>
                <button onClick={() => removeFromFavorites(fav)}>Remove</button>
              </li>
            ))}
        </ul>
      </div>

      {/* Search & Results Column */}
      <div style={{ flex: 1 }}>
        <h1>Search Fighters</h1>
        <form onSubmit={handleSearch} style={{ marginBottom: "20px" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter fighter name"
          />
          <button type="submit" style={{ marginLeft: "10px" }}>Search</button>
        </form>

        <h2>Results</h2>
        <ul>
          {results.map((fighter, idx) => {
            const isFavorite = favorites.some(fav => fav.name === fighter.name);
            return (
              <li key={idx}>
                <a href={fighter.url} target="_blank" rel="noopener noreferrer">
                  {fighter.name}
                </a>
                <button
                  onClick={() => addToFavorites(fighter)}
                  disabled={isFavorite}
                  style={{
                    marginLeft: "10px",
                    backgroundColor: isFavorite ? "lightgreen" : "initial",
                    cursor: isFavorite ? "not-allowed" : "pointer"
                  }}
                >
                  {isFavorite ? "Favorited" : "Add to Favorites"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default FighterSearch;
