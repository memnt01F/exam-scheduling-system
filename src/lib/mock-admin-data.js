export const allUsers = [
  { id: 'u1', name: 'Dr. Ahmed Al-Rashid', email: 'arashid@kfupm.edu.sa', role: 'coordinator', department: 'Information & Computer Science', isActive: true },
  { id: 'u2', name: 'Dr. Fatima Al-Otaibi', email: 'falotaibi@kfupm.edu.sa', role: 'committee', department: 'Scheduling Office', isActive: true },
  { id: 'u3', name: 'Eng. Omar Al-Harbi', email: 'oalharbi@kfupm.edu.sa', role: 'admin', department: 'IT Services', isActive: true },
  { id: 'u4', name: 'Dr. Khalid Al-Dossary', email: 'kdossary@kfupm.edu.sa', role: 'coordinator', department: 'Mathematics', isActive: true },
  { id: 'u5', name: 'Dr. Sara Al-Zahrani', email: 'szahrani@kfupm.edu.sa', role: 'coordinator', department: 'Physics', isActive: true },
  { id: 'u6', name: 'Dr. Nasser Al-Mutairi', email: 'nmutairi@kfupm.edu.sa', role: 'committee', department: 'Scheduling Office', isActive: false },
  { id: 'u7', name: 'Dr. Layla Al-Qahtani', email: 'lqahtani@kfupm.edu.sa', role: 'coordinator', department: 'Chemical Engineering', isActive: true },
];

export const auditLogs = [
  { id: 'a1', action: 'booking_created', user: 'Dr. Ahmed Al-Rashid', course: 'ICS 108', details: 'Booked Week 4, Jan 14', timestamp: '2026-01-20T09:00:00Z' },
  { id: 'a2', action: 'booking_created', user: 'Dr. Ahmed Al-Rashid', course: 'ICS 253', details: 'Booked Week 7, Feb 3', timestamp: '2026-03-01T10:30:00Z' },
  { id: 'a3', action: 'phase_activated', user: 'Dr. Fatima Al-Otaibi', course: '—', details: 'Phase 1 (Level 2) activated', timestamp: '2026-02-15T00:00:00Z' },
  { id: 'a4', action: 'user_role_changed', user: 'Eng. Omar Al-Harbi', course: '—', details: 'Changed Dr. Nasser role to committee', timestamp: '2026-01-10T14:00:00Z' },
  { id: 'a5', action: 'level1_configured', user: 'Dr. Fatima Al-Otaibi', course: 'MATH101', details: 'Anchored to Week 5, Jan 18', timestamp: '2026-01-15T08:00:00Z' },
  { id: 'a6', action: 'booking_rescheduled', user: 'Dr. Khalid Al-Dossary', course: 'MATH208', details: 'Moved from Week 5, Jan 21 to Week 6, Jan 28', timestamp: '2026-03-05T11:00:00Z' },
  { id: 'a7', action: 'user_deactivated', user: 'Eng. Omar Al-Harbi', course: '—', details: 'Deactivated Dr. Nasser Al-Mutairi', timestamp: '2026-03-10T09:30:00Z' },
];

export const departments = [
  'Information & Computer Science',
  'Mathematics',
  'Physics',
  'Chemical Engineering',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Civil Engineering',
  'Petroleum Engineering',
];

export const academicTerms = [];
