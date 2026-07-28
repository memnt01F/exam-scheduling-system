import { useState, useEffect, useMemo } from 'react';
import { useCourses } from '../../context/CoursesContext.jsx';
import { getBookings, getScheduledExams } from '../../services/api.js';
import { toast } from 'sonner';

const ProctorSummary = ({ restrictedDepts }) => {
  const { academicTerms, courses } = useCourses();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTermId, setSelectedTermId] = useState(() => localStorage.getItem('proctorTermId') || '');
  const [deptFilter, setDeptFilter] = useState('');

  const setTermIdPersisted = (id) => {
    localStorage.setItem('proctorTermId', id);
    setSelectedTermId(id);
  };

  // Default to active term only if nothing stored
  useEffect(() => {
    if (selectedTermId || !academicTerms?.length) return;
    const active = academicTerms.find(t => t.isActive || t.status === 'active') || academicTerms[0];
    if (active) setTermIdPersisted(String(active._serverId || active.id));
  }, [academicTerms]);

  useEffect(() => {
    if (!selectedTermId) return;
    setLoading(true);
    Promise.all([
      getBookings(),
      getScheduledExams({ termId: selectedTermId, phase: 0 }),
      getScheduledExams({ termId: selectedTermId, phase: 1 }),
    ])
      .then(([phase2, phase0, phase1]) => {
        setBookings([
          ...(Array.isArray(phase2) ? phase2 : []),
          ...(Array.isArray(phase0) ? phase0 : []),
          ...(Array.isArray(phase1) ? phase1 : []),
        ]);
      })
      .catch(() => toast.error('Failed to load proctor data'))
      .finally(() => setLoading(false));
  }, [selectedTermId]);

  const courseByCode = useMemo(() =>
    Object.fromEntries(courses.map(c => [c.code, c])),
    [courses]
  );

  const allDepts = useMemo(() =>
    [...new Set(courses.map(c => c.department))].sort(),
    [courses]
  );

  const filtered = useMemo(() => {
    const scope = restrictedDepts?.length ? restrictedDepts : (deptFilter ? [deptFilter] : null);
    if (!scope) return bookings;
    return bookings.filter(b => scope.includes(courseByCode[b.courseCode]?.department));
  }, [bookings, restrictedDepts, deptFilter, courseByCode]);

  const totalMale   = filtered.reduce((s, b) => s + (b.maleProctors   || 0), 0);
  const totalFemale = filtered.reduce((s, b) => s + (b.femaleProctors || 0), 0);
  const grandTotal  = totalMale + totalFemale;

  const slots = useMemo(() => {
    const map = {};
    filtered.forEach(b => {
      const key = b.examDate ? new Date(b.examDate).toISOString().slice(0, 10) : 'Unknown';
      if (!map[key]) map[key] = { date: key, courses: [], male: 0, female: 0 };
      map[key].courses.push(b.courseCode);
      map[key].male   += b.maleProctors   || 0;
      map[key].female += b.femaleProctors || 0;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const fmtDate = (d) => d === 'Unknown' ? '—' :
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          value={selectedTermId}
          onChange={e => setTermIdPersisted(e.target.value)}
        >
          {academicTerms?.map(t => (
            <option key={t._serverId || t.id} value={String(t._serverId || t.id)}>{t.name}</option>
          ))}
        </select>
        {!restrictedDepts?.length && (
          <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Male Proctors',   value: totalMale },
          { label: 'Total Female Proctors', value: totalFemale },
          { label: 'Grand Total',           value: grandTotal, green: true },
        ].map(({ label, value, green }) => (
          <div key={label} className="card">
            <div className="card-content" style={{ padding: 20 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: green ? 'var(--clr-primary)' : 'inherit' }}>{value}</div>
              <div className="text-sm text-muted" style={{ marginTop: 4 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-muted)' }}>Loading…</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Courses</th>
                    <th>Male Proctors</th>
                    <th>Female Proctors</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map(slot => {
                    const total = slot.male + slot.female;
                    const noProctors = total === 0;
                    return (
                      <tr key={slot.date} style={{ background: noProctors ? 'rgba(251,191,36,0.1)' : 'transparent' }}>
                        <td className="font-medium">{fmtDate(slot.date)}</td>
                        <td className="text-sm">{slot.courses.join(', ')}</td>
                        <td className="text-sm">{slot.male}</td>
                        <td className="text-sm">{slot.female}</td>
                        <td>
                          <span style={{ fontWeight: noProctors ? 600 : 400, color: noProctors ? '#d97706' : 'inherit' }}>
                            {total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {slots.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>
                        No exam bookings found for this term
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProctorSummary;
