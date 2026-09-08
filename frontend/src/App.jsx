import { useState } from "react";
import HomePage from "./pages/HomePage.jsx";
import RunningPage from "./pages/RunningPage.jsx";
import QuestionsPage from "./pages/QuestionsPage.jsx";
import SubmittedPage from "./pages/SubmittedPage.jsx";
import FailedPage from "./pages/FailedPage.jsx";

// ─── Shared header ────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="header">
      <div className="container">
        <div className="header-logo">
          <div className="header-logo-icon">⚡</div>
          <span className="header-logo-text">AutoApply Engine</span>
        </div>
      </div>
    </header>
  );
}

// ─── App shell / state machine ────────────────────────────────────────────────
// views: home | running | questions | submitted | failed
export default function App() {
  const [view, setView] = useState("home");
  const [runId, setRunId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [failureInfo, setFailureInfo] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [submissionType, setSubmissionType] = useState(null); // "submitted" | "filled"
  const [filledPreview, setFilledPreview] = useState(null);

  function handleStarted(newRunId) {
    setRunId(newRunId);
    setLiveEvents([]);
    setSubmissionType(null);
    setFilledPreview(null);
    setView("running");
  }

  function handleEvent(event) {
    setLiveEvents((prev) => [...prev, event]);
    if (event.type === "NEEDS_INPUT") {
      setQuestions(event.questions);
      setView("questions");
    } else if (event.type === "FILLED" || event.type === "READY_TO_SUBMIT") {
      // Application fully filled — automation stopped BEFORE clicking submit.
      setReceipt(event.receipt);
      setFilledPreview(event.filledPreview ?? null);
      setSubmissionType("filled");
      setView("submitted");
    } else if (event.type === "SUBMITTED") {
      setReceipt(event.receipt);
      setFilledPreview(null);
      setSubmissionType("submitted");
      setView("submitted");
    } else if (event.type === "FAILED") {
      setFailureInfo({ reason: event.reason, step: event.step });
      setView("failed");
    }
  }

  function handleReset() {
    setView("home");
    setRunId(null);
    setQuestions([]);
    setReceipt(null);
    setFailureInfo(null);
    setLiveEvents([]);
    setSubmissionType(null);
    setFilledPreview(null);
  }

  function handleAnswersSubmitted(newRunId) {
    setRunId(newRunId);
    setLiveEvents([]);
    setSubmissionType(null);
    setFilledPreview(null);
    setView("running");
  }

  return (
    <div className="app">
      <Header />
      {view === "home" && (
        <HomePage onStarted={handleStarted} />
      )}
      {view === "running" && (
        <RunningPage
          runId={runId}
          events={liveEvents}
          onEvent={handleEvent}
        />
      )}
      {view === "questions" && (
        <QuestionsPage
          runId={runId}
          questions={questions}
          onAnswersSubmitted={handleAnswersSubmitted}
          onEvent={handleEvent}
        />
      )}
      {view === "submitted" && (
        <SubmittedPage
          receipt={receipt}
          filledPreview={filledPreview}
          submissionType={submissionType}
          onReset={handleReset}
        />
      )}
      {view === "failed" && (
        <FailedPage failure={failureInfo} onReset={handleReset} />
      )}
    </div>
  );
}
