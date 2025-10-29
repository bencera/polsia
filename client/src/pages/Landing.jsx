import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

const STATUS_MESSAGES = [
  '> Welcome to Polsia',
  '> Deploying marketing campaign...',
  '> Processing autonomous tasks...',
  '> Replying to customer emails...',
  '> Creating new UGC videos...',
  '> Making competitive research...',
  '> Fixing security holes...',
];

function Landing() {
  const [email, setEmail] = useState('');
  const [buttonText, setButtonText] = useState('Join Waitlist');
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [terminalText, setTerminalText] = useState(STATUS_MESSAGES[0]);
  const [terminalOpacity, setTerminalOpacity] = useState(1);

  // Rotate terminal messages
  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      setTerminalOpacity(0);
      setTimeout(() => {
        currentIndex = (currentIndex + 1) % STATUS_MESSAGES.length;
        setTerminalText(STATUS_MESSAGES[currentIndex]);
        setTerminalOpacity(1);
      }, 300);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (trimmedEmail && isValidEmail(trimmedEmail)) {
      setButtonText('PROCESSING...');
      setButtonDisabled(true);

      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: trimmedEmail }),
        });

        const data = await response.json();

        if (data.success) {
          setButtonText('ADDED TO QUEUE');
          setEmail('');

          setTimeout(() => {
            setButtonText('Join Waitlist');
            setButtonDisabled(false);
          }, 3000);
        } else {
          throw new Error(data.message || 'Failed to join waitlist');
        }
      } catch (error) {
        console.error('Error joining waitlist:', error);
        setButtonText('ERROR - TRY AGAIN');
        setTimeout(() => {
          setButtonText('Join Waitlist');
          setButtonDisabled(false);
        }, 3000);
      }
    } else {
      // Invalid email - flash border red
      const input = document.getElementById('email-input');
      if (input) {
        input.style.borderColor = '#ff0000';
        setTimeout(() => {
          input.style.borderColor = '';
        }, 1000);
      }
    }
  };

  return (
    <div className="landing-container">
      {/* Terminal Display */}
      <section className="terminal">
        <span style={{ opacity: terminalOpacity, transition: 'opacity 0.3s ease' }}>
          {terminalText}
        </span>
      </section>

      {/* Main Intro Section */}
      <section className="intro">
        <h1>Polsia</h1>
        <p className="tagline">The Autonomous System that Runs Your Company While You Sleep.</p>
        <p className="description">
          Polsia thinks, builds, and markets your projects autonomously.
          It plans, codes, and promotes your ideas continuously — operating 24/7,
          adapting to data, and improving itself without human intervention.
        </p>

        {/* CTA */}
        <form onSubmit={handleSubmit} className="cta">
          <input
            type="email"
            id="email-input"
            placeholder="your@email.com"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={buttonDisabled}
          />
          <button type="submit" className="btn-primary" disabled={buttonDisabled}>
            {buttonText}
          </button>
        </form>

        <p className="login-link">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>Polsia v1.0.0 | Autonomous Operations Division</p>
        <p className="footer-note">Warning: System operates independently. Human oversight recommended.</p>
        <p className="footer-contact">Contact: <a href="mailto:hello@polsia.ai">hello@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Landing;
