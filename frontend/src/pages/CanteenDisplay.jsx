import { useEffect, useState, useRef } from "react";
import client from "../api/client";
import { getSocket } from "../socket";
import { announceReadyOrder, playDingDongChime } from "../utils/audio";

export default function CanteenDisplay() {
  const [preparing, setPreparing] = useState([]);
  const [ready, setReady] = useState([]);
  const [time, setTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [recentlyReadyToken, setRecentlyReadyToken] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  function loadDisplayOrders() {
    client
      .get("/orders/display")
      .then(({ data }) => {
        setPreparing(data.preparing || []);
        setReady(data.ready || []);
      })
      .catch((err) => console.error("Error loading display orders:", err));
  }

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial fetch and Socket.IO real-time subscriptions
  useEffect(() => {
    loadDisplayOrders();

    const socket = getSocket();
    socket.emit("join:display");

    function handleDisplayChange(payload) {
      loadDisplayOrders();

      if (payload?.justReady && payload?.token) {
        setRecentlyReadyToken(payload.token);
        setTimeout(() => setRecentlyReadyToken(null), 10000);

        if (soundEnabledRef.current) {
          announceReadyOrder(payload.token);
          setLastAnnouncedToken(payload.token);
        }
      }
    }

    socket.on("display:orders-changed", handleDisplayChange);
    // Also listen to general admin orders changed as fallback
    socket.on("admin:orders-changed", loadDisplayOrders);

    // Periodically re-sync every 15s to ensure nothing drifts
    const syncInterval = setInterval(loadDisplayOrders, 15000);

    return () => {
      socket.off("display:orders-changed", handleDisplayChange);
      socket.off("admin:orders-changed", loadDisplayOrders);
      clearInterval(syncInterval);
    };
  }, []);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      playDingDongChime();
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  return (
    <div className="tv-display-container">
      {/* TV Header */}
      <header className="tv-header">
        <div className="tv-brand">
          <span className="tv-logo-icon">🍽️</span>
          <div>
            <div className="tv-title">CAMPUS CANTEEN</div>
            <div className="tv-subtitle">LIVE QUEUE & PICKUP DISPLAY</div>
          </div>
        </div>

        <div className="tv-header-center">
          <span className="tv-pulse-dot" />
          <span className="tv-live-tag">LIVE SYSTEM</span>
          <span className="tv-clock">
            {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>

        <div className="tv-header-actions">
          <button
            className={`tv-btn ${soundEnabled ? "tv-btn-active" : "tv-btn-warn"}`}
            onClick={toggleSound}
            title="Audio alerts on order ready"
          >
            {soundEnabled ? "🔊 Sound ON" : "🔇 Click to Enable Audio"}
          </button>

          <button
            className="tv-btn tv-btn-ghost"
            onClick={() => {
              setSoundEnabled(true);
              playDingDongChime();
            }}
          >
            🔔 Test Chime
          </button>

          <button className="tv-btn tv-btn-ghost" onClick={toggleFullscreen}>
            {isFullscreen ? "🗗 Exit Fullscreen" : "⛶ Fullscreen"}
          </button>
        </div>
      </header>

      {/* Audio banner notice if audio is muted */}
      {!soundEnabled && (
        <div className="tv-audio-banner" onClick={toggleSound}>
          <span>🔔 Audio announcement is currently muted. Click anywhere here to turn ON automatic chime & voice callouts.</span>
        </div>
      )}

      {/* Main Split-Screen Display */}
      <main className="tv-grid">
        {/* LEFT COLUMN: NOW PREPARING */}
        <section className="tv-column tv-column-preparing">
          <div className="tv-column-header">
            <div className="tv-column-title-wrap">
              <span className="tv-column-icon">🍳</span>
              <div>
                <h2 className="tv-column-title">NOW PREPARING</h2>
                <p className="tv-column-desc">Currently on griddle & cooking</p>
              </div>
            </div>
            <span className="tv-column-count">{preparing.length}</span>
          </div>

          <div className="tv-tokens-grid">
            {preparing.length === 0 ? (
              <div className="tv-empty-box">
                <span className="tv-empty-icon">✨</span>
                <p>No orders currently in the kitchen</p>
              </div>
            ) : (
              preparing.map((order) => (
                <div key={order.id} className="tv-token-card tv-token-card-preparing">
                  <div className="tv-token-number">{order.token}</div>
                  <div className="tv-token-meta">
                    <span className="tv-token-badge preparing">Cooking</span>
                    {order.estimatedWaitMinutes > 0 && (
                      <span className="tv-token-eta">~{order.estimatedWaitMinutes}m</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: READY FOR PICKUP */}
        <section className="tv-column tv-column-ready">
          <div className="tv-column-header">
            <div className="tv-column-title-wrap">
              <span className="tv-column-icon">🎉</span>
              <div>
                <h2 className="tv-column-title">READY FOR PICKUP</h2>
                <p className="tv-column-desc">Collect immediately at counter</p>
              </div>
            </div>
            <span className="tv-column-count tv-column-count-ready">{ready.length}</span>
          </div>

          <div className="tv-tokens-grid tv-tokens-grid-ready">
            {ready.length === 0 ? (
              <div className="tv-empty-box">
                <span className="tv-empty-icon">☕</span>
                <p>Next ready orders will flash here</p>
              </div>
            ) : (
              ready.map((order) => {
                const isJustCalled = recentlyReadyToken === order.token;
                return (
                  <div
                    key={order.id}
                    className={`tv-token-card tv-token-card-ready ${isJustCalled ? "tv-token-just-ready" : ""}`}
                  >
                    <div className="tv-token-top">
                      <span className="tv-ready-pill">READY</span>
                      {isJustCalled && <span className="tv-flash-badge">NEW!</span>}
                    </div>
                    <div className="tv-token-number tv-token-number-ready">{order.token}</div>
                    <div className="tv-token-counter-hint">Counter 1</div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Footer Ticker */}
      <footer className="tv-footer">
        <div className="tv-footer-ticker">
          <span className="tv-ticker-item">💡 Place pre-orders directly on your phone to skip the line</span>
          <span className="tv-ticker-divider">•</span>
          <span className="tv-ticker-item">🔔 Keep your 4-digit PIN ready when your token is called</span>
          <span className="tv-ticker-divider">•</span>
          <span className="tv-ticker-item">⚡ Average turnaround time today: ~4 minutes</span>
        </div>
      </footer>
    </div>
  );
}
