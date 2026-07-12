import { useState, useRef } from 'react';
import { Plus, X, Upload, Trash2, Edit3, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { processIcsFile, expandDateRange, generateWeekStartDates } from '../../lib/ics-parser.js';

/**
 * AddTermModal — create or edit an academic term.
 *
 * Create mode (term = null): two-step flow — metadata + ICS upload → calendar review.
 * Edit mode   (term = obj):  same flow, but ICS upload is optional when the term already
 *                            has calendarData. The admin can proceed straight to the calendar
 *                            review step and edit events / blocked dates without re-uploading.
 */
const AddTermModal = ({ onClose, onSave, term = null }) => {
  const isEdit = !!term;
  const fileRef = useRef(null);

  // Step 1 form — code and academicYear are creation-only (not stored in backend)
  const [form, setForm] = useState({
    code:         '',
    name:         term?.name || '',
    academicYear: '',
    status:       term?.status || (term?.isActive ? 'active' : 'upcoming'),
  });
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Step 2 review data — pre-populated from existing calendarData in edit mode
  const [step, setStep] = useState(1);
  const [icsData, setIcsData] = useState(() => {
    if (isEdit && term.calendarData) {
      return {
        events:         term.calendarData.events       || [],
        termStart:      term.calendarData.termStart    || term.startDate || '',
        termEnd:        term.calendarData.termEnd      || term.endDate   || '',
        blockedDates:   term.calendarData.blockedDates || {},
        weekStartDates: term.calendarData.weekStartDates || [],
      };
    }
    return null;
  });
  const [newIcsUploaded, setNewIcsUploaded] = useState(false);
  const [editingBlockedIdx, setEditingBlockedIdx] = useState(null);
  const [newFromDate, setNewFromDate] = useState('');
  const [newToDate, setNewToDate] = useState('');
  const [newEventReason, setNewEventReason] = useState('');
  const [newIsBlocked, setNewIsBlocked] = useState(true);

  /* ── File upload ── */
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.ics')) {
      toast.error('Please upload a valid .ics file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = processIcsFile(ev.target.result);
        if (!result.events.length) {
          toast.error('No events found in the .ics file');
          return;
        }
        setIcsData(result);
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

  /* ── Step 2 edit helpers ── */
  const updateTermStart = (val) => setIcsData(prev => ({ ...prev, termStart: val }));
  const updateTermEnd   = (val) => setIcsData(prev => ({ ...prev, termEnd: val }));

  const toggleEventBlocked = (idx) => {
    setIcsData(prev => {
      const events = prev.events.map((ev, i) => {
        if (i !== idx) return ev;
        return { ...ev, isBlocked: !ev.isBlocked, blockReason: !ev.isBlocked ? ev.summary : '' };
      });
      const blockedDates = rebuildBlockedDates(events, prev.blockedDates);
      return { ...prev, events, blockedDates };
    });
  };

  const updateEventLabel = (idx, newLabel) => {
    setIcsData(prev => {
      const events = prev.events.map((ev, i) =>
        i === idx ? { ...ev, summary: newLabel, blockReason: ev.isBlocked ? newLabel : '' } : ev
      );
      const blockedDates = rebuildBlockedDates(events, prev.blockedDates);
      return { ...prev, events, blockedDates };
    });
  };

  const addManualEvent = () => {
    if (!newFromDate) { toast.error('Please select a start date'); return; }
    const endDate = newToDate || newFromDate;
    if (newToDate && newToDate < newFromDate) { toast.error('End date must be on or after start date'); return; }
    const reason = newEventReason.trim() || (newIsBlocked ? 'Blocked' : 'University Event');
    const newEvent = {
      id: `manual-${Date.now()}`,
      summary: reason,
      startDate: newFromDate,
      endDate,
      isBlocked: newIsBlocked,
      blockReason: newIsBlocked ? reason : '',
    };
    setIcsData(prev => {
      const events = [...prev.events, newEvent];
      const blockedDates = rebuildBlockedDates(events, prev.blockedDates);
      return { ...prev, events, blockedDates };
    });
    setNewFromDate('');
    setNewToDate('');
    setNewEventReason('');
    setNewIsBlocked(true);
    toast.success(newIsBlocked ? 'Blocked date added' : 'Event added to calendar');
  };

  const removeBlockedDate = (dateStr) => {
    setIcsData(prev => {
      const bd = { ...prev.blockedDates };
      delete bd[dateStr];
      return { ...prev, blockedDates: bd };
    });
  };

  /* ── Save ── */
  const handleConfirmSave = () => {
    const weekStartDates = generateWeekStartDates(icsData.termStart, icsData.termEnd, icsData.blockedDates);
    const calendarData = {
      weekStartDates,
      blockedDates:   icsData.blockedDates,
      termStart:      icsData.termStart,
      termEnd:        icsData.termEnd,
      events:         icsData.events,
    };

    if (isEdit) {
      onSave({
        name:       form.name.trim(),
        startDate:  icsData.termStart,
        endDate:    icsData.termEnd,
        isActive:   form.status === 'active',
        status:     form.status,
        calendarData,
      });
    } else {
      onSave({
        id:           `t-${Date.now()}`,
        code:         form.code.trim(),
        name:         form.name.trim(),
        academicYear: form.academicYear.trim(),
        startDate:    icsData.termStart,
        endDate:      icsData.termEnd,
        isActive:     form.status === 'active',
        status:       form.status,
        calendarData,
      });
    }
  };

  /* ── Derived display values ── */
  const sortedBlockedDates = icsData
    ? Object.entries(icsData.blockedDates).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const blockedCount  = sortedBlockedDates.length;
  const eventCount    = icsData?.events?.length || 0;
  const blockedEvents = icsData?.events?.filter(e => e.isBlocked).length || 0;

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

            {/* Name — always shown */}
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Term 233 (Summer 2026)"
              />
            </div>

            {/* Code + Academic Year — create mode only */}
            {!isEdit && (
              <>
                <div>
                  <label className="text-sm font-medium">Term Code</label>
                  <input
                    className="form-input"
                    value={form.code}
                    onChange={e => set('code', e.target.value)}
                    placeholder="e.g. 233"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Academic Year</label>
                  <input
                    className="form-input"
                    value={form.academicYear}
                    onChange={e => set('academicYear', e.target.value)}
                    placeholder="e.g. 2025-2026"
                  />
                </div>
              </>
            )}

            {/* Status */}
            <div>
              <label className="text-sm font-medium">Status</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>

            {/* Existing calendar data summary (edit mode only) */}
            {isEdit && icsData && !newIcsUploaded && (
              <div style={{ background: 'var(--clr-primary-bg, hsl(152 60% 95%))', borderRadius: 'var(--radius)', padding: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--clr-primary)' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Existing calendar data loaded
                </p>
                <p className="text-xs text-muted mt-1">
                  {eventCount} events · {blockedCount} blocked dates · {icsData.termStart} to {icsData.termEnd}
                </p>
                <p className="text-xs text-muted mt-1">
                  You can continue to review and edit the calendar, or upload a new .ics file below to replace it entirely.
                </p>
              </div>
            )}

            {/* ICS upload area */}
            <div
              style={{ border: '2px dashed var(--clr-border)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', background: 'var(--clr-muted-bg)', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} style={{ margin: '0 auto 8px', color: 'var(--clr-muted)' }} />
              <p className="text-sm font-medium">
                {isEdit && icsData ? 'Upload new .ics to replace calendar' : 'Upload iCalendar File (.ics)'}
              </p>
              <p className="text-xs text-muted mt-1">Click to browse or drag and drop</p>
              <input ref={fileRef} type="file" accept=".ics" onChange={handleFileUpload} style={{ display: 'none' }} />
            </div>

            {/* Newly uploaded ICS success */}
            {newIcsUploaded && icsData && (
              <div style={{ background: 'var(--clr-primary-bg, hsl(152 60% 95%))', borderRadius: 'var(--radius)', padding: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--clr-primary)' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  New calendar parsed successfully
                </p>
                <p className="text-xs text-muted mt-1">
                  {eventCount} events · {blockedEvents} blocked · {icsData.termStart} to {icsData.termEnd}
                </p>
              </div>
            )}

            {/* Create mode: show parsed summary when ICS is loaded */}
            {!isEdit && icsData && (
              <div style={{ background: 'var(--clr-primary-bg, hsl(152 60% 95%))', borderRadius: 'var(--radius)', padding: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--clr-primary)' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Calendar parsed successfully
                </p>
                <p className="text-xs text-muted mt-1">
                  {eventCount} events · {blockedEvents} blocked · {icsData.termStart} to {icsData.termEnd}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleProceedToReview}>
                Review Calendar Data →
              </button>
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
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr><th>Event</th><th>Start</th><th>End</th><th style={{ width: 80 }}>Blocked?</th></tr>
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
                          <button
                            className={`btn btn-sm ${ev.isBlocked ? 'btn-primary' : 'btn-outline'}`}
                            style={{ fontSize: 10, padding: '2px 8px', height: 24 }}
                            onClick={() => toggleEventBlocked(i)}
                          >
                            {ev.isBlocked ? 'Yes' : 'No'}
                          </button>
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

            {/* Blocked dates */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Blocked Dates ({blockedCount})</h4>
              <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr><th>Date</th><th>Reason</th><th style={{ width: 50 }}></th></tr>
                  </thead>
                  <tbody>
                    {sortedBlockedDates.map(([dateStr, reason]) => (
                      <tr key={dateStr}>
                        <td className="text-muted">{dateStr}</td>
                        <td>{reason}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => removeBlockedDate(dateStr)} title="Remove">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {sortedBlockedDates.length === 0 && (
                      <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 12 }}>No blocked dates</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add manual event */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label className="text-xs text-muted">From</label>
                  <input className="form-input" type="date" value={newFromDate} onChange={e => setNewFromDate(e.target.value)} style={{ height: 32, fontSize: 12, width: 140 }} />
                </div>
                <div>
                  <label className="text-xs text-muted">To (optional)</label>
                  <input className="form-input" type="date" value={newToDate} min={newFromDate || undefined} onChange={e => setNewToDate(e.target.value)} style={{ height: 32, fontSize: 12, width: 140 }} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="text-xs text-muted">Reason</label>
                  <input className="form-input" value={newEventReason} onChange={e => setNewEventReason(e.target.value)} placeholder="e.g. University Holiday" style={{ height: 32, fontSize: 12 }} />
                </div>
                <div>
                  <label className="text-xs text-muted">Blocked?</label>
                  <button
                    className={`btn btn-sm ${newIsBlocked ? 'btn-primary' : 'btn-outline'}`}
                    style={{ height: 32, fontSize: 12, display: 'block', width: '100%' }}
                    onClick={() => setNewIsBlocked(v => !v)}
                  >
                    {newIsBlocked ? 'Yes' : 'No'}
                  </button>
                </div>
                <button className="btn btn-outline btn-sm" onClick={addManualEvent} style={{ height: 32 }}>
                  <Plus size={12} /> Add
                </button>
              </div>
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

function rebuildBlockedDates(events, existingBlockedDates) {
  const blockedDates = {};
  // First pass: dates from currently-blocked events
  for (const ev of events) {
    if (!ev.isBlocked) continue;
    const dates = expandDateRange(ev.startDate, ev.endDate);
    for (const d of dates) blockedDates[d] = ev.blockReason || ev.summary;
  }
  // Build the full set of dates owned by ANY event (blocked or not)
  const allEventDates = new Set(
    events.flatMap(ev => expandDateRange(ev.startDate, ev.endDate))
  );
  // Preserve only truly manual blocked dates (not owned by any event)
  for (const [d, reason] of Object.entries(existingBlockedDates)) {
    if (!allEventDates.has(d) && !blockedDates[d]) blockedDates[d] = reason;
  }
  return blockedDates;
}

export default AddTermModal;
