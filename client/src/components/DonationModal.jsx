import { useState } from 'react';
import './DonationModal.css';

function DonationModal({ isOpen, onClose, userId, projectId, projectName, isOwnAccount = false, token, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Predefined amount buttons (in ops)
  const quickAmounts = [100, 500, 1000, 2500, 5000, 10000];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate amount
      const opsAmount = parseInt(amount);
      if (isNaN(opsAmount) || opsAmount < 1) {
        setError('Please enter a valid amount (minimum 1 ops)');
        setLoading(false);
        return;
      }

      if (isOwnAccount) {
        // Transfer ops to own company
        const response = await fetch('/api/operations/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ amount: opsAmount })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to transfer operations');
        }

        // Success
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      } else {
        // Contribute ops to another user's company
        const response = await fetch('/api/operations/contribute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            recipientUserId: userId,
            amount: opsAmount,
            message: message || null,
            isAnonymous
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to contribute operations');
        }

        // Success
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      }
    } catch (err) {
      console.error('Operations transfer error:', err);
      setError(err.message || 'Failed to process transfer. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="donation-modal-overlay" onClick={onClose}>
      <div className="donation-modal" onClick={(e) => e.stopPropagation()}>
        <button className="donation-modal-close" onClick={onClose}>Close</button>

        <h2 className="donation-modal-title">
          {isOwnAccount ? 'Transfer Ops to Company' : `Donate Ops to ${projectName}`}
        </h2>
        <p className="donation-modal-subtitle">
          {isOwnAccount
            ? 'Move ops from your personal balance to your company for autonomous operations.'
            : 'These ops will be used exclusively for autonomous operations and actions.'}
        </p>

        <form onSubmit={handleSubmit} className="donation-form">
          <div className="donation-quick-amounts">
            {quickAmounts.map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                className={`quick-amount-btn ${amount === quickAmount.toString() ? 'active' : ''}`}
                onClick={() => setAmount(quickAmount.toString())}
              >
                {quickAmount} ops
              </button>
            ))}
          </div>

          <div className="donation-form-group">
            <label htmlFor="amount">Amount (ops)</label>
            <div className="donation-amount-input">
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter custom amount"
                min="1"
                step="1"
                required
              />
            </div>
          </div>

          {!isOwnAccount && (
            <>
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

              <div className="donation-checkbox">
                <input
                  type="checkbox"
                  id="isAnonymous"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                <label htmlFor="isAnonymous">Contribute anonymously</label>
              </div>

              <p className="donation-info-notice">
                Ops contributed to this company will only be used for autonomous actions.
              </p>
            </>
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
              {loading ? 'Processing...' : (isOwnAccount ? 'Transfer to Company' : 'Contribute Operations')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DonationModal;
