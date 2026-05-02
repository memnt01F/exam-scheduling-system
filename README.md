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
  - [Frontend Setup](#frontend-setup)
- [Test Accounts](#test-accounts)
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


---

### Backend Setup

```bash
# 1. Navigate to the backend folder
cd backend

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The backend will start on **http://localhost:5001** by default.

To verify it's running, visit:
```
http://localhost:5001/
```
You should see: `Exam Scheduling Backend is running`

**Available backend scripts:**

| Script        | Command        | Description                               |
|---------------|----------------|-------------------------------------------|
| Development   | `npm run dev`  | Starts server with nodemon (auto-restart) |
| Production    | `npm start`    | Starts server with node                   |
| Seed database | `npm run seed` | Seeds enrollment data from Excel file     |

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

## Test Accounts

Use the following credentials to log in and explore different roles.

> **All accounts use the password `kfupm2026` — except the Admin account which uses `password`.**

| Name | Email | Role | Password |
|------|-------|------|----------|
| Admin | admin@kfupm.edu.sa | **Admin** | `password` |
| Dr. Fatima Al-Otaibi | falotaibi@kfupm.edu.sa | Committee | `kfupm2026` |
| Dr. Nasser Al-Mutairi | nmutairi@kfupm.edu.sa | Committee | `kfupm2026` |
| Dr. Ahmed Al-Rashid | arashid@kfupm.edu.sa | Coordinator | `kfupm2026` |
| Dr. Khalid Al-Dossary | kdossary@kfupm.edu.sa | Coordinator | `kfupm2026` |
| Dr. Sara Al-Zahrani | szahrani@kfupm.edu.sa | Coordinator | `kfupm2026` |
| Dr. Layla Al-Qahtani | lqahtani@kfupm.edu.sa | Coordinator | `kfupm2026` |
| H. Jamaan | hjamaan@kfupm.edu.sa | Coordinator | `kfupm2026` |

---

## Testing Guide for Graders

### How to Test Conflict Detection

The system automatically prevents booking two courses on the same date if students are enrolled in both. To test conflict detection:

1. Log in as **H. Jamaan** (`hjamaan@kfupm.edu.sa` / `kfupm2026`) — this account is assigned to **SWE206** and is ideal for testing conflicts.
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
  "password": "kfupm2026"
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
  "password": "kfupm2026",
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

**Tracked actions:** `CREATE_BOOKING`, `RESCHEDULE_BOOKING`, `CANCEL_BOOKING`, `BOOKING_CONFLICT`

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
│   │   ├── phase.routes.js
│   │   └── user.routes.js
│   ├── scripts/
│   │   └── seedEnrollments.js       # Database seeding script
│   ├── services/
│   │   └── conflictService.js       # Student conflict detection logic
│   ├── .env                         # Environment variables (NOT committed to GitHub)
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
