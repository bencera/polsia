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
        <button onClick={handleTasks} className="nav-button">
          Tasks
        </button>
        <button onClick={handleAgents} className="nav-button">
          Agents
        </button>
        <button onClick={handleSettings} className="nav-button">
          Settings
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
