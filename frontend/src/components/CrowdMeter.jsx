import { useEffect, useState } from "react";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";

const FALLBACK = {
  level: "LOW",
  label: "Low Wait",
  color: "#10b981",
  advice: "Kitchen running fast — great time to order!",
  activeCount: 0,
  readyCount: 0,
  estWaitMinutes: 4,
};

export default function CrowdMeter({ onSkipRush }) {
  const { user } = useAuth();
  const [crowd, setCrowd] = useState(FALLBACK);

  useEffect(() => {
    client
      .get("/orders/crowd")
      .then(({ data }) => setCrowd({ ...FALLBACK, ...data }))
      .catch(() => {});

    const socket = getSocket(user);
    function handleCrowd(metrics) {
      if (metrics) setCrowd({ ...FALLBACK, ...metrics });
    }
    socket.on("crowd:updated", handleCrowd);
    return () => socket.off("crowd:updated", handleCrowd);
  }, [user]);

  const levelKey = (crowd.level || "LOW").toLowerCase();
  const busy = levelKey === "peak" || levelKey === "high" || levelKey === "moderate";

  return (
    <section className={`crowd-meter crowd-${levelKey}`}>
      <div className="crowd-meter-main">
        <span className="crowd-pulse" style={{ background: crowd.color }} />
        <div>
          <div className="crowd-meter-top">
            <span className="crowd-badge" style={{ background: crowd.color }}>
              {crowd.level === "PEAK" || crowd.level === "HIGH"
                ? "🔴 Peak Rush"
                : crowd.level === "MODERATE"
                  ? "🟡 Moderate Rush"
                  : "🟢 Low Wait"}
            </span>
            <span className="crowd-wait">~{crowd.estWaitMinutes}m wait</span>
          </div>
          <p className="crowd-advice">{crowd.advice}</p>
          <div className="crowd-stats">
            <span>{crowd.activeCount} cooking</span>
            <span>{crowd.readyCount} ready at counter</span>
          </div>
        </div>
      </div>
      {busy && (
        <button type="button" className="crowd-skip-btn" onClick={onSkipRush}>
          Skip the rush: Pre-book for next break slot ➔
        </button>
      )}
    </section>
  );
}
