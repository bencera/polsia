import { useState } from 'react';
import ReportListItem from './ReportListItem';
import './ReportCategory.css';

function ReportCategory({
  categoryName,
  reportCount,
  reports,
  onReportClick,
  onLoadMore,
  hasMore = false,
  loading = false
}) {
  const [expanded, setExpanded] = useState(true);

  const formatCategoryName = (name) => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="report-category">
      <div className="report-category-header" onClick={() => setExpanded(!expanded)}>
        <div className="report-category-title-section">
          <h3 className="report-category-title">{formatCategoryName(categoryName)}</h3>
          <span className="report-category-count">{reportCount} reports</span>
        </div>
        <span className="report-category-toggle">
          {expanded ? '−' : '+'}
        </span>
      </div>

      {expanded && (
        <div className="report-category-content">
          {reports.length === 0 ? (
            <p className="report-category-empty">No reports in this category yet.</p>
          ) : (
            <>
              <div className="report-category-list">
                {reports.map((report) => (
                  <ReportListItem
                    key={report.id}
                    report={report}
                    onClick={() => onReportClick(report)}
                  />
                ))}
              </div>

              {hasMore && (
                <button
                  className="report-category-load-more"
                  onClick={onLoadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ReportCategory;
