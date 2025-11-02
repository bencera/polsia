/**
 * Document Routes
 * RESTful API endpoints for managing user document store (vision, goals, analytics, memory)
 */

const express = require('express');
const router = express.Router();
const {
  initializeDocumentStore,
  getDocumentStore,
  updateDocument,
  appendToMemory,
  getUnifiedContext,
} = require('../services/document-store');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/documents
 * Get all documents for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    let documentStore = await getDocumentStore(req.user.id);

    // If no document store exists, initialize one
    if (!documentStore) {
      documentStore = await initializeDocumentStore(req.user.id);
    }

    res.json({ success: true, documents: documentStore });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({ success: false, message: 'Failed to get documents' });
  }
});

/**
 * GET /api/documents/context
 * Get unified context bundle (documents + runtime data) for Brain
 */
router.get('/context', async (req, res) => {
  try {
    const context = await getUnifiedContext(req.user.id);
    res.json({ success: true, context });
  } catch (error) {
    console.error('Error getting unified context:', error);
    res.status(500).json({ success: false, message: 'Failed to get unified context' });
  }
});

/**
 * GET /api/documents/:type
 * Get a specific document by type
 * Valid types: vision, goals, analytics, memory
 */
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['vision', 'goals', 'analytics', 'memory'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid document type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    let documentStore = await getDocumentStore(req.user.id);

    // If no document store exists, initialize one
    if (!documentStore) {
      documentStore = await initializeDocumentStore(req.user.id);
    }

    // Map friendly names to database column names
    const fieldMap = {
      vision: 'vision_md',
      goals: 'goals_md',
      analytics: 'analytics_md',
      memory: 'memory_md',
    };

    const fieldName = fieldMap[type];
    const content = documentStore[fieldName];
    const analyticsJson = type === 'analytics' ? documentStore.analytics_json : undefined;

    res.json({
      success: true,
      type,
      content,
      ...(analyticsJson && { analytics_json: analyticsJson }),
      updated_at: documentStore.updated_at,
    });
  } catch (error) {
    console.error(`Error getting document ${req.params.type}:`, error);
    res.status(500).json({ success: false, message: 'Failed to get document' });
  }
});

/**
 * PUT /api/documents/:type
 * Update a specific document
 * Valid types: vision, goals (analytics and memory are auto-managed)
 */
router.put('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { content } = req.body;

    // Only allow users to update vision and goals manually
    const editableTypes = ['vision', 'goals'];

    if (!editableTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Cannot manually update ${type}. Only vision and goals can be edited directly.`,
      });
    }

    if (!content && content !== '') {
      return res.status(400).json({
        success: false,
        message: 'Content is required',
      });
    }

    // Map friendly names to database column names
    const fieldMap = {
      vision: 'vision_md',
      goals: 'goals_md',
    };

    const fieldName = fieldMap[type];
    const updatedStore = await updateDocument(req.user.id, fieldName, content);

    res.json({
      success: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully`,
      document: {
        type,
        content: updatedStore[fieldName],
        updated_at: updatedStore.updated_at,
      },
    });
  } catch (error) {
    console.error(`Error updating document ${req.params.type}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update document' });
  }
});

/**
 * POST /api/documents/memory/append
 * Append an entry to the memory log
 * Body: { entry: "text to append" }
 */
router.post('/memory/append', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry) {
      return res.status(400).json({
        success: false,
        message: 'Entry is required',
      });
    }

    const updatedStore = await appendToMemory(req.user.id, entry);

    res.json({
      success: true,
      message: 'Memory entry added successfully',
      memory: updatedStore.memory_md,
      updated_at: updatedStore.updated_at,
    });
  } catch (error) {
    console.error('Error appending to memory:', error);
    res.status(500).json({ success: false, message: 'Failed to append to memory' });
  }
});

/**
 * POST /api/documents/initialize
 * Manually initialize document store for a user (usually done automatically on signup)
 */
router.post('/initialize', async (req, res) => {
  try {
    const documentStore = await initializeDocumentStore(req.user.id);

    res.json({
      success: true,
      message: 'Document store initialized successfully',
      documents: documentStore,
    });
  } catch (error) {
    console.error('Error initializing document store:', error);
    res.status(500).json({ success: false, message: 'Failed to initialize document store' });
  }
});

module.exports = router;
