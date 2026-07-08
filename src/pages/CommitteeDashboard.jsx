import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { Users, ClipboardList } from 'lucide-react';

const tabs = [
  { id: 'proctors', label: 'Proctor Summary', icon: Users },
  { id: 'audit',   label: 'Activity Log',    icon: ClipboardList },
];

function flattenBookings(courses) {
  const rows = [];
  courses.forEach(c => {
    Object.entries(c.bookings).forEach(([examType, b]) => {
      rows.push({ ...c, examType, week: b.week, day: b.day, maleProctors: b.maleProctors, femaleProctors: b.femaleProctors, bookedAt: b.bookedAt });
    });
  });
  return rows;
}

/* ── Proctor Summary Tab ── */
const ProctorSummary = ({ courses, formatSlotDate }) => {
  const bookedRows = flattenBookings(courses);

  const dayTotals = {};
  bookedRows.forEach(r => {
    const key = `W${r.week}-D${r.day}`;
    if (!dayTotals[key]) dayTotals[key] = { week: r.week, day: r.day, male: 0, female: 0, courses: [] };
    dayTotals[key].male += r.maleProctors || 0;
    dayTotals[key].female += r.femaleProctors || 0;
    dayTotals[key].courses.push(`${r.code} (${r.examType})`);
  });

  const sorted = Object.values(dayTotals).sort((a, b) => a.week - b.week || a.day - b.day);
  const totalMale = sorted.reduce((s, d) => s + d.male, 0);
  const totalFemale = sorted.reduce((s, d) => s + d.female, 0);

  return (
    <div className="space-y-4">
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <div className="card">
          <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
            <p className="stat-value">{totalMale}</p>
            <p className="stat-label">Total Male Proctors</p>
          </div>
        </div>
        <div className="card">
          <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
            <p className="stat-value">{totalFemale}</p>
            <p className="stat-label">Total Female Proctors</p>
          </div>
        </div>
        <div className="card">
          <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
            <p className="stat-value text-primary">{totalMale + totalFemale}</p>
            <p className="stat-label">Grand Total</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap"><table className="data-table">
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
              {sorted.map(d => (
                <tr key={`${d.week}-${d.day}`}>
                  <td><strong>Week {d.week}, {formatSlotDate(d.week, d.day)}</strong></td>
                  <td className="text-sm">{d.courses.join(', ')}</td>
                  <td>{d.male}</td>
                  <td>{d.female}</td>
                  <td><strong>{d.male + d.female}</strong></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};

/* ── Activity Log Tab ── */
const AuditLog = () => {
  const { auditLogs } = useCourses();
  const actionLabels = {
    booking_created:    'Booking Created',
    booking_rescheduled:'Booking Rescheduled',
    booking_deleted:    'Booking Deleted',
    booking_conflict:   'Booking Conflict',
    phase_updated:      'Phase Updated',
    user_role_changed:  'User Updated',
    user_deactivated:   'User Deactivated',
    user_activated:     'User Activated',
    user_deleted:       'User Deleted',
    user_created:       'User Created',
    course_created:     'Course Created',
    course_updated:     'Course Updated',
    course_deleted:     'Course Deleted',
    term_created:       'Term Created',
    term_activated:     'Term Activated',
  };

  return (
    <div className="card">
      <div className="card-content" style={{ paddingTop: 16 }}>
        <div className="data-table-wrap"><table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>User</th>
              <th>Course</th>
              <th>Details</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map(log => (
              <tr key={log.id}>
                <td><span className="badge badge-secondary">{actionLabels[log.action] || log.action}</span></td>
                <td className="text-sm">{log.user}</td>
                <td className="text-sm font-medium">{log.course}</td>
                <td className="text-sm text-muted">{log.details}</td>
                <td className="text-xs text-muted">
                  {new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

/* ── Main Committee Dashboard ── */
const CommitteeDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('proctors');
  const { courses, formatSlotDate } = useCourses();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    const valid = tabs.some(t => t.id === tab);
    if (valid && tab !== activeTab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTab = (tabId) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'proctors': return <ProctorSummary courses={courses} formatSlotDate={formatSlotDate} />;
      case 'audit':    return <AuditLog />;
      default:         return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scheduling Committee</h1>
          <p className="text-sm text-muted mt-1">Oversee exam scheduling across all phases and course levels</p>
        </div>

        <div className="tab-bar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setTab(tab.id)}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {renderTab()}
      </div>
    </DashboardLayout>
  );
};

export default CommitteeDashboard;
