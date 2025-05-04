import React, { useEffect, useState } from "react";

const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFavoritesAndFetch = async () => {
      try {
        const res = await fetch("/api/favorites");
        const storedFavorites = await res.json();
        setFavorites(storedFavorites);
        fetchFights(storedFavorites);
      } catch (err) {
        console.error("Error loading favorites:", err);
        setError("Failed to load favorites.");
      }
    };

    loadFavoritesAndFetch();
  }, []);

  const fetchFights = async (fighters = favorites) => {
    if (fighters.length === 0) {
      setError("No favorite fighters found. Add some in the Search page!");
      setFights([]);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/upcoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighters: fighters.map((f) => f.name) }),
      });

      if (!response.ok) throw new Error("Failed to fetch upcoming fights.");
      const data = await response.json();

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
      setError("");
    } catch (err) {
      console.error("Error fetching fights:", err);
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
        <p>Loading...</p>
      ) : error ? (
        <p>{error}</p>
      ) : fights.length === 0 ? (
        <p>No upcoming UFC fights found. Click refresh to load.</p>
      ) : (
        <ul>
          {fights.map((fight, idx) => {
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
                  href={getUrl(fight.name)}
                  style={nameStyle}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {fight.name}
                </a>{" "}
                vs.{" "}
                <a
                  href={getUrl(fight.opponent)}
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
};

export default UpcomingFights;
