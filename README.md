# KFUPM Exam Scheduling System

A full-stack web application for managing and scheduling exams at KFUPM. Built with React (Vite) on the front-end and Node.js + Express + MongoDB Atlas on the back-end.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Test Accounts](#test-accounts)
- [API Documentation](#api-documentation)
  - [Bookings](#bookings-apibookings)
  - [Users](#users-apiusers)
  - [Courses](#courses-apicourses)
  - [Phases](#phases-apiphases)
  - [Academic Terms](#academic-terms-apiterms)
  - [Audit Logs](#audit-logs-apiauditlogs)
  - [Anchor Slots](#anchor-slots-apianchors)
- [Project Structure](#project-structure)

---

## Project Overview

ExamEase allows department coordinators to book exam slots for their courses, while a scheduling committee reviews and approves those bookings. An admin manages users, system settings, and reference data. The system detects student conflicts automatically and maintains a full audit trail.

**Roles:**
- **Coordinator** — books and manages exam slots for their department's courses
- **Committee** — reviews, approves, or rejects bookings submitted by coordinators
- **Admin** — manages users, reference data, system configuration, and views audit logs

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend   | Node.js, Express.js                 |
| Database  | MongoDB Atlas (Mongoose ODM)        |
| Tooling   | nodemon (dev), dotenv               |

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A MongoDB Atlas connection string (already configured in `.env`)

---

### Backend Setup

```bash
# 1. Navigate to the backend folder
cd exam-ease/backend

# 2. Install dependencies
npm install

# 3. Configure environment variables
#    A .env file is already provided. It contains the MongoDB Atlas URI.
#    If you need to reset it, create a new .env with:
#
#    MONGO_URL=<your_mongodb_atlas_connection_string>
#    PORT=5001

# 4. (Optional) Seed enrollment data
npm run seed

# 5. Start the development server
npm run dev
```

The backend will start on **http://localhost:5001** by default.

To verify it's running, open your browser and visit:
```
http://localhost:5001/
```
You should see: `Exam Scheduling Backend is running`

---

### Frontend Setup

```bash
# 1. Navigate to the project root
cd exam-ease

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The frontend will start on **http://localhost:8080** by default.

> **Note:** Make sure the backend is running before starting the frontend, as the app fetches live data on load.

---

## Test Accounts

Use the following credentials to log in and test different roles.

> **All accounts use the password `kfupm2026` except the Admin account.**

| Name | Email | Role | Password |
|---|---|---|---|
| Eng. Omar Al-Harbi | oalharbi@kfupm.edu.sa | **Admin** | `password` |
| Dr. Fatima Al-Otaibi | falotaibi@kfupm.edu.sa | Committee | `kfupm2026` |
| Dr. Nasser Al-Mutairi | nmutairi@kfupm.edu.sa | Committee | `kfupm2026` |
| Dr. Ahmed Al-Rashid | arashid@kfupm.edu.sa | Coordinator | `kfupm2026` |
| Dr. Khalid Al-Dossary | kdossary@kfupm.edu.sa | Coordinator | `kfupm2026` |
| Dr. Sara Al-Zahrani | szahrani@kfupm.edu.sa | Coordinator | `kfupm2026` |
| Dr. Layla Al-Qahtani | lqahtani@kfupm.edu.sa | Coordinator | `kfupm2026` |

---

## API Documentation

All endpoints are prefixed with `/api`. The server runs on port `5001` by default.

Base URL: `http://localhost:5001`

---

### Bookings `/api/bookings`

#### `GET /api/bookings`
Returns all active bookings (status: `pending` or `approved`), ordered by exam date.

**Response example:**
```json
[
  {
    "_id": "64f1a...",
    "courseCode": "ICS 101",
    "examType": "Major 1",
    "examDate": "2025-03-10T00:00:00.000Z",
    "level": 1,
    "status": "pending",
    "createdBy": "arashid@kfupm.edu.sa"
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

**Valid `examType` values:** `"Major 1"`, `"Major 2"`, `"Mid"`

**Responses:**
- `201 Created` — booking created successfully
- `409 Conflict` — duplicate booking or student conflict detected
- `400 Bad Request` — missing required fields

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

**Response:**
```json
{ "hasConflict": false }
```

---

#### `PUT /api/bookings/:id`
Reschedules or edits an existing booking.

**Request body (all fields optional, sends only changed fields):**
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
- `200 OK` — booking updated
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

**Response:**
```json
{ "message": "Booking cancelled", "booking": { ... } }
```

---

### Users `/api/users`

#### `GET /api/users`
Returns all users.

#### `POST /api/users`
Creates a new user.

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

#### `PUT /api/users/:id`
Updates a user's details.

#### `DELETE /api/users/:id`
Deletes a user.

#### `POST /api/users/login`
Authenticates a user.

**Request body:**
```json
{
  "email": "arashid@kfupm.edu.sa",
  "password": "kfupm2026"
}
```

**Response:**
```json
{
  "_id": "...",
  "name": "Dr. Ahmed Al-Rashid",
  "email": "arashid@kfupm.edu.sa",
  "role": "coordinator",
  "department": "Information & Computer Science"
}
```

---

### Courses `/api/courses`

#### `GET /api/courses`
Returns all courses.

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

---

### Phases `/api/phases`

Manages the booking workflow phases (open, review, closed, etc.).

#### `GET /api/phases`
Returns current phase configuration.

#### `PUT /api/phases/:id`
Updates a phase's status or date range.

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

---

### Audit Logs `/api/auditlogs`

#### `GET /api/auditlogs`
Returns the full audit trail of all system actions (bookings created, rescheduled, cancelled, conflicts, etc.).

**Response example:**
```json
[
  {
    "action": "CREATE_BOOKING",
    "user": "arashid@kfupm.edu.sa",
    "role": "coordinator",
    "courseCode": "ICS 101",
    "details": "Created Major 1 booking for ICS 101 on 2025-03-10",
    "createdAt": "2025-01-20T14:30:00.000Z"
  }
]
```

---

### Anchor Slots `/api/anchors`

Anchor slots are pre-fixed exam time slots that cannot be moved.

#### `GET /api/anchors`
Returns all anchor slots.

#### `POST /api/anchors`
Creates a new anchor slot.

#### `DELETE /api/anchors/:id`
Removes an anchor slot.

---

## Project Structure

```
exam-ease/
├── backend/
│   ├── config/
│   │   └── db.js                  # MongoDB connection
│   ├── data/
│   │   └── MidTermExamsRandomizedData.xlsx
│   ├── models/
│   │   ├── academicTerm.model.js
│   │   ├── anchorSlot.model.js
│   │   ├── auditLog.model.js
│   │   ├── booking.model.js
│   │   ├── course.model.js
│   │   ├── enrollment.model.js
│   │   ├── phase.model.js
│   │   └── user.model.js
│   ├── routes/
│   │   ├── academicTerm.routes.js
│   │   ├── anchorSlot.routes.js
│   │   ├── auditLog.routes.js
│   │   ├── booking.routes.js
│   │   ├── course.routes.js
│   │   ├── phase.routes.js
│   │   └── user.routes.js
│   ├── scripts/
│   │   └── seedEnrollments.js
│   ├── services/
│   │   └── conflictService.js     # Student conflict detection logic
│   ├── .env                       # Environment variables (not committed to GitHub)
│   ├── package.json
│   └── server.js                  # Express entry point
│
├── src/
│   ├── components/
│   │   ├── admin/
│   │   │   ├── ReferenceData.jsx
│   │   │   └── UserManagement.jsx
│   │   ├── DashboardLayout.jsx
│   │   └── ExamCalendar.jsx
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── CoursesContext.jsx
│   ├── pages/
│   │   ├── AdminDashboard.jsx
│   │   ├── BookingPage.jsx
│   │   ├── CommitteeDashboard.jsx
│   │   ├── Dashboard.jsx
│   │   └── Login.jsx
│   ├── services/
│   │   └── api.js                 # Axios API calls to backend
│   ├── App.jsx
│   └── main.jsx
│
├── index.html
└── package.json
```
