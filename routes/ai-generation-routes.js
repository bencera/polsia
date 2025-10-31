/**
 * AI Generation Routes
 * RESTful API endpoints for AI content generation (images, videos)
 */

const express = require('express');
const router = express.Router();
const aiGenerationService = require('../services/ai-generation-service');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/ai/models
 * List available AI generation models
 */
router.get('/models', (req, res) => {
    try {
        const models = aiGenerationService.getAvailableModels();
        res.json({
            success: true,
            models,
            fal_configured: aiGenerationService.isFalConfigured()
        });
    } catch (error) {
        console.error('Error getting available models:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get available models'
        });
    }
});

/**
 * POST /api/ai/generate/image
 * Generate an image from text
 */
router.post('/generate/image', async (req, res) => {
    try {
        const { prompt, options = {} } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                message: 'Prompt is required'
            });
        }

        if (!aiGenerationService.isFalConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Fal.ai is not configured. Please set FAL_API_KEY environment variable.'
            });
        }

        console.log(`[AI Generation Routes] Generating image for user ${req.user.id}`);

        const result = await aiGenerationService.createImageGeneration(
            req.user.id,
            prompt,
            options
        );

        if (result.success) {
            res.json({
                success: true,
                generation: result.generation,
                image_url: result.image_url,
                message: 'Image generated successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Image generation failed',
                error: result.error,
                generation_id: result.generation_id
            });
        }
    } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate image',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/generate/video
 * Generate a video (text-to-video or image-to-video)
 */
router.post('/generate/video', async (req, res) => {
    try {
        const { source_type, source, prompt = '', options = {} } = req.body;

        // Validate inputs
        if (!source_type || (source_type !== 'text' && source_type !== 'image')) {
            return res.status(400).json({
                success: false,
                message: 'source_type must be "text" or "image"'
            });
        }

        if (!source) {
            return res.status(400).json({
                success: false,
                message: 'source is required (text prompt or image URL)'
            });
        }

        if (!aiGenerationService.isFalConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Fal.ai is not configured. Please set FAL_API_KEY environment variable.'
            });
        }

        console.log(`[AI Generation Routes] Generating ${source_type}-to-video for user ${req.user.id}`);

        const result = await aiGenerationService.createVideoGeneration(
            req.user.id,
            source_type,
            source,
            prompt,
            options
        );

        if (result.success) {
            res.json({
                success: true,
                generation: result.generation,
                video_url: result.video_url,
                message: 'Video generated successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Video generation failed',
                error: result.error,
                generation_id: result.generation_id
            });
        }
    } catch (error) {
        console.error('Error generating video:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate video',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/generate/content
 * Generate complete social media content with AI media
 */
router.post('/generate/content', async (req, res) => {
    try {
        const { account_id, text, media_type, generation_prompt, generation_options, scheduled_for, post_now } = req.body;

        // Validate inputs
        if (!account_id) {
            return res.status(400).json({
                success: false,
                message: 'account_id is required'
            });
        }

        if (!generation_prompt) {
            return res.status(400).json({
                success: false,
                message: 'generation_prompt is required'
            });
        }

        if (media_type && media_type !== 'image' && media_type !== 'video') {
            return res.status(400).json({
                success: false,
                message: 'media_type must be "image" or "video"'
            });
        }

        if (!aiGenerationService.isFalConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Fal.ai is not configured. Please set FAL_API_KEY environment variable.'
            });
        }

        console.log(`[AI Generation Routes] Creating content with AI media for user ${req.user.id}`);

        const result = await aiGenerationService.createContentWithAIMedia(
            req.user.id,
            account_id,
            {
                text,
                media_type,
                generation_prompt,
                generation_options,
                scheduled_for,
                post_now
            }
        );

        res.json({
            success: true,
            content: result.content,
            media: result.media,
            generation: result.generation,
            message: 'Content created with AI media successfully'
        });
    } catch (error) {
        console.error('Error creating content with AI media:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create content with AI media',
            error: error.message
        });
    }
});

/**
 * GET /api/ai/generations
 * List AI generations for the authenticated user
 */
router.get('/generations', async (req, res) => {
    try {
        const {
            generation_type,
            status,
            module_id,
            content_id,
            limit
        } = req.query;

        const filters = {};
        if (generation_type) filters.generation_type = generation_type;
        if (status) filters.status = status;
        if (module_id) filters.module_id = parseInt(module_id);
        if (content_id) filters.content_id = parseInt(content_id);

        const generations = await aiGenerationService.getGenerations(
            req.user.id,
            filters,
            limit ? parseInt(limit) : 50
        );

        res.json({
            success: true,
            generations,
            count: generations.length
        });
    } catch (error) {
        console.error('Error getting generations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get generations',
            error: error.message
        });
    }
});

/**
 * GET /api/ai/generations/:id
 * Get a specific AI generation
 */
router.get('/generations/:id', async (req, res) => {
    try {
        const generationId = parseInt(req.params.id);

        if (isNaN(generationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid generation ID'
            });
        }

        const generation = await aiGenerationService.getGeneration(generationId, req.user.id);

        if (!generation) {
            return res.status(404).json({
                success: false,
                message: 'Generation not found'
            });
        }

        res.json({
            success: true,
            generation
        });
    } catch (error) {
        console.error('Error getting generation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get generation',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/generations/:id/retry
 * Retry a failed AI generation
 */
router.post('/generations/:id/retry', async (req, res) => {
    try {
        const generationId = parseInt(req.params.id);

        if (isNaN(generationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid generation ID'
            });
        }

        if (!aiGenerationService.isFalConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Fal.ai is not configured. Please set FAL_API_KEY environment variable.'
            });
        }

        console.log(`[AI Generation Routes] Retrying generation ${generationId} for user ${req.user.id}`);

        const result = await aiGenerationService.retryGeneration(generationId, req.user.id);

        if (result.success) {
            res.json({
                success: true,
                generation: result.generation,
                message: 'Generation retried successfully',
                image_url: result.image_url,
                video_url: result.video_url
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Generation retry failed',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error retrying generation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retry generation',
            error: error.message
        });
    }
});

/**
 * GET /api/ai/stats
 * Get AI generation usage statistics for the user
 */
router.get('/stats', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const options = {};
        if (start_date) options.startDate = new Date(start_date);
        if (end_date) options.endDate = new Date(end_date);

        const stats = await aiGenerationService.getStats(req.user.id, options);

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error getting AI generation stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get stats',
            error: error.message
        });
    }
});

module.exports = router;
