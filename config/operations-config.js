/**
 * Operations Currency Configuration
 *
 * Defines the two-tier currency system:
 * - External: Operations (user-facing virtual currency)
 * - Internal: USD (accounting and cost tracking)
 */

const OPERATIONS_CONFIG = {
  /**
   * Internal conversion rate (FIXED - do not change without migration)
   * This is how Polsia internally values each operation for cost accounting
   */
  USD_PER_OPERATION: 0.01, // 1 operation = $0.01 real cost

  /**
   * Base purchase rate (user-facing)
   * How many operations a user gets per dollar without bonuses
   */
  BASE_OPS_PER_USD: 100, // $1 buys 100 operations

  /**
   * Package pricing with volume bonuses
   * Users get more ops per dollar with larger purchases
   * Note: Bonuses are pricing levers, internal cost remains fixed
   */
  PACKAGES: [
    {
      usd: 1,
      base_ops: 100,
      bonus_ops: 0,
      total_ops: 100,
      label: '$1 - 100 ops'
    },
    {
      usd: 5,
      base_ops: 500,
      bonus_ops: 50,
      total_ops: 550,
      label: '$5 - 550 ops (+10% bonus)'
    },
    {
      usd: 10,
      base_ops: 1000,
      bonus_ops: 200,
      total_ops: 1200,
      label: '$10 - 1,200 ops (+20% bonus)'
    },
    {
      usd: 25,
      base_ops: 2500,
      bonus_ops: 750,
      total_ops: 3250,
      label: '$25 - 3,250 ops (+30% bonus)'
    },
    {
      usd: 50,
      base_ops: 5000,
      bonus_ops: 1500,
      total_ops: 6500,
      label: '$50 - 6,500 ops (+30% bonus)'
    },
    {
      usd: 100,
      base_ops: 10000,
      bonus_ops: 4000,
      total_ops: 14000,
      label: '$100 - 14,000 ops (+40% bonus)'
    }
  ],

  /**
   * Manual action costs (in operations)
   * These are predefined costs for user-triggered actions
   */
  MANUAL_ACTION_COSTS: {
    FORCE_CEO_DECISION: 500,      // Force CEO to make decision now
    REFRESH_METRICS: 200,          // Refresh business metrics
    PRIORITY_ENGINEERING: 1000,    // Urgent engineering task
    PRIORITY_MARKETING: 800,       // Urgent marketing task
    PRIORITY_DATA: 600,            // Urgent data analysis
    CUSTOM_QUERY: 300              // Generic AI query/task
  }
};

/**
 * Helper function to convert USD cost to operations
 * @param {number} usdCost - Cost in USD
 * @returns {number} - Cost in operations (rounded up)
 */
function usdToOperations(usdCost) {
  return Math.ceil(usdCost / OPERATIONS_CONFIG.USD_PER_OPERATION);
}

/**
 * Helper function to convert operations to USD
 * @param {number} operations - Number of operations
 * @returns {number} - Value in USD
 */
function operationsToUsd(operations) {
  return operations * OPERATIONS_CONFIG.USD_PER_OPERATION;
}

/**
 * Get package details by USD amount
 * @param {number} usdAmount - USD amount
 * @returns {object|null} - Package object or null if not found
 */
function getPackageByUsd(usdAmount) {
  return OPERATIONS_CONFIG.PACKAGES.find(pkg => pkg.usd === usdAmount) || null;
}

/**
 * Calculate operations for custom USD amount
 * Uses base rate without bonuses
 * @param {number} usdAmount - USD amount
 * @returns {number} - Number of operations
 */
function calculateOperationsForUsd(usdAmount) {
  return Math.floor(usdAmount * OPERATIONS_CONFIG.BASE_OPS_PER_USD);
}

module.exports = {
  OPERATIONS_CONFIG,
  usdToOperations,
  operationsToUsd,
  getPackageByUsd,
  calculateOperationsForUsd
};
