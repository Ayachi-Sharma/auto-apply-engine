import { useState } from "react";

const API = "/api";

// --- Question renderers -------------------------------------------------------

function RadioQuestion({ question, value, onChange }) {
  return (
    <div className="options-list">
      {question.options.map((opt) => (
        <label
          key={opt.value}
          className={`option-item ${value === opt.value ? "selected" : ""}`}
        >
          <input
            type="radio"
            name={question.field}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <div className="option-check"></div>
          <span className="option-text">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxQuestion({ question, value = [], onChange }) {
  function toggle(optValue) {
    const arr = Array.isArray(value) ? value : [];
    if (arr.includes(optValue)) {
      onChange(arr.filter((v) => v !== optValue));
    } else {
      onChange([...arr, optValue]);
    }
  }

  return (
    <div className="options-list">
      {question.options.map((opt) => {
        const selected = Array.isArray(value) && value.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={`option-item ${selected ? "selected" : ""}`}
          >
            <input
              type="checkbox"
              name={question.field}
              value={opt.value}
              checked={selected}
              onChange={() => toggle(opt.value)}
            />
            <div className="option-check option-check-sq">
              {selected && <span style={{ fontSize: 10, color: "white" }}>?</span>}
            </div>
            <span className="option-text">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function SelectQuestion({ question, value, onChange }) {
  return (
    <div className="field">
      <select
        id={question.field}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {question.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextQuestion({ question, value, onChange }) {
  return (
    <div className="field">
      <input
        id={question.field}
        type="text"
        placeholder={`Enter ${question.label.toLowerCase()}�`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// --- Main Questions page ------------------------------------------------------

export default function QuestionsPage({ runId, questions, onAnswersSubmitted, onEvent }) {
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function setAnswer(field, value) {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  }

  function renderQuestion(q) {
    const val = answers[q.field];
    switch (q.type) {
      case "radio":    return <RadioQuestion    question={q} value={val}     onChange={(v) => setAnswer(q.field, v)} />;
      case "checkbox": return <CheckboxQuestion question={q} value={val}     onChange={(v) => setAnswer(q.field, v)} />;
      case "select":   return <SelectQuestion   question={q} value={val}     onChange={(v) => setAnswer(q.field, v)} />;
      default:         return <TextQuestion     question={q} value={val}     onChange={(v) => setAnswer(q.field, v)} />;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    // Validate all questions answered
    const unanswered = questions.filter((q) => {
      const a = answers[q.field];
      if (a === undefined || a === null) return true;
      if (Array.isArray(a) && a.length === 0) return true;
      if (typeof a === "string" && a.trim() === "") return true;
      return false;
    });

    if (unanswered.length > 0) {
      setError(`Please answer all questions. Missing: ${unanswered.map((q) => q.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/applications/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit answers");

      // Go back to running view which will re-subscribe to SSE
      onAnswersSubmitted(runId);

      // Also open a new SSE connection from the running page � 
      // but we pass onEvent so the parent can transition on SUBMITTED/FAILED
      const es = new EventSource(`${API}/applications/${runId}/events`);
      es.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data);
          onEvent(event);
          if (["SUBMITTED", "FAILED"].includes(event.type)) es.close();
        } catch {}
      };
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main>
      <div className="container">
        <div className="questions-page">
          <div className="status-header">
            <div className="status-dot needs-input"></div>
            <div className="status-title">A few more details</div>
            <div className="status-subtitle">
              Answer the questions below to complete your application.
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="card">
              {questions.map((q) => (
                <div className="question-block" key={q.field}>
                  <div className="question-label">{q.label}</div>
                  {renderQuestion(q)}
                </div>
              ))}

              {error && (
                <div className="error-box" style={{ marginBottom: 16 }}>
                  <code>?? {error}</code>
                </div>
              )}

              <button
                type="submit"
                id="continueBtn"
                className="btn btn-primary btn-full"
                disabled={submitting}
              >
                {submitting ? <><div className="spinner"></div> Submitting�</> : "?? Continue Application"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
