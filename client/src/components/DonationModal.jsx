import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import './DonationModal.css';

// Load Stripe publishable key based on environment
const isProduction = import.meta.env.MODE === 'production';
const stripePublishableKey = isProduction
  ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_LIVE
  : (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_LIVE);

const stripePromise = loadStripe(stripePublishableKey);

console.log(`[Donation Modal] Using Stripe in ${isProduction ? 'LIVE' : 'TEST'} mode`);

function DonationModal({ isOpen, onClose, userId, projectId, projectName, isOwnAccount = false }) {
  const [amount, setAmount] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Predefined amount buttons
  const quickAmounts = [10, 25, 50, 100, 250, 500];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate amount
      const donationAmount = parseFloat(amount);
      if (isNaN(donationAmount) || donationAmount < 1) {
        setError('Please enter a valid amount (minimum $1)');
        setLoading(false);
        return;
      }

      // Validate donor name if not anonymous
      if (!isAnonymous && (!donorName || donorName.trim() === '')) {
        setError('Please enter your name or check "Donate anonymously"');
        setLoading(false);
        return;
      }

      // Create checkout session
      const response = await fetch('/api/donations/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          projectId,
          amount: donationAmount,
          donorEmail,
          donorName: isAnonymous ? 'Anonymous' : donorName,
          message,
          isAnonymous,
          projectName,
          isOwnAccount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout using the session URL
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (err) {
      console.error('Donation error:', err);
      setError(err.message || 'Failed to process donation. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="donation-modal-overlay" onClick={onClose}>
      <div className="donation-modal" onClick={(e) => e.stopPropagation()}>
        <button className="donation-modal-close" onClick={onClose}>Close</button>

        <h2 className="donation-modal-title">{isOwnAccount ? 'Add Funds' : 'Donate Funds'}</h2>
        {projectName && (
          <p className="donation-modal-subtitle">Supporting: {projectName}</p>
        )}

        <form onSubmit={handleSubmit} className="donation-form">
          <div className="donation-quick-amounts">
            {quickAmounts.map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                className={`quick-amount-btn ${amount === quickAmount.toString() ? 'active' : ''}`}
                onClick={() => setAmount(quickAmount.toString())}
              >
                ${quickAmount}
              </button>
            ))}
          </div>

          <div className="donation-form-group">
            <label htmlFor="amount">Amount (USD)</label>
            <div className="donation-amount-input">
              <span className="donation-currency">$</span>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter custom amount"
                min="1"
                step="0.01"
                required
              />
            </div>
          </div>

          <div className="donation-form-group">
            <label htmlFor="donorName">Your Name</label>
            <input
              type="text"
              id="donorName"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              placeholder="John Doe"
              disabled={isAnonymous}
              required={!isAnonymous}
            />
          </div>

          <div className="donation-form-group">
            <label htmlFor="donorEmail">Email</label>
            <input
              type="email"
              id="donorEmail"
              value={donorEmail}
              onChange={(e) => setDonorEmail(e.target.value)}
              placeholder="john@example.com"
              required
            />
          </div>

          {!isOwnAccount && (
            <div className="donation-form-group">
              <label htmlFor="message">Message (Optional)</label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Leave a message of support..."
                rows="3"
              />
            </div>
          )}

          {!isOwnAccount && (
            <div className="donation-checkbox">
              <input
                type="checkbox"
                id="isAnonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              <label htmlFor="isAnonymous">Donate anonymously</label>
            </div>
          )}

          {error && (
            <div className="donation-error">
              {error}
            </div>
          )}

          <div className="donation-actions">
            <button
              type="submit"
              className="donation-btn donation-btn-submit"
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Continue to Payment'}
            </button>
          </div>
        </form>

        <p className="donation-secure-notice">
          Secure payment powered by Stripe
        </p>
      </div>
    </div>
  );
}

export default DonationModal;
