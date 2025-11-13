import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import ReportCategory from '../components/ReportCategory';
import DocumentViewer from '../components/DocumentViewer';
import './Documents.css';

function Documents() {
  const [documents, setDocuments] = useState(null);
  const [reportTypes, setReportTypes] = useState([]);
  const [reportsByType, setReportsByType] = useState({});
  const [reportOffsets, setReportOffsets] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingReports, setLoadingReports] = useState({});
  const [error, setError] = useState('');

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerData, setViewerData] = useState(null);

  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  // Check if page is embedded in modal
  const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === 'true';

  useEffect(() => {
    fetchDocuments();
    fetchReportTypes();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setDocuments(data.documents);
      } else {
        setError(data.message || 'Failed to load documents');
      }
    } catch (err) {
      setError('Failed to load documents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReportTypes = async () => {
    try {
      const response = await fetch('/api/reports/types', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setReportTypes(data.types || []);
        // Load initial reports for each type
        data.types.forEach(type => {
          fetchReportsForType(type.report_type, 0);
        });
      }
    } catch (err) {
      console.error('Error fetching report types:', err);
    }
  };

  const fetchReportsForType = async (reportType, offset = 0) => {
    setLoadingReports(prev => ({ ...prev, [reportType]: true }));

    try {
      const response = await fetch(
        `/api/reports/type/${encodeURIComponent(reportType)}?limit=5&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (response.ok) {
        setReportsByType(prev => ({
          ...prev,
          [reportType]: offset === 0
            ? data.reports
            : [...(prev[reportType] || []), ...data.reports]
        }));

        setReportOffsets(prev => ({
          ...prev,
          [reportType]: offset + data.reports.length
        }));
      }
    } catch (err) {
      console.error(`Error fetching reports for ${reportType}:`, err);
    } finally {
      setLoadingReports(prev => ({ ...prev, [reportType]: false }));
    }
  };

  const handleLoadMoreReports = (reportType) => {
    const currentOffset = reportOffsets[reportType] || 0;
    fetchReportsForType(reportType, currentOffset);
  };

  const openDocumentViewer = (title, content, lastUpdated, canEdit, docType) => {
    setViewerData({
      title,
      content,
      lastUpdated,
      canEdit,
      type: 'document',
      docType
    });
    setViewerOpen(true);
  };

  const openReportViewer = (report) => {
    setViewerData({
      title: report.name,
      content: report.content,
      lastUpdated: report.created_at,
      canEdit: false,
      type: 'report'
    });
    setViewerOpen(true);
  };

  const handleSaveDocument = async (content) => {
    if (!viewerData || !viewerData.docType) return;

    try {
      const response = await fetch(`/api/documents/${viewerData.docType}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });

      const data = await response.json();

      if (response.ok) {
        // Update local state
        setDocuments({
          ...documents,
          [`${viewerData.docType}_md`]: content,
          updated_at: data.document.updated_at
        });

        // Update viewer data
        setViewerData({
          ...viewerData,
          content: content,
          lastUpdated: data.document.updated_at
        });

        alert('Document saved successfully!');
      } else {
        throw new Error(data.message || 'Failed to save document');
      }
    } catch (err) {
      console.error('Error saving document:', err);
      throw err;
    }
  };

  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  const displayLogs = terminalLogs.slice(-5);

  const highLevelDocs = documents ? [
    {
      id: 'vision',
      title: 'Vision',
      description: 'Your company\'s long-term vision and strategic direction',
      content: documents.vision_md,
      canEdit: true
    },
    {
      id: 'goals',
      title: 'Goals',
      description: 'Current objectives and key results (OKRs)',
      content: documents.goals_md,
      canEdit: true
    }
  ] : [];

  return (
    <div className="documents-container">
      {!isEmbedded && (
        <div className="terminal">
          {displayLogs.length === 0 ? (
            <>
              <div>&gt; Document Library</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div></>
          ) : (
            <>
              {displayLogs.map((log, index) => (
                <div key={`${log.id}-${index}`}>&gt; {formatLogMessage(log)}</div>
              ))}
              {displayLogs.length < 5 &&
                Array.from({ length: 5 - displayLogs.length }).map((_, i) => (
                  <div key={`empty-${i}`}>&nbsp;</div>
                ))
              }
            </>
          )}
        </div>
      )}

      {!isEmbedded && <Navbar />}

      <div className="documents-content">
        {loading && (
          <div className="status-message">
            <p>Loading documents...</p>
          </div>
        )}

        {error && !loading && (
          <div className="status-message error">
            <p>{error}</p>
          </div>
        )}

        {!loading && documents && (
          <>
            {!isEmbedded && (
              <div className="documents-header">
                <h1>Documents & Reports</h1>
                <p className="documents-subtitle">
                  Strategic documents and auto-generated business reports
                </p>
              </div>
            )}

            {/* High-Level Documents */}
            <section className="documents-section">
              <h2 className="section-title">Strategic Documents</h2>
              <div className="documents-list">
                {highLevelDocs.map(doc => (
                  <div
                    key={doc.id}
                    className="document-list-item"
                    onClick={() => openDocumentViewer(
                      doc.title,
                      doc.content,
                      documents.updated_at,
                      doc.canEdit,
                      doc.id
                    )}
                  >
                    <div className="document-list-item-main">
                      <h3 className="document-list-item-title">{doc.title}</h3>
                      <p className="document-list-item-description">{doc.description}</p>
                      <div className="document-list-item-meta">
                        {doc.canEdit ? (
                          <span className="document-list-item-badge">Editable</span>
                        ) : (
                          <span className="document-list-item-badge auto">Auto-managed</span>
                        )}
                        {doc.content && doc.content.trim().length > 0 && (
                          <span className="document-list-item-status">
                            {doc.content.length} characters
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="document-list-item-view">View →</button>
                  </div>
                ))}
              </div>
            </section>

            {/* Reports by Category */}
            <section className="reports-section">
              <h2 className="section-title">Business Reports</h2>

              {reportTypes.length === 0 ? (
                <p className="empty-state">
                  No reports yet. Reports will appear here as your agents generate them.
                </p>
              ) : (
                <div className="reports-categories">
                  {reportTypes.map(type => (
                    <ReportCategory
                      key={type.report_type}
                      categoryName={type.report_type}
                      reportCount={type.count}
                      reports={reportsByType[type.report_type] || []}
                      onReportClick={openReportViewer}
                      onLoadMore={() => handleLoadMoreReports(type.report_type)}
                      hasMore={(reportsByType[type.report_type]?.length || 0) < type.count}
                      loading={loadingReports[type.report_type] || false}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Document/Report Viewer Modal */}
      <DocumentViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={viewerData?.title || ''}
        content={viewerData?.content || ''}
        lastUpdated={viewerData?.lastUpdated}
        canEdit={viewerData?.canEdit || false}
        onSave={viewerData?.canEdit ? handleSaveDocument : null}
        type={viewerData?.type || 'document'}
      />

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Documents;
