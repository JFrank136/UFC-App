import React, { useEffect, useState } from "react";

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

        await fetchFights(favData);
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

      const names = favList.map((f) => f.name);

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

  const isFavorite = (name) =>
    favorites.some((fav) => fav.name.replace(/"[^"]+"/g, "").trim() === name);

  const getUrl = (name) => {
    const match = favorites.find(
      (fav) => fav.name.replace(/"[^"]+"/g, "").trim() === name
    );
    return match?.url || "#";
  };

  return (
    <div>
      <h1>Upcoming Fights</h1>
      <button onClick={() => fetchFights()} style={{ marginBottom: "20px" }}>
        Refresh
      </button>

      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div>{error}</div>
      ) : fights.length === 0 ? (
        <p>No upcoming UFC fights found.</p>
      ) : (
        <ul>
          {fights.map((fight, idx) => {
            const nameUrl = getUrl(fight.name);
            const opponentUrl = getUrl(fight.opponent);

            const nameStyle = {
              fontWeight: isFavorite(fight.name) ? "bold" : "normal",
              color: isFavorite(fight.name) ? "#1976d2" : "inherit",
            };

            const opponentStyle = {
              fontWeight: isFavorite(fight.opponent) ? "bold" : "normal",
              color: isFavorite(fight.opponent) ? "#1976d2" : "inherit",
            };

            return (
              <li key={idx}>
                <a
                  href={nameUrl}
                  style={nameStyle}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {fight.name}
                </a>{" "}
                vs.{" "}
                <a
                  href={opponentUrl}
                  style={opponentStyle}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {fight.opponent}
                </a>
                <br />
                Event: {fight.event}
                <br />
                Date: {fight.date}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default UpcomingFights;
