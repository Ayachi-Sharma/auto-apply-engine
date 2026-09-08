# Bugfix Requirements Document

## Introduction

The Auto-Apply Engine's ATS adapters for Greenhouse, Ashby, and Workable platforms are currently broken and fail to process job applications. While the Lever adapter functions correctly as a reference implementation, these three adapters either throw "not yet implemented" errors or have bugs in their field extraction, form filling, resume upload, or submission logic. This prevents users from applying to jobs on these major ATS platforms, significantly limiting the engine's usefulness.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user attempts to apply to a job on boards.greenhouse.io or job-boards.greenhouse.io THEN the system throws "Greenhouse adapter is not yet implemented" errors

1.2 WHEN a user attempts to apply to a job on apply.workable.com THEN the system throws "Workable adapter is not yet implemented" errors

1.3 WHEN a user attempts to apply to a job on jobs.ashbyhq.com THEN the system may fail during field extraction, form filling, resume upload, or submission with various adapter-specific errors

1.4 WHEN the application engine detects these ATS platforms THEN it correctly routes to the appropriate adapter but the adapters fail to complete the application process

### Expected Behavior (Correct)

2.1 WHEN a user attempts to apply to a job on boards.greenhouse.io or job-boards.greenhouse.io THEN the system SHALL successfully extract form fields, fill user profile data, upload resume, and submit the application

2.2 WHEN a user attempts to apply to a job on apply.workable.com THEN the system SHALL successfully extract form fields, fill user profile data, upload resume, and submit the application

2.3 WHEN a user attempts to apply to a job on jobs.ashbyhq.com THEN the system SHALL successfully extract form fields, fill user profile data, upload resume, and submit the application

2.4 WHEN any of these adapters encounter missing required fields THEN the system SHALL return {status: "NEEDS_INPUT", questions: [...]} to prompt the user

2.5 WHEN any of these adapters complete successfully THEN the system SHALL return {status: "SUBMITTED", receipt: {...}, confirmation_text: "..."}

2.6 WHEN any of these adapters encounter unrecoverable errors THEN the system SHALL return {status: "FAILED", reason: "...", step: "...", screenshot: "..."}

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user applies to a job on jobs.lever.co THEN the system SHALL CONTINUE TO successfully process applications using the existing LeverAdapter implementation

3.2 WHEN the ATS detector processes job URLs THEN the system SHALL CONTINUE TO correctly route URLs to their respective adapters based on hostname matching

3.3 WHEN the application engine processes the core contract THEN the system SHALL CONTINUE TO support the apply(job_url, profile, resume_pdf) and apply_resume(run_id, answers) functions

3.4 WHEN field mapping occurs THEN the system SHALL CONTINUE TO use the existing fieldMapper service to map form fields to user profile data

3.5 WHEN browser automation executes THEN the system SHALL CONTINUE TO use Playwright with stealth plugins and proper error handling including CAPTCHA support