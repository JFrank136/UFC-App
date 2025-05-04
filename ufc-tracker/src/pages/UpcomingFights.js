import React, { useEffect, useState } from "react";

const UpcomingFights = ({ trackedFighters }) => {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchFights = async () => {
      if (trackedFighters.length === 0) return;

      setLoading(true);
      try {
        const response = await fetch("https://ufc-app-58c5.onrender.com/api/upcoming", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fighters: trackedFighters }),
        });

        const data = await response.json();
        setFights(data);
      } catch (error) {
        console.error("Error fetching upcoming fights:", error);
      }
      setLoading(false);
    };

    fetchFights();
  }, [trackedFighters]);

  return (
    <div className="fights-container">
      <h2>Upcoming Fights</h2>
      {loading ? (
        <p>Loading...</p>
      ) : fights.length === 0 ? (
        <p>No upcoming fights found.</p>
      ) : (
        <ul className="fight-list">
          {fights.map((fight, idx) => (
            <li key={idx}>
              {fight.name} vs {fight.opponent} — {fight.event} on {fight.date}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default UpcomingFights;
