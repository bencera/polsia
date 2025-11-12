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

  const handleHome = () => {
    navigate('/dashboard');
  };

  const handleTasks = () => {
    navigate('/tasks');
  };

  const handleAgents = () => {
    navigate('/agents');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  const handlePolsiaClick = () => {
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand-container">
        <Link to="/dashboard" className="navbar-brand">
          {user?.company_name || 'My Company'}
        </Link>
        <button
          onClick={handlePolsiaClick}
          className="nav-button"
          style={{ marginLeft: '10px' }}
        >
          Run by Polsia
        </button>
      </div>
      <div className="navbar-actions">
        <span className="user-info">{user?.email}</span>
        <button onClick={handleSettings} className="nav-button">
          Settings
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
