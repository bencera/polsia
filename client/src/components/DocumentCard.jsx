import './DocumentCard.css';

function DocumentCard({ title, description, content, lastUpdated, onView, onEdit, canEdit = false }) {
  const hasContent = content && content.trim().length > 0;

  return (
    <div className="document-card">
      <div className="document-card-header">
        <h3 className="document-card-title">{title}</h3>
        {canEdit && (
          <button className="document-card-edit-btn" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>

      <p className="document-card-description">{description}</p>

      {hasContent && (
        <div className="document-card-preview">
          {content.substring(0, 150)}...
        </div>
      )}

      <div className="document-card-footer">
        {hasContent ? (
          <button className="document-card-view-btn" onClick={onView}>
            View Full Document
          </button>
        ) : (
          <span className="document-card-empty">No content yet</span>
        )}

        {lastUpdated && (
          <span className="document-card-updated">
            Updated {new Date(lastUpdated).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

export default DocumentCard;
