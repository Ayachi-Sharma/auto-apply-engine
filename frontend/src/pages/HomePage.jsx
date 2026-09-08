import { useState, useRef } from "react";

const API = "/api";

export default function HomePage({ onStarted }) {
  const [jobUrl, setJobUrl] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  // Profile fields
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    linkedin: "",
    github: "",
    company: "",
  });

  function setField(key, val) {
    setProfile((p) => ({ ...p, [key]: val }));
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (f) setResumeFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!jobUrl.trim()) return setError("Please enter a job URL.");
    if (!profile.fullName.trim()) return setError("Full name is required.");
    if (!profile.email.trim()) return setError("Email is required.");
    if (!resumeFile) return setError("Please upload your resume.");

    setSubmitting(true);
    try {
      const profileObj = {
        personalInfo: {
          fullName: profile.fullName.trim(),
          email: profile.email.trim(),
          phone: profile.phone.trim(),
          address: profile.address.trim(),
          profiles: [
            ...(profile.linkedin ? [{ platform: "LinkedIn", url: profile.linkedin.trim() }] : []),
            ...(profile.github   ? [{ platform: "Github",   url: profile.github.trim()   }] : []),
          ],
        },
        experience: profile.company
          ? [{ company: profile.company.trim(), title: "", current: true }]
          : [],
      };

      const form = new FormData();
      form.append("jobUrl", jobUrl.trim());
      form.append("profile", JSON.stringify(profileObj));
      form.append("resume", resumeFile);

      const res = await fetch(`${API}/applications`, { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to start application");
      onStarted(data.runId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <div className="container">
        <div className="hero">
          <div className="hero-badge">? AI-Powered</div>
          <h1>Apply to jobs <span>instantly</span></h1>
          <p>Paste a job link, fill your profile once, and let the engine do the rest.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="card">

            {/* Job URL */}
            <div className="form-section">
              <div className="section-title">?? Job URL</div>
              <div className="field">
                <label htmlFor="jobUrl">Lever / Ashby / Workable link</label>
                <input
                  id="jobUrl"
                  type="url"
                  placeholder="https://jobs.lever.co/company/job-id"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                />
              </div>
            </div>

            <hr className="divider" />

            {/* Profile */}
            <div className="form-section">
              <div className="section-title">?? Your Profile</div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="fullName">Full Name *</label>
                  <input id="fullName" type="text" placeholder="Jane Smith"
                    value={profile.fullName} onChange={(e) => setField("fullName", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="email">Email *</label>
                  <input id="email" type="email" placeholder="jane@example.com"
                    value={profile.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" placeholder="+1 (555) 000-0000"
                    value={profile.phone} onChange={(e) => setField("phone", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="address">Location</label>
                  <input id="address" type="text" placeholder="San Francisco, CA"
                    value={profile.address} onChange={(e) => setField("address", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="linkedin">LinkedIn URL</label>
                  <input id="linkedin" type="url" placeholder="https://linkedin.com/in/you"
                    value={profile.linkedin} onChange={(e) => setField("linkedin", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="github">GitHub URL</label>
                  <input id="github" type="url" placeholder="https://github.com/you"
                    value={profile.github} onChange={(e) => setField("github", e.target.value)} />
                </div>
                <div className="field field-full">
                  <label htmlFor="company">Current Company</label>
                  <input id="company" type="text" placeholder="Acme Inc. (or leave blank if unemployed)"
                    value={profile.company} onChange={(e) => setField("company", e.target.value)} />
                </div>
              </div>
            </div>

            <hr className="divider" />

            {/* Resume Upload */}
            <div className="form-section">
              <div className="section-title">?? Resume</div>
              <div
                className="upload-zone"
                onClick={() => fileRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setResumeFile(f); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFile} id="resumeInput" />
                <div className="upload-icon">??</div>
                <div className="upload-label"><span>Click to upload</span> or drag & drop</div>
                <div className="upload-hint">PDF, DOC, DOCX � max 20 MB</div>
              </div>
              {resumeFile && (
                <div className="upload-selected">
                  <span>?</span>
                  <span className="upload-selected-name">{resumeFile.name}</span>
                  <button type="button" className="upload-selected-remove"
                    onClick={() => { setResumeFile(null); fileRef.current.value = ""; }}>?</button>
                </div>
              )}
            </div>

            {error && (
              <div className="error-box" style={{ marginBottom: 16 }}>
                <code>?? {error}</code>
              </div>
            )}

            <button type="submit" id="applyBtn" className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? <><div className="spinner"></div> Starting�</> : "? Apply Now"}
            </button>
          </div>
        </form>

        <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.78rem", marginTop: 20, paddingBottom: 40 }}>
          Your data is used only for this application and never stored beyond your session.
        </p>
      </div>
    </main>
  );
}
