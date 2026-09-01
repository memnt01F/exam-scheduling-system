import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportSchedule } from '../../services/api.js';

/**
 * "Extract to Excel" — downloads the exam-calendar workbook for the selected term.
 *
 * The export covers the WHOLE term, not the phase currently selected on the
 * page. `phaseNumber` is not reliable enough to filter on, and a booking sitting
 * in the wrong phase would silently drop out of the sheet. That is stated in the
 * caption beneath the button, because someone who picked phase 1 in the toolbar
 * would otherwise reasonably expect only phase 1 in the file.
 */
const ExtractScheduleButton = ({ termId, disabled = false, termName }) => {
  const [isExporting, setIsExporting] = useState(false);

  const scope = 'Includes every booked exam in the term, all phases.';

  const handleExtract = async () => {
    // Guard against a double-submit: a second click while the first request is
    // in flight would download the same file twice.
    if (isExporting || disabled || !termId) return;
    setIsExporting(true);

    let href = null;
    try {
      const { blob, filename, anomalyCount } = await exportSchedule({ termId });

      href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      if (anomalyCount > 0) {
        toast.warning(
          `Downloaded ${filename} with ${anomalyCount} issue${anomalyCount === 1 ? '' : 's'}. ` +
            'See the "Export Log" sheet in the workbook for details.'
        );
      } else {
        toast.success(`Downloaded ${filename}`);
      }
    } catch (err) {
      // A button that downloads nothing and says nothing reads as broken, so
      // the server's own message is surfaced verbatim.
      toast.error(err.message || 'Could not export the schedule.');
    } finally {
      if (href) URL.revokeObjectURL(href);
      setIsExporting(false);
    }
  };

  const blockedReason = !termId
    ? 'Select a term first'
    : disabled
      ? 'Generate or load a schedule first'
      : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        className="btn btn-outline btn-sm"
        onClick={handleExtract}
        disabled={isExporting || disabled || !termId}
        title={blockedReason || `${scope} Term ${termName || termId}.`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
      >
        <Download size={14} />
        {isExporting ? 'Preparing…' : 'Extract to Excel'}
      </button>
      {!blockedReason && (
        <span className="text-xs" style={{ color: '#6b7280', fontSize: 10, whiteSpace: 'nowrap' }}>
          {scope}
        </span>
      )}
    </div>
  );
};

export default ExtractScheduleButton;
