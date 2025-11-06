import './ReportListItem.css';

function ReportListItem({ report, onClick }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="report-list-item" onClick={onClick}>
      <div className="report-list-item-main">
        <h4 className="report-list-item-title">{report.name}</h4>
        <div className="report-list-item-meta">
          <span className="report-list-item-date">
            {formatDate(report.report_date)}
          </span>
          {report.metadata && report.metadata.summary && (
            <span className="report-list-item-summary">
              {report.metadata.summary}
            </span>
          )}
        </div>
      </div>
      <button className="report-list-item-view">View →</button>
    </div>
  );
}

export default ReportListItem;
