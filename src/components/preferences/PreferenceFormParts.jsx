import { useState, useEffect, useRef } from 'react';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat'];

export const EXAM_TYPE_OPTIONS = ['Midterm', 'Two Majors', 'Three Majors'];

export const EMPTY_FORM = {
  examType: null,
  major1Weeks: [],
  major2Weeks: [],
  midtermWeeks: [],
  preferredDays: [],
  unpreferredDays: [],
  comments: '',
};

export function getColumnActivity(examType) {
  return {
    major1:  examType === 'Two Majors'   || examType === 'Three Majors',
    major2:  examType === 'Two Majors'   || examType === 'Three Majors',
    midterm: examType === 'Midterm'      || examType === 'Three Majors',
  };
}

export const WeekPicker = ({ selected, onChange, totalWeeks, disabled }) => {
  const [open, setOpen]             = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 240);
    }
    setOpen(o => !o);
  };

  const toggleWeek = (w) => {
    onChange(selected.includes(w)
      ? selected.filter(x => x !== w)
      : [...selected, w].sort((a, b) => a - b)
    );
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          padding: '4px 8px', borderRadius: 6,
          border: '1px solid var(--clr-border)',
          background: disabled ? 'var(--clr-muted-bg, #f1f5f9)' : '#fff',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 12, width: '100%', minHeight: 30,
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: 'var(--clr-muted)' }}>None ▾</span>
        ) : (
          <>
            {selected.map(w => (
              <span key={w} style={{
                background: '#1a1a1a', color: '#fff',
                borderRadius: 4, padding: '1px 7px', fontSize: 12, fontWeight: 500,
              }}>
                Wk {w}
              </span>
            ))}
            <span style={{ color: 'var(--clr-muted)', marginLeft: 2, fontSize: 11 }}>▾</span>
          </>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 200,
          ...(openUpward
            ? { bottom: 'calc(100% + 4px)', top: 'auto' }
            : { top: 'calc(100% + 4px)', bottom: 'auto' }
          ),
          left: 0,
          background: '#fff', border: '1px solid var(--clr-border)',
          borderRadius: 8, padding: 12, width: 210,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
              <button
                key={w}
                type="button"
                onClick={() => toggleWeek(w)}
                style={{
                  padding: '6px 0', borderRadius: 6, border: 'none',
                  background: selected.includes(w) ? '#1a1a1a' : '#f1f5f9',
                  color: selected.includes(w) ? '#fff' : '#334155',
                  fontSize: 13, cursor: 'pointer',
                  fontWeight: selected.includes(w) ? 600 : 400,
                }}
              >
                {w}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn btn-primary btn-sm"
            style={{ width: '100%', marginTop: 10 }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export const DayToggleGroup = ({ selected, onChange, disabledDays, disabled }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
    {DAYS.map(day => {
      const isSelected = selected.includes(day);
      const isDisabled = disabled || disabledDays.includes(day);
      return (
        <button
          key={day}
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (isDisabled) return;
            onChange(isSelected ? selected.filter(d => d !== day) : [...selected, day]);
          }}
          style={{
            padding: '3px 0', borderRadius: 6, fontSize: 11,
            border: '1px solid var(--clr-border)',
            background: isSelected ? '#1a1a1a' : isDisabled ? 'var(--clr-muted-bg, #f1f5f9)' : '#fff',
            color: isSelected ? '#fff' : isDisabled ? 'var(--clr-muted)' : '#334155',
            cursor: isDisabled ? 'default' : 'pointer',
            fontWeight: isSelected ? 600 : 400,
          }}
        >
          {day}
        </button>
      );
    })}
  </div>
);
