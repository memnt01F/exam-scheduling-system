# KFUPM Exam Scheduling System

A full-stack web application for managing and scheduling exams at KFUPM. Built with React (Vite) on the front-end and Node.js + Express.js + MongoDB Atlas on the back-end.

🌐 **Live App:** https://kfupm-exam-scheduling-42ia.onrender.com

> **Note:** The app is hosted on Render's free tier. The backend may take **30–50 seconds** to wake up on the first request after inactivity. Please wait and try again if you see a connection error.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Environment Variables](#environment-variables)
  - [Frontend Setup](#frontend-setup)
- [Test Accounts](#test-accounts)
- [Development Seed Accounts](#development-seed-accounts)
- [Testing Guide for Graders](#testing-guide-for-graders)
  - [How to Test Conflict Detection](#how-to-test-conflict-detection)
  - [Conflict Test Cases](#conflict-test-cases)
- [API Documentation](#api-documentation)
  - [Bookings](#bookings-apibookings)
  - [Users](#users-apiusers)
  - [Courses](#courses-apicourses)
  - [Phases](#phases-apiphases)
  - [Academic Terms](#academic-terms-apiterms)
  - [Audit Logs](#audit-logs-apiauditlogs)
  - [Anchor Slots](#anchor-slots-apianchors)
  - [Enrollments](#enrollments-apienrollments)
  - [Course Offerings](#course-offerings-apicourse-offerings)
  - [Schedule Generation](#schedule-generation-apischedule)
- [Error Handling](#error-handling)
- [Project Structure](#project-structure)

---

## Project Overview

ExamEase allows department coordinators to book exam slots for their courses, while a scheduling committee reviews and approves those bookings. An admin manages users, system settings, and reference data. The system automatically detects student conflicts and maintains a full audit trail of all actions.

**Roles:**
- **Coordinator** — books and manages exam slots for their department's courses
- **Committee** — reviews, approves, or rejects bookings submitted by coordinators
- **Admin** — manages users, reference data, system configuration, and views audit logs

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend   | Node.js, Express.js                     |
| Database  | MongoDB Atlas (Mongoose ODM)            |
| Tooling   | nodemon (dev), dotenv                   |

---


## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **MongoDB Atlas** account and cluster ([free tier](https://www.mongodb.com/cloud/atlas/register) is sufficient)

---

### Backend Setup

```bash
# 1. Navigate to the backend folder
cd backend

# 2. Install dependencies
npm install

# 3. Configure environment variables (see below)

# 4. Start the development server
npm run dev
```

The backend will start on **http://localhost:5001** by default.

---

### Environment Variables

The backend requires a `.env` file inside the `backend/` folder. A template is provided at `backend/.env.example`.

**Step 1 — Copy the example file:**

```bash
# From the backend/ directory
cp .env.example .env
```

**Step 2 — Fill in your values:**

Open `backend/.env` and replace the placeholders with your actual credentials:

```env
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
PORT=5001
```

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URL` | Yes | MongoDB Atlas connection string. Found in your Atlas cluster under **Connect → Drivers**. |
| `PORT` | No | Port the Express server listens on. Defaults to `5001` if not set. |
| `SCHEDULER_URL` | No | Base URL of the Python scheduling service. Defaults to `http://localhost:8000`. Set to the deployed Render URL in production. |

> **Never commit your `.env` file.** It is already listed in `backend/.gitignore`.

**How to get your `MONGO_URL`:**
1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Select your cluster → click **Connect**
3. Choose **Drivers**, select **Node.js**
4. Copy the connection string and replace `<password>` with your database user's password

To verify it's running, visit:
```
http://localhost:5001/
```
You should see: `Exam Scheduling Backend is running`

**Available backend scripts:**

| Script         | Command               | Description                                      |
|----------------|-----------------------|--------------------------------------------------|
| Development    | `npm run dev`         | Starts server with nodemon (auto-restart)        |
| Production     | `npm start`           | Starts server with node                          |
| Seed           | `npm run seed`        | Creates all default dev accounts (see Test Accounts) |
| Seed dev users | `npm run seed:users`  | Creates all default accounts (same as above)     |

---

### Frontend Setup

```bash
# 1. Navigate to the project root
cd exam-scheduling-system

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The frontend will start on **http://localhost:8080** by default.

> **Important:** Make sure the backend server is running before starting the frontend, as the app fetches live data on load.

---

## Development Seed Accounts

When running the project locally, seed the database with:

```bash
# From the backend/ directory
npm run seed
```

This creates all default dev accounts. The script is **idempotent** — running it multiple times is safe. It skips any account that already exists.

The seeded accounts are exactly the ones listed in the [Test Accounts](#test-accounts) table below.

> **Enrollment data** is loaded through the admin panel — go to **System Settings → Enrollment Data**, select a term, and upload an `.xlsx` file. Student IDs are masked before storage.

> **Note for coordinators:** Seeded coordinator accounts have no courses assigned by default. After seeding, log in as admin, go to **User Management**, and assign courses to each coordinator so they can see and book their courses on the dashboard.

---

## Test Accounts

Use the following credentials to log in and explore different roles.

> **All accounts use the password `kfupm1234`.**

| Name | Email | Role | Password |
|------|-------|------|----------|
| Admin | admin@kfupm.edu.sa | **Admin** | `kfupm1234` |
| Dr. Fatima Al-Otaibi | falotaibi@kfupm.edu.sa | Committee | `kfupm1234` |
| Dr. Nasser Al-Mutairi | nmutairi@kfupm.edu.sa | Committee | `kfupm1234` |
| Dr. Ahmed Al-Rashid | arashid@kfupm.edu.sa | Coordinator | `kfupm1234` |
| Dr. Khalid Al-Dossary | kdossary@kfupm.edu.sa | Coordinator | `kfupm1234` |
| Dr. Sara Al-Zahrani | szahrani@kfupm.edu.sa | Coordinator | `kfupm1234` |
| Dr. Layla Al-Qahtani | lqahtani@kfupm.edu.sa | Coordinator | `kfupm1234` |
| H. Jamaan | hjamaan@kfupm.edu.sa | Coordinator | `kfupm1234` |

---

## Testing Guide for Graders

### How to Test Conflict Detection

The system automatically prevents booking two courses on the same date if students are enrolled in both. To test conflict detection:

1. Log in as **H. Jamaan** (`hjamaan@kfupm.edu.sa` / `kfupm1234`) — this account is assigned to **SWE206** and is ideal for testing conflicts.
2. Go to the **Booking Page**.
3. Create a booking for the first course on a specific date.
4. Try to create a booking for the second course on the **same date**.
5. The system should either block the booking (conflict detected) or allow it (no shared students).

---

### Conflict Test Cases

#### ✅ Should NOT trigger a conflict (safe to book on the same date)

| Course A | Course B | Reason |
|----------|----------|--------|
| SWE206 | ICS344 | No shared students |
| SWE206 | CHEM101 | No shared students |
| SWE206 | CHEM102 | No shared students |
| ICS344 | ICS202 | No shared students |
| ICS344 | PHYS101 | No shared students |
| ICS253 | CHEM102 | No shared students |
| CHEM101 | CHEM102 | No shared students |
| STAT201 | PHYS101 | No shared students |
| STAT201 | PHYS102 | No shared students |
| MATH101 | MATH102 | No shared students |
| PHYS101 | PHYS102 | No shared students |
| ICS108 | ICS202 | No shared students |
| ICS202 | ICS104 | No shared students |

---

#### ❌ Should trigger a conflict (must NOT be booked on the same date)

| Course A | Course B | Expected Result |
|----------|----------|-----------------|
| SWE206 | MATH201 | 🚫 Conflict detected |
| ICS344 | ICS253 | 🚫 Conflict detected |
| CHEM101 | PHYS101 | 🚫 Conflict detected |
| MATH201 | ICS202 | 🚫 Conflict detected |
| SWE206 | ICS202 | 🚫 Conflict detected |

> **How conflicts work:** The system checks the enrollment database to find students enrolled in both courses. If any shared students exist, booking them on the same date is blocked with a `409 Conflict` response.

---

## API Documentation

All endpoints are prefixed with `/api`. The server runs on port `5001` by default.

**Base URL (local):** `http://localhost:5001`  
**Base URL (live):** `https://kfupm-exam-scheduling.onrender.com`

---

### Bookings `/api/bookings`

#### `GET /api/bookings`
Returns all active bookings (status: `pending` or `approved`), ordered by exam date.

**Response `200 OK`:**
```json
[
  {
    "_id": "64f1a...",
    "courseCode": "ICS 101",
    "examType": "Major 1",
    "examDate": "2025-03-10T00:00:00.000Z",
    "level": 1,
    "maleProctors": 2,
    "femaleProctors": 1,
    "status": "pending",
    "createdBy": "arashid@kfupm.edu.sa",
    "notes": "Room 201"
  }
]
```

---

#### `POST /api/bookings`
Creates a new exam booking.

**Request body:**
```json
{
  "courseCode": "ICS 101",
  "examDate": "2025-03-10",
  "level": 1,
  "examType": "Major 1",
  "maleProctors": 2,
  "femaleProctors": 1,
  "createdBy": "arashid@kfupm.edu.sa",
  "notes": "Room 201"
}
```

**Required fields:** `courseCode`, `examDate`, `level`, `createdBy`

**Valid `examType` values:** `"Major 1"`, `"Major 2"`, `"Mid"`

**Responses:**
- `201 Created` — booking created successfully
- `200 OK` — previously cancelled booking reactivated
- `400 Bad Request` — missing required fields or invalid examType
- `409 Conflict` — duplicate booking or student conflict detected

---

#### `POST /api/bookings/check-conflict`
Previews whether a date would cause a student conflict, without creating a booking.

**Request body:**
```json
{
  "courseCode": "ICS 101",
  "examDate": "2025-03-10"
}
```

**Response `200 OK`:**
```json
{ "hasConflict": false }
```

---

#### `PUT /api/bookings/:id`
Reschedules or edits an existing booking.

**Request body (only include fields you want to change):**
```json
{
  "examDate": "2025-03-15",
  "examType": "Major 2",
  "level": 2,
  "maleProctors": 3,
  "femaleProctors": 2,
  "updatedBy": "arashid@kfupm.edu.sa"
}
```

**Responses:**
- `200 OK` — booking updated successfully
- `400 Bad Request` — invalid fields
- `404 Not Found` — booking ID does not exist
- `409 Conflict` — conflict detected on new date

---

#### `DELETE /api/bookings/:id`
Soft-cancels a booking (sets status to `"cancelled"`). The record is preserved for the audit trail.

**Request body:**
```json
{
  "user": "arashid@kfupm.edu.sa",
  "role": "coordinator"
}
```

**Response `200 OK`:**
```json
{ "message": "Booking cancelled", "booking": { "...": "..." } }
```

**Responses:**
- `200 OK` — booking cancelled
- `404 Not Found` — booking ID does not exist

---

### Users `/api/users`

#### `GET /api/users`
Returns all users.

**Response `200 OK`:**
```json
[
  {
    "_id": "...",
    "name": "Dr. Ahmed Al-Rashid",
    "email": "arashid@kfupm.edu.sa",
    "role": "coordinator",
    "department": "Information & Computer Science"
  }
]
```

---

#### `POST /api/users/login`
Authenticates a user.

**Request body:**
```json
{
  "email": "arashid@kfupm.edu.sa",
  "password": "kfupm1234"
}
```

**Response `200 OK`:**
```json
{
  "_id": "...",
  "name": "Dr. Ahmed Al-Rashid",
  "email": "arashid@kfupm.edu.sa",
  "role": "coordinator",
  "department": "Information & Computer Science"
}
```

**Responses:**
- `200 OK` — login successful
- `401 Unauthorized` — invalid email or password

---

#### `POST /api/users`
Creates a new user (Admin only).

**Request body:**
```json
{
  "name": "Dr. Example",
  "email": "example@kfupm.edu.sa",
  "password": "kfupm1234",
  "role": "coordinator",
  "department": "Mathematics"
}
```

**Valid `role` values:** `"admin"`, `"committee"`, `"coordinator"`

**Responses:**
- `201 Created` — user created
- `409 Conflict` — email already exists

---

#### `PUT /api/users/:id`
Updates a user's details.

**Request body (only include fields to change):**
```json
{
  "name": "Dr. Updated Name",
  "department": "Physics"
}
```

#### `DELETE /api/users/:id`
Deletes a user permanently.

---

### Courses `/api/courses`

#### `GET /api/courses`
Returns all courses.

**Response `200 OK`:**
```json
[
  {
    "_id": "...",
    "courseCode": "ICS 101",
    "courseName": "Introduction to Computing",
    "department": "ICS"
  }
]
```

---

#### `POST /api/courses`
Adds a new course.

**Request body:**
```json
{
  "courseCode": "ICS 201",
  "courseName": "Data Structures",
  "department": "ICS"
}
```

**Responses:**
- `201 Created` — course added
- `409 Conflict` — course code already exists

---

### Phases `/api/phases`

Manages the booking workflow phases (e.g. open, review, closed).

#### `GET /api/phases`
Returns current phase configuration.

**Response `200 OK`:**
```json
[
  {
    "_id": "...",
    "name": "Booking Open",
    "status": "active",
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-01-15T00:00:00.000Z"
  }
]
```

#### `PUT /api/phases/:id`
Updates a phase's status or date range.

**Request body:**
```json
{
  "status": "inactive",
  "endDate": "2025-01-20"
}
```

---

### Academic Terms `/api/terms`

#### `GET /api/terms`
Returns all academic terms.

#### `POST /api/terms`
Creates a new academic term.

**Request body:**
```json
{
  "term": "241",
  "startDate": "2024-09-01",
  "endDate": "2025-01-15"
}
```

**Responses:**
- `201 Created` — term created
- `409 Conflict` — term already exists

---

### Audit Logs `/api/auditlogs`

#### `GET /api/auditlogs`
Returns the full audit trail of all system actions.

**Response `200 OK`:**
```json
[
  {
    "_id": "...",
    "action": "CREATE_BOOKING",
    "user": "arashid@kfupm.edu.sa",
    "role": "coordinator",
    "courseCode": "ICS 101",
    "bookingId": "...",
    "details": "Created Major 1 booking for ICS 101 on 2025-03-10",
    "createdAt": "2025-01-20T14:30:00.000Z"
  }
]
```

**Tracked actions:** `CREATE_BOOKING`, `RESCHEDULE_BOOKING`, `CANCEL_BOOKING`, `BOOKING_CONFLICT`, `ENROLLMENT_UPLOAD`

---

### Anchor Slots `/api/anchors`

Anchor slots are pre-fixed exam time slots that cannot be moved by coordinators.

#### `GET /api/anchors`
Returns all anchor slots.

#### `POST /api/anchors`
Creates a new anchor slot.

**Request body:**
```json
{
  "courseCode": "ICS 101",
  "examDate": "2025-03-10",
  "examType": "Major 1"
}
```

**Responses:**
- `201 Created` — anchor slot created
- `409 Conflict` — slot already exists

#### `DELETE /api/anchors/:id`
Removes an anchor slot.

---

### Enrollments `/api/enrollments`

#### `GET /api/enrollments/stats`
Returns enrollment counts grouped by term.

**Response `200 OK`:**
```json
{
  "stats": [
    { "termId": "...", "count": 12400, "lastUpdated": "2026-07-06T09:52:57.008Z" }
  ]
}
```

---

#### `POST /api/enrollments/upload` *(multipart/form-data)*
Uploads an enrollment Excel file for a given term. Replaces all existing enrollments for that term. Student IDs are masked with SHA-256 (truncated to 7 digits) before storage.

**Form fields:** `termId` (string), `importedBy` (string, optional), `file` (.xlsx)

**Responses:**
- `200 OK` — `{ termName, termId, inserted, replaced }`
- `400 Bad Request` — missing termId, no file, wrong format, or no valid rows found
- `404 Not Found` — termId does not exist

---

### Course Offerings `/api/course-offerings`

#### `POST /api/course-offerings/import`
Scrapes the KFUPM Registrar and upserts courses into the reference data for a given term. Filters out graduate courses (500+), internship/summer training (398/399), and senior project courses.

**Request body:**
```json
{
  "termId": "...",
  "importedBy": "admin"
}
```

**Response `200 OK`:**
```json
{
  "termName": "252",
  "registrarTermCode": "202520",
  "summary": { "upserted": 412, "skipped": 0, "cleaned": 3 },
  "errors": []
}
```

---

### Schedule Generation `/api/schedule`

These routes proxy to the Python FastAPI scheduling service (`SCHEDULER_URL`). The service must be running separately — see the `schudeler-API` repo.

#### `POST /api/schedule/generate`
Starts a scheduling run. Returns immediately with a `jobId`; the solver runs in the background.

**Request body (all fields optional):**
```json
{
  "dryRun": true,
  "maxExamsPerDay": 4
}
```

- `dryRun: true` — solves and reports but does NOT write bookings to the database. Use this for testing.
- `maxExamsPerDay` — overrides the value in `schedulingconfigs` for this run only.

**Response `202 Accepted`:**
```json
{
  "jobId": "a400f70d28e2",
  "state": "running",
  "poll": "/jobs/a400f70d28e2"
}
```

**Responses:**
- `202 Accepted` — job started, poll for result
- `409 Conflict` — another job is already running
- `502 Bad Gateway` — scheduler service is unreachable

---

#### `GET /api/schedule/jobs/:id`
Polls a scheduling job. Call every ~5 seconds until `state === "finished"`.

**Response `200 OK` (while running):**
```json
{ "jobId": "...", "state": "running" }
```

**Response `200 OK` (finished):**
```json
{
  "jobId": "...",
  "state": "finished",
  "result": {
    "status": "done",
    "summary": { "total": 78, "byType": { "Major 1": 39, "Major 2": 39 } },
    "warnings": [],
    "write": { "deleted": 0, "inserted": 78 }
  }
}
```

`result.status` values: `done` | `infeasible` | `validation_error` | `error`

- `done` — schedule written to `bookings` collection as phase-0 documents
- `validation_error` — data constraints are impossible (e.g. too many exams for the available week windows); `result.message` explains exactly what to fix
- `infeasible` — solver ran but could not find a valid assignment within the time limit

**Responses:**
- `200 OK` — job found
- `404 Not Found` — unknown jobId (jobs live in memory and are cleared on service restart)
- `502 Bad Gateway` — scheduler service is unreachable

---

## Error Handling

All API endpoints return consistent error responses in the following format:

```json
{
  "message": "Description of what went wrong"
}
```

**HTTP Status Codes used:**

| Code | Meaning |
|------|---------|
| `200 OK` | Request succeeded |
| `201 Created` | Resource created successfully |
| `400 Bad Request` | Missing or invalid input fields |
| `401 Unauthorized` | Invalid login credentials |
| `404 Not Found` | Requested resource does not exist |
| `409 Conflict` | Duplicate resource or scheduling conflict |
| `500 Internal Server Error` | Unexpected server-side error |

---

## Project Structure

```
exam-scheduling-system/
├── backend/
│   ├── config/
│   │   └── db.js                    # MongoDB Atlas connection setup
│   ├── data/
│   │   └── MidTermExamsRandomizedData.xlsx  # Source data for seeding
│   ├── models/                      # Mongoose schemas (database structure)
│   │   ├── academicTerm.model.js
│   │   ├── anchorSlot.model.js
│   │   ├── auditLog.model.js
│   │   ├── booking.model.js
│   │   ├── course.model.js
│   │   ├── enrollment.model.js
│   │   ├── phase.model.js
│   │   └── user.model.js
│   ├── routes/                      # Express route handlers (RESTful APIs)
│   │   ├── academicTerm.routes.js
│   │   ├── anchorSlot.routes.js
│   │   ├── auditLog.routes.js
│   │   ├── booking.routes.js
│   │   ├── course.routes.js
│   │   ├── courseOffering.routes.js
│   │   ├── enrollment.routes.js
│   │   ├── phase.routes.js
│   │   ├── preference.routes.js
│   │   ├── schedule.routes.js           # Proxy to Python scheduler service
│   │   └── user.routes.js
│   ├── scripts/
│   │   ├── seed.js                  # Runs all seeders
│   │   └── seedUsers.js             # Seeds default dev accounts
│   ├── services/
│   │   ├── conflictService.js       # Student conflict detection logic
│   │   └── courseOfferingService.js # KFUPM Registrar scraper
│   ├── utils/
│   │   └── hashStudentId.js         # SHA-256 masking for student IDs
│   ├── .env                         # Environment variables (NOT committed — create from .env.example)
│   ├── .env.example                 # Template with placeholder values (safe to commit)
│   ├── .gitignore
│   ├── package.json
│   └── server.js                    # Express entry point
│
├── src/                             # React frontend source
│   ├── components/
│   │   ├── admin/
│   │   │   ├── ReferenceData.jsx
│   │   │   └── UserManagement.jsx
│   │   ├── DashboardLayout.jsx
│   │   └── ExamCalendar.jsx
│   ├── context/
│   │   ├── AuthContext.jsx          # Authentication state management
│   │   └── CoursesContext.jsx
│   ├── pages/
│   │   ├── AdminDashboard.jsx
│   │   ├── BookingPage.jsx
│   │   ├── CommitteeDashboard.jsx
│   │   ├── Dashboard.jsx
│   │   └── Login.jsx
│   ├── services/
│   │   └── api.js                   # API calls to backend
│   ├── App.jsx                      # App routes and layout
│   └── main.jsx
│
├── .gitignore
├── index.html
└── package.json
```
