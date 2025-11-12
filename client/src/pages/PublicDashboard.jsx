import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Dashboard from './Dashboard';
import './Dashboard.css';

function PublicDashboard() {
  const { company_slug } = useParams();
  const [publicUser, setPublicUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPublicDashboard();
  }, [company_slug]);

  const fetchPublicDashboard = async () => {
    try {
      const response = await fetch(`/api/public/dashboard/${company_slug}`);
      const data = await response.json();

      if (response.ok) {
        // Set the public user data so Dashboard can use it
        setPublicUser(data.user);
      } else {
        setError(data.error || 'Dashboard not found');
      }
    } catch (err) {
      setError('Failed to load dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ff4444' }}>
        <p>Error: {error}</p>
      </div>
    );
  }

  // Render Dashboard component in public mode
  return <Dashboard isPublic={true} publicUser={publicUser} />;
}

export default PublicDashboard;
