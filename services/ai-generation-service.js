/**
 * AI Generation Service
 * High-level orchestration for AI content generation
 * Manages fal.ai generation, database tracking, R2 backup, and content creation
 */

const falService = require('./fal-ai-service');
const { uploadMediaToR2, isR2Enabled } = require('./r2-media-service');
const {
    createAIGeneration,
    updateAIGeneration,
    getAIGenerationById,
    getAIGenerationsByUserId,
    linkMediaToGeneration,
    getAIGenerationStats,
    createContent,
    createMediaWithR2Data,
    createMedia
} = require('../db');

/**
 * Create an image generation
 * Generates image, saves to DB, and uploads to R2
 * @param {number} userId - User ID
 * @param {string} prompt - Generation prompt
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result with database record
 */
async function createImageGeneration(userId, prompt, options = {}) {
    const startTime = Date.now();
    const {
        model = 'flux-pro',
        module_id,
        content_id,
        ...falOptions
    } = options;

    // Create initial generation record
    const generation = await createAIGeneration(userId, {
        module_id,
        content_id,
        generation_type: 'image',
        model,
        prompt,
        input_params: { model, ...falOptions },
        status: 'generating'
    });

    try {
        console.log(`[AI Generation Service] Starting image generation ${generation.id} for user ${userId}`);

        // Generate image using fal.ai
        const falResult = await falService.generateImage(prompt, { model, ...falOptions });

        const imageUrl = falResult.data.images[0].url;
        const duration = Date.now() - startTime;

        // Estimate cost (approximate)
        const cost = model === 'flux-pro' ? 0.10 : 0.02;

        // Backup to R2 if enabled
        let r2Backup = null;
        if (isR2Enabled) {
            r2Backup = await falService.backupMediaToR2(
                imageUrl,
                'image',
                generation.id.toString(),
                { userId, module_id, content_id }
            );
        }

        // Update generation record with results
        const updatedGeneration = await updateAIGeneration(generation.id, {
            output_url: imageUrl,
            r2_url: r2Backup?.url || null,
            r2_key: r2Backup?.key || null,
            r2_bucket: r2Backup?.bucket || null,
            status: 'completed',
            cost_usd: cost,
            duration_ms: duration,
            metadata: {
                seed: falResult.data.seed,
                width: falOptions.width || 1024,
                height: falOptions.height || 1024,
                num_images: falResult.data.images.length
            },
            completed_at: new Date()
        });

        console.log(`[AI Generation Service] Image generation ${generation.id} completed in ${(duration / 1000).toFixed(2)}s`);

        return {
            success: true,
            generation: updatedGeneration,
            image_url: r2Backup?.url || imageUrl,
            fal_url: imageUrl
        };

    } catch (error) {
        console.error(`[AI Generation Service] Image generation ${generation.id} failed:`, error.message);

        // Update generation record with error
        await updateAIGeneration(generation.id, {
            status: 'failed',
            error_message: error.message,
            duration_ms: Date.now() - startTime,
            completed_at: new Date()
        });

        return {
            success: false,
            generation_id: generation.id,
            error: error.message
        };
    }
}

/**
 * Create a video generation (text-to-video or image-to-video)
 * @param {number} userId - User ID
 * @param {string} sourceType - 'text' or 'image'
 * @param {string} source - Text prompt or image URL
 * @param {string} prompt - Motion/generation prompt
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result with database record
 */
async function createVideoGeneration(userId, sourceType, source, prompt, options = {}) {
    const startTime = Date.now();
    const {
        model = sourceType === 'text' ? 'veo3-fast' : 'minimax-hailuo',
        module_id,
        content_id,
        ...falOptions
    } = options;

    const generationType = sourceType === 'text' ? 'text-to-video' : 'image-to-video';

    // Create initial generation record
    const generation = await createAIGeneration(userId, {
        module_id,
        content_id,
        generation_type: generationType,
        model,
        prompt: sourceType === 'text' ? source : prompt,
        input_params: { model, sourceType, source, prompt, ...falOptions },
        status: 'generating'
    });

    try {
        console.log(`[AI Generation Service] Starting ${generationType} generation ${generation.id} for user ${userId}`);

        // Generate video using fal.ai
        let falResult;
        if (sourceType === 'text') {
            falResult = await falService.generateVideoFromText(source, { model, ...falOptions });
        } else {
            falResult = await falService.generateVideo(source, prompt, { model, ...falOptions });
        }

        const videoUrl = falResult.data.video.url;
        const duration = Date.now() - startTime;

        // Estimate cost (varies by model and duration)
        const cost = estimateVideoCost(model, falOptions.duration || 5);

        // Backup to R2 if enabled
        let r2Backup = null;
        if (isR2Enabled) {
            r2Backup = await falService.backupMediaToR2(
                videoUrl,
                'video',
                generation.id.toString(),
                { userId, module_id, content_id }
            );
        }

        // Update generation record with results
        const updatedGeneration = await updateAIGeneration(generation.id, {
            output_url: videoUrl,
            r2_url: r2Backup?.url || null,
            r2_key: r2Backup?.key || null,
            r2_bucket: r2Backup?.bucket || null,
            status: 'completed',
            cost_usd: cost,
            duration_ms: duration,
            metadata: {
                video_duration: falResult.data.video.duration,
                aspect_ratio: falOptions.aspect_ratio || '16:9',
                model,
                source_type: sourceType
            },
            completed_at: new Date()
        });

        console.log(`[AI Generation Service] Video generation ${generation.id} completed in ${(duration / 1000).toFixed(2)}s`);

        return {
            success: true,
            generation: updatedGeneration,
            video_url: r2Backup?.url || videoUrl,
            fal_url: videoUrl
        };

    } catch (error) {
        console.error(`[AI Generation Service] Video generation ${generation.id} failed:`, error.message);

        // Update generation record with error
        await updateAIGeneration(generation.id, {
            status: 'failed',
            error_message: error.message,
            duration_ms: Date.now() - startTime,
            completed_at: new Date()
        });

        return {
            success: false,
            generation_id: generation.id,
            error: error.message
        };
    }
}

/**
 * Create social media content with AI-generated media
 * End-to-end: generate media → upload to R2 → create content → attach media
 * @param {number} userId - User ID
 * @param {number} accountId - Social account ID
 * @param {Object} config - Generation and content configuration
 * @returns {Promise<Object>} Created content with media
 */
async function createContentWithAIMedia(userId, accountId, config) {
    const {
        text,
        media_type = 'image', // 'image' or 'video'
        generation_prompt,
        generation_options = {},
        scheduled_for,
        post_now = false
    } = config;

    try {
        console.log(`[AI Generation Service] Creating content with AI ${media_type} for account ${accountId}`);

        // Step 1: Generate media
        let generationResult;
        if (media_type === 'image') {
            generationResult = await createImageGeneration(userId, generation_prompt, generation_options);
        } else if (media_type === 'video') {
            const sourceType = generation_options.source_type || 'text';
            const source = generation_options.source || generation_prompt;
            const prompt = generation_options.motion_prompt || '';
            generationResult = await createVideoGeneration(userId, sourceType, source, prompt, generation_options);
        } else {
            throw new Error(`Unsupported media_type: ${media_type}`);
        }

        if (!generationResult.success) {
            throw new Error(`Media generation failed: ${generationResult.error}`);
        }

        // Step 2: Create content record
        const contentData = {
            text: text || generation_prompt,
            media: [{
                url: generationResult.video_url || generationResult.image_url,
                type: media_type
            }]
        };

        const content = await createContent(accountId, {
            content_data: contentData,
            status: post_now ? 'QUEUED' : 'DRAFT',
            scheduled_for: scheduled_for || null
        });

        // Step 3: Create media record and link to generation
        const mediaRecord = generationResult.generation.r2_url
            ? await createMediaWithR2Data(content.id, {
                url: generationResult.generation.r2_url,
                key: generationResult.generation.r2_key,
                bucket: generationResult.generation.r2_bucket,
                type: media_type,
                size: generationResult.generation.metadata?.file_size,
                mimeType: media_type === 'video' ? 'video/mp4' : 'image/png',
                filename: `ai-${media_type}-${generationResult.generation.id}.${media_type === 'video' ? 'mp4' : 'png'}`
            })
            : await createMedia(content.id, {
                url: generationResult.fal_url,
                type: media_type,
                metadata: { source: 'fal.ai' }
            });

        // Link media to generation
        await linkMediaToGeneration(mediaRecord.id, generationResult.generation.id);

        // Update generation with content_id
        await updateAIGeneration(generationResult.generation.id, {
            content_id: content.id
        });

        console.log(`[AI Generation Service] Content created successfully with AI ${media_type}`);

        return {
            success: true,
            content,
            media: mediaRecord,
            generation: generationResult.generation
        };

    } catch (error) {
        console.error('[AI Generation Service] Failed to create content with AI media:', error.message);
        throw error;
    }
}

/**
 * Get generations for a user with filters
 * @param {number} userId - User ID
 * @param {Object} filters - Filters (generation_type, status, module_id, content_id)
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Generations
 */
async function getGenerations(userId, filters = {}, limit = 50) {
    return await getAIGenerationsByUserId(userId, filters, limit);
}

/**
 * Get a specific generation
 * @param {number} generationId - Generation ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<Object|null>} Generation record
 */
async function getGeneration(generationId, userId) {
    return await getAIGenerationById(generationId, userId);
}

/**
 * Retry a failed generation
 * @param {number} generationId - Generation ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<Object>} New generation result
 */
async function retryGeneration(generationId, userId) {
    const original = await getAIGenerationById(generationId, userId);

    if (!original) {
        throw new Error('Generation not found');
    }

    if (original.status !== 'failed') {
        throw new Error('Can only retry failed generations');
    }

    console.log(`[AI Generation Service] Retrying generation ${generationId}`);

    const { generation_type, input_params, prompt, module_id, content_id } = original;

    // Retry based on generation type
    if (generation_type === 'image') {
        return await createImageGeneration(userId, prompt, {
            ...input_params,
            module_id,
            content_id
        });
    } else if (generation_type === 'text-to-video') {
        return await createVideoGeneration(userId, 'text', prompt, '', {
            ...input_params,
            module_id,
            content_id
        });
    } else if (generation_type === 'image-to-video') {
        return await createVideoGeneration(
            userId,
            'image',
            input_params.source,
            prompt,
            {
                ...input_params,
                module_id,
                content_id
            }
        );
    } else {
        throw new Error(`Unsupported generation type for retry: ${generation_type}`);
    }
}

/**
 * Get generation statistics for a user
 * @param {number} userId - User ID
 * @param {Object} options - Options (startDate, endDate)
 * @returns {Promise<Object>} Statistics
 */
async function getStats(userId, options = {}) {
    return await getAIGenerationStats(userId, options);
}

/**
 * Estimate video generation cost based on model and duration
 * @param {string} model - Model name
 * @param {number} duration - Video duration in seconds
 * @returns {number} Estimated cost in USD
 */
function estimateVideoCost(model, duration) {
    // These are rough estimates - actual costs vary
    const costPerSecond = {
        'veo3-fast': 0.05,
        'veo3-image': 0.05,
        'kling-video': 0.08,
        'kling-text-to-video': 0.08,
        'sora2-text': 0.15,
        'sora2-text-pro': 0.25,
        'sora2-image': 0.15,
        'sora2-image-pro': 0.25,
        'minimax-hailuo': 0.03,
        'wan-v2.2': 0.06
    };

    return (costPerSecond[model] || 0.05) * duration;
}

/**
 * List available generation models
 * @returns {Object} Available models grouped by type
 */
function getAvailableModels() {
    return {
        image: [
            {
                id: 'flux-pro',
                name: 'FLUX Pro 1.1',
                description: 'High-quality image generation',
                cost_estimate: '$0.10 per image'
            },
            {
                id: 'nano-banana',
                name: 'Nano Banana',
                description: 'Fast, cost-effective image generation (Google)',
                cost_estimate: '$0.02 per image'
            }
        ],
        'text-to-video': [
            {
                id: 'veo3-fast',
                name: 'Veo 3 Fast',
                description: 'Fast text-to-video by Google',
                cost_estimate: '$0.05/sec'
            },
            {
                id: 'kling-text-to-video',
                name: 'Kling Video v2.5 Turbo Pro',
                description: 'High-quality text-to-video',
                cost_estimate: '$0.08/sec'
            },
            {
                id: 'sora2-text',
                name: 'Sora 2 Standard',
                description: 'OpenAI text-to-video',
                cost_estimate: '$0.15/sec'
            },
            {
                id: 'sora2-text-pro',
                name: 'Sora 2 Pro',
                description: 'OpenAI premium text-to-video',
                cost_estimate: '$0.25/sec'
            },
            {
                id: 'wan-v2.2',
                name: 'WAN v2.2-a14b',
                description: 'Text-to-video generation',
                cost_estimate: '$0.06/sec'
            }
        ],
        'image-to-video': [
            {
                id: 'minimax-hailuo',
                name: 'MiniMax Hailuo 02',
                description: 'Image-to-video animation (default)',
                cost_estimate: '$0.03/sec'
            },
            {
                id: 'veo3-image',
                name: 'Veo 3 Image-to-Video',
                description: 'Google image-to-video',
                cost_estimate: '$0.05/sec'
            },
            {
                id: 'kling-video',
                name: 'Kling Video v2.5',
                description: 'High-quality image-to-video',
                cost_estimate: '$0.08/sec'
            },
            {
                id: 'sora2-image',
                name: 'Sora 2 Image-to-Video',
                description: 'OpenAI image-to-video',
                cost_estimate: '$0.15/sec'
            },
            {
                id: 'sora2-image-pro',
                name: 'Sora 2 Image-to-Video Pro',
                description: 'OpenAI premium image-to-video',
                cost_estimate: '$0.25/sec'
            }
        ]
    };
}

module.exports = {
    createImageGeneration,
    createVideoGeneration,
    createContentWithAIMedia,
    getGenerations,
    getGeneration,
    retryGeneration,
    getStats,
    getAvailableModels,
    isFalConfigured: falService.isFalConfigured
};
