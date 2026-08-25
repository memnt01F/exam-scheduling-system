/**
 * conflictsService — thin client for the Python scheduler's conflict cache.
 *
 * The `courseconflicts` collection is a cache derived from `enrollments`
 * (one document per course per term). It is what powers the /day-scores
 * heatmap, and it is ONLY refreshed on demand: the scheduler auto-builds it
 * when a term has zero documents, but a stale cache is never noticed.
 *
 * So it must be rebuilt whenever enrollment rows actually change — after an
 * enrollment upload, and after a lab course copies its parent's roster.
 * Adding a plain lecture changes nothing here: build_course_conflicts reads
 * only the `enrollments` collection.
 */

const SCHEDULER_URL = process.env.SCHEDULER_URL || 'http://localhost:8000';

/** A 24-character hex string — the only shape the scheduler accepts as termId. */
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isObjectIdString(value) {
  return OBJECT_ID_RE.test(String(value || '').trim());
}

/**
 * Rebuild the courseconflicts cache for one term.
 *
 * Never throws — returns a result object so best-effort callers (course
 * creation, enrollment upload) can report the outcome without failing the
 * request when the scheduler service happens to be down.
 *
 * @param {string} termId AcademicTerm._id as a 24-hex string
 * @returns {Promise<{ok: boolean, status: number|null, data: any, message?: string}>}
 */
async function rebuildCourseConflicts(termId) {
  const id = String(termId || '').trim();

  // The scheduler resolves termId with ObjectId.is_valid() and falls back to a
  // raw string lookup, so a term NAME like "261" silently 404s there instead of
  // reporting a bad argument. Catch it here where the message can be useful.
  if (!isObjectIdString(id)) {
    return {
      ok: false,
      status: 400,
      data: null,
      message: `termId must be the AcademicTerm _id (24-character hex), got "${id}". A term name such as "261" will not work.`,
    };
  }

  try {
    const r = await fetch(
      `${SCHEDULER_URL}/conflicts/rebuild?termId=${encodeURIComponent(id)}`,
      { method: 'POST' }
    );

    let data = null;
    const text = await r.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { detail: text }; }
    }

    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        data,
        message: (data && (data.detail || data.message)) || `Conflict rebuild failed (${r.status})`,
      };
    }
    return { ok: true, status: r.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: null,
      message: `Scheduler unreachable: ${err.message}`,
    };
  }
}

module.exports = { rebuildCourseConflicts, isObjectIdString, SCHEDULER_URL };
