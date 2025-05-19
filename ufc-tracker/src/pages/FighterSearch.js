import React, { useState, useEffect } from "react";
import { Search, Heart, X, Loader2 } from "lucide-react";

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

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50">
      <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">UFC Fighter Search</h1>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Search & Results Column */}
        <div className="w-full md:w-2/3 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 flex items-center">
            <Search className="mr-2" size={20} />
            Search Fighters
          </h2>
          
          <div className="mb-6">
            <div className="flex">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter fighter name"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r-md transition duration-200 disabled:opacity-70 flex items-center"
              >
                {searchLoading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Searching
                  </>
                ) : (
                  "Search"
                )}
              </button>
            </div>
          </div>
          
          {error && (
            <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md flex items-center">
              <X className="mr-2" size={16} />
              {error}
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-xl font-medium mb-3 text-gray-700">Results</h3>
            {results.length === 0 ? (
              <p className="text-gray-500 italic">No results to display</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {results.map((fighter, idx) => (
                  <li key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <a 
                        href={fighter.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      >
                        {formatFighterName(fighter.name)}
                      </a>
                    </div>
                    <button
                      onClick={() => addToFavorites(fighter)}
                      disabled={isFavorite(fighter.name)}
                      className={`flex items-center px-3 py-1 rounded-md transition duration-200 text-sm ${
                        isFavorite(fighter.name)
                          ? "bg-green-100 text-green-700 cursor-not-allowed"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                    >
                      <Heart 
                        className={`mr-1 ${isFavorite(fighter.name) ? "fill-green-500" : ""}`}
                        size={16} 
                      />
                      {isFavorite(fighter.name) ? "Favorited" : "Add to Favorites"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Favorites Column */}
        <div className="w-full md:w-1/3 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 flex items-center">
            Favorite Fighters
          </h2>
          
          {favorites.length === 0 ? (
            <p className="text-gray-500 italic">No favorites added yet</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {[...favorites]
                .sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)))
                .map((fav) => (
                  <li key={fav.name} className="py-3 flex items-center justify-between">
                    <span className="text-gray-800">{formatFighterName(fav.name)}</span>
                    <button
                      onClick={() => removeFromFavorites(fav.name)}
                      className="flex items-center px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-sm transition duration-200"
                    >
                      <X size={14} className="mr-1" />
                      Remove
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