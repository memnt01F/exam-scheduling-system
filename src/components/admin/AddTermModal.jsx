import { useState, useRef } from 'react';
import { Plus, X, Upload, Trash2, Edit3, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { processIcsFile, expandDateRange, generateWeekStartDates } from '../../lib/ics-parser.js';

/**
 * AddTermModal — Two-step flow:
 * Step 1: Enter term metadata + upload .ics file
 * Step 2: Review & edit extracted calendar data before saving
 */
const AddTermModal = ({ onClose, onSave }) => {
  const fileRef = useRef(null);

  // Step 1 form
  const [form, setForm] = useState({
    code: '',
    name: '',
    academicYear: '',
    status: 'upcoming',
  });
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Step 2 review data
  const [step, setStep] = useState(1);
  const [icsData, setIcsData] = useState(null); // { events, termStart, termEnd, blockedDates, weekStartDates }
  const [editingBlockedIdx, setEditingBlockedIdx] = useState(null);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [newBlockedReason, setNewBlockedReason] = useState('');

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
        const text = ev.target.result;
        const result = processIcsFile(text);
        if (!result.events.length) {
          toast.error('No events found in the .ics file');
          return;
        }
        setIcsData(result);
        toast.success(`Parsed ${result.events.length} events from calendar`);
      } catch (err) {
        toast.error('Failed to parse .ics file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleProceedToReview = () => {
    if (!form.code.trim()) { toast.error('Term code is required'); return; }
    if (!form.name.trim()) { toast.error('Term name is required'); return; }
    if (!form.academicYear.trim()) { toast.error('Academic year is required'); return; }
    if (!icsData) { toast.error('Please upload an .ics calendar file'); return; }
    setStep(2);
  };

  // Edit functions for step 2
  const updateTermStart = (val) => {
    setIcsData(prev => ({ ...prev, termStart: val }));
  };
  const updateTermEnd = (val) => {
    setIcsData(prev => ({ ...prev, termEnd: val }));
  };
  const toggleEventBlocked = (idx) => {
    setIcsData(prev => {
      const events = prev.events.map((ev, i) => {
        if (i !== idx) return ev;
        return { ...ev, isBlocked: !ev.isBlocked, blockReason: !ev.isBlocked ? ev.summary : '' };
      });
      // Rebuild blocked dates
      const blockedDates = {};
      for (const ev of events) {
        if (!ev.isBlocked) continue;
        const dates = expandDateRange(ev.startDate, ev.endDate);
        for (const d of dates) blockedDates[d] = ev.blockReason || ev.summary;
      }
      // Add any manually added blocked dates that aren't from events
      for (const [d, reason] of Object.entries(prev.blockedDates)) {
        const isFromEvent = events.some(ev => ev.isBlocked && expandDateRange(ev.startDate, ev.endDate).includes(d));
        if (!isFromEvent && !blockedDates[d]) {
          blockedDates[d] = reason;
        }
      }
      return { ...prev, events, blockedDates };
    });
  };

  const updateEventLabel = (idx, newLabel) => {
    setIcsData(prev => {
      const events = prev.events.map((ev, i) => i === idx ? { ...ev, summary: newLabel, blockReason: ev.isBlocked ? newLabel : '' } : ev);
      const blockedDates = {};
      for (const ev of events) {
        if (!ev.isBlocked) continue;
        const dates = expandDateRange(ev.startDate, ev.endDate);
        for (const d of dates) blockedDates[d] = ev.blockReason || ev.summary;
      }
      // Keep manual entries
      for (const [d, reason] of Object.entries(prev.blockedDates)) {
        const isFromEvent = events.some(ev => ev.isBlocked && expandDateRange(ev.startDate, ev.endDate).includes(d));
        if (!isFromEvent && !blockedDates[d]) {
          blockedDates[d] = reason;
        }
      }
      return { ...prev, events, blockedDates };
    });
  };

  const addManualBlockedDate = () => {
    if (!newBlockedDate) { toast.error('Please select a date'); return; }
    const reason = newBlockedReason.trim() || 'Blocked';
    setIcsData(prev => ({
      ...prev,
      blockedDates: { ...prev.blockedDates, [newBlockedDate]: reason },
    }));
    setNewBlockedDate('');
    setNewBlockedReason('');
    toast.success('Blocked date added');
  };

  const removeBlockedDate = (dateStr) => {
    setIcsData(prev => {
      const bd = { ...prev.blockedDates };
      delete bd[dateStr];
      return { ...prev, blockedDates: bd };
    });
  };

  const handleConfirmSave = () => {
    const weekStartDates = generateWeekStartDates(icsData.termStart, icsData.termEnd, icsData.blockedDates);

    // Add Fridays to blocked dates
    const allBlocked = { ...icsData.blockedDates };

    onSave({
      id: `t-${Date.now()}`,
      code: form.code.trim(),
      name: form.name.trim(),
      academicYear: form.academicYear.trim(),
      startDate: icsData.termStart,
      endDate: icsData.termEnd,
      isActive: form.status === 'active',
      status: form.status,
      calendarData: {
        weekStartDates,
        blockedDates: allBlocked,
        termStart: icsData.termStart,
        termEnd: icsData.termEnd,
        events: icsData.events,
      },
    });
  };

  // Sorted blocked dates for display
  const sortedBlockedDates = icsData
    ? Object.entries(icsData.blockedDates).sort(([a], [b]) => a.localeCompare(b))
    : [];

  const blockedCount = sortedBlockedDates.length;
  const eventCount = icsData?.events?.length || 0;
  const blockedEvents = icsData?.events?.filter(e => e.isBlocked).length || 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflow: 'auto', padding: '20px 0' }} onClick={onClose}>
      <div className="card" style={{ width: step === 2 ? 720 : 480, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--clr-surface)', zIndex: 1 }}>
          <div className="card-title">
            <Plus size={16} /> {step === 1 ? 'Add Academic Term' : 'Review & Edit Calendar Data'}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {step === 1 && (
          <div className="card-content space-y-3">
            <div>
              <label className="text-sm font-medium">Term Code</label>
              <input className="form-input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. 233" />
            </div>
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Term 233 (Summer 2026)" />
            </div>
            <div>
              <label className="text-sm font-medium">Academic Year</label>
              <input className="form-input" value={form.academicYear} onChange={e => set('academicYear', e.target.value)} placeholder="e.g. 2025-2026" />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>

            <div style={{ border: '2px dashed var(--clr-border)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', background: 'var(--clr-muted-bg)', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} style={{ margin: '0 auto 8px', color: 'var(--clr-muted)' }} />
              <p className="text-sm font-medium">Upload iCalendar File (.ics)</p>
              <p className="text-xs text-muted mt-1">Click to browse or drag and drop</p>
              <input ref={fileRef} type="file" accept=".ics" onChange={handleFileUpload} style={{ display: 'none' }} />
            </div>

            {icsData && (
              <div style={{ background: 'var(--clr-primary-bg, hsl(152 60% 95%))', borderRadius: 'var(--radius)', padding: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--clr-primary)' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Calendar parsed successfully
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

            {/* Events */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Imported Events ({eventCount})</h4>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr><th>Event</th><th>Start</th><th>End</th><th style={{ width: 80 }}>Blocked?</th></tr>
                  </thead>
                  <tbody>
                    {icsData.events.map((ev, i) => (
                      <tr key={ev.id}>
                        <td>
                          {editingBlockedIdx === i ? (
                            <input className="form-input" style={{ height: 28, fontSize: 12 }}
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
                  </tbody>
                </table>
              </div>
            </div>

            {/* Blocked dates summary */}
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

              {/* Add manual blocked date */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-xs text-muted">Date</label>
                  <input className="form-input" type="date" value={newBlockedDate} onChange={e => setNewBlockedDate(e.target.value)} style={{ height: 32, fontSize: 12 }} />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="text-xs text-muted">Reason</label>
                  <input className="form-input" value={newBlockedReason} onChange={e => setNewBlockedReason(e.target.value)} placeholder="e.g. University Holiday" style={{ height: 32, fontSize: 12 }} />
                </div>
                <button className="btn btn-outline btn-sm" onClick={addManualBlockedDate} style={{ height: 32 }}>
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>

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
                <Check size={14} /> Confirm & Save Term
              </button>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddTermModal;
