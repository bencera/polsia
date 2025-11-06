import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './DocumentViewer.css';

function DocumentViewer({
  isOpen,
  onClose,
  title,
  content,
  lastUpdated,
  canEdit = false,
  onSave = null,
  type = 'document' // 'document' or 'report'
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!onSave) return;

    setSaving(true);
    try {
      await onSave(editContent);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="document-viewer-overlay" onClick={handleOverlayClick}>
      <div className="document-viewer-modal">
        <div className="document-viewer-header">
          <div className="document-viewer-title-section">
            <h2 className="document-viewer-title">{title}</h2>
            {lastUpdated && (
              <span className="document-viewer-date">
                Last updated: {new Date(lastUpdated).toLocaleString()}
              </span>
            )}
          </div>

          <div className="document-viewer-actions">
            {canEdit && !isEditing && (
              <button className="document-viewer-edit-btn" onClick={handleEdit}>
                Edit
              </button>
            )}

            {isEditing && (
              <>
                <button
                  className="document-viewer-cancel-btn"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="document-viewer-save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}

            <button className="document-viewer-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="document-viewer-content">
          {isEditing ? (
            <textarea
              className="document-viewer-editor"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Enter content..."
            />
          ) : (
            <div className="document-viewer-markdown">
              {content && content.trim().length > 0 ? (
                <ReactMarkdown>{content}</ReactMarkdown>
              ) : (
                <p className="document-viewer-empty">No content available.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentViewer;
