import { useEffect, useRef } from "react";

const API = "/api";

const STEP_ICONS = {
  open_application: "??",
  extract_fields:   "??",
  fill_fields:      "??",
  upload_resume:    "??",
  wait_for_input:   "?",
  fill_answers:     "??",
  finalize:         "✅",
  default:          "?",
};

function stepIcon(step) {
  return STEP_ICONS[step] || STEP_ICONS.default;
}

export default function RunningPage({ runId, events, onEvent }) {
  const feedRef = useRef(null);
  const esRef = useRef(null);

  // Open SSE connection
  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(`${API}/applications/${runId}/events`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        onEvent(event);
        // Close SSE on terminal states
        if (["NEEDS_INPUT", "READY_TO_SUBMIT", "SUBMITTED", "FAILED", "FILLED"].includes(event.type)) {
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      // Will auto-reconnect; don't do anything aggressive here
    };

    return () => es.close();
  }, [runId]);

  // Auto-scroll feed to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const progressEvents = events.filter((e) => e.type === "PROGRESS" || e.type === "RUNNING");
  const lastEvent = events[events.length - 1];
  const isTerminal = lastEvent && ["NEEDS_INPUT", "READY_TO_SUBMIT", "SUBMITTED", "FAILED", "FILLED"].includes(lastEvent.type);

  return (
    <main>
      <div className="container">
        <div className="running-page">
          <div className="status-header">
            <div className="status-dot running"></div>
            <div className="status-title">Application in progress</div>
            <div className="status-subtitle">
              {lastEvent?.type === "READY_TO_SUBMIT"
                ? "Development mode stopped before final submission"
                : isTerminal ? "Processing complete" : "Filling your application - this takes about 30-60 seconds"}
            </div>
          </div>

          <div className="card">
            <div className="section-title" style={{ marginBottom: 16 }}>
              Live feed &nbsp;
              <span style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "var(--text-3)" }}>
                {runId?.slice(0, 8)}�
              </span>
            </div>

            <div className="live-feed" ref={feedRef}>
              {progressEvents.length === 0 && (
                <div className="feed-item">
                  <span className="feed-icon">?</span>
                  <div className="feed-text">
                    <div className="feed-message">Connecting to browser engine�</div>
                  </div>
                </div>
              )}
              {progressEvents.map((ev, i) => (
                <div className="feed-item" key={i}>
                  <span className="feed-icon">{stepIcon(ev.step)}</span>
                  <div className="feed-text">
                    <div className="feed-message">{ev.message || ev.type}</div>
                    {ev.step && (
                      <div className="feed-step">{ev.step}</div>
                    )}
                  </div>
                </div>
              ))}
              {!isTerminal && (
                <div className="feed-item">
                  <span className="feed-icon"><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div></span>
                  <div className="feed-text">
                    <div className="feed-message" style={{ color: "var(--text-3)" }}>Working�</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.8rem", marginTop: 20 }}>
            A browser window will open on your machine. Do not close it.
          </p>
        </div>
      </div>
    </main>
  );
}
