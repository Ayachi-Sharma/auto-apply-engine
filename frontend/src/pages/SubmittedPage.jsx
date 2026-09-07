// Fields to hide from the user-facing receipt display
// (engine already strips most internal ones; this is a UI-level guard)
const HIDE_FIELDS = new Set([
  "h-captcha-response", "origin", "referer", "timezone",
  "accountId", "linkedInData", "socialReferralKey", "socialSource",
  "selectedLocation", "source",
]);

function isHidden(key) {
  return (
    HIDE_FIELDS.has(key) ||
    key.endsWith("[baseTemplate]") ||
    key.endsWith("[surveyId]")
  );
}

function formatValue(val) {
  if (Array.isArray(val))  return val.join(", ");
  if (val === "")           return <span style={{ color: "var(--text-3)" }}>—</span>;
  return String(val);
}

function formatKey(key) {
  // Make keys more readable: urls[LinkedIn] → LinkedIn URL
  return key
    .replace(/^urls\[(.+)\]$/, "$1 URL")
    .replace(/^eeo\[(.+)\]$/, "EEO · $1")
    .replace(/\[responses\]\[field\d+\]$/, " response")
    .replace(/^surveysResponses\[.+?\]/, "Survey");
}

export default function SubmittedPage({ receipt, onReset }) {
  const entries = receipt
    ? Object.entries(receipt).filter(([k]) => !isHidden(k))
    : [];

  return (
    <main>
      <div className="container">
        <div className="success-page">
          <div className="success-icon">🎉</div>
          <h2>Application Submitted!</h2>
          <p>Your application was successfully submitted. Good luck!</p>

          {entries.length > 0 && (
            <>
              <div className="card" style={{ textAlign: "left", marginBottom: 24 }}>
                <div className="section-title" style={{ marginBottom: 16 }}>
                  📋 Submission Receipt
                </div>
                <div className="receipt-grid">
                  {entries.map(([key, val]) => (
                    <div className="receipt-row" key={key}>
                      <span className="receipt-key">{formatKey(key)}</span>
                      <span className="receipt-val">{formatValue(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <button id="applyAgainBtn" className="btn btn-primary" onClick={onReset}>
            ⚡ Apply to Another Job
          </button>
        </div>
      </div>
    </main>
  );
}
