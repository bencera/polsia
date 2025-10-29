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

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-brand">
        Polsia
      </Link>
      <div className="navbar-actions">
        <span className="user-info">{user?.email}</span>
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
