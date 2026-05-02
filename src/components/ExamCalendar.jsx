import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCourses } from '../context/CoursesContext.jsx';
// FIX (Issue 3): removed bookedDateMap import from mock-data.js.
// It contained 9 hardcoded fake bookings that appeared on the calendar
// on every render regardless of what was in MongoDB.

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build set of all valid teaching dates from weekStartDates. */
function buildTeachingDates(weekStartDates) {
  const set = new Set();
  for (let w = 0; w < weekStartDates.length; w++) {
    const start = new Date(weekStartDates[w] + 'T00:00:00');
    for (let d = 0; d < 7; d++) {
      if (d === 5) continue; // skip Friday
      const dt = new Date(start);
      dt.setDate(dt.getDate() + d);
      set.add(toDateStr(dt));
    }
  }
  return set;
}

/** Map dateStr → { week, day } using weekStartDates. */
function dateToWeekDayDynamic(dateStr, weekStartDates) {
  for (let w = 0; w < weekStartDates.length; w++) {
    const weekStart = new Date(weekStartDates[w] + 'T00:00:00');
    for (let d = 0; d < 7; d++) {
      if (d === 5) continue;
      const slotDate = new Date(weekStart);
      slotDate.setDate(slotDate.getDate() + d);
      if (toDateStr(slotDate) === dateStr) {
        return { week: w + 1, day: d + 1 };
      }
    }
  }
  return null;
}

function getMonthGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = [];
  let row = Array(7).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const col = new Date(year, month, d).getDay();
    row[col] = d;
    if (col === 6 || d === daysInMonth) {
      rows.push(row);
      row = Array(7).fill(null);
    }
  }
  return rows;
}

const ExamCalendar = ({ examSlots, selectedDate, onSelectDate, courseCode }) => {
  const {
    effectiveWeekStartDates,
    effectiveBlockedDates,
    effectiveTermStart,
    effectiveTermEnd,
    refreshBookings,
    backendOnline,
  } = useCourses();

  // Always refresh global bookings when the calendar is opened so all users
  // see the latest system-wide booking state (not filtered by user).
  useEffect(() => {
    if (!backendOnline) return;
    refreshBookings();
  }, [backendOnline, refreshBookings]);

  // Determine month range from term dates
  const termStartDate = new Date(effectiveTermStart + 'T00:00:00');
  const termEndDate = new Date(effectiveTermEnd + 'T00:00:00');

  const months = useMemo(() => {
    const result = [];
    let y = termStartDate.getFullYear();
    let m = termStartDate.getMonth();
    const endY = termEndDate.getFullYear();
    const endM = termEndDate.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const label = new Date(y, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      result.push({ year: y, month: m, label });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return result;
  }, [effectiveTermStart, effectiveTermEnd]);

  const [viewMonth, setViewMonth] = useState(0);

  const teachingDates = useMemo(() => buildTeachingDates(effectiveWeekStartDates), [effectiveWeekStartDates]);

  // FIX (Issue 3): was const map = { ...bookedDateMap } which seeded the calendar
  // with hardcoded fake bookings on every render. Now starts empty and builds
  // entirely from live examSlots populated by CoursesContext from MongoDB.
  const dynamicBooked = useMemo(() => {
    const map = {};
    if (examSlots) {
      examSlots.flat().forEach((slot) => {
        if (slot.date && slot.bookedCourses.length > 0) {
          map[slot.date] = [...(map[slot.date] || [])];
          slot.bookedCourses.forEach((code) => {
            if (!map[slot.date].includes(code)) map[slot.date].push(code);
          });
        }
      });
    }
    return map;
  }, [examSlots]);

  const current = months[viewMonth] || months[0];
  if (!current) return null;
  const grid = getMonthGrid(current.year, current.month);

  return (
    <div className="exam-calendar">
      <div className="exam-cal-nav">
        <button
          className="btn btn-ghost btn-icon"
          disabled={viewMonth === 0}
          onClick={() => setViewMonth((v) => v - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="exam-cal-month">{current.label}</span>
        <button
          className="btn btn-ghost btn-icon"
          disabled={viewMonth === months.length - 1}
          onClick={() => setViewMonth((v) => v + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <table className="exam-cal-grid">
        <thead>
          <tr>
            {DAY_HEADERS.map((d) => (
              <th key={d} className="exam-cal-th">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              {row.map((day, ci) => {
                if (day === null) {
                  return <td key={ci} className="exam-cal-td" />;
                }

                const dateStr = toDateStr(new Date(current.year, current.month, day));
                const isTeaching = teachingDates.has(dateStr);
                const blocked = effectiveBlockedDates[dateStr];
                const booked = dynamicBooked[dateStr] || [];
                const weekDay = dateToWeekDayDynamic(dateStr, effectiveWeekStartDates);
                const isSelected = selectedDate === dateStr;
                const isFriday = ci === 5;
                const isAvailable = isTeaching && !blocked && !isFriday;

                let cls = 'exam-cal-day';
                if (isFriday) cls += ' weekend';
                else if (blocked) cls += ' blocked';
                else if (isSelected) cls += ' selected';
                else if (isTeaching) cls += ' available';
                else cls += ' outside';

                const tooltip = blocked
                  ? blocked
                  : booked.length > 0
                  ? `Booked: ${booked.join(', ')}`
                  : isAvailable
                  ? weekDay
                    ? `Week ${weekDay.week}, Day ${weekDay.day} — Available`
                    : 'Available'
                  : '';

                return (
                  <td key={ci} className="exam-cal-td">
                    <button
                      className={cls}
                      disabled={!isAvailable}
                      title={tooltip}
                      onClick={() => isAvailable && onSelectDate(dateStr, weekDay)}
                    >
                      <span className="exam-cal-daynum">{day}</span>
                      {blocked && (
                        <span className="exam-cal-badge blocked-badge">
                          {blocked.length > 16 ? blocked.slice(0, 14) + '…' : blocked}
                        </span>
                      )}
                      {!blocked && booked.length > 0 && booked.map((code, i) => (
                        <span key={i} className="exam-cal-badge booked-badge">
                          {code}
                        </span>
                      ))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="exam-cal-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'white', border: '1px solid var(--clr-border)' }} />
          Available
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--clr-primary)' }} />
          Selected
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger)' }} />
          Blocked / Holiday
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--clr-muted-bg)' }} />
          Non-teaching / Weekend
        </span>
      </div>
    </div>
  );
};

export default ExamCalendar;
