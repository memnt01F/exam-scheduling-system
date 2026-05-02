/**
 * ICS (iCalendar) file parser.
 * Extracts events and classifies them for the exam booking system.
 */

/**
 * Parse a date string from ICS format (YYYYMMDD or YYYYMMDDTHHMMSSZ).
 * Returns a YYYY-MM-DD string.
 */
function parseIcsDate(raw) {
  if (!raw) return null;
  const s = raw.replace(/[^0-9T]/g, '');
  if (s.length < 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * Unfold ICS content (lines starting with space/tab are continuations).
 */
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');
}

/**
 * Parse raw ICS text into an array of calendar events.
 */
export function parseIcsFile(text) {
  const unfolded = unfold(text);
  const lines = unfolded.split('\n');
  const events = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
    } else if (trimmed === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).split(';')[0].toUpperCase();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (key === 'SUMMARY') current.summary = value;
      else if (key === 'DTSTART') current.dtstart = value;
      else if (key === 'DTEND') current.dtend = value;
      else if (key === 'DESCRIPTION') current.description = value;
      else if (key === 'LOCATION') current.location = value;
    }
  }

  return events.map((ev, i) => {
    const startDate = parseIcsDate(ev.dtstart);
    const endDate = parseIcsDate(ev.dtend);
    // For all-day events DTEND is exclusive (day after last day)
    const isAllDay = ev.dtstart && !ev.dtstart.includes('T');
    let adjustedEnd = endDate;
    if (isAllDay && endDate) {
      const d = new Date(endDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      adjustedEnd = toDateKey(d);
    }
    return {
      id: `ics-${i}`,
      summary: ev.summary || 'Untitled Event',
      startDate,
      endDate: adjustedEnd || startDate,
      description: ev.description || '',
      location: ev.location || '',
      isBlocked: false, // will be classified later
      blockReason: '',
    };
  }).filter(ev => ev.startDate);
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Keywords that indicate a date should be blocked for booking.
 */
const BLOCK_KEYWORDS = [
  'final', 'exam', 'break', 'holiday', 'eid', 'national day', 'founding day',
  'ramadan', 'midterm break', 'mid-term break', 'vacation', 'recess',
  'no class', 'no classes', 'off day', 'closed',
];

/**
 * Classify events as blocked or not based on their summary.
 */
export function classifyEvents(events) {
  return events.map(ev => {
    const lower = (ev.summary || '').toLowerCase();
    const isBlocked = BLOCK_KEYWORDS.some(kw => lower.includes(kw));
    return {
      ...ev,
      isBlocked,
      blockReason: isBlocked ? ev.summary : '',
    };
  });
}

/**
 * Generate all dates between start and end (inclusive) as YYYY-MM-DD strings.
 */
export function expandDateRange(startStr, endStr) {
  const dates = [];
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Build a blocked dates map from classified events.
 * Returns { 'YYYY-MM-DD': 'reason', ... }
 */
export function buildBlockedDates(events) {
  const blocked = {};
  for (const ev of events) {
    if (!ev.isBlocked) continue;
    const dates = expandDateRange(ev.startDate, ev.endDate);
    for (const d of dates) {
      blocked[d] = ev.blockReason || ev.summary;
    }
  }
  return blocked;
}

/**
 * Generate Sunday-based week start dates between termStart and termEnd,
 * skipping weeks that are entirely blocked.
 */
export function generateWeekStartDates(termStart, termEnd, blockedDates) {
  const weeks = [];
  const start = new Date(termStart + 'T00:00:00');
  const end = new Date(termEnd + 'T00:00:00');

  // Find the first Sunday on or before termStart
  const firstSunday = new Date(start);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

  const cur = new Date(firstSunday);
  while (cur <= end) {
    const weekStart = toDateKey(cur);
    // Check if the entire week (Sun-Thu, skipping Fri) is blocked
    let allBlocked = true;
    for (let d = 0; d < 7; d++) {
      if (d === 5) continue; // skip Friday
      const dayDate = new Date(cur);
      dayDate.setDate(dayDate.getDate() + d);
      const dayStr = toDateKey(dayDate);
      if (dayDate > end) continue;
      if (!blockedDates[dayStr]) {
        allBlocked = false;
        break;
      }
    }
    if (!allBlocked) {
      weeks.push(weekStart);
    }
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

/**
 * Detect term start/end from events.
 * Looks for events containing "first day" or "classes begin" for start,
 * and "last day" or "classes end" for end.
 * Falls back to earliest and latest event dates.
 */
export function detectTermDates(events) {
  let termStart = null;
  let termEnd = null;

  for (const ev of events) {
    const lower = (ev.summary || '').toLowerCase();
    if (lower.includes('first day') || lower.includes('classes begin') || lower.includes('instruction begins')) {
      termStart = ev.startDate;
    }
    if (lower.includes('last day') || lower.includes('classes end') || lower.includes('instruction ends')) {
      termEnd = ev.endDate || ev.startDate;
    }
  }

  if (!termStart || !termEnd) {
    const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (!termStart && sorted.length) termStart = sorted[0].startDate;
    if (!termEnd && sorted.length) termEnd = sorted[sorted.length - 1].endDate || sorted[sorted.length - 1].startDate;
  }

  return { termStart, termEnd };
}

/**
 * Full pipeline: parse ICS text → classified events + blocked dates + term dates + week starts.
 */
export function processIcsFile(text) {
  const raw = parseIcsFile(text);
  const events = classifyEvents(raw);
  const { termStart, termEnd } = detectTermDates(events);
  const blockedDates = buildBlockedDates(events);
  const weekStartDates = generateWeekStartDates(termStart, termEnd, blockedDates);

  return {
    events,
    termStart,
    termEnd,
    blockedDates,
    weekStartDates,
  };
}
