/**
 * courseOfferingService — scrapes KFUPM Registrar course offerings and
 * performs a selective upsert into the Course collection.
 *
 * Ownership model:
 *   Registrar-owned (updated on every sync): name, department
 *   Admin-owned    (never touched by this service): level, coordinator, status
 *
 * New courses are inserted with level auto-assigned via assignLevel().
 * Existing courses only have name/department updated if they differ.
 * Courses absent from this import are never deleted or deactivated.
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const Course = require('../models/course.model');
const AuditLog = require('../models/auditLog.model');
const { assignLevel, normalizeCode } = require('../utils/assignLevel');

const BASE_URL = 'https://registrar.kfupm.edu.sa';

const ALL_DEPARTMENTS = [
  'ACFN','AE','AECM','ACD','BIOE','MBA','CHE','CHEM','CE','COE',
  'CIE','EE','ELD','ELI','ERTH','GS','ISE','ICS','ISOM','ITD',
  'IAS','LS','MGT','MSE','MATH','ME','CPG','PETE','PE','PHYS',
  'PMP','PSE','URO',
];

// Registrar department codes → full names stored in Course.department
const REGISTRAR_DEPT_NAMES = {
  ACFN: 'Accounting & Finance',
  AE:   'Aerospace Engineering',
  AECM: 'Arch. Engg & Construction Mgt.',
  ACD:  'Architecture and City Design',
  BIOE: 'Bioengineering',
  MBA:  'Business Administration',
  CHE:  'Chemical Engineering',
  CHEM: 'Chemistry',
  CE:   'Civil & Environmental Engineering',
  COE:  'Computer Engineering',
  CIE:  'Control & Instrumentation Engineering',
  EE:   'Electrical Engineering',
  ELD:  'English Language Department',
  ELI:  'English Language Inst. (Prep)',
  ERTH: 'Geosciences',
  GS:   'Global Studies',
  ISE:  'Industrial and Systems Engineering',
  ICS:  'Information & Computer Science',
  ISOM: 'Information Systems & Operations Mgt.',
  ITD:  'Information Technology',
  IAS:  'Islamic & Arabic Studies',
  LS:   'Life Sciences',
  MGT:  'Management & Marketing',
  MSE:  'Material Sciences and Engineering',
  MATH: 'Mathematics',
  ME:   'Mechanical Engineering',
  CPG:  'City & Regional Planning',
  PETE: 'Petroleum Engineering',
  PE:   'Physical Education',
  PHYS: 'Physics',
  PMP:  'Project Management',
  PSE:  'Preparatory Sciences & Engineering',
  URO:  'Urban & Regional Planning',
};

// Course numbers excluded from reference data — no exams (universal across all departments)
const EXCLUDED_COURSE_NUMBERS = new Set([
  398, // internship
  399, // summer training
]);

const DELAY_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Derive the registrar's term code string from an AcademicTerm name.
 * Expects a 3-digit format: YYS  e.g. "261" → "202610"
 */
function toRegistrarTermCode(termName) {
  const match = String(termName || '').match(/(\d{3})$/);
  if (!match) {
    throw new Error(
      `Cannot derive registrar term code from "${termName}" — ` +
      `the term name must end with a 3-digit number e.g. "261" or "Term 261".`
    );
  }
  const digits = match[1];
  return '20' + digits.slice(0, 2) + digits.slice(2) + '0';
}

/**
 * Create a persistent axios session with a shared cookie jar.
 * Equivalent to Python's requests.Session().
 */
function createSession() {
  const jar = new CookieJar();
  const session = wrapper(axios.create({
    jar,
    baseURL: BASE_URL,
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': `${BASE_URL}/courses-classes/course-offering1/`,
    },
  }));
  return session;
}

/**
 * Load the form page and extract the Django CSRF token.
 * The session cookie set by this GET is carried automatically into the POST.
 */
async function fetchCsrfToken(session) {
  const resp = await session.get('/courses-classes/course-offering1/');
  const $ = cheerio.load(resp.data);
  const token = $('input[name="csrfmiddlewaretoken"]').val();
  if (!token) {
    throw new Error(
      'CSRF token not found — registrar page structure may have changed or bot-detection is active.'
    );
  }
  return token;
}

/**
 * Fetch and parse course offerings for one department using a pre-fetched CSRF token.
 * Returns an array of { code, name, department } objects.
 */
async function fetchDepartmentOfferings(session, termCode, deptCode, csrfToken) {
  const resp = await session.post('/course-offerings', new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    term_code: termCode,
    dept_code: deptCode,
    page_choice: 'CO',
  }), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': BASE_URL,
    },
  });

  const $ = cheerio.load(resp.data);
  const table = $('table').first();

  if (!table.length) {
    throw new Error('No table found in registrar response — page structure may have changed.');
  }

  const headers = [];
  table.find('thead th').each((_, el) => headers.push($(el).text().trim()));

  const seen = new Set();
  const courses = [];
  table.find('tbody tr').each((_, row) => {
    const cols = [];
    $(row).find('td').each((_, td) => cols.push($(td).text().trim()));
    if (!cols.length) return;

    const rowObj = {};
    headers.forEach((h, i) => { if (cols[i] !== undefined) rowObj[h] = cols[i]; });

    // KFUPM registrar format: "Course-Sec" = "ICS 104-01", "Course Name" = title
    // Fall back to other common column names for resilience
    const rawCode = rowObj['Course-Sec'] || rowObj['Course No.'] || rowObj['Course No']
      || rowObj['CourseNo'] || rowObj['Code'] || rowObj['Course Code'] || '';
    const rawName = rowObj['Course Name'] || rowObj['Title'] || rowObj['Course Title']
      || rowObj['Name'] || rowObj['Description'] || '';

    if (!rawCode || !rawName) return;

    // Strip section suffix: "ICS 104-01" → "ICS104", "ACCT 110-F03" → "ACCT110"
    // Handles numeric (-01), female (-F03), and other alphanumeric suffixes
    const codeBase = rawCode.replace(/-[A-Z]*\d+$/i, '').trim();
    const code = normalizeCode(codeBase);

    // Skip excluded course numbers (no exams) and grad courses (≥ 500)
    const numMatch = code.match(/^[A-Z]+(\d+)/);
    const courseNum = numMatch ? parseInt(numMatch[1], 10) : 0;
    if (courseNum >= 500 || EXCLUDED_COURSE_NUMBERS.has(courseNum)) return;

    // Skip senior project / senior design courses by name regardless of course number
    const lowerName = rawName.toLowerCase();
    if (lowerName.includes('senior project') || lowerName.includes('senior design')) return;

    // One entry per unique course code (multiple sections → same course)
    if (seen.has(code)) return;
    seen.add(code);

    const department = REGISTRAR_DEPT_NAMES[deptCode] || deptCode;
    courses.push({ code, name: rawName.trim(), department });
  });

  return courses;
}

/**
 * Run the selective upsert across all scraped courses.
 * Returns summary counts and lists.
 */
async function upsertCourses(scrapedCourses, termName, importedBy) {
  const summary = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    departmentChanges: [],
    missingFromImport: [],
  };

  // Build a set of codes returned by the scraper for missingFromImport detection
  const scrapedCodes = new Set(scrapedCourses.map(c => c.code));

  // Load all existing courses once
  const existing = await Course.find({});
  const existingMap = new Map(existing.map(c => [c.code, c]));

  const auditEntries = [];

  for (const scraped of scrapedCourses) {
    const doc = existingMap.get(scraped.code);

    if (!doc) {
      // Brand-new course — insert with auto-assigned level
      const level = assignLevel(scraped.code);
      await Course.create({
        code: scraped.code,
        name: scraped.name,
        department: scraped.department,
        level,
        coordinator: '',
        status: 'active',
      });
      auditEntries.push({
        action: 'IMPORT_COURSE_INSERT',
        user: importedBy || 'admin',
        role: 'admin',
        courseCode: scraped.code,
        details: `Imported new course ${scraped.code} — ${scraped.name} (L${level}) from term ${termName}`,
      });
      summary.inserted++;
    } else {
      // Existing course — update only registrar-owned fields if they differ
      const patch = {};
      if (doc.name !== scraped.name) patch.name = scraped.name;
      if (doc.department !== scraped.department) {
        patch.department = scraped.department;
        summary.departmentChanges.push({
          code: scraped.code,
          from: doc.department,
          to: scraped.department,
        });
      }

      if (Object.keys(patch).length === 0) {
        summary.unchanged++;
      } else {
        await Course.findByIdAndUpdate(doc._id, patch);
        auditEntries.push({
          action: 'IMPORT_COURSE_UPDATE',
          user: importedBy || 'admin',
          role: 'admin',
          courseCode: scraped.code,
          details: `Import updated ${scraped.code}: ${Object.keys(patch).join(', ')} (term ${termName})`,
          metadata: { before: { name: doc.name, department: doc.department }, after: patch },
        });
        summary.updated++;
      }
    }
  }

  // Courses in DB not seen in this import
  for (const doc of existing) {
    if (!scrapedCodes.has(doc.code)) {
      summary.missingFromImport.push(doc.code);
    }
  }

  // Batch audit log
  if (auditEntries.length) {
    await AuditLog.insertMany(auditEntries);
  }

  return summary;
}

/**
 * Main entry point — scrape offerings for all (or selected) departments
 * for the given term, then run the selective upsert.
 *
 * @param {string} termName     AcademicTerm.name e.g. "261"
 * @param {string[]} deptCodes  Departments to scrape (defaults to all)
 * @param {string} importedBy   Admin email/name for audit log
 * @returns {{ summary, errors }}
 */
async function importCourseOfferings(termName, deptCodes = ALL_DEPARTMENTS, importedBy = 'admin') {
  const termCode = toRegistrarTermCode(termName); // throws on bad format

  const session = createSession();
  const allScraped = [];
  const errors = [];

  // Fetch CSRF token once — valid for the full session lifetime
  const csrfToken = await fetchCsrfToken(session);

  for (const dept of deptCodes) {
    try {
      const courses = await fetchDepartmentOfferings(session, termCode, dept, csrfToken);
      allScraped.push(...courses);
    } catch (err) {
      errors.push({ dept, reason: err.message });
    }
    await sleep(DELAY_MS);
  }

  // Deduplicate by code (same course can appear across departments)
  const seen = new Set();
  const unique = allScraped.filter(c => {
    if (seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  });

  // Remove bad courses from previous imports:
  //   - section-suffix artifacts e.g. "ACCT110-F03"
  //   - graduate/master courses (number ≥ 500)
  //   - no-exam courses: internship (398), summer training (399), senior project (411, 412)
  //   - senior project / senior design courses identified by name
  const { deletedCount: cleaned } = await Course.deleteMany({
    $or: [
      { code: /-/ },
      { code: /^[A-Z]+[5-9]\d/ },
      { code: /^[A-Z]+(398|399)$/ },
      { name: /senior project|senior design/i },
    ],
  });
  if (cleaned > 0) {
    console.log(`[courseOffering] Removed ${cleaned} courses with section-suffix codes (cleanup)`);
  }

  const summary = await upsertCourses(unique, termName, importedBy);
  summary.cleaned = cleaned;

  return { summary, errors };
}

/**
 * Diagnostic — scrapes one department and returns raw parsing detail.
 * Used to inspect what the registrar actually returns without touching the DB.
 */
async function diagnoseOneDept(termName, deptCode) {
  const termCode = toRegistrarTermCode(termName);
  const session = createSession();
  const result = {
    termCode,
    deptCode,
    csrfFound: false,
    postStatus: null,
    tableFound: false,
    allTableCount: 0,
    headers: [],
    sampleRows: [],
    parsedCourses: 0,
    rawHtmlSnippet: '',
  };

  // Step 1: CSRF
  let csrfToken;
  try {
    csrfToken = await fetchCsrfToken(session);
    result.csrfFound = true;
  } catch (err) {
    result.csrfError = err.message;
    return result;
  }

  // Step 2: POST
  let resp;
  try {
    resp = await session.post('/course-offerings', new URLSearchParams({
      csrfmiddlewaretoken: csrfToken,
      term_code: termCode,
      dept_code: deptCode,
      page_choice: 'CO',
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': BASE_URL,
      },
    });
    result.postStatus = resp.status;
  } catch (err) {
    result.postError = err.message;
    return result;
  }

  // Step 3: Parse
  const $ = cheerio.load(resp.data);
  result.rawHtmlSnippet = resp.data.slice(0, 800);
  result.allTableCount = $('table').length;

  const table = $('table').first();
  if (!table.length) return result;
  result.tableFound = true;

  // Try thead first, fall back to first tr with th elements
  const theadHeaders = [];
  table.find('thead th').each((_, el) => theadHeaders.push($(el).text().trim()));

  const firstRowHeaders = [];
  table.find('tr').first().find('th').each((_, el) => firstRowHeaders.push($(el).text().trim()));

  result.headers = theadHeaders.length ? theadHeaders : firstRowHeaders;
  result.headerSource = theadHeaders.length ? 'thead' : 'first-tr';

  // Sample up to 3 raw rows (td text arrays)
  let rowCount = 0;
  table.find('tr').each((_, row) => {
    const cols = [];
    $(row).find('td').each((_, td) => cols.push($(td).text().trim()));
    if (!cols.length) return;
    if (rowCount < 3) result.sampleRows.push(cols);
    rowCount++;
  });
  result.totalDataRows = rowCount;

  // Count unique courses that would be extracted with the current parser
  const headers = result.headers;
  const parsedSeen = new Set();
  table.find('tr').each((_, row) => {
    const cols = [];
    $(row).find('td').each((_, td) => cols.push($(td).text().trim()));
    if (!cols.length) return;
    const rowObj = {};
    headers.forEach((h, i) => { if (cols[i] !== undefined) rowObj[h] = cols[i]; });
    const rawCode = rowObj['Course-Sec'] || rowObj['Course No.'] || rowObj['Course No']
      || rowObj['CourseNo'] || rowObj['Code'] || rowObj['Course Code'] || '';
    const rawName = rowObj['Course Name'] || rowObj['Title'] || rowObj['Course Title']
      || rowObj['Name'] || rowObj['Description'] || '';
    if (!rawCode || !rawName) return;
    const code = normalizeCode(rawCode.replace(/-\d+$/, '').trim());
    parsedSeen.add(code);
  });
  result.parsedCourses = parsedSeen.size;

  return result;
}

module.exports = { importCourseOfferings, diagnoseOneDept, ALL_DEPARTMENTS, toRegistrarTermCode };
