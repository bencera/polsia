/**
 * Operations Routes
 * API endpoints for managing user and company operations balances
 */

const express = require('express');
const router = express.Router();
const {
    getUserOperationsBalance,
    deductUserOperations,
    transferToCompany,
    contributeToUser
} = require('../db');
const { OPERATIONS_CONFIG } = require('../config/operations-config');

/**
 * GET /api/operations
 * Get user's operations balance (both company and user)
 */
router.get('/', async (req, res) => {
    try {
        const balance = await getUserOperationsBalance(req.user.id);

        if (!balance) {
            return res.json({
                success: true,
                company_operations: 0,
                user_operations: 0,
                total_donated_usd: 0,
                total_spent_usd: 0
            });
        }

        res.json({
            success: true,
            company_operations: balance.company_operations,
            user_operations: balance.user_operations,
            total_donated_usd: parseFloat(balance.total_donated_usd || 0),
            total_spent_usd: parseFloat(balance.total_spent_usd || 0),
            last_updated_at: balance.last_updated_at
        });
    } catch (error) {
        console.error('Error getting operations balance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get operations balance'
        });
    }
});

/**
 * POST /api/operations/transfer
 * Transfer user operations to company operations (one-way)
 * Body: { amount: number }
 */
router.post('/transfer', async (req, res) => {
    try {
        const { amount } = req.body;

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount. Must be a positive number.'
            });
        }

        // Transfer operations
        const updatedBalance = await transferToCompany(req.user.id, amount);

        res.json({
            success: true,
            message: `Transferred ${amount} operations to company balance`,
            company_operations: updatedBalance.company_operations,
            user_operations: updatedBalance.user_operations
        });
    } catch (error) {
        console.error('Error transferring operations:', error);

        if (error.message === 'Insufficient user operations') {
            return res.status(400).json({
                success: false,
                message: 'Insufficient user operations for transfer'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to transfer operations'
        });
    }
});

/**
 * POST /api/operations/contribute
 * Contribute user operations to another user's company
 * Body: { recipientUserId: number, amount: number, message: string (optional), isAnonymous: boolean (optional) }
 */
router.post('/contribute', async (req, res) => {
    try {
        const { recipientUserId, amount, message, isAnonymous } = req.body;
        const donorUserId = req.user.id;

        // Validate input
        if (!recipientUserId || typeof recipientUserId !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'Invalid recipient user ID'
            });
        }

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount. Must be a positive number.'
            });
        }

        // Prevent self-contribution
        if (donorUserId === recipientUserId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot contribute to your own company. Use transfer instead.'
            });
        }

        // Contribute operations
        const result = await contributeToUser(donorUserId, recipientUserId, amount, message, isAnonymous);

        res.json({
            success: true,
            message: `Contributed ${amount} operations to company`,
            donor_balance: result.donor_balance,
            recipient_balance: result.recipient_balance
        });
    } catch (error) {
        console.error('Error contributing operations:', error);

        if (error.message === 'Insufficient user operations') {
            return res.status(400).json({
                success: false,
                message: 'Insufficient user operations for contribution'
            });
        }

        if (error.message === 'Recipient user not found') {
            return res.status(404).json({
                success: false,
                message: 'Recipient user not found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to contribute operations'
        });
    }
});

/**
 * POST /api/operations/deduct-user
 * Deduct user operations for a manual action
 * Body: { cost: number, action_type: string }
 */
router.post('/deduct-user', async (req, res) => {
    try {
        const { cost, action_type } = req.body;

        // Validate cost
        if (!cost || typeof cost !== 'number' || cost <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid cost. Must be a positive number.'
            });
        }

        // Check if user has sufficient operations
        const balance = await getUserOperationsBalance(req.user.id);
        if (!balance || balance.user_operations < cost) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient user operations',
                required: cost,
                available: balance ? balance.user_operations : 0
            });
        }

        // Deduct operations
        const updatedBalance = await deductUserOperations(req.user.id, cost, action_type);

        res.json({
            success: true,
            message: `Deducted ${cost} operations for ${action_type}`,
            user_operations: updatedBalance.user_operations,
            company_operations: updatedBalance.company_operations
        });
    } catch (error) {
        console.error('Error deducting user operations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to deduct user operations'
        });
    }
});

/**
 * GET /api/operations/costs
 * Get manual action costs configuration
 */
router.get('/costs', (req, res) => {
    res.json({
        success: true,
        costs: OPERATIONS_CONFIG.MANUAL_ACTION_COSTS
    });
});

/**
 * GET /api/operations/packages
 * Get available operations packages for purchase
 */
router.get('/packages', (req, res) => {
    res.json({
        success: true,
        packages: OPERATIONS_CONFIG.PACKAGES
    });
});

module.exports = router;
