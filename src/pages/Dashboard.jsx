import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { getRequiredExamTypes, getCourseBookingStatus } from '../lib/mock-data.js';
import {
  Clock, CheckCircle2, AlertCircle, ArrowRight, BookOpen, CalendarDays, Lock,
  ChevronDown, ChevronUp, Users, Circle,
} from 'lucide-react';
import { toast } from 'sonner';

const levelBadgeClass = {
  1: 'badge-level-1', 2: 'badge-level-2', 3: 'badge-level-3', 4: 'badge-level-4',
};

function getTimeLeft(endDate) {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

const CourseRow = ({ course, isPhaseActive, isPhaseClosed, isPhaseUpcoming, onBook, formatSlotDate }) => {
  const [expanded, setExpanded] = useState(false);
  const status = getCourseBookingStatus(course);
  const requiredTypes = getRequiredExamTypes(course);
  const bookedTypes = Object.keys(course.bookings || {});
  const hasAnyBooking = bookedTypes.length > 0;

  const StatusIcon = status === 'fully_booked' ? CheckCircle2
    : status === 'partially_booked' ? Clock
    : AlertCircle;
  const statusLabel = status === 'fully_booked' ? 'Booked'
    : status === 'partially_booked' ? 'Partial Booking'
    : 'Not Booked';
  const statusColor = status === 'fully_booked' ? 'var(--clr-primary)'
    : status === 'partially_booked' ? 'var(--clr-warning, #e68a00)'
    : 'var(--clr-muted)';

  const needsMoreBooking = status !== 'fully_booked';

  return (
    <div className={`course-row-wrapper${expanded ? ' expanded' : ''}`}>
      <div className="course-row" onClick={() => {
        if (hasAnyBooking) { setExpanded(!expanded); }
        else if (!isPhaseActive) { toast.info('Booking phase has not started yet for this course. Please wait until the phase opens.'); }
      }} style={{ cursor: (hasAnyBooking || !isPhaseActive) ? 'pointer' : undefined }}>
        <div className="course-info">
          <div className="course-code">
            {course.code}
            <span className={`badge ${levelBadgeClass[course.level]}`}>L{course.level}</span>
          </div>
          <span className="course-name">{course.name}</span>
        </div>

        <div className="course-actions">
          {/* Show booking slot indicators for required types */}
          {hasAnyBooking && (
            <div className="exam-slots-row">
              {requiredTypes.map(type => {
                const b = course.bookings[type];
                return (
                  <div key={type} className="exam-slot-badge">
                    <span className="exam-slot-label">{type}</span>
                    {b ? (
                      <span className="exam-slot-status exam-slot-booked">
                        <CheckCircle2 size={11} /> {formatSlotDate(b.week, b.day)}
                      </span>
                    ) : (
                      <span className="exam-slot-status exam-slot-pending">
                        <Circle size={11} /> Pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="status-indicator" style={{ color: statusColor }}>
            <StatusIcon size={14} />
            <span>{statusLabel}</span>
          </div>

          {needsMoreBooking && isPhaseActive && (
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onBook(); }}>
              {status === 'partially_booked' ? <>Complete Booking <ArrowRight size={12} /></> : <>Book <ArrowRight size={12} /></>}
            </button>
          )}
          {status === 'fully_booked' && isPhaseActive && (
            <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); onBook(); }}>
              <CalendarDays size={12} /> Reschedule
            </button>
          )}
          {needsMoreBooking && isPhaseUpcoming && (
            <button className="btn btn-outline btn-sm" disabled>
              <Lock size={12} /> Phase Not Open
            </button>
          )}
          {isPhaseClosed && (
            <span className="badge badge-outline" style={{ color: 'var(--clr-muted)' }}>
              <Lock size={10} /> Locked
            </span>
          )}
          {hasAnyBooking && (
            expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />
          )}
        </div>
      </div>

      {expanded && hasAnyBooking && (
        <div className="course-details">
          {bookedTypes.map(type => {
            const b = course.bookings[type];
            return (
              <div key={type} className="booking-detail-section">
                <h4 className="booking-detail-title">{type}</h4>
                <div className="course-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Exam Date</span>
                    <span className="detail-value">{formatSlotDate(b.week, b.day)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Week / Day</span>
                    <span className="detail-value">Week {b.week}, Day {b.day}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label"><Users size={12} /> Male Proctors</span>
                    <span className="detail-value">{b.maleProctors ?? '—'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label"><Users size={12} /> Female Proctors</span>
                    <span className="detail-value">{b.femaleProctors ?? '—'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Booked On</span>
                    <span className="detail-value">
                      {b.bookedAt ? new Date(b.bookedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { courses, phases, formatSlotDate } = useCourses();
  const now = new Date();
  const activePhase = phases.find((p) => p.isActive && new Date(p.startDate) <= now && new Date(p.endDate) >= now);

  // Filter out Level 1 courses — those are committee-fixed and not self-bookable
  const coordinatorCourses = courses.filter(c => c.level !== 1);

  const fullyBookedCount = coordinatorCourses.filter(c => getCourseBookingStatus(c) === 'fully_booked').length;
  const partialCount = coordinatorCourses.filter(c => getCourseBookingStatus(c) === 'partially_booked').length;
  const totalCount = coordinatorCourses.length;
  const notBookedCount = coordinatorCourses.filter(c => getCourseBookingStatus(c) === 'not_booked').length;

  const [timeLeft, setTimeLeft] = useState(activePhase ? getTimeLeft(activePhase.endDate) : null);

  useEffect(() => {
    if (!activePhase) { setTimeLeft(null); return; }
    setTimeLeft(getTimeLeft(activePhase.endDate));
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(activePhase.endDate));
    }, 60000);
    return () => clearInterval(interval);
  }, [activePhase]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Coordinator Dashboard</h1>
          <p className="text-sm text-muted mt-1">Manage your exam scheduling across assigned courses</p>
        </div>

        {activePhase ? (
          <div className="phase-banner">
            <div className="phase-info">
              <div className="phase-dot" />
              <div>
                <p className="phase-name">{activePhase.name}</p>
                <p className="phase-desc">
                  {new Date(activePhase.startDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                  {' — '}
                  {new Date(activePhase.endDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {timeLeft && (
                <span className="countdown-badge">
                  <Clock size={13} />
                  {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m left
                </span>
              )}
              <span className="badge badge-outline" style={{ borderColor: 'rgba(26,122,76,0.3)', color: 'var(--clr-primary)' }}>
                Active
              </span>
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderLeft: '4px solid var(--clr-muted)', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={18} style={{ color: 'var(--clr-muted)' }} />
              <div>
                <p className="text-sm font-semibold">No Active Booking Phase</p>
                <p className="text-xs text-muted">There is no open booking phase at the moment. Please wait for the scheduling committee to activate the next phase.</p>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <BookOpen size={16} /> My Courses
            </div>
          </div>
          <div className="card-content">
            {coordinatorCourses.length === 0 ? (
              <p className="text-sm text-muted text-center" style={{ padding: 24 }}>No courses assigned to you for self-booking.</p>
            ) : coordinatorCourses.map((course) => {
              const coursePhase = phases.find((p) => p.targetLevels.includes(course.level));
              const phaseInDateRange = coursePhase && new Date(coursePhase.startDate) <= now && new Date(coursePhase.endDate) >= now;
              const isPhaseActive = (coursePhase?.isActive && phaseInDateRange) || false;
              const isPhaseClosed = coursePhase && (!coursePhase.isActive || new Date(coursePhase.endDate) < now);
              const isPhaseUpcoming = coursePhase && !isPhaseActive && new Date(coursePhase.startDate) > now;

              return (
                <CourseRow
                  key={course.id}
                  course={course}
                  isPhaseActive={isPhaseActive}
                  isPhaseClosed={!!isPhaseClosed}
                  isPhaseUpcoming={!!isPhaseUpcoming}
                  onBook={() => navigate(`/booking/${course.id}`)}
                  formatSlotDate={formatSlotDate}
                />
              );
            })}
          </div>
        </div>

        <div className="stats-grid">
          <div className="card">
            <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
              <p className="stat-value">{totalCount}</p>
              <p className="stat-label">Total Courses</p>
            </div>
          </div>
          <div className="card">
            <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
              <p className="stat-value text-primary">{fullyBookedCount}</p>
              <p className="stat-label">Booked</p>
            </div>
          </div>
          <div className="card">
            <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
              <p className="stat-value">{partialCount}</p>
              <p className="stat-label">Partial</p>
            </div>
          </div>
          <div className="card">
            <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
              <p className="stat-value">{notBookedCount}</p>
              <p className="stat-label">Awaiting Booking</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
