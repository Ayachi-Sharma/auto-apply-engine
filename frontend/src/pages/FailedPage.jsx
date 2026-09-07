export default function FailedPage({ failure, onReset }) {
  const reason = failure?.reason || "An unexpected error occurred.";
  const step   = failure?.step;

  return (
    <main>
      <div className="container">
        <div className="failed-page">
          <div className="failed-icon">💔</div>
          <h2>Application Failed</h2>
          <p>Something went wrong during the application process.</p>

          <div className="error-box">
            <code>{reason}</code>
            {step && <div className="error-step">Failed at step: {step}</div>}
          </div>

          <p style={{ color: "var(--text-3)", fontSize: "0.82rem", marginBottom: 24 }}>
            If a browser window opened, it may still be visible. You can check it for more details.
          </p>

          <button id="tryAgainBtn" className="btn btn-primary" onClick={onReset}>
            ↩ Try Again
          </button>
        </div>
      </div>
    </main>
  );
}
