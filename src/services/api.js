/**
 * Frontend API service layer.
 *
 * All requests go through the Vite dev proxy (`/api` → http://localhost:5000)
 * configured in `vite.config.ts`. This means:
 *   - In local dev (`npm run dev`) with the Node/Express backend running,
 *     these calls hit the real MongoDB-backed API.
 *   - In the hosted Lovable preview, calls to `/api/...` will fail because
 *     there is no backend reachable. Callers should handle that gracefully
 *     (e.g. fall back to local state — see CoursesContext).
 *
 * Use plain `fetch`. Do NOT introduce axios.
 */

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

/** Wrap fetch with consistent error shape. */
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }

  if (!res.ok) {
    const error = new Error((data && data.message) || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

/* ──────────────────────────── Bookings ──────────────────────────── */

export async function getBookings(params = {}) {
  const qs = new URLSearchParams();
  if (params.termId)                    qs.set('termId', params.termId);
  if (params.phaseNumber !== undefined) qs.set('phaseNumber', params.phaseNumber);
  return request(`/bookings${qs.toString() ? `?${qs}` : ''}`);
}

/**
 * Create a booking.
 * payload = {
 *   courseCode, examDate (YYYY-MM-DD), level,
 *   maleProctors, femaleProctors, createdBy
 * }
 *
 * Throws on non-2xx. For 409 conflicts, error.status === 409 and
 * error.data contains { message, conflictCount, conflictingCourses, conflicts }.
 */
export async function createBooking(payload) {
  return request("/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Soft-cancel a booking (sets status to "cancelled" on the backend). */
export async function deleteBooking(id, body = {}) {
  return request(`/bookings/${id}`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

/**
 * Update / reschedule a booking.
 * payload may include { courseCode, examType, examDate, level,
 *   maleProctors, femaleProctors, updatedBy, role }
 *
 * 409 on conflict — error.data carries { conflictCount, conflictingCourses }.
 */
export async function updateBooking(id, payload) {
  return request(`/bookings/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/**
 * Preview same-day student conflicts WITHOUT creating a booking.
 * payload = { courseCode, examDate (YYYY-MM-DD or ISO), excludeBookingId? }
 * Returns { hasConflict, conflictCount, conflictingCourses }.
 */
export async function checkBookingConflict(payload) {
  return request("/bookings/check-conflict", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ──────────────────────────── Users ──────────────────────────── */

export async function getUsers() {
  return request("/users");
}
export async function createUser(payload) {
  return request("/users", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateUser(id, payload) {
  return request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export async function changePassword(id, newPassword) {
  return request(`/users/${id}/change-password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword }),
  });
}

export async function deleteUser(id, { hard = false, ...body } = {}) {
  const qs = hard ? "?hard=true" : "";
  return request(`/users/${id}${qs}`, { method: "DELETE", body: JSON.stringify(body) });
}

/* ──────────────────────────── Courses ──────────────────────────── */

export async function getCourses() {
  return request("/courses");
}
export async function createCourse(payload) {
  return request("/courses", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateCourseApi(id, payload) {
  return request(`/courses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export async function deleteCourseApi(id, { hard = false, ...body } = {}) {
  const qs = hard ? "?hard=true" : "";
  return request(`/courses/${id}${qs}`, { method: "DELETE", body: JSON.stringify(body) });
}

/* ──────────────────────────── Audit logs ──────────────────────────── */

export async function getAuditLogs() {
  return request("/auditlogs");
}

/**
 * Record a custom audit log entry (POST /api/auditlogs).
 * payload = { action, user?, role?, courseCode?, details?, metadata? }
 */
export async function createAuditLog(payload) {
  return request("/auditlogs", { method: "POST", body: JSON.stringify(payload) });
}

/* ──────────────────────────── Academic terms ──────────────────────────── */

export async function getTerms() {
  return request("/terms");
}
export async function createTerm(payload) {
  return request("/terms", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateTermApi(id, payload) {
  return request(`/terms/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export async function deleteTermApi(id, body = {}) {
  return request(`/terms/${id}`, { method: "DELETE", body: JSON.stringify(body) });
}


/* ──────────────────────────── Phases ──────────────────────────── */

export async function getPhases() {
  return request("/phases");
}

export async function updatePhase(id, payload) {
  return request(`/phases/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createPhase(payload) {
  return request("/phases", { method: "POST", body: JSON.stringify(payload) });
}

/** Auto-create Phase 0/1/2 for a term that has no phases yet. */
export async function initPhasesForTerm(termId) {
  return request(`/phases/init/${termId}`, { method: "POST" });
}

/* ──────────────────────────── Preferences ──────────────────────────── */

/**
 * Fetch preferences. Pass { courseCode, termId } to get a single course's
 * preference, or { termId } to get all preferences for a term.
 */
export async function getPreferences(params = {}) {
  const qs = new URLSearchParams();
  if (params.courseCode) qs.set("courseCode", params.courseCode);
  if (params.termId) qs.set("termId", params.termId);
  return request(`/preferences${qs.toString() ? `?${qs}` : ""}`);
}

/**
 * Upsert a preference for a course + term (auto-save draft or submit).
 * payload = { courseCode, termId, submittedBy, examType?, major1Weeks?,
 *             major2Weeks?, midtermWeeks?, preferredDays?, unpreferredDays?,
 *             comments?, status? }
 */
export async function upsertPreference(payload) {
  return request("/preferences", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Update a preference by its Mongo _id. */
export async function updatePreference(id, payload) {
  return request(`/preferences/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/* ──────────────────────────── Enrollments ──────────────────────────── */

/** Returns enrollment counts grouped by termId: { stats: [{termId, count, lastUpdated}] } */
export async function getEnrollmentStats() {
  return request('/enrollments/stats');
}

/**
 * Upload an enrollment Excel file for a given term.
 * Student IDs are hashed server-side (HMAC-SHA256) before storage.
 * Replaces all existing enrollments for that term.
 */
export async function uploadEnrollments(termId, file, importedBy = 'admin') {
  const form = new FormData();
  form.append('termId', termId);
  form.append('importedBy', importedBy);
  form.append('file', file);

  const base = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api';

  const res = await fetch(`${base}/enrollments/upload`, { method: 'POST', body: form });
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ──────────────────────────── Scheduled Exams ──────────────────────────── */

/** GET /api/bookings?phaseNumber=&termId= — algorithm exams for a term + phase */
export async function getScheduledExams({ termId, phase } = {}) {
  const qs = new URLSearchParams();
  if (termId !== undefined) qs.set('termId', termId);
  if (phase !== undefined) qs.set('phaseNumber', phase);
  return request(`/bookings${qs.toString() ? `?${qs}` : ''}`);
}

/** PUT /api/bookings/:id — update date/room on an algorithm exam */
export async function updateScheduledExam(id, payload) {
  return request(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

/** DELETE /api/bookings/:id — soft-cancel an algorithm exam */
export async function deleteScheduledExam(id) {
  return request(`/bookings/${id}`, { method: 'DELETE' });
}

/** POST /api/bookings/confirm — confirm all algorithm exams for a term + phase */
export async function confirmSchedule(payload) {
  return request('/bookings/confirm', { method: 'POST', body: JSON.stringify(payload) });
}

/** POST /api/bookings/bulk — bulk-insert algorithm exams (cancels previous for same term+phase) */
export async function createScheduledExamsBulk(payload) {
  return request('/bookings/bulk', { method: 'POST', body: JSON.stringify(payload) });
}

/* ──────────────────────────── Course Offerings ──────────────────────────── */

/**
 * Scrape KFUPM Registrar and upsert courses for the given academic term.
 * payload = { termId, departments?, importedBy? }
 * Returns { termName, registrarTermCode, summary, errors }
 */
export async function importCourseOfferings(payload) {
  return request('/course-offerings/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/* ──────────────────────────── Course Assignments ──────────────────────────── */

/** GET /api/course-assignments?coordinatorId=&courseCode= */
export async function getAssignments(params = {}) {
  const qs = new URLSearchParams();
  if (params.coordinatorId) qs.set("coordinatorId", params.coordinatorId);
  if (params.courseCode)    qs.set("courseCode", params.courseCode);
  return request(`/course-assignments${qs.toString() ? `?${qs}` : ""}`);
}

/**
 * Bulk upsert/delete assignments.
 * assignments = [{ courseCode, coordinatorId }] — empty coordinatorId removes it.
 */
export async function bulkSaveAssignments(assignments, assignedBy) {
  return request("/course-assignments/bulk", {
    method: "POST",
    body: JSON.stringify({ assignments, assignedBy }),
  });
}

/* ──────────────────────────── Exam Groups ──────────────────────────── */

export async function getExamGroups(termId) {
  const qs = termId ? `?termId=${termId}` : '';
  return request(`/exam-groups${qs}`);
}

export async function createExamGroup(payload) {
  return request('/exam-groups', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateExamGroup(id, payload) {
  return request(`/exam-groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteExamGroup(id) {
  return request(`/exam-groups/${id}`, { method: 'DELETE' });
}

/* ──────────────────────────── Schedule generation ──────────────────────────── */

export async function generateSchedule(options = {}) {
  return request("/schedule/generate", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function getScheduleJob(jobId) {
  return request(`/schedule/jobs/${jobId}`);
}

export async function getDayScores({ courseCode, examType, termName }) {
  const qs = new URLSearchParams({ courseCode, examType, termName }).toString();
  return request(`/schedule/day-scores?${qs}`);
}

/**
 * Probe whether the backend is reachable. Used so the UI can fall back
 * to local mock data when running in the hosted preview (no backend).
 */
export async function isBackendReachable() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1000);
    const res = await fetch(`${API_BASE}/bookings`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status === 404; // route exists / server up
  } catch {
    return false;
  }
}
