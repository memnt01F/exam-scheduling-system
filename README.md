# Exam Scheduling System

A web-based exam scheduling and booking system built for KFUPM. It streamlines the coordination of exam slots across departments, course levels, and booking phases — supporting coordinators, scheduling committees, and system administrators through role-based dashboards.

## Features

- **Coordinator Dashboard** — View assigned courses, book/reschedule exam slots, and track booking status with real-time phase countdowns.
- **Scheduling Committee Dashboard** — Manage Level 1 (anchor) course configurations, oversee all bookings, control phase activation, review proctor summaries, and export final schedules.
- **System Administration** — Manage users and roles, configure academic terms (with .ics calendar import), maintain reference data (courses, departments), and view full audit logs.
- **Calendar-Based Booking** — Interactive monthly calendar synced with the KFUPM academic calendar, supporting blocked dates, holidays, and teaching-week awareness.
- **Phase-Based Access Control** — Three booking phases (Phase 0, Phase 1, Phase 2) with configurable date windows and manual activation toggles.
- **Conflict Detection** — Prevents double-booking and enforces scheduling constraints.
- **Proctor Management** — Male and female proctor requirement tracking per exam slot.
- **CSV Export** — Export the finalized exam schedule for distribution.
- **Responsive Design** — Fully usable on desktop, tablet, and mobile devices.

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | React 18                            |
| Build Tool  | Vite 5                              |
| Language    | JavaScript (JSX)                    |
| Styling     | Tailwind CSS v3 + custom CSS tokens |
| Routing     | React Router DOM v7                 |
| State       | React Context API                   |
| UI Library  | Lucide React (icons), Sonner (toasts) |

## Project Structure

```
├── index.html              # Entry HTML
├── package.json            # Dependencies and scripts
├── vite.config.ts          # Vite configuration
├── tailwind.config.ts      # Tailwind CSS configuration
├── postcss.config.js       # PostCSS configuration
├── .gitignore              # Git ignore rules
├── public/                 # Static assets
│   ├── placeholder.svg
│   └── robots.txt
└── src/
    ├── main.jsx            # App entry point
    ├── App.jsx             # Root component and routes
    ├── index.css           # Global styles and design tokens
    ├── components/         # Reusable UI components
    │   ├── DashboardLayout.jsx
    │   ├── ExamCalendar.jsx
    │   ├── ui/             # Base UI primitives
    │   └── admin/          # Admin-specific components
    ├── context/            # React Context providers
    │   ├── AuthContext.jsx
    │   └── CoursesContext.jsx
    ├── hooks/              # Custom React hooks
    ├── lib/                # Utilities, mock data, helpers
    │   ├── mock-data.js
    │   ├── mock-admin-data.js
    │   ├── anchor-courses.js
    │   ├── ics-parser.js
    │   └── utils.js
    └── pages/              # Page-level route components
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── BookingPage.jsx
        ├── CommitteeDashboard.jsx
        ├── AdminDashboard.jsx
        └── NotFound.jsx
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js) or [Bun](https://bun.sh/)

## Setup & Installation

```bash
# 1. Clone the repository
git clone https://github.com/Kaltham1/exam-scheduling-system.git
cd exam-scheduling-system

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

## Available Scripts

| Command           | Description                        |
|-------------------|------------------------------------|
| `npm run dev`     | Start local development server     |
| `npm run build`   | Build for production               |
| `npm run preview` | Preview the production build       |

## Environment Variables

This project currently runs entirely on the client side with mock data — **no API keys or environment variables are required** for local development.

If backend integration (e.g., Supabase, authentication providers) is added in the future, create a `.env` file in the project root:

```env
# Example — do NOT commit this file
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Important:** The `.env` file is excluded via `.gitignore`. Never hard-code API keys or secrets in source files.

## Usage

### Login

The app uses mock authentication. Select a role from the login page:

| Role        | Access                                      |
|-------------|---------------------------------------------|
| Coordinator | Dashboard, exam booking/rescheduling         |
| Committee   | Booking overview, Level 1 config, phases     |
| Admin       | User management, system settings, audit logs |

### Booking Flow

1. Log in as a **Coordinator**.
2. From the Dashboard, click **Book** on any course with an active phase.
3. Select an exam type (Major 1, Major 2, or Mid).
4. Pick a date from the interactive calendar.
5. Enter male and female proctor counts.
6. Confirm the booking.

### Committee Workflow

1. Log in as **Committee**.
2. Use the **Level 1 Config** tab to assign anchor slots for Level 1 courses.
3. Use **Phase Management** to activate/deactivate booking phases.
4. Monitor all bookings in the **Booking Overview** tab.
5. Export the final schedule via the **Final Schedule** tab.

## Team Members

<!-- Fill in your team details below -->

| Name | Role | Student ID |
|------|------|------------|
| Kaltham Alhashmi     |      |   202371470         |
|      |      |            |
|      |      |            |
|      |      |            |




