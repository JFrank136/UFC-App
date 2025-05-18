import React, { useEffect, useState } from "react";
import { RefreshCw, Star, ExternalLink, Calendar, Award, Loader2 } from "lucide-react";

function UpcomingFights() {
  const [fights, setFights] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const API_BASE = "https://ufc-app-58c5.onrender.com";

  useEffect(() => {
    const loadFavoritesAndFights = async () => {
      try {
        const favRes = await fetch(`${API_BASE}/api/favorites`);
        const favData = await favRes.json();
        setFavorites(favData);

        if (favData.length === 0) {
          setError("No favorite fighters found. Add some in the Search page!");
          return;
        }

        // 1. Try loading cached fights…
        const cacheRes = await fetch(`${API_BASE}/api/upcoming`);
        const cacheData = await cacheRes.json();
        if (Array.isArray(cacheData) && cacheData.length > 0) {
          setFights(cacheData);
        } else {
          // 2. No cache yet, scrape fresh
          await fetchFights(favData);
        }

      } catch (err) {
        console.error("Error loading favorites:", err);
        setError("Failed to load favorites.");
      }
    };

    loadFavoritesAndFights();
  }, []);

  const fetchFights = async (favList = favorites) => {
    if (!favList || favList.length === 0) {
      setError("No favorite fighters to check for upcoming fights.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const names = favList.map((f) => typeof f === "string" ? f : f.name);

      const res = await fetch(`${API_BASE}/api/upcoming`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighters: names }),
      });

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setFights([]);
        setError("No upcoming UFC fights found.");
        return;
      }

      const filtered = data
        .filter((fight) => fight.event.toLowerCase().includes("ufc"))
        .map((fight) => {
          const cleanName = fight.name.replace(/"[^"]+"/g, "").trim();
          const cleanOpponent = fight.opponent.replace(/"[^"]+"/g, "").trim();
          let formattedDate = fight.date;

          try {
            if (
              formattedDate &&
              !formattedDate.toLowerCase().includes("tba") &&
              formattedDate.split(" ").length === 2
            ) {
              const fullDate = new Date(`2025 ${formattedDate}`);
              formattedDate = fullDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              });
            }
          } catch {}

          return {
            ...fight,
            name: cleanName,
            opponent: cleanOpponent,
            date: formattedDate,
          };
        });

      const sorted = filtered.sort((a, b) => {
        const parseDate = (d) => {
          if (!d || d.toLowerCase() === "tba") return Infinity;
          return new Date(`2025 ${d}`);
        };
        return parseDate(a.date) - parseDate(b.date);
      });

      setFights(sorted);
    } catch (err) {
      console.error("Fetch fights failed:", err);
      setError("Error fetching upcoming fights.");
    } finally {
      setLoading(false);
    }
  };

  const isFavorite = (name) => {
    return favorites.some(f => 
      (typeof f === "string" && f === name) || 
      (typeof f === "object" && f.name === name)
    );
  };

  const getUrl = (name) =>
    `https://www.tapology.com/search?term=${encodeURIComponent(name)}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Upcoming Fights</h1>
        <button 
          onClick={() => fetchFights()} 
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors shadow-md"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-md">
          <p className="text-amber-700">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 text-red-500 animate-spin mb-4" />
          <p className="text-gray-600">Loading upcoming fights...</p>
        </div>
      ) : fights.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-600">No upcoming UFC fights found.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {fights.map((fight, idx) => {
            const nameUrl = getUrl(fight.name);
            const opponentUrl = getUrl(fight.opponent);
            
            const isFavName = isFavorite(fight.name);
            const isFavOpponent = isFavorite(fight.opponent);

            return (
              <div key={idx} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="bg-gray-800 text-white p-3">
                  <h3 className="font-medium text-lg flex items-center justify-between">
                    <span>{fight.event}</span>
                  </h3>
                </div>
                
                <div className="p-4">
                  <div className="flex items-center justify-center mb-4 text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{fight.date || "TBA"}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex-1 text-center">
                      <div className="flex items-center justify-center mb-2">
                        <a
                          href={nameUrl}
                          className={`font-medium hover:underline flex items-center ${isFavName ? "text-red-600" : "text-gray-800"}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {fight.name}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                        {isFavName && <Star className="text-yellow-400 ml-1 h-4 w-4 fill-yellow-400" />}
                      </div>
                    </div>
                    
                    <div className="mx-4 flex flex-col items-center">
                      <Award className="h-6 w-6 text-red-500 mb-1" />
                      <span className="text-sm font-bold text-gray-500">VS</span>
                    </div>
                    
                    <div className="flex-1 text-center">
                      <div className="flex items-center justify-center mb-2">
                        <a
                          href={opponentUrl}
                          className={`font-medium hover:underline flex items-center ${isFavOpponent ? "text-red-600" : "text-gray-800"}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {fight.opponent}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                        {isFavOpponent && <Star className="text-yellow-400 ml-1 h-4 w-4 fill-yellow-400" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default UpcomingFights;