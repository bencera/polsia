import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Connections.css';

function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [availableRepos, setAvailableRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [primaryRepo, setPrimaryRepo] = useState(null);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderApiKey, setRenderApiKey] = useState('');
  const [validatingRender, setValidatingRender] = useState(false);
  const [showRenderApiKey, setShowRenderApiKey] = useState(false);
  const [showRenderServiceSelector, setShowRenderServiceSelector] = useState(false);
  const [availableRenderServices, setAvailableRenderServices] = useState([]);
  const [loadingRenderServices, setLoadingRenderServices] = useState(false);
  const [primaryRenderService, setPrimaryRenderService] = useState(null);
  // App Store Connect state
  const [showAppStoreModal, setShowAppStoreModal] = useState(false);
  const [appStoreKeyId, setAppStoreKeyId] = useState('');
  const [appStoreIssuerId, setAppStoreIssuerId] = useState('');
  const [appStorePrivateKey, setAppStorePrivateKey] = useState('');
  const [validatingAppStore, setValidatingAppStore] = useState(false);
  const [showAppStoreAppSelector, setShowAppStoreAppSelector] = useState(false);
  const [availableAppStoreApps, setAvailableAppStoreApps] = useState([]);
  const [loadingAppStoreApps, setLoadingAppStoreApps] = useState(false);
  const [primaryAppStoreApp, setPrimaryAppStoreApp] = useState(null);
  // Meta Ads state
  const [showMetaAdsAdAccountSelector, setShowMetaAdsAdAccountSelector] = useState(false);
  const [availableMetaAdsAdAccounts, setAvailableMetaAdsAdAccounts] = useState([]);
  const [loadingMetaAdsAdAccounts, setLoadingMetaAdsAdAccounts] = useState(false);
  const [primaryMetaAdsAdAccount, setPrimaryMetaAdsAdAccount] = useState(null);
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchConnections();

    // Check for OAuth callback messages in URL
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const errorParam = params.get('error');

    if (success === 'github_connected') {
      setSuccessMessage('GitHub account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'gmail_connected') {
      setSuccessMessage('Gmail account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'instagram_connected') {
      const username = params.get('username');
      setSuccessMessage(`Instagram account ${username ? `@${username}` : ''} connected successfully!`);
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'meta_ads_connected') {
      setSuccessMessage('Meta Ads account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'sentry_connected') {
      setSuccessMessage('Sentry account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'slack_connected') {
      setSuccessMessage('Slack workspace connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (errorParam) {
      const errorMessages = {
        'invalid_state': 'OAuth security validation failed. Please try again.',
        'no_code': 'Authorization failed. Please try again.',
        'no_token': 'Failed to obtain access token.',
        'oauth_failed': 'OAuth process failed. Please try again.',
        'instagram_session_expired': 'Instagram session expired. Please try connecting again.',
        'instagram_connection_failed': 'Instagram connection failed. Make sure you have an Instagram Business or Creator account connected to a Facebook Page, and that you granted all required permissions.',
        'instagram_invalid_callback': 'Invalid Instagram callback. Please try again.',
        'instagram_failed': 'Instagram connection failed. Please try again.',
        'invalid_callback': 'Invalid callback parameters. Please try again.',
        'meta_ads_access_denied': 'Meta Ads access denied. Please grant all required permissions.',
        'meta_ads_token_exchange_failed': 'Failed to exchange token for long-lived access. Please try again.',
        'meta_ads_invalid_callback': 'Invalid Meta Ads callback. Please try again.',
        'meta_ads_failed': 'Meta Ads connection failed. Please try again.',
        'sentry_access_denied': 'Sentry access denied. Please grant all required permissions.',
        'sentry_invalid_token_expiry': 'Invalid token expiry received from Sentry. Please try again.',
        'sentry_invalid_callback': 'Invalid Sentry callback. Please try again.',
        'sentry_failed': 'Sentry connection failed. Please try again.'
      };
      setError(errorMessages[errorParam] || 'An error occurred during connection.');
    }
  }, []);

  // Extract primary app from App Store Connect connection when connections change
  useEffect(() => {
    const appStoreConnection = connections.find(c => c.service_name === 'appstore_connect');
    if (appStoreConnection && appStoreConnection.metadata && appStoreConnection.metadata.primary_app) {
      setPrimaryAppStoreApp(appStoreConnection.metadata.primary_app);
    }
  }, [connections]);

  // Extract primary ad account from Meta Ads connection when connections change
  useEffect(() => {
    const metaAdsConnection = connections.find(c => c.service_name === 'meta-ads');
    if (metaAdsConnection && metaAdsConnection.metadata && metaAdsConnection.metadata.primary_ad_account) {
      setPrimaryMetaAdsAdAccount(metaAdsConnection.metadata.primary_ad_account);
    }
  }, [connections]);

  const fetchConnections = async () => {
    try {
      const response = await fetch('/api/connections', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setConnections(data.connections);
      } else {
        setError(data.message || 'Failed to load connections');
      }
    } catch (err) {
      setError('Failed to load connections. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const connectGitHub = () => {
    // Redirect to GitHub OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/github?token=${token}`;
  };

  const connectGmail = () => {
    // Redirect to Gmail OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/gmail?token=${token}`;
  };

  const connectInstagram = () => {
    // Redirect to Instagram OAuth flow (via Late.dev)
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/instagram?token=${token}`;
  };

  const connectMetaAds = () => {
    // Redirect to Meta Ads OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/meta-ads?token=${token}`;
  };

  const connectSlack = () => {
    // Redirect to Slack OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/slack?token=${token}`;
  };

  const disconnectGitHub = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your GitHub account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/github/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('GitHub account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect GitHub');
      }
    } catch (err) {
      alert('Failed to disconnect GitHub. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectGmail = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Gmail account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/gmail/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Gmail account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Gmail');
      }
    } catch (err) {
      alert('Failed to disconnect Gmail. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectInstagram = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Instagram account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/instagram/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Instagram account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Instagram');
      }
    } catch (err) {
      alert('Failed to disconnect Instagram. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectMetaAds = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Meta Ads account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/meta-ads/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Meta Ads account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Meta Ads');
      }
    } catch (err) {
      alert('Failed to disconnect Meta Ads. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectSlack = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Slack workspace?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/slack/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Slack workspace disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Slack');
      }
    } catch (err) {
      alert('Failed to disconnect Slack. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const connectSentry = () => {
    // Redirect to Sentry OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/sentry?token=${token}`;
  };

  const disconnectSentry = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Sentry account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/sentry/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Sentry account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Sentry');
      }
    } catch (err) {
      alert('Failed to disconnect Sentry. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const connectRender = async () => {
    if (!renderApiKey.trim()) {
      setError('Please enter your Render API key');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setValidatingRender(true);
    setError('');

    try {
      const response = await fetch('/api/connections/render', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ api_key: renderApiKey })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage('Render API key connected successfully!');
        setShowRenderModal(false);
        setRenderApiKey('');
        setShowRenderApiKey(false);
        setTimeout(() => {
          fetchConnections();
          setSuccessMessage('');
        }, 3000);
      } else {
        setError(data.error || 'Failed to connect Render API key');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      setError('Failed to validate Render API key. Please try again.');
      setTimeout(() => setError(''), 5000);
    } finally {
      setValidatingRender(false);
    }
  };

  const disconnectRender = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Render account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/connections/render/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Render account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Render');
      }
    } catch (err) {
      alert('Failed to disconnect Render. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  // App Store Connect connection handlers
  const connectAppStore = async () => {
    // Validate inputs
    if (!appStoreKeyId.trim()) {
      setError('Please enter your Key ID');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!appStoreIssuerId.trim()) {
      setError('Please enter your Issuer ID');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!appStorePrivateKey.trim()) {
      setError('Please enter your Private Key');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setValidatingAppStore(true);
    setError('');

    try {
      const response = await fetch('/api/connections/appstore-connect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyId: appStoreKeyId.trim(),
          issuerId: appStoreIssuerId.trim(),
          privateKey: appStorePrivateKey.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(`App Store Connect credentials connected successfully! Found ${data.data.appCount} app(s).`);
        setShowAppStoreModal(false);
        setAppStoreKeyId('');
        setAppStoreIssuerId('');
        setAppStorePrivateKey('');
        setTimeout(() => {
          fetchConnections();
          setSuccessMessage('');
        }, 3000);
      } else {
        setError(data.error || 'Failed to connect App Store Connect credentials');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      setError('Failed to validate App Store Connect credentials. Please try again.');
      setTimeout(() => setError(''), 5000);
    } finally {
      setValidatingAppStore(false);
    }
  };

  const disconnectAppStore = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your App Store Connect account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/connections/appstore-connect/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('App Store Connect account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect App Store Connect');
      }
    } catch (err) {
      alert('Failed to disconnect App Store Connect. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  // Fetch App Store Connect apps
  const fetchAppStoreApps = async () => {
    setLoadingAppStoreApps(true);
    try {
      const response = await fetch('/api/connections/appstore-connect/apps', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAvailableAppStoreApps(data.apps);
        setShowAppStoreAppSelector(true);
      } else {
        alert(data.error || 'Failed to fetch apps');
      }
    } catch (err) {
      alert('Failed to fetch App Store Connect apps. Please try again.');
    } finally {
      setLoadingAppStoreApps(false);
    }
  };

  // Set primary App Store Connect app
  const setPrimaryAppStoreAppHandler = async (appId, appName, bundleId) => {
    try {
      const response = await fetch('/api/connections/appstore-connect/primary-app', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ appId, appName, bundleId })
      });

      const data = await response.json();

      if (response.ok) {
        setPrimaryAppStoreApp(data.primaryApp);
        setShowAppStoreAppSelector(false);
        setSuccessMessage('Primary app updated successfully!');
        setTimeout(() => {
          fetchConnections();
          setSuccessMessage('');
        }, 3000);
      } else {
        alert(data.error || 'Failed to set primary app');
      }
    } catch (err) {
      alert('Failed to set primary app. Please try again.');
    }
  };

  // Fetch Meta Ads ad accounts
  const fetchMetaAdsAdAccounts = async () => {
    setLoadingMetaAdsAdAccounts(true);
    try {
      const response = await fetch('/api/connections/meta-ads/ad-accounts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAvailableMetaAdsAdAccounts(data.adAccounts);
        setShowMetaAdsAdAccountSelector(true);
      } else {
        alert(data.error || 'Failed to fetch ad accounts');
      }
    } catch (err) {
      alert('Failed to fetch Meta Ads ad accounts. Please try again.');
    } finally {
      setLoadingMetaAdsAdAccounts(false);
    }
  };

  // Set primary Meta Ads ad account
  const setPrimaryMetaAdsAdAccountHandler = async (adAccountId, name, accountId, currency) => {
    try {
      const response = await fetch('/api/connections/meta-ads/primary-ad-account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ adAccountId, name, accountId, currency })
      });

      const data = await response.json();

      if (response.ok) {
        setPrimaryMetaAdsAdAccount(data.primaryAdAccount);
        setShowMetaAdsAdAccountSelector(false);
        setSuccessMessage('Primary ad account updated successfully!');
        setTimeout(() => {
          fetchConnections();
          setSuccessMessage('');
        }, 3000);
      } else {
        alert(data.error || 'Failed to set primary ad account');
      }
    } catch (err) {
      alert('Failed to set primary ad account. Please try again.');
    }
  };

  // Fetch Render services
  const fetchRenderServices = async () => {
    setLoadingRenderServices(true);
    try {
      const response = await fetch('/api/connections/render/services', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAvailableRenderServices(data.services);
        setShowRenderServiceSelector(true);
      } else {
        alert(data.error || 'Failed to fetch Render services');
      }
    } catch (err) {
      alert('Failed to fetch Render services. Please try again.');
    } finally {
      setLoadingRenderServices(false);
    }
  };

  // Fetch current primary Render service
  const fetchPrimaryRenderService = async () => {
    try {
      const response = await fetch('/api/connections/render/primary-service', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.primary_service) {
        setPrimaryRenderService(data.primary_service);
      }
    } catch (err) {
      console.error('Failed to fetch primary Render service:', err);
    }
  };

  // Set primary Render service
  const setPrimaryRenderServiceHandler = async (serviceId, serviceName, serviceType) => {
    try {
      const response = await fetch('/api/connections/render/primary-service', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ serviceId, serviceName, serviceType })
      });

      const data = await response.json();

      if (response.ok) {
        setPrimaryRenderService(data.primary_service);
        setShowRenderServiceSelector(false);
        setSuccessMessage('Primary Render service updated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to set primary Render service');
      }
    } catch (err) {
      alert('Failed to set primary Render service. Please try again.');
    }
  };

  const toggleConnection = async (connectionId, currentStatus) => {
    setUpdating(connectionId);
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected';

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok) {
        setConnections(connections.map(conn =>
          conn.id === connectionId ? { ...conn, status: newStatus} : conn
        ));
      } else {
        alert(data.message || 'Failed to update connection');
      }
    } catch (err) {
      alert('Failed to update connection. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  // Fetch GitHub repositories
  const fetchGitHubRepos = async () => {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/connections/github/repos', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAvailableRepos(data.repos);
        setShowRepoSelector(true);
      } else {
        alert(data.message || 'Failed to fetch repositories');
      }
    } catch (err) {
      alert('Failed to fetch repositories. Please try again.');
    } finally {
      setLoadingRepos(false);
    }
  };

  // Fetch current primary repo
  const fetchPrimaryRepo = async () => {
    try {
      const response = await fetch('/api/connections/github/primary-repo', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.primary_repo) {
        setPrimaryRepo(data.primary_repo);
      }
    } catch (err) {
      console.error('Failed to fetch primary repo:', err);
    }
  };

  // Set primary repository
  const setPrimaryRepository = async (owner, repo, branch) => {
    try {
      const response = await fetch('/api/connections/github/primary-repo', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ owner, repo, branch: branch || 'main' })
      });

      const data = await response.json();

      if (response.ok) {
        setPrimaryRepo(data.primary_repo);
        setShowRepoSelector(false);
        setSuccessMessage('Primary repository updated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.message || 'Failed to set primary repository');
      }
    } catch (err) {
      alert('Failed to set primary repository. Please try again.');
    }
  };

  // Load primary repo when connections load
  useEffect(() => {
    if (connections.find(c => c.service_name === 'github')) {
      fetchPrimaryRepo();
    }
  }, [connections]);

  // Load primary Render service when connections load
  useEffect(() => {
    if (connections.find(c => c.service_name === 'render')) {
      fetchPrimaryRenderService();
    }
  }, [connections]);

  const getServiceIcon = (serviceName) => {
    const icons = {
      github: '🐙',
      gmail: '📧',
      instagram: '📷',
      'meta-ads': '📊',
      notion: '📝',
      slack: '💬',
      default: '🔗'
    };
    return icons[serviceName.toLowerCase()] || icons.default;
  };

  // Format log for terminal display
  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  // Get last 4 logs for terminal display
  const displayLogs = terminalLogs.slice(-4);

  return (
    <div className="settings-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          // Show 4 lines when idle
          <>
            <div>&gt; Autonomous Operations Control</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
          </>
        ) : (
          // Show logs and fill remaining lines
          <>
            {displayLogs.map((log, index) => (
              <div key={`${log.id}-${index}`}>&gt; {formatLogMessage(log)}</div>
            ))}
            {displayLogs.length < 4 &&
              Array.from({ length: 4 - displayLogs.length }).map((_, i) => (
                <div key={`empty-${i}`}>&nbsp;</div>
              ))
            }
          </>
        )}
      </div>

      <Navbar />

      <div className="settings-content">
        <div className="settings-header">
          <h2>Connections</h2>
          <p>Manage your service connections</p>
        </div>

        {loading && (
          <div className="loading-state">
            <p>Loading connections...</p>
          </div>
        )}

        {successMessage && (
          <div className="success-state">
            <p>{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>{error}</p>
          </div>
        )}

        {/* GitHub Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'github') && (
          <div className="connection-card github-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>GitHub</h3>
                  <p className="service-description">Connect your GitHub account to enable code reading and pushing</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectGitHub}
              disabled={updating === 'github'}
            >
              {updating === 'github' ? 'Connecting...' : 'Connect GitHub'}
            </button>
          </div>
        )}

        {/* Gmail Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'gmail') && (
          <div className="connection-card gmail-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Gmail</h3>
                  <p className="service-description">Connect your Gmail account to read, send, and manage emails</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectGmail}
              disabled={updating === 'gmail'}
            >
              {updating === 'gmail' ? 'Connecting...' : 'Connect Gmail'}
            </button>
          </div>
        )}

        {/* Slack Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'slack') && (
          <div className="connection-card slack-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Slack</h3>
                  <p className="service-description">Connect your Slack workspace to read messages, post updates, and understand team conversations</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectSlack}
              disabled={updating === 'slack'}
            >
              {updating === 'slack' ? 'Connecting...' : 'Connect Slack'}
            </button>
          </div>
        )}

        {/* Instagram Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'instagram') && (
          <div className="connection-card instagram-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Instagram</h3>
                  <p className="service-description">Connect your Instagram Business account to post and manage content</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectInstagram}
              disabled={updating === 'instagram'}
            >
              {updating === 'instagram' ? 'Connecting...' : 'Connect Instagram'}
            </button>
          </div>
        )}

        {/* Meta Ads Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'meta-ads') && (
          <div className="connection-card meta-ads-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Meta Ads</h3>
                  <p className="service-description">Connect your Meta (Facebook) Ads account to manage campaigns and track performance</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectMetaAds}
              disabled={updating === 'meta-ads'}
            >
              {updating === 'meta-ads' ? 'Connecting...' : 'Connect Meta Ads'}
            </button>
          </div>
        )}

        {!loading && !connections.find(c => c.service_name === 'sentry') && (
          <div className="connection-card sentry-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Sentry</h3>
                  <p className="service-description">Connect Sentry to monitor errors and performance issues in real-time</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectSentry}
              disabled={updating === 'sentry'}
            >
              {updating === 'sentry' ? 'Connecting...' : 'Connect Sentry'}
            </button>
          </div>
        )}

        {/* Render Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'render') && (
          <div className="connection-card render-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Render</h3>
                  <p className="service-description">Connect your Render account to manage web services, databases, and deployments</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={() => setShowRenderModal(true)}
              disabled={updating === 'render'}
            >
              {updating === 'render' ? 'Connecting...' : 'Connect Render'}
            </button>
          </div>
        )}

        {/* Render API Key Modal */}
        {showRenderModal && (
          <div className="modal-overlay" onClick={() => setShowRenderModal(false)}>
            <div className="modal-content render-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Connect Render Account</h3>
                <button
                  className="modal-close"
                  onClick={() => {
                    setShowRenderModal(false);
                    setRenderApiKey('');
                    setShowRenderApiKey(false);
                    setError('');
                  }}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="modal-description">
                  Enter your Render API key to connect your account. You can generate an API key from your Render Dashboard.
                </p>
                <div className="api-key-instructions">
                  <p><strong>How to get your API key:</strong></p>
                  <ol>
                    <li>Go to <a href="https://dashboard.render.com/u/settings?add-api-key" target="_blank" rel="noopener noreferrer">Render Dashboard Settings</a></li>
                    <li>Click "Create API Key"</li>
                    <li>Copy the key immediately (it won't be shown again)</li>
                    <li>Paste it below</li>
                  </ol>
                </div>
                <div className="api-key-input-wrapper">
                  <input
                    type={showRenderApiKey ? 'text' : 'password'}
                    className="api-key-input"
                    placeholder="rnd_xxxxxxxxxxxxxxxxxxxx"
                    value={renderApiKey}
                    onChange={(e) => setRenderApiKey(e.target.value)}
                    disabled={validatingRender}
                  />
                  <button
                    className="toggle-visibility"
                    onClick={() => setShowRenderApiKey(!showRenderApiKey)}
                    type="button"
                  >
                    {showRenderApiKey ? '🙈' : '👁️'}
                  </button>
                </div>
                <p className="security-warning">
                  ⚠️ Keep your API key secure. It provides full access to your Render account.
                </p>
                {error && (
                  <div className="modal-error">
                    {error}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="modal-cancel"
                  onClick={() => {
                    setShowRenderModal(false);
                    setRenderApiKey('');
                    setShowRenderApiKey(false);
                    setError('');
                  }}
                  disabled={validatingRender}
                >
                  Cancel
                </button>
                <button
                  className="modal-submit"
                  onClick={connectRender}
                  disabled={validatingRender || !renderApiKey.trim()}
                >
                  {validatingRender ? 'Validating...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* App Store Connect Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'appstore_connect') && (
          <div className="connection-card appstore-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>App Store Connect</h3>
                  <p className="service-description">Connect your Apple Developer account to manage TestFlight, app submissions, reviews, and analytics</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={() => setShowAppStoreModal(true)}
              disabled={updating === 'appstore_connect'}
            >
              {updating === 'appstore_connect' ? 'Connecting...' : 'Connect App Store Connect'}
            </button>
          </div>
        )}

        {/* App Store Connect Modal */}
        {showAppStoreModal && (
          <div className="modal-overlay" onClick={() => setShowAppStoreModal(false)}>
            <div className="modal-content appstore-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Connect App Store Connect</h3>
                <button
                  className="modal-close"
                  onClick={() => {
                    setShowAppStoreModal(false);
                    setAppStoreKeyId('');
                    setAppStoreIssuerId('');
                    setAppStorePrivateKey('');
                    setError('');
                  }}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="modal-description">
                  Enter your App Store Connect API credentials. These use JWT authentication (not OAuth).
                </p>
                <div className="api-key-instructions">
                  <p><strong>How to get your credentials:</strong></p>
                  <ol>
                    <li>Go to <a href="https://appstoreconnect.apple.com/access/integrations" target="_blank" rel="noopener noreferrer">App Store Connect → Users and Access → Integrations</a></li>
                    <li>Click "Team Keys" tab</li>
                    <li>Click "Generate API Key" (or + to add more)</li>
                    <li>Enter a key name and select access role (Admin, App Manager, etc.)</li>
                    <li>Copy the <strong>Key ID</strong> and <strong>Issuer ID</strong></li>
                    <li>Download the <strong>.p8 file</strong> (only shown once!)</li>
                    <li>Open the .p8 file in a text editor and copy its contents</li>
                  </ol>
                </div>

                <div className="form-group">
                  <label>Key ID (10 characters)</label>
                  <input
                    type="text"
                    className="api-key-input"
                    placeholder="2X9R4HXF34"
                    value={appStoreKeyId}
                    onChange={(e) => setAppStoreKeyId(e.target.value)}
                    disabled={validatingAppStore}
                    maxLength={10}
                  />
                </div>

                <div className="form-group">
                  <label>Issuer ID (UUID format)</label>
                  <input
                    type="text"
                    className="api-key-input"
                    placeholder="57246542-96fe-1a63-e053-0824d011072a"
                    value={appStoreIssuerId}
                    onChange={(e) => setAppStoreIssuerId(e.target.value)}
                    disabled={validatingAppStore}
                  />
                </div>

                <div className="form-group">
                  <label>Private Key (contents of .p8 file)</label>
                  <textarea
                    className="api-key-input private-key-textarea"
                    placeholder="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwd...
-----END PRIVATE KEY-----"
                    value={appStorePrivateKey}
                    onChange={(e) => setAppStorePrivateKey(e.target.value)}
                    disabled={validatingAppStore}
                    rows={8}
                  />
                </div>

                <p className="security-warning">
                  ⚠️ Keep your credentials secure. They provide access to your App Store Connect account.
                </p>
                {error && (
                  <div className="modal-error">
                    {error}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="modal-cancel"
                  onClick={() => {
                    setShowAppStoreModal(false);
                    setAppStoreKeyId('');
                    setAppStoreIssuerId('');
                    setAppStorePrivateKey('');
                    setError('');
                  }}
                  disabled={validatingAppStore}
                >
                  Cancel
                </button>
                <button
                  className="modal-submit"
                  onClick={connectAppStore}
                  disabled={validatingAppStore || !appStoreKeyId.trim() || !appStoreIssuerId.trim() || !appStorePrivateKey.trim()}
                >
                  {validatingAppStore ? 'Validating...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && connections.length === 0 && !connections.find(c => c.service_name === 'github') && !connections.find(c => c.service_name === 'gmail') && !connections.find(c => c.service_name === 'instagram') && !connections.find(c => c.service_name === 'meta-ads') && !connections.find(c => c.service_name === 'sentry') && !connections.find(c => c.service_name === 'render') && !connections.find(c => c.service_name === 'appstore_connect') && (
          <div className="empty-state">
            <p>No other service connections found.</p>
          </div>
        )}

        {!loading && !error && connections.length > 0 && (
          <div className="connections-grid">
            {connections.map((connection) => (
              <div key={connection.id} className="connection-card">
                <div className="connection-header">
                  <div className="service-info">
                    <div>
                      <h3>{connection.service_name}</h3>
                      <span className={`connection-status ${connection.status}`}>
                        {connection.status}
                      </span>
                    </div>
                  </div>

                  {connection.service_name === 'github' || connection.service_name === 'gmail' || connection.service_name === 'slack' || connection.service_name === 'instagram' || connection.service_name === 'meta-ads' || connection.service_name === 'sentry' || connection.service_name === 'render' || connection.service_name === 'appstore_connect' ? (
                    <button
                      className="disconnect-button"
                      onClick={() => {
                        if (connection.service_name === 'github') disconnectGitHub(connection.id);
                        else if (connection.service_name === 'gmail') disconnectGmail(connection.id);
                        else if (connection.service_name === 'slack') disconnectSlack(connection.id);
                        else if (connection.service_name === 'instagram') disconnectInstagram(connection.id);
                        else if (connection.service_name === 'meta-ads') disconnectMetaAds(connection.id);
                        else if (connection.service_name === 'sentry') disconnectSentry(connection.id);
                        else if (connection.service_name === 'render') disconnectRender(connection.id);
                        else if (connection.service_name === 'appstore_connect') disconnectAppStore(connection.id);
                      }}
                      disabled={updating === connection.id}
                    >
                      {updating === connection.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  ) : (
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={connection.status === 'connected'}
                        onChange={() => toggleConnection(connection.id, connection.status)}
                        disabled={updating === connection.id}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  )}
                </div>

                {/* GitHub-specific metadata */}
                {connection.service_name === 'github' && connection.metadata && (
                  <div className="connection-metadata github-metadata">
                    {connection.metadata.avatar_url && (
                      <div className="github-avatar">
                        <img
                          src={connection.metadata.avatar_url}
                          alt={connection.metadata.username}
                        />
                      </div>
                    )}
                    <div className="metadata-details">
                      {connection.metadata.username && (
                        <div className="metadata-item">
                          <p className="metadata-label">Username:</p>
                          <p className="metadata-value">
                            <a
                              href={connection.metadata.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              @{connection.metadata.username}
                            </a>
                          </p>
                        </div>
                      )}
                      {connection.metadata.public_repos !== undefined && (
                        <div className="metadata-item">
                          <p className="metadata-label">Public Repositories:</p>
                          <p className="metadata-value">{connection.metadata.public_repos}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Primary Repository:</p>
                        <p className="metadata-value">
                          {primaryRepo ? (
                            <span>
                              {primaryRepo.full_name}
                              <button
                                className="change-repo-button"
                                onClick={fetchGitHubRepos}
                                disabled={loadingRepos}
                              >
                                {loadingRepos ? 'Loading...' : 'Change'}
                              </button>
                            </span>
                          ) : (
                            <button
                              className="set-repo-button"
                              onClick={fetchGitHubRepos}
                              disabled={loadingRepos}
                            >
                              {loadingRepos ? 'Loading...' : 'Set Primary Repo'}
                            </button>
                          )}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Repository Selector Modal */}
                {connection.service_name === 'github' && showRepoSelector && (
                  <div className="repo-selector-modal">
                    <div className="modal-header">
                      <h4>Select Primary Repository</h4>
                      <button
                        className="modal-close"
                        onClick={() => setShowRepoSelector(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="repo-list">
                      {availableRepos.length === 0 ? (
                        <p>No repositories found</p>
                      ) : (
                        availableRepos.map((repo) => (
                          <div
                            key={repo.id}
                            className="repo-item"
                            onClick={() => setPrimaryRepository(repo.owner, repo.name, repo.default_branch)}
                          >
                            <div className="repo-info">
                              <strong>{repo.full_name}</strong>
                              {repo.description && <p>{repo.description}</p>}
                              <small>{repo.language || 'No language'} • {repo.private ? 'Private' : 'Public'}</small>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Gmail-specific metadata */}
                {connection.service_name === 'gmail' && connection.metadata && (
                  <div className="connection-metadata gmail-metadata">
                    {connection.metadata.picture && (
                      <div className="gmail-avatar">
                        <img
                          src={connection.metadata.picture}
                          alt={connection.metadata.email}
                        />
                      </div>
                    )}
                    <div className="metadata-details">
                      {connection.metadata.email && (
                        <div className="metadata-item">
                          <p className="metadata-label">Email:</p>
                          <p className="metadata-value">{connection.metadata.email}</p>
                        </div>
                      )}
                      {connection.metadata.name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Name:</p>
                          <p className="metadata-value">{connection.metadata.name}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Slack-specific metadata */}
                {connection.service_name === 'slack' && connection.metadata && (
                  <div className="connection-metadata slack-metadata">
                    {connection.metadata.bot_avatar && (
                      <div className="slack-avatar">
                        <img
                          src={connection.metadata.bot_avatar}
                          alt={connection.metadata.workspace_name}
                        />
                      </div>
                    )}
                    <div className="metadata-details">
                      {connection.metadata.workspace_name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Workspace:</p>
                          <p className="metadata-value">{connection.metadata.workspace_name}</p>
                        </div>
                      )}
                      {connection.metadata.bot_name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Bot Name:</p>
                          <p className="metadata-value">{connection.metadata.bot_name}</p>
                        </div>
                      )}
                      {connection.metadata.workspace_id && (
                        <div className="metadata-item">
                          <p className="metadata-label">Workspace ID:</p>
                          <p className="metadata-value">{connection.metadata.workspace_id}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Channel Access:</p>
                        <p className="metadata-value">
                          {connection.metadata.has_user_token ? (
                            <span style={{ color: '#10b981' }}>
                              ✓ Full Access (All public channels)
                            </span>
                          ) : (
                            <span style={{ color: '#f59e0b' }}>
                              ⚠️ Limited (Bot must be invited to channels)
                              <br />
                              <small style={{ fontSize: '0.85em', opacity: 0.8 }}>
                                Reconnect to enable full access
                              </small>
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Instagram-specific metadata */}
                {connection.service_name === 'instagram' && connection.metadata && (
                  <div className="connection-metadata instagram-metadata">
                    <div className="metadata-details">
                      {connection.metadata.username && (
                        <div className="metadata-item">
                          <p className="metadata-label">Username:</p>
                          <p className="metadata-value">@{connection.metadata.username}</p>
                        </div>
                      )}
                      {connection.metadata.platform && (
                        <div className="metadata-item">
                          <p className="metadata-label">Platform:</p>
                          <p className="metadata-value">{connection.metadata.platform}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Meta Ads-specific metadata */}
                {connection.service_name === 'meta-ads' && connection.metadata && (
                  <div className="connection-metadata meta-ads-metadata">
                    <div className="metadata-details">
                      {connection.metadata.name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Name:</p>
                          <p className="metadata-value">{connection.metadata.name}</p>
                        </div>
                      )}
                      {connection.metadata.email && (
                        <div className="metadata-item">
                          <p className="metadata-label">Email:</p>
                          <p className="metadata-value">{connection.metadata.email}</p>
                        </div>
                      )}
                      {/* Primary Ad Account */}
                      {connection.metadata.ad_accounts && connection.metadata.ad_accounts.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Primary Ad Account:</p>
                          {primaryMetaAdsAdAccount ? (
                            <span>
                              {primaryMetaAdsAdAccount.name}
                              {primaryMetaAdsAdAccount.currency && ` (${primaryMetaAdsAdAccount.currency})`}
                              <button
                                className="change-repo-button"
                                onClick={fetchMetaAdsAdAccounts}
                                disabled={loadingMetaAdsAdAccounts}
                              >
                                {loadingMetaAdsAdAccounts ? 'Loading...' : 'Change'}
                              </button>
                              {primaryMetaAdsAdAccount.account_id && (
                                <small style={{ display: 'block', marginTop: '4px', opacity: 0.8 }}>
                                  Account ID: {primaryMetaAdsAdAccount.account_id}
                                </small>
                              )}
                            </span>
                          ) : (
                            <button
                              className="set-repo-button"
                              onClick={fetchMetaAdsAdAccounts}
                              disabled={loadingMetaAdsAdAccounts}
                            >
                              {loadingMetaAdsAdAccounts ? 'Loading...' : 'Select Ad Account'}
                            </button>
                          )}
                        </div>
                      )}
                      {connection.metadata.ad_accounts && connection.metadata.ad_accounts.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Total Ad Accounts:</p>
                          <p className="metadata-value">
                            {connection.metadata.ad_accounts.length} account{connection.metadata.ad_accounts.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      )}
                      {connection.metadata.businesses && connection.metadata.businesses.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Businesses:</p>
                          <p className="metadata-value">
                            {connection.metadata.businesses.length} business{connection.metadata.businesses.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                      )}
                      {connection.metadata.pages && connection.metadata.pages.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Pages:</p>
                          <p className="metadata-value">
                            {connection.metadata.pages.length} page{connection.metadata.pages.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      )}
                      {connection.metadata.token_expiry && (
                        <div className="metadata-item">
                          <p className="metadata-label">Token Expires:</p>
                          <p className="metadata-value">
                            {new Date(connection.metadata.token_expiry).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Meta Ads Ad Account Selector Modal */}
                {connection.service_name === 'meta-ads' && showMetaAdsAdAccountSelector && (
                  <div className="repo-selector-modal">
                    <div className="modal-header">
                      <h4>Select Primary Ad Account</h4>
                      <button
                        className="modal-close"
                        onClick={() => setShowMetaAdsAdAccountSelector(false)}
                      >×</button>
                    </div>
                    {loadingMetaAdsAdAccounts ? (
                      <div className="modal-loading">Loading ad accounts...</div>
                    ) : (
                      availableMetaAdsAdAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="repo-item"
                          onClick={() => setPrimaryMetaAdsAdAccountHandler(account.id, account.name, account.account_id, account.currency)}
                        >
                          <div className="repo-info">
                            <strong>{account.name || 'Unknown Account'}</strong>
                            <p>
                              {account.account_id && `Account ID: ${account.account_id}`}
                              {account.currency && ` • Currency: ${account.currency}`}
                              {account.account_status && ` • Status: ${account.account_status}`}
                            </p>
                            {account.timezone_name && (
                              <small>Timezone: {account.timezone_name}</small>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Render-specific metadata */}
                {connection.service_name === 'render' && connection.metadata && (
                  <div className="connection-metadata render-metadata">
                    <div className="metadata-details">
                      {connection.metadata.owner_name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Workspace:</p>
                          <p className="metadata-value">{connection.metadata.owner_name}</p>
                        </div>
                      )}
                      {connection.metadata.total_workspaces !== undefined && (
                        <div className="metadata-item">
                          <p className="metadata-label">Total Workspaces:</p>
                          <p className="metadata-value">{connection.metadata.total_workspaces}</p>
                        </div>
                      )}
                      {connection.metadata.owner_email && (
                        <div className="metadata-item">
                          <p className="metadata-label">Email:</p>
                          <p className="metadata-value">{connection.metadata.owner_email}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Primary Service:</p>
                        <p className="metadata-value">
                          {primaryRenderService ? (
                            <span>
                              {primaryRenderService.name} ({primaryRenderService.type})
                              <button
                                className="change-repo-button"
                                onClick={fetchRenderServices}
                                disabled={loadingRenderServices}
                              >
                                {loadingRenderServices ? 'Loading...' : 'Change'}
                              </button>
                            </span>
                          ) : (
                            <button
                              className="set-repo-button"
                              onClick={fetchRenderServices}
                              disabled={loadingRenderServices}
                            >
                              {loadingRenderServices ? 'Loading...' : 'Set Primary Service'}
                            </button>
                          )}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.metadata.connected_at || connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* App Store Connect-specific metadata */}
                {connection.service_name === 'appstore_connect' && connection.metadata && (
                  <div className="connection-metadata appstore-metadata">
                    <div className="metadata-details">
                      {connection.metadata.key_id && (
                        <div className="metadata-item">
                          <p className="metadata-label">Key ID:</p>
                          <p className="metadata-value">{connection.metadata.key_id}</p>
                        </div>
                      )}
                      {connection.metadata.issuer_id && (
                        <div className="metadata-item">
                          <p className="metadata-label">Issuer ID:</p>
                          <p className="metadata-value">{connection.metadata.issuer_id}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Primary App:</p>
                        <p className="metadata-value">
                          {connection.metadata.primary_app ? (
                            <span>
                              {connection.metadata.primary_app.name}
                              {connection.metadata.primary_app.bundle_id && ` (${connection.metadata.primary_app.bundle_id})`}
                              <button
                                className="change-repo-button"
                                onClick={fetchAppStoreApps}
                                disabled={loadingAppStoreApps}
                              >
                                {loadingAppStoreApps ? 'Loading...' : 'Change'}
                              </button>
                            </span>
                          ) : (
                            <button
                              className="set-repo-button"
                              onClick={fetchAppStoreApps}
                              disabled={loadingAppStoreApps}
                            >
                              {loadingAppStoreApps ? 'Loading...' : 'Set Primary App'}
                            </button>
                          )}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.metadata.connected_at || connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Render Service Selector Modal */}
                {connection.service_name === 'render' && showRenderServiceSelector && (
                  <div className="repo-selector-modal">
                    <div className="modal-header">
                      <h4>Select Primary Service</h4>
                      <button
                        className="modal-close"
                        onClick={() => setShowRenderServiceSelector(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="repo-list">
                      {availableRenderServices.length === 0 ? (
                        <p>No services found</p>
                      ) : (
                        availableRenderServices.map((service) => (
                          <div
                            key={service.id}
                            className="repo-item"
                            onClick={() => setPrimaryRenderServiceHandler(service.id, service.name, service.type)}
                          >
                            <div className="repo-info">
                              <strong>{service.name || 'Unknown Service'}</strong>
                              <p>
                                {service.type && `Type: ${service.type.toUpperCase()}`}
                                {service.region && ` • Region: ${service.region}`}
                                {service.env && ` • Env: ${service.env}`}
                              </p>
                              {service.url && <small>URL: {service.url}</small>}
                              {service.suspended && service.suspended !== 'NOT_SUSPENDED' && <small style={{color: 'red'}}> • {service.suspended}</small>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* App Store Connect App Selector Modal */}
                {connection.service_name === 'appstore_connect' && showAppStoreAppSelector && (
                  <div className="repo-selector-modal">
                    <div className="modal-header">
                      <h4>Select Primary App</h4>
                      <button
                        className="modal-close"
                        onClick={() => setShowAppStoreAppSelector(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="repo-list">
                      {availableAppStoreApps.length === 0 ? (
                        <p>No apps found</p>
                      ) : (
                        availableAppStoreApps.map((app) => (
                          <div
                            key={app.id}
                            className="repo-item"
                            onClick={() => setPrimaryAppStoreAppHandler(app.id, app.name, app.bundleId)}
                          >
                            <div className="repo-info">
                              <strong>{app.name || 'Unknown App'}</strong>
                              <p>
                                {app.bundleId && `Bundle ID: ${app.bundleId}`}
                                {app.sku && ` • SKU: ${app.sku}`}
                              </p>
                              {app.primaryLocale && <small>Locale: {app.primaryLocale}</small>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Standard metadata for other services */}
                {connection.service_name !== 'github' && connection.service_name !== 'gmail' && connection.service_name !== 'instagram' && connection.service_name !== 'meta-ads' && connection.service_name !== 'render' && connection.service_name !== 'appstore_connect' && connection.metadata && (
                  <div className="connection-metadata">
                    <p className="metadata-label">Connected since:</p>
                    <p className="metadata-value">
                      {new Date(connection.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Connections;
