import { useState, useMemo, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import AdminPreferencesView from '../components/admin/AdminPreferencesView.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { BookOpen, BarChart2, Search, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';

const tabs = [
  { id: 'assignments', label: 'Course Assignments', icon: BookOpen },
  { id: 'preferences', label: 'Preferences',        icon: BarChart2 },
];

/* ── Assignments tab ── */
const AssignmentsTab = ({ deptCourses, coordinators, assignments, setAssignments, saving, onSave }) => {
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');

  const depts = useMemo(() => [...new Set(deptCourses.map(c => c.department))].sort(), [deptCourses]);

  const filtered = useMemo(() => deptCourses.filter(c => {
    const matchDept = !deptFilter || c.department === deptFilter;
    const q = search.toLowerCase();
    const matchSearch = !search || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    return matchDept && matchSearch;
  }), [deptCourses, deptFilter, search]);

  const unassigned = deptCourses.filter(c => !assignments[c.code]).length;

  return (
    <div className="space-y-4">
      {unassigned > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d' }}>
          <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>
            {unassigned} course{unassigned !== 1 ? 's have' : ' has'} no coordinator assigned.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--clr-muted)' }} />
          <input className="form-input" placeholder="Search courses…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        {depts.length > 1 && (
          <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Assignments'}
        </button>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Name</th>
                  <th>Level</th>
                  <th>Department</th>
                  <th>Coordinator</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.code}</td>
                    <td className="text-sm">{c.name}</td>
                    <td className="text-sm">{c.level}</td>
                    <td className="text-sm">{c.department}</td>
                    <td>
                      <select
                        className="form-input"
                        style={{ minWidth: 180 }}
                        value={assignments[c.code] || ''}
                        onChange={e => setAssignments(prev => ({ ...prev, [c.code]: e.target.value }))}
                      >
                        <option value="">— Unassigned —</option>
                        {coordinators.map(coord => (
                          <option key={coord.id} value={coord.id}>{coord.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>
                      No courses found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Preferences tab ── */
const PreferencesTab = ({ managedDepts, terms, phases }) => {
  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedPhaseNum, setSelectedPhaseNum] = useState(0);
  const [showPrefsView, setShowPrefsView] = useState(false);

  const selectedTerm = terms.find(t => String(t._serverId || t.id) === String(selectedTermId));
  const selectedPhase = phases.find(p =>
    p.phaseNumber === selectedPhaseNum &&
    String(p.targetTermId) === String(selectedTermId)
  );

  if (showPrefsView && selectedTermId && selectedPhase) {
    return (
      <AdminPreferencesView
        phaseNum={selectedPhaseNum}
        termId={selectedTermId}
        phase={selectedPhase}
        term={selectedTerm}
        onBack={() => setShowPrefsView(false)}
        restrictedDepts={managedDepts}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 200 }}
          value={selectedTermId}
          onChange={e => { setSelectedTermId(e.target.value); setShowPrefsView(false); }}
        >
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t._serverId || t.id}>{t.name}</option>)}
        </select>
        {selectedTermId && [0, 1].map(n => (
          <button
            key={n}
            className={`btn btn-sm ${selectedPhaseNum === n ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSelectedPhaseNum(n)}
          >
            Phase {n}
          </button>
        ))}
        {selectedTermId && selectedPhase && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowPrefsView(true)}>
            View Preferences
          </button>
        )}
      </div>
      {!selectedTermId && (
        <div className="card">
          <div className="card-content" style={{ padding: 40, textAlign: 'center', color: 'var(--clr-muted)' }}>
            Select a term to view preference submissions.
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main Dashboard ── */
const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { courses, users, phases, academicTerms: terms, updateUser: updateUserCtx } = useCourses();

  const liveUser = users.find(u => u.email === user?.email);
  const managedDepts = liveUser?.managedDepartments || [];
  const [activeTab, setActiveTab] = useState('assignments');

  const coordinators = useMemo(() => users.filter(u => u.role === 'coordinator'), [users]);
  const deptCourses = useMemo(
    () => courses
      .filter(c => managedDepts.includes(c.department))
      .sort((a, b) => a.code.localeCompare(b.code)),
    [courses, managedDepts]
  );

  const [assignments, setAssignments] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = {};
    deptCourses.forEach(c => {
      const coord = coordinators.find(u => (u.assignedCourses || []).includes(c.code));
      init[c.code] = coord?.id || '';
    });
    setAssignments(init);
  }, [deptCourses, coordinators]);

  const handleSave = async () => {
    setSaving(true);

    // Build desired final assignedCourses per coordinator
    const finalSets = {};
    coordinators.forEach(c => { finalSets[c.id] = new Set(c.assignedCourses || []); });

    deptCourses.forEach(({ code }) => {
      const newCoordId = assignments[code] || '';
      const oldCoord = coordinators.find(c => (c.assignedCourses || []).includes(code));

      if (oldCoord && oldCoord.id !== newCoordId) {
        finalSets[oldCoord.id]?.delete(code);
      }
      if (newCoordId) {
        if (!finalSets[newCoordId]) finalSets[newCoordId] = new Set();
        finalSets[newCoordId].add(code);
      }
    });

    for (const coord of coordinators) {
      const newArr = [...(finalSets[coord.id] || new Set())];
      const oldSorted = [...new Set(coord.assignedCourses || [])].sort().join(',');
      const newSorted = newArr.slice().sort().join(',');
      if (oldSorted !== newSorted) {
        await updateUserCtx(coord.id, { assignedCourses: newArr }, user?.name || 'Dept Head');
      }
    }

    setSaving(false);
    toast.success('Assignments saved successfully');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Department Head</h1>
          <p className="text-sm text-muted mt-1">
            {managedDepts.length
              ? `Managing: ${managedDepts.join(', ')}`
              : 'No departments assigned — contact admin'}
          </p>
        </div>

        <div className="tab-bar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'assignments' && (
          <AssignmentsTab
            deptCourses={deptCourses}
            coordinators={coordinators}
            assignments={assignments}
            setAssignments={setAssignments}
            saving={saving}
            onSave={handleSave}
          />
        )}

        {activeTab === 'preferences' && (
          <PreferencesTab
            managedDepts={managedDepts}
            terms={terms}
            phases={phases}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default DepartmentHeadDashboard;
