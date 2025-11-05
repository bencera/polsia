import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleConnections = () => {
    navigate('/connections');
  };

  const handleModules = () => {
    navigate('/modules');
  };

  const handleBrain = () => {
    navigate('/brain');
  };

  const handleDocuments = () => {
    navigate('/documents');
  };

  const handleAnalytics = () => {
    navigate('/analytics');
  };

  const handleTasks = () => {
    navigate('/tasks');
  };

  const handleHome = () => {
    navigate('/dashboard');
  };

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-brand">
        Polsia
      </Link>
      <div className="navbar-actions">
        <span className="user-info">{user?.email}</span>
        <button onClick={handleHome} className="nav-button">
          Home
        </button>
        <button onClick={handleBrain} className="nav-button">
          Brain
        </button>
        <button onClick={handleDocuments} className="nav-button">
          Docs
        </button>
        <button onClick={handleAnalytics} className="nav-button">
          Analytics
        </button>
        <button onClick={handleTasks} className="nav-button">
          Tasks
        </button>
        <button onClick={handleModules} className="nav-button">
          Modules
        </button>
        <button onClick={handleConnections} className="nav-button">
          Connections
        </button>
        <button onClick={handleLogout} className="nav-button">
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
