import { useState } from 'react';
import './DonationModal.css';

// Ops pricing with bulk discounts
function getOpsPrice(ops) {
  // Fixed pack prices (only for exact amounts)
  if (ops === 10000) return 70;
  if (ops === 5000) return 40;
  if (ops === 2500) return 20;
  if (ops === 1000) return 10;
  // Default: 100 ops = $1
  return ops / 100;
}

// Format price without trailing zeros
function formatPrice(price) {
  return price % 1 === 0 ? price.toString() : price.toFixed(2);
}

function DonationModal({ isOpen, onClose, userId, projectId, projectName, isOwnAccount = false, token, onSuccess, userBalance }) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Predefined amount buttons (in ops)
  const quickAmounts = [100, 500, 1000, 2500, 5000, 10000];

  // Check if user has enough ops
  const opsAmount = parseInt(amount) || 0;
  const availableOps = userBalance?.user_operations || 0;
  const needsToBuy = opsAmount > availableOps;
  const opsNeeded = needsToBuy ? opsAmount - availableOps : 0;
  const usdCost = formatPrice(getOpsPrice(opsNeeded));

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

      // If user needs to buy ops, redirect to Stripe
      if (needsToBuy) {
        const response = await fetch('/api/operations/purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            opsToPurchase: opsNeeded, // Amount to buy
            totalOpsAmount: opsAmount, // Total amount to donate after purchase
            recipientUserId: isOwnAccount ? null : userId,
            message: isOwnAccount ? null : (message || null),
            isAnonymous: isOwnAccount ? false : isAnonymous,
            returnPath: window.location.pathname // Current page to return to after payment
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to create checkout session');
        }

        // Redirect to Stripe
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          throw new Error('No checkout URL received');
        }
        return;
      }

      // Otherwise, contribute directly from user's ops balance
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

        // Success - wait for refresh before closing
        if (onSuccess) {
          await onSuccess();
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

        // Success - wait for refresh before closing
        if (onSuccess) {
          await onSuccess();
        }
        onClose();
      }
    } catch (err) {
      console.error('Operations transfer error:', err);

      // Check if error is about insufficient operations
      if (err.message && err.message.toLowerCase().includes('insufficient')) {
        // Calculate how many ops are needed
        const currentBalance = userBalance?.user_operations || 0;
        const opsNeeded = opsAmount - currentBalance;

        // Redirect to purchase flow
        try {
          const response = await fetch('/api/operations/purchase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              opsToPurchase: opsNeeded > 0 ? opsNeeded : opsAmount,
              totalOpsAmount: opsAmount,
              recipientUserId: isOwnAccount ? null : userId,
              message: isOwnAccount ? null : (message || null),
              isAnonymous: isOwnAccount ? false : isAnonymous,
              returnPath: window.location.pathname
            })
          });

          const data = await response.json();

          if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
            return;
          }
        } catch (purchaseErr) {
          console.error('Failed to create purchase session:', purchaseErr);
        }
      }

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
          {isOwnAccount ? 'Add Ops' : `Donate Ops to ${projectName}`}
        </h2>

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
              disabled={loading || !opsAmount}
            >
              {loading ? 'Processing...' : (
                needsToBuy
                  ? `Buy ${opsNeeded} ops for $${usdCost}`
                  : (isOwnAccount ? 'Transfer to Company' : `Donate ${opsAmount} ops`)
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DonationModal;
