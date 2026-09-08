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
  if (val === true)         return "Yes";
  if (val === false)        return "No";
  return String(val);
}

function inputValue(val) {
  if (Array.isArray(val)) return val.join(", ");
  if (val === "" || val === null || val === undefined) return "";
  if (val === true) return "Yes";
  if (val === false) return "No";
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

function ReadOnlyField({ field }) {
  const values = (Array.isArray(field.value) ? field.value : [field.value])
    .filter((value) => value !== "" && value !== null && value !== undefined);
  const isChoice = field.type === "checkbox" || field.type === "radio";

  if (isChoice) {
    return (
      <div className="filled-choice">
        <span className={`filled-choice-indicator ${values.length > 0 ? "checked" : ""}`}>
          {values.length > 0 ? "✓" : ""}
        </span>
        <span>{values.length > 0 ? formatValue(field.value) : "Not selected"}</span>
      </div>
    );
  }

  if (field.type === "textarea") {
    return <textarea className="filled-form-control" value={inputValue(field.value)} readOnly rows={3} />;
  }

  return <input className="filled-form-control" value={inputValue(field.value)} readOnly />;
}

/**
 * SubmittedPage / Filled review page.
 *
 * - submissionType === "submitted"  → application was actually submitted (Lever path).
 * - submissionType === "filled"      → automation stopped right before clicking
 *   "Submit Application"; this shows exactly what was filled in.
 */
export default function SubmittedPage({ receipt, filledPreview, submissionType, onReset }) {
  const isFilled = submissionType === "filled";

  const preview = Array.isArray(filledPreview) && filledPreview.length > 0;
  const entries = preview
    ? filledPreview.map((p) => [
        p.label || formatKey(p.name),
        p.value,
      ])
    : receipt
      ? Object.entries(receipt).filter(([k]) => !isHidden(k))
      : [];

  return (
    <main>
      <div className="container">
        <div className="success-page">
          <div className="success-icon">{isFilled ? "📋" : "🎉"}</div>
          <h2>
            {isFilled
              ? "Application Filled — Awaiting Your Review"
              : "Application Submitted!"}
          </h2>
          <p>
            {isFilled
              ? "The application form has been filled in completely. Below is exactly what will be sent to the employer. Submission is currently paused — review the details when ready."
              : "Your application was successfully submitted. Good luck!"}
          </p>

          {entries.length > 0 && (
            <>
              <div className="card" style={{ textAlign: "left", marginBottom: 24 }}>
                <div className="section-title" style={{ marginBottom: 16 }}>
                  {isFilled ? "📋 Filled Values" : "📋 Submission Receipt"}
                </div>
                <div className="receipt-grid">
                  {preview ? (
                    <div className="filled-form-grid">
                      {filledPreview.map((field, i) => (
                        <div className="filled-form-field" key={`${field.name}-${i}`}>
                          <label>{field.label || formatKey(field.name)}</label>
                          <ReadOnlyField field={field} />
                        </div>
                      ))}
                    </div>
                  ) : entries.map(([key, val], i) => (
                    <div className="receipt-row" key={`${isFilled ? "f" : "s"}-${i}`}>
                      <span className="receipt-key">{key}</span>
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
