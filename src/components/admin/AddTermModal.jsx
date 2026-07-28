import { useState, useRef } from 'react';
import { Plus, X, Upload, Trash2, Edit3, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { processIcsFile, expandDateRange, generateWeekStartDates } from '../../lib/ics-parser.js';

/**
 * AddTermModal — create or edit an academic term.
 *
 * Block types stored in calendarData:
 *   blockedDates     — enforced always; no exam can be placed on these days.
 *   softBlockedDates — Hard constraint for Phase 0 only (B54 unavailable). Phase 1/2 not affected.
 */
const AddRow = ({ from, setFrom, to, setTo, reason, setReason, onAdd }) => (
  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
    <div>
      <label className="text-xs text-muted">From</label>
      <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ height: 32, fontSize: 12, width: 140 }} />
    </div>
    <div>
      <label className="text-xs text-muted">To (optional)</label>
      <input className="form-input" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={{ height: 32, fontSize: 12, width: 140 }} />
    </div>
    <div style={{ flex: 1, minWidth: 120 }}>
      <label className="text-xs text-muted">Reason</label>
      <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. National Day" style={{ height: 32, fontSize: 12 }} />
    </div>
    <button className="btn btn-outline btn-sm" onClick={onAdd} style={{ height: 32 }}>
      <Plus size={12} /> Add
    </button>
  </div>
);

const DateTable = ({ rows, type, accentColor, onRemove }) => (
  <div style={{ border: `1px solid ${accentColor}40`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
    {rows.length === 0 ? (
      <div className="text-muted text-xs" style={{ textAlign: 'center', padding: '12px 0' }}>None added yet</div>
    ) : (
      <table className="data-table" style={{ fontSize: 12 }}>
        <tbody>
          {rows.map(([dateStr, reason]) => (
            <tr key={dateStr}>
              <td className="text-muted" style={{ width: 110 }}>{dateStr}</td>
              <td>{reason}</td>
              <td style={{ width: 36 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onRemove(dateStr, type)} title="Remove">
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const AddTermModal = ({ onClose, onSave, term = null }) => {
  const isEdit = !!term;
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    code:         '',
    name:         term?.name || '',
    academicYear: '',
    status:       term?.status || (term?.isActive ? 'active' : 'upcoming'),
  });
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const [step, setStep] = useState(1);
  const [icsData, setIcsData] = useState(() => {
    if (isEdit && term.calendarData) {
      return {
        events: (term.calendarData.events || []).map(ev => ({
          ...ev,
          blockType: ev.blockType || (ev.isBlocked ? 'hard' : 'none'),
        })),
        termStart:        term.calendarData.termStart        || term.startDate || '',
        termEnd:          term.calendarData.termEnd          || term.endDate   || '',
        blockedDates:     term.calendarData.blockedDates     || {},
        softBlockedDates: term.calendarData.softBlockedDates || {},
        weekStartDates:   term.calendarData.weekStartDates   || [],
      };
    }
    return null;
  });

  const [newIcsUploaded, setNewIcsUploaded] = useState(false);
  const [editingBlockedIdx, setEditingBlockedIdx] = useState(null);

  // Add-row state — one set per section
  const [hardFrom, setHardFrom]     = useState('');
  const [hardTo, setHardTo]         = useState('');
  const [hardReason, setHardReason] = useState('');
  const [softFrom, setSoftFrom]     = useState('');
  const [softTo, setSoftTo]         = useState('');
  const [softReason, setSoftReason] = useState('');

  /* ── File upload ── */
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.ics')) { toast.error('Please upload a valid .ics file'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = processIcsFile(ev.target.result);
        if (!result.events.length) { toast.error('No events found in the .ics file'); return; }
        setIcsData({
          ...result,
          softBlockedDates: {},
          events: result.events.map(ev => ({
            ...ev,
            blockType: ev.isBlocked ? 'hard' : 'none',
          })),
        });
        setNewIcsUploaded(true);
        toast.success(`Parsed ${result.events.length} events from calendar`);
      } catch (err) {
        toast.error('Failed to parse .ics file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  /* ── Step navigation ── */
  const handleProceedToReview = () => {
    if (!form.name.trim()) { toast.error('Term name is required'); return; }
    if (!isEdit) {
      if (!form.code.trim()) { toast.error('Term code is required'); return; }
      if (!form.academicYear.trim()) { toast.error('Academic year is required'); return; }
    }
    if (!icsData) { toast.error('Please upload an .ics calendar file'); return; }
    setStep(2);
  };

  /* ── Step 2 helpers ── */
  const updateTermStart = (val) => setIcsData(prev => ({ ...prev, termStart: val }));
  const updateTermEnd   = (val) => setIcsData(prev => ({ ...prev, termEnd: val }));

  const changeEventBlockType = (idx, blockType) => {
    setIcsData(prev => {
      const events = prev.events.map((ev, i) => {
        if (i !== idx) return ev;
        return {
          ...ev,
          blockType,
          isBlocked:   blockType !== 'none',
          blockReason: blockType !== 'none' ? (ev.blockReason || ev.summary) : '',
        };
      });
      const { blockedDates, softBlockedDates } = rebuildBlockedDates(events, prev.blockedDates, prev.softBlockedDates);
      return { ...prev, events, blockedDates, softBlockedDates };
    });
  };

  const updateEventLabel = (idx, newLabel) => {
    setIcsData(prev => {
      const events = prev.events.map((ev, i) =>
        i === idx ? { ...ev, summary: newLabel, blockReason: ev.blockType !== 'none' ? newLabel : '' } : ev
      );
      const { blockedDates, softBlockedDates } = rebuildBlockedDates(events, prev.blockedDates, prev.softBlockedDates);
      return { ...prev, events, blockedDates, softBlockedDates };
    });
  };

  const addDates = (type, fromDate, toDate, reason, clearFn) => {
    if (!fromDate) { toast.error('Please select a start date'); return; }
    if (toDate && toDate < fromDate) { toast.error('End date must be on or after start date'); return; }
    const endDate = toDate || fromDate;
    const label = reason.trim() || (type === 'hard' ? 'Blocked' : 'B54 Unavailable');
    const newEvent = {
      id:          `manual-${Date.now()}`,
      summary:     label,
      startDate:   fromDate,
      endDate,
      blockType:   type,
      isBlocked:   true,
      blockReason: label,
    };
    setIcsData(prev => {
      const events = [...prev.events, newEvent];
      const { blockedDates, softBlockedDates } = rebuildBlockedDates(events, prev.blockedDates, prev.softBlockedDates);
      return { ...prev, events, blockedDates, softBlockedDates };
    });
    clearFn();
    toast.success(type === 'hard' ? 'Blocked day added' : 'B54 Unavailable day added');
  };

  const removeDate = (dateStr, type) => {
    setIcsData(prev => {
      if (type === 'hard') {
        const bd = { ...prev.blockedDates }; delete bd[dateStr];
        return { ...prev, blockedDates: bd };
      } else {
        const sbd = { ...prev.softBlockedDates }; delete sbd[dateStr];
        return { ...prev, softBlockedDates: sbd };
      }
    });
  };

  /* ── Save ── */
  const handleConfirmSave = () => {
    const weekStartDates = generateWeekStartDates(icsData.termStart, icsData.termEnd, icsData.blockedDates);
    const calendarData = {
      weekStartDates,
      blockedDates:     icsData.blockedDates,
      softBlockedDates: icsData.softBlockedDates,
      termStart:        icsData.termStart,
      termEnd:          icsData.termEnd,
      events:           icsData.events,
    };
    if (isEdit) {
      onSave({ name: form.name.trim(), startDate: icsData.termStart, endDate: icsData.termEnd, isActive: form.status === 'active', status: form.status, calendarData });
    } else {
      onSave({ id: `t-${Date.now()}`, code: form.code.trim(), name: form.name.trim(), academicYear: form.academicYear.trim(), startDate: icsData.termStart, endDate: icsData.termEnd, isActive: form.status === 'active', status: form.status, calendarData });
    }
  };

  /* ── Derived ── */
  const sortedBlocked  = Object.entries(icsData?.blockedDates     || {}).sort(([a], [b]) => a.localeCompare(b));
  const sortedSoft     = Object.entries(icsData?.softBlockedDates || {}).sort(([a], [b]) => a.localeCompare(b));
  const eventCount     = icsData?.events?.length || 0;
  const blockedCount   = sortedBlocked.length;
  const softCount      = sortedSoft.length;
  const blockedEvents  = icsData?.events?.filter(e => e.blockType !== 'none').length || 0;

  const modalTitle = step === 1
    ? (isEdit ? 'Edit Academic Term' : 'Add Academic Term')
    : 'Review & Edit Calendar Data';


  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflow: 'auto', padding: '20px 0' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: step === 2 ? 720 : 480, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--clr-surface)', zIndex: 1 }}>
          <div className="card-title">
            {isEdit ? <Edit3 size={16} /> : <Plus size={16} />} {modalTitle}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="card-content space-y-3">
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Term 233 (Summer 2026)" />
            </div>
            {!isEdit && (
              <>
                <div>
                  <label className="text-sm font-medium">Term Code</label>
                  <input className="form-input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. 233" />
                </div>
                <div>
                  <label className="text-sm font-medium">Academic Year</label>
                  <input className="form-input" value={form.academicYear} onChange={e => set('academicYear', e.target.value)} placeholder="e.g. 2025-2026" />
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium">Status</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>
            {isEdit && icsData && !newIcsUploaded && (
              <div style={{ background: 'var(--clr-primary-bg, hsl(152 60% 95%))', borderRadius: 'var(--radius)', padding: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--clr-primary)' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Existing calendar data loaded
                </p>
                <p className="text-xs text-muted mt-1">
                  {eventCount} events · {blockedCount} blocked · {softCount} B54 unavailable · {icsData.termStart} to {icsData.termEnd}
                </p>
                <p className="text-xs text-muted mt-1">
                  You can continue to review and edit the calendar, or upload a new .ics file below to replace it entirely.
                </p>
              </div>
            )}
            <div
              style={{ border: '2px dashed var(--clr-border)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', background: 'var(--clr-muted-bg)', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} style={{ margin: '0 auto 8px', color: 'var(--clr-muted)' }} />
              <p className="text-sm font-medium">{isEdit && icsData ? 'Upload new .ics to replace calendar' : 'Upload iCalendar File (.ics)'}</p>
              <p className="text-xs text-muted mt-1">Click to browse or drag and drop</p>
              <input ref={fileRef} type="file" accept=".ics" onChange={handleFileUpload} style={{ display: 'none' }} />
            </div>
            {(newIcsUploaded || (!isEdit && icsData)) && (
              <div style={{ background: 'var(--clr-primary-bg, hsl(152 60% 95%))', borderRadius: 'var(--radius)', padding: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--clr-primary)' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Calendar parsed successfully
                </p>
                <p className="text-xs text-muted mt-1">{eventCount} events · {blockedEvents} auto-detected blocked · {icsData.termStart} to {icsData.termEnd}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleProceedToReview}>Review Calendar Data →</button>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && icsData && (
          <div className="card-content space-y-4">

            {/* Term dates */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Term Dates</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <label className="text-xs text-muted">Start Date</label>
                  <input className="form-input" type="date" value={icsData.termStart} onChange={e => updateTermStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted">End Date</label>
                  <input className="form-input" type="date" value={icsData.termEnd} onChange={e => updateTermEnd(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Events table */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Calendar Events ({eventCount})</h4>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr><th>Event</th><th>Start</th><th>End</th><th style={{ width: 110 }}>Block type</th></tr>
                  </thead>
                  <tbody>
                    {icsData.events.map((ev, i) => (
                      <tr key={ev.id || i}>
                        <td>
                          {editingBlockedIdx === i ? (
                            <input
                              className="form-input"
                              style={{ height: 28, fontSize: 12 }}
                              value={ev.summary}
                              onChange={e => updateEventLabel(i, e.target.value)}
                              onBlur={() => setEditingBlockedIdx(null)}
                              autoFocus
                            />
                          ) : (
                            <span style={{ cursor: 'pointer' }} onClick={() => setEditingBlockedIdx(i)} title="Click to edit">
                              {ev.summary} <Edit3 size={10} style={{ opacity: 0.4 }} />
                            </span>
                          )}
                        </td>
                        <td className="text-muted">{ev.startDate}</td>
                        <td className="text-muted">{ev.endDate}</td>
                        <td>
                          <select
                            value={ev.blockType}
                            onChange={e => changeEventBlockType(i, e.target.value)}
                            style={{
                              fontSize: 11, height: 26, borderRadius: 4, cursor: 'pointer',
                              border: '1px solid var(--clr-border)', background: 'var(--clr-card)',
                              color: ev.blockType === 'hard' ? '#dc2626' : ev.blockType === 'soft' ? '#b45309' : 'var(--clr-muted)',
                              padding: '0 4px',
                            }}
                          >
                            <option value="none">No block</option>
                            <option value="hard">Blocked</option>
                            <option value="soft">B54 Unavailable</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                    {icsData.events.length === 0 && (
                      <tr><td colSpan={4} className="text-muted" style={{ textAlign: 'center', padding: 12 }}>No events</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Blocked Days ── */}
            <div style={{ borderLeft: '3px solid #ef4444', paddingLeft: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h4 className="text-sm font-semibold">Blocked Days</h4>
                {blockedCount > 0 && (
                  <span style={{ fontSize: 11, background: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>
                    {blockedCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted" style={{ marginBottom: 8 }}>
                No exam can be scheduled on these days under any circumstances — holidays, national days, breaks, etc.
              </p>
              <div style={{ maxHeight: 140, overflow: 'auto' }}>
                <DateTable rows={sortedBlocked} type="hard" accentColor="#ef4444" onRemove={removeDate} />
              </div>
              <AddRow
                from={hardFrom} setFrom={setHardFrom}
                to={hardTo}     setTo={setHardTo}
                reason={hardReason} setReason={setHardReason}
                onAdd={() => addDates('hard', hardFrom, hardTo, hardReason, () => { setHardFrom(''); setHardTo(''); setHardReason(''); })}
              />
            </div>

            {/* ── B54 Unavailable ── */}
            <div style={{ borderLeft: '3px solid #f59e0b', paddingLeft: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h4 className="text-sm font-semibold">B54 Unavailable</h4>
                {softCount > 0 && (
                  <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>
                    {softCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted" style={{ marginBottom: 8 }}>
                Building 54 is unavailable on these days. Phase 0 exams cannot be scheduled here. Phase 1 and Phase 2 courses are not affected.
              </p>
              <div style={{ maxHeight: 140, overflow: 'auto' }}>
                <DateTable rows={sortedSoft} type="soft" accentColor="#f59e0b" onRemove={removeDate} />
              </div>
              <AddRow
                from={softFrom} setFrom={setSoftFrom}
                to={softTo}     setTo={setSoftTo}
                reason={softReason} setReason={setSoftReason}
                onAdd={() => addDates('soft', softFrom, softTo, softReason, () => { setSoftFrom(''); setSoftTo(''); setSoftReason(''); })}
              />
            </div>

            {/* Active term warning */}
            {form.status === 'active' && (
              <div style={{ background: 'hsl(45 93% 94%)', border: '1px solid hsl(45 80% 70%)', borderRadius: 'var(--radius)', padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle size={16} style={{ color: 'hsl(45 80% 40%)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'hsl(45 80% 30%)' }}>Active Term</p>
                  <p className="text-xs" style={{ color: 'hsl(45 50% 40%)' }}>
                    Saving as active will immediately update the booking calendar for all coordinators and admins. Any existing active term will be deactivated.
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary btn-sm" onClick={handleConfirmSave}>
                <Check size={14} /> {isEdit ? 'Save Changes' : 'Confirm & Save Term'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function rebuildBlockedDates(events, existingBlockedDates, existingSoftBlockedDates) {
  const blockedDates     = {};
  const softBlockedDates = {};

  for (const ev of events) {
    if (ev.blockType === 'none') continue;
    const dates  = expandDateRange(ev.startDate, ev.endDate);
    const reason = ev.blockReason || ev.summary;
    if (ev.blockType === 'hard') {
      for (const d of dates) blockedDates[d] = reason;
    } else {
      for (const d of dates) softBlockedDates[d] = reason;
    }
  }

  const allEventDates = new Set(events.flatMap(ev => expandDateRange(ev.startDate, ev.endDate)));

  for (const [d, reason] of Object.entries(existingBlockedDates || {})) {
    if (!allEventDates.has(d) && !blockedDates[d]) blockedDates[d] = reason;
  }
  for (const [d, reason] of Object.entries(existingSoftBlockedDates || {})) {
    if (!allEventDates.has(d) && !softBlockedDates[d]) softBlockedDates[d] = reason;
  }

  return { blockedDates, softBlockedDates };
}

export default AddTermModal;
