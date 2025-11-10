import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import Documents from './Documents';
import Analytics from './Analytics';
import Tools from './Tools';
import Connections from './Connections';
import './Settings.css';

function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [expandedSections, setExpandedSections] = useState(new Set(['connections']));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSection = (sectionId) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  return (
    <div className="settings-page">
      <Navbar />

      <div className="settings-content">
        <div className="settings-header">
          <h2>Settings</h2>
          <p className="settings-subtitle">
            Manage your connections, tools, documents, and analytics
          </p>
        </div>

        <div className="settings-sections">
          {/* Connections Section */}
          <div className="settings-section">
            <div
              className="section-header"
              onClick={() => toggleSection('connections')}
            >
              <h3>
                <span className="section-icon">🔌</span>
                Connections
              </h3>
              <span className="toggle-icon">
                {expandedSections.has('connections') ? '−' : '+'}
              </span>
            </div>
            {expandedSections.has('connections') && (
              <div className="section-content">
                <Connections embedded={true} />
              </div>
            )}
          </div>

          {/* Tools Section */}
          <div className="settings-section">
            <div
              className="section-header"
              onClick={() => toggleSection('tools')}
            >
              <h3>
                <span className="section-icon">🛠️</span>
                Tools
              </h3>
              <span className="toggle-icon">
                {expandedSections.has('tools') ? '−' : '+'}
              </span>
            </div>
            {expandedSections.has('tools') && (
              <div className="section-content">
                <Tools embedded={true} />
              </div>
            )}
          </div>

          {/* Documents Section */}
          <div className="settings-section">
            <div
              className="section-header"
              onClick={() => toggleSection('documents')}
            >
              <h3>
                <span className="section-icon">📄</span>
                Documents
              </h3>
              <span className="toggle-icon">
                {expandedSections.has('documents') ? '−' : '+'}
              </span>
            </div>
            {expandedSections.has('documents') && (
              <div className="section-content">
                <Documents embedded={true} />
              </div>
            )}
          </div>

          {/* Analytics Section */}
          <div className="settings-section">
            <div
              className="section-header"
              onClick={() => toggleSection('analytics')}
            >
              <h3>
                <span className="section-icon">📊</span>
                Analytics
              </h3>
              <span className="toggle-icon">
                {expandedSections.has('analytics') ? '−' : '+'}
              </span>
            </div>
            {expandedSections.has('analytics') && (
              <div className="section-content">
                <Analytics embedded={true} />
              </div>
            )}
          </div>

          {/* Logout Section */}
          <div className="settings-section logout-section">
            <button onClick={handleLogout} className="logout-button">
              <span className="section-icon">🚪</span>
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
