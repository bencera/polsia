import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

// Landing page copy variants for A/B testing
const COPY_VARIANTS = {
  cofounder: {
    tagline: 'Your AI Co-Founder Who Never Sleeps.',
    description: 'Polsia works alongside your team like a technical co-founder. It builds features, fixes bugs, ships products, and runs marketing campaigns while you focus on vision and strategy. Available 24/7, learning your business, and scaling with your ambitions.'
  },
  autonomous: {
    tagline: 'AI That Runs Your Company While You Sleep.',
    description: 'Polsia thinks, builds, and markets your projects autonomously. It plans, codes, and promotes your ideas continuously — operating 24/7, adapting to data, and improving itself without human intervention.'
  },
  invest: {
    tagline: 'Invest in a Portfolio of AI-Run Companies.',
    description: 'Polsia lets you build a portfolio of fully autonomous companies that run without human labor. From product development to customer acquisition to scaling — every function is AI-driven. Invest in ventures that compound 24/7 while you sleep.'
  }
};

function Landing() {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get('variant') || 'autonomous'; // Default to autonomous

  // Get copy for current variant, fallback to autonomous if invalid variant
  const copy = COPY_VARIANTS[variant] || COPY_VARIANTS.autonomous;

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
          body: JSON.stringify({
            email: trimmedEmail,
            variant: variant // Send variant to backend for tracking
          }),
        });

        const data = await response.json();

        if (data.success) {
          setButtonText('ADDED TO QUEUE');
          setEmail('');

          // Redirect to Typeform with pre-filled email and variant
          setTimeout(() => {
            window.location.href = `https://form.typeform.com/to/W4lyrtBc#email=${encodeURIComponent(trimmedEmail)}&variant=${variant}`;
          }, 800);
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
        <p className="tagline">{copy.tagline}</p>
        <p className="description">
          {copy.description}
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
        <p className="footer-note">Warning: System operates independently. Human oversight recommended.</p>
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Landing;
