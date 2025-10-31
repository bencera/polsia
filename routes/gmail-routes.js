/**
 * Gmail Agent Routes
 * API endpoints for modules to interact with Gmail
 */

const express = require('express');
const GmailProvider = require('../services/gmail-provider');

const router = express.Router();

/**
 * POST /api/agent/gmail/read
 * Read emails from Gmail
 */
router.post('/read', async (req, res) => {
  try {
    const { query = '', maxResults = 10, labelIds = ['INBOX'] } = req.body;

    const gmailProvider = new GmailProvider(req.user.id);
    const emails = await gmailProvider.readEmails({
      query,
      maxResults,
      labelIds
    });

    res.json({
      success: true,
      emails,
      count: emails.length
    });

  } catch (error) {
    console.error('[Gmail Routes] Error reading emails:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to read emails'
    });
  }
});

/**
 * POST /api/agent/gmail/send
 * Send an email through Gmail
 */
router.post('/send', async (req, res) => {
  try {
    const { to, subject, body, cc, bcc } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'To, subject, and body are required'
      });
    }

    const gmailProvider = new GmailProvider(req.user.id);
    const result = await gmailProvider.sendEmail({
      to,
      subject,
      body,
      cc,
      bcc
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[Gmail Routes] Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email'
    });
  }
});

/**
 * POST /api/agent/gmail/search
 * Search emails with Gmail query syntax
 */
router.post('/search', async (req, res) => {
  try {
    const { query, maxResults = 20 } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const gmailProvider = new GmailProvider(req.user.id);
    const emails = await gmailProvider.searchEmails(query, maxResults);

    res.json({
      success: true,
      emails,
      count: emails.length,
      query
    });

  } catch (error) {
    console.error('[Gmail Routes] Error searching emails:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search emails'
    });
  }
});

/**
 * GET /api/agent/gmail/labels
 * List all Gmail labels
 */
router.get('/labels', async (req, res) => {
  try {
    const gmailProvider = new GmailProvider(req.user.id);
    const labels = await gmailProvider.listLabels();

    res.json({
      success: true,
      labels,
      count: labels.length
    });

  } catch (error) {
    console.error('[Gmail Routes] Error listing labels:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list labels'
    });
  }
});

/**
 * POST /api/agent/gmail/labels
 * Create a new Gmail label
 */
router.post('/labels', async (req, res) => {
  try {
    const { name, labelListVisibility, messageListVisibility } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Label name is required'
      });
    }

    const gmailProvider = new GmailProvider(req.user.id);
    const label = await gmailProvider.createLabel(name, {
      labelListVisibility,
      messageListVisibility
    });

    res.json({
      success: true,
      label
    });

  } catch (error) {
    console.error('[Gmail Routes] Error creating label:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create label'
    });
  }
});

/**
 * POST /api/agent/gmail/labels/add
 * Add a label to a message
 */
router.post('/labels/add', async (req, res) => {
  try {
    const { messageId, labelId } = req.body;

    if (!messageId || !labelId) {
      return res.status(400).json({
        success: false,
        error: 'Message ID and label ID are required'
      });
    }

    const gmailProvider = new GmailProvider(req.user.id);
    const result = await gmailProvider.addLabelToMessage(messageId, labelId);

    res.json({
      success: true,
      message: result
    });

  } catch (error) {
    console.error('[Gmail Routes] Error adding label:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add label'
    });
  }
});

/**
 * POST /api/agent/gmail/labels/remove
 * Remove a label from a message
 */
router.post('/labels/remove', async (req, res) => {
  try {
    const { messageId, labelId } = req.body;

    if (!messageId || !labelId) {
      return res.status(400).json({
        success: false,
        error: 'Message ID and label ID are required'
      });
    }

    const gmailProvider = new GmailProvider(req.user.id);
    const result = await gmailProvider.removeLabelFromMessage(messageId, labelId);

    res.json({
      success: true,
      message: result
    });

  } catch (error) {
    console.error('[Gmail Routes] Error removing label:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove label'
    });
  }
});

/**
 * GET /api/agent/gmail/test
 * Test Gmail connection
 */
router.get('/test', async (req, res) => {
  try {
    const gmailProvider = new GmailProvider(req.user.id);
    const isConnected = await gmailProvider.testConnection();

    res.json({
      success: true,
      connected: isConnected
    });

  } catch (error) {
    console.error('[Gmail Routes] Error testing connection:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test connection',
      connected: false
    });
  }
});

module.exports = router;
