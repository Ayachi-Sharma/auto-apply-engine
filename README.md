# Auto-Apply Engine

An automated job application engine that detects ATS platforms, extracts application fields, maps them against a candidate profile, fills supported fields, uploads a resume, pauses for missing information, and resumes the application after receiving user answers.

The project is built using:

- Node.js
- Express.js
- MongoDB
- Mongoose
- React
- Vite
- Playwright
- Server-Sent Events (SSE)
- ATS-specific adapters

---

## Features

- ATS detection
  - Lever
  - Ashby
  - Workable

- Automated application field extraction
- Profile-to-field mapping
- Resume upload
- Structured screening-question handling
- Batch collection of missing required information
- Pause and resume application flow
- Persistent application runs using MongoDB
- Real-time application status updates using SSE
- Application receipt after submission
- Step-by-step application trace
- Screenshots during application execution
- ATS adapter architecture for easy extension

---

1. Clone the Repository
2. Backend Setup : npm i
3. Create Environment Variables: .env with MONGODB_URI and PORT
4. Frontend Setup : npm i
---

# Project Structure
User
 │
 │ Job URL + Profile + Resume
 ▼
Frontend
 │
 ▼
POST /api/applications
 │
 ▼
ATS Detector
 │
 ├── Lever
 ├── Ashby
 └── Workable
 │
 ▼
ATS Adapter
 │
 ▼
Extract Application Fields
 │
 ▼
Field Mapper
 │
 ├── Confidently mapped fields
 │
 └── Missing / uncertain fields
 │
 ▼
Fill Application
 │
 ▼
Upload Resume
 │
 ▼
Are required fields missing?
 │
 ├── YES
 │     │
 │     ▼
 │  NEEDS_INPUT
 │     │
 │     ▼
 │  User provides answers
 │     │
 │     ▼
 │  Resume Application
 │
 └── NO
       │
       ▼
    Submit
       │
       ▼
   Application Receipt
