import { useState } from 'react';
import Navbar from '../components/Navbar';
import './Modules.css';

// Demo modules data
const DEMO_MODULES = [
  {
    id: 'ugc-marketing',
    name: 'UGC Marketing Agent',
    description: 'Generate and post user-generated content to social media and ads',
    status: 'active',
    frequency: 'daily',
    services: ['instagram', 'meta-ads'],
    tier: 'free',
    guardrails: {
      requireApproval: false,
      autoPost: true
    }
  },
  {
    id: 'customer-support',
    name: 'Customer Support Agent',
    description: 'Monitor and respond to customer inquiries across channels',
    status: 'active',
    frequency: 'auto',
    services: ['gmail'],
    tier: 'free',
    guardrails: {
      requireApproval: true,
      autoPost: false
    }
  },
  {
    id: 'documentation',
    name: 'Documentation Agent',
    description: 'Generate and update technical documentation from code changes',
    status: 'active',
    frequency: 'auto',
    services: ['github'],
    tier: 'free',
    guardrails: {
      requireApproval: false,
      autoPost: true
    }
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Scan codebase for vulnerabilities and suggest fixes',
    status: 'coming-soon',
    frequency: 'auto',
    services: ['github'],
    tier: 'free',
    guardrails: {
      requireApproval: true,
      autoPost: false
    }
  },
  {
    id: 'growth-analytics',
    name: 'Growth Analytics Agent',
    description: 'Analyze metrics and suggest growth experiments',
    status: 'locked',
    frequency: 'auto',
    services: ['google-analytics', 'mixpanel'],
    tier: 'pro',
    guardrails: {
      requireApproval: false,
      autoPost: false
    }
  }
];

function Modules() {
  const [modules, setModules] = useState(DEMO_MODULES);
  const [expandedModule, setExpandedModule] = useState(null);

  const toggleModuleStatus = (moduleId) => {
    setModules(modules.map(module => {
      if (module.id === moduleId && module.status !== 'coming-soon' && module.status !== 'locked') {
        return {
          ...module,
          status: module.status === 'active' ? 'paused' : 'active'
        };
      }
      return module;
    }));
  };

  const updateFrequency = (moduleId, frequency) => {
    setModules(modules.map(module => {
      if (module.id === moduleId) {
        return { ...module, frequency };
      }
      return module;
    }));
  };

  const toggleGuardrail = (moduleId, guardrail) => {
    setModules(modules.map(module => {
      if (module.id === moduleId) {
        return {
          ...module,
          guardrails: {
            ...module.guardrails,
            [guardrail]: !module.guardrails[guardrail]
          }
        };
      }
      return module;
    }));
  };

  const toggleSettings = (moduleId) => {
    setExpandedModule(expandedModule === moduleId ? null : moduleId);
  };

  const activeCount = modules.filter(m => m.status === 'active').length;

  return (
    <div className="modules-container">
      <div className="terminal">
        <span>&gt; Autonomous Operations Control</span>
      </div>

      <Navbar />

      <div className="modules-content">
        <div className="modules-header">
          <h2>Modules</h2>
          <p className="modules-subtitle">
            Active modules will run automatically based on system priority.
            You can adjust frequency or disable specific modules.
          </p>
          <p className="modules-status">
            {activeCount} {activeCount === 1 ? 'module' : 'modules'} active
          </p>
        </div>

        <div className="modules-list">
          {modules.map((module) => (
            <div key={module.id} className="module-card">
              <div className="module-main">
                <div className="module-info">
                  <h3 className="module-name">{module.name}</h3>
                  <p className="module-description">{module.description}</p>

                  <div className="module-meta">
                    <span className={`module-status ${module.status}`}>
                      {module.status === 'coming-soon' ? 'Coming Soon' :
                       module.status === 'locked' ? `Locked - ${module.tier} tier` :
                       module.status}
                    </span>
                    <span className="module-frequency">
                      {module.frequency}
                    </span>
                    {module.services.length > 0 && (
                      <span className="module-services">
                        Needs: {module.services.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="module-controls">
                  {module.status !== 'coming-soon' && module.status !== 'locked' && (
                    <>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={module.status === 'active'}
                          onChange={() => toggleModuleStatus(module.id)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <button
                        className="settings-btn"
                        onClick={() => toggleSettings(module.id)}
                      >
                        ⚙
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expandedModule === module.id && module.status !== 'coming-soon' && module.status !== 'locked' && (
                <div className="module-settings">
                  <div className="settings-section">
                    <label className="settings-label">Frequency:</label>
                    <div className="frequency-options">
                      {['auto', 'daily', 'weekly', 'manual'].map((freq) => (
                        <label key={freq} className="radio-option">
                          <input
                            type="radio"
                            name={`frequency-${module.id}`}
                            value={freq}
                            checked={module.frequency === freq}
                            onChange={() => updateFrequency(module.id, freq)}
                          />
                          <span>{freq}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="settings-section">
                    <label className="settings-label">Guardrails:</label>
                    <div className="guardrails-options">
                      <label className="checkbox-option">
                        <input
                          type="checkbox"
                          checked={module.guardrails.requireApproval}
                          onChange={() => toggleGuardrail(module.id, 'requireApproval')}
                        />
                        <span>Require approval before executing</span>
                      </label>
                      <label className="checkbox-option">
                        <input
                          type="checkbox"
                          checked={module.guardrails.autoPost}
                          onChange={() => toggleGuardrail(module.id, 'autoPost')}
                        />
                        <span>Allow automatic posting</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Modules;
