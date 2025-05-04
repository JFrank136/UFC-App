import React, { useState } from "react";

const FighterSearch = ({ onAddFighter }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `https://ufc-app-58c5.onrender.com/api/search?query=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setResults(data);
    } catch (err) {
      console.error("Search failed:", err);
    }
    setLoading(false);
  };

  const handleAdd = (fighter) => {
    onAddFighter(fighter.name);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="Search UFC fighters..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button onClick={handleSearch}>Search</button>

      {loading && <p>Searching...</p>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((fighter) => (
            <li key={fighter.url}>
              <button onClick={() => handleAdd(fighter)}>
                {fighter.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FighterSearch;
