/**
 * Predefined committee-fixed courses for Level 1 scheduling.
 * These courses are preloaded in Level 1 Config — the committee only assigns booking details.
 */
export const anchorEligibleCourses = [
  { code: 'CHEM101', name: 'Principles of Chemical Science I', department: 'Chemical Engineering' },
  { code: 'CHEM102', name: 'Principles of Chemical Science II', department: 'Chemical Engineering' },
  { code: 'STAT201', name: 'Probability and Statistics for Engineers and Scientists', department: 'Mathematics' },
  { code: 'MATH101', name: 'Calculus I', department: 'Mathematics' },
  { code: 'MATH102', name: 'Calculus II', department: 'Mathematics' },
  { code: 'MATH201', name: 'Calculus III', department: 'Mathematics' },
  { code: 'MATH208', name: 'Differential Equations and Linear Algebra', department: 'Mathematics' },
  { code: 'BUS200', name: 'Business & Entrepreneurship', department: 'Management & Marketing' },
  { code: 'PHYS101', name: 'General Physics I', department: 'Physics' },
  { code: 'PHYS102', name: 'General Physics II', department: 'Physics' },
  { code: 'IAS111', name: 'Belief and its Consequences', department: 'Islamic & Arabic Studies' },
  { code: 'IAS121', name: 'Language Foundation', department: 'Islamic & Arabic Studies' },
  { code: 'IAS212', name: 'Professional Ethics and Governance', department: 'Islamic & Arabic Studies' },
  { code: 'IAS322', name: 'Human Rights in Islam', department: 'Islamic & Arabic Studies' },
  { code: 'IAS330', name: 'Introduction to Justice & Law', department: 'Islamic & Arabic Studies' },
  { code: 'IAS331', name: 'Literature and Text', department: 'Islamic & Arabic Studies' },
  { code: 'IAS430', name: 'Jurisprudence of Entrepreneurship', department: 'Islamic & Arabic Studies' },
  { code: 'COE202', name: 'Digital Logic Design', department: 'Electrical Engineering' },
  { code: 'COE292', name: 'Introduction to Artificial Intelligence', department: 'Electrical Engineering' },
  { code: 'CGS392', name: 'Career Essentials', department: 'General Studies' },
  { code: 'ENGL101', name: 'Introduction to Academic Discourse', department: 'General Studies' },
  { code: 'ENGL102', name: 'Introduction to Argument Writing', department: 'General Studies' },
  { code: 'ENGL214', name: 'Academic & Professional Communication', department: 'General Studies' },
  { code: 'ICS104', name: 'Introduction to Programming in Python and C', department: 'Information & Computer Science' },
  { code: 'ICS108', name: 'Object-Oriented Programming', department: 'Information & Computer Science' },
  { code: 'ISE291', name: 'Introduction to Data Science', department: 'Information & Computer Science' },
  
];

/**
 * Exam types available for committee-fixed booking.
 */
export const ANCHOR_EXAM_TYPES = ['Major 1', 'Major 2', 'Mid'];
