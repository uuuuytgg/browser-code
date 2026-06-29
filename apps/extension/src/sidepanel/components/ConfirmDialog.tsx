type Props = {
  open: boolean;
  title: string;
  detail: string;
  onConfirm: () => void;
  onReject: () => void;
  /** Whether this is a high-risk action (red confirm button) */
  highRisk?: boolean;
};

/**
 * Confirmation dialog for high-risk actions.
 * Per 03 design doc: shows when task status is `need_confirmation`.
 */
export function ConfirmDialog({ open, title, detail, onConfirm, onReject, highRisk }: Props) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-card">
        <h3 className={highRisk ? "confirm-title-warn" : ""}>{title}</h3>
        <p>{detail}</p>
        <div className="confirm-actions">
          <button type="button" className="ghost-button" onClick={onReject}>
            取消
          </button>
          <button
            type="button"
            className={highRisk ? "confirm-danger" : "primary-button"}
            onClick={onConfirm}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
