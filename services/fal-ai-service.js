/**
 * Fal.ai Service
 * Provides AI-powered image and video generation capabilities
 * Based on fal.ai API with support for multiple models
 */

const { fal } = require('@fal-ai/client');
const fetch = require('node-fetch');
const { uploadMediaToR2, isR2Enabled } = require('./r2-media-service');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg');
const ffprobePath = require('@ffprobe-installer/ffprobe');
const { promises: fs } = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

// Configure fal.ai client
if (process.env.FAL_API_KEY) {
  fal.config({
    credentials: process.env.FAL_API_KEY
  });
}

/**
 * Check if fal.ai is configured
 * @returns {boolean} Whether FAL_API_KEY is set
 */
function isFalConfigured() {
  return !!process.env.FAL_API_KEY;
}

/**
 * Generate an image from text
 * @param {string} prompt - The text prompt for image generation
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Generated image result
 */
async function generateImage(prompt, options = {}) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  const {
    model = 'flux-pro', // 'flux-pro' or 'nano-banana'
    width = 1024,
    height = 1024,
    num_inference_steps = 28,
    guidance_scale = 3.5,
    seed,
    num_images = 1
  } = options;

  const startTime = Date.now();

  if (model === 'nano-banana') {
    console.log('🎨 Starting image generation...');
    console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    console.log(`   Model: Nano Banana (Google)`);
    console.log(`   Images: ${num_images}`);

    const result = await fal.subscribe('fal-ai/nano-banana', {
      input: {
        prompt,
        num_images,
        output_format: 'png'
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Generation in progress...');
        }
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Image generated successfully in ${duration}s`);
    console.log(`   URL: ${result.data.images[0].url}`);

    return result;
  } else {
    // FLUX Pro 1.1 (default)
    console.log('🎨 Starting image generation...');
    console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    console.log(`   Size: ${width}x${height}`);
    console.log(`   Model: FLUX Pro 1.1`);

    const result = await fal.subscribe('fal-ai/flux-pro/v1.1', {
      input: {
        prompt,
        image_size: {
          width,
          height
        },
        num_inference_steps,
        guidance_scale,
        ...(seed && { seed })
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Generation in progress...');
        }
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Image generated successfully in ${duration}s`);
    console.log(`   URL: ${result.data.images[0].url}`);
    console.log(`   Seed: ${result.data.seed}`);

    return result;
  }
}

/**
 * Generate a video from an image
 * @param {string} imageUrl - URL of the image to animate
 * @param {string} prompt - Motion description prompt
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Generated video result
 */
async function generateVideo(imageUrl, prompt = '', options = {}) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  const {
    model = 'minimax-hailuo', // 'minimax-hailuo', 'veo3-image', 'kling-video', 'sora2-image', 'sora2-image-pro'
    duration = 5,
    aspect_ratio = '16:9',
    cfg_scale,
    enable_audio = false,
    resolution
  } = options;

  const motionPrompt = prompt || 'Natural motion, cinematic camera movement';

  const startTime = Date.now();

  if (model === 'veo3-image') {
    // Veo 3 Fast Image-to-Video
    const durationStr = typeof duration === 'number' ? `${duration}s` : duration;

    console.log('🎬 Starting image-to-video generation...');
    console.log(`   Image URL: ${imageUrl}`);
    console.log(`   Motion Prompt: "${motionPrompt}"`);
    console.log(`   Model: Veo 3 Fast Image-to-Video (Google)`);
    console.log(`   Duration: ${durationStr}`);
    console.log(`   Aspect Ratio: ${aspect_ratio}`);
    console.log(`   Audio: ${enable_audio ? 'Enabled' : 'Disabled'}`);

    const result = await fal.subscribe('fal-ai/veo3/fast/image-to-video', {
      input: {
        image_url: imageUrl,
        prompt: motionPrompt,
        duration: durationStr,
        aspect_ratio,
        generate_audio: enable_audio
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-60 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);
    if (enable_audio) {
      console.log(`   Audio: Included`);
    }

    return result;
  } else if (model === 'kling-video') {
    console.log('🎬 Starting image-to-video generation...');
    console.log(`   Image URL: ${imageUrl}`);
    console.log(`   Motion Prompt: "${motionPrompt}"`);
    console.log(`   Model: Kling Video v2.5 Turbo Pro`);
    console.log(`   Duration: ${duration}s`);

    const result = await fal.subscribe('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', {
      input: {
        prompt: motionPrompt,
        image_url: imageUrl,
        duration,
        aspect_ratio,
        ...(cfg_scale && { cfg_scale })
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-60 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);

    return result;
  } else if (model === 'sora2-image' || model === 'sora2-image-pro') {
    // Sora 2 Image-to-Video (Standard or Pro)
    const isPro = model === 'sora2-image-pro';
    const durationNum = Number(duration);

    console.log('🎬 Starting image-to-video generation...');
    console.log(`   Image URL: ${imageUrl}`);
    console.log(`   Motion Prompt: "${motionPrompt}"`);
    console.log(`   Model: Sora 2 ${isPro ? 'Pro' : 'Standard'} (OpenAI)`);
    console.log(`   Duration: ${durationNum}s`);
    console.log(`   Aspect Ratio: ${aspect_ratio}`);
    console.log(`   Resolution: ${resolution || 'auto'}`);

    const inputParams = {
      image_url: imageUrl,
      prompt: motionPrompt,
      duration: durationNum,
      aspect_ratio,
      resolution: resolution || 'auto'
    };
    console.log(`   📋 Full API parameters:`, JSON.stringify(inputParams, null, 2));

    const endpoint = isPro ? 'fal-ai/sora-2/image-to-video/pro' : 'fal-ai/sora-2/image-to-video';
    const result = await fal.subscribe(endpoint, {
      input: inputParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-60 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);

    return result;
  } else {
    // MiniMax Hailuo (default)
    console.log('🎬 Starting image-to-video generation...');
    console.log(`   Image URL: ${imageUrl}`);
    console.log(`   Motion Prompt: "${motionPrompt}"`);
    console.log(`   Model: MiniMax Hailuo 02`);

    const result = await fal.subscribe('fal-ai/minimax/hailuo-02/standard/image-to-video', {
      input: {
        image_url: imageUrl,
        prompt: motionPrompt
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-60 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);

    return result;
  }
}

/**
 * Upload a file to fal.ai storage and get a URL
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - Name of the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} URL of the uploaded file
 */
async function uploadFile(fileBuffer, filename, mimeType) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  console.log(`📤 Uploading file to fal.ai storage: ${filename} (${(fileBuffer.length / 1024).toFixed(2)} KB)`);

  const file = new File([fileBuffer], filename, { type: mimeType });
  const url = await fal.storage.upload(file);

  console.log(`✅ File uploaded to fal.ai: ${url}`);

  return url;
}

/**
 * Generate a video from text
 * @param {string} prompt - The text prompt for video generation
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Generated video result
 */
async function generateVideoFromText(prompt, options = {}) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  const {
    model = 'veo3-fast', // 'veo3-fast', 'kling-text-to-video', 'wan-v2.2', 'sora2-text', 'sora2-text-pro'
    duration = 4,
    aspect_ratio = '16:9',
    enable_audio = false,
    cfg_scale,
    num_frames,
    frames_per_second,
    resolution
  } = options;

  const startTime = Date.now();

  if (model === 'wan-v2.2') {
    // WAN v2.2-a14b text-to-video
    console.log('🎬 Starting text-to-video generation...');
    console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    console.log(`   Model: WAN v2.2-a14b`);
    console.log(`   Frames: ${num_frames || 81}`);
    console.log(`   FPS: ${frames_per_second || 24}`);
    console.log(`   Aspect Ratio: ${aspect_ratio}`);

    const inputParams = {
      prompt,
      ...(num_frames && { num_frames }),
      ...(frames_per_second && { frames_per_second }),
      aspect_ratio,
      resolution: '720p'
    };
    console.log(`   📋 Full API parameters:`, JSON.stringify(inputParams, null, 2));

    const result = await fal.subscribe('fal-ai/wan/v2.2-a14b/text-to-video', {
      input: inputParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-90 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);

    return result;
  } else if (model === 'kling-text-to-video') {
    // Kling Video v2.5 Turbo Pro text-to-video
    // Duration should be string "5" or "10" (not "5s" format)
    const durationStr = String(duration);

    console.log('🎬 Starting text-to-video generation...');
    console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    console.log(`   Model: Kling Video v2.5 Turbo Pro`);
    console.log(`   Duration: ${durationStr}s`);
    console.log(`   Aspect Ratio: ${aspect_ratio}`);

    const inputParams = {
      prompt,
      duration: durationStr,
      aspect_ratio,
      ...(cfg_scale && { cfg_scale })
    };
    console.log(`   📋 Full API parameters:`, JSON.stringify(inputParams, null, 2));

    const result = await fal.subscribe('fal-ai/kling-video/v2.5-turbo/pro/text-to-video', {
      input: inputParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-90 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);

    return result;
  } else if (model === 'sora2-text' || model === 'sora2-text-pro') {
    // Sora 2 Text-to-Video (Standard or Pro)
    const isPro = model === 'sora2-text-pro';
    const durationNum = Number(duration);

    console.log('🎬 Starting text-to-video generation...');
    console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    console.log(`   Model: Sora 2 ${isPro ? 'Pro' : 'Standard'} (OpenAI)`);
    console.log(`   Duration: ${durationNum}s`);
    console.log(`   Aspect Ratio: ${aspect_ratio}`);
    console.log(`   Resolution: ${resolution || (isPro ? '1080p' : '720p')}`);

    const inputParams = {
      prompt,
      duration: durationNum,
      aspect_ratio,
      resolution: resolution || (isPro ? '1080p' : '720p')
    };
    console.log(`   📋 Full API parameters:`, JSON.stringify(inputParams, null, 2));

    const endpoint = isPro ? 'fal-ai/sora-2/text-to-video/pro' : 'fal-ai/sora-2/text-to-video';
    const result = await fal.subscribe(endpoint, {
      input: inputParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-90 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);

    return result;
  } else {
    // Veo 3 Fast (default)
    // Duration should be string with 's' suffix like "4s", "6s", "8s"
    const durationStr = typeof duration === 'number' ? `${duration}s` : duration;

    console.log('🎬 Starting text-to-video generation...');
    console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    console.log(`   Model: Veo 3 Fast (Google)`);
    console.log(`   Duration: ${durationStr}`);
    console.log(`   Aspect Ratio: ${aspect_ratio}`);
    console.log(`   Audio: ${enable_audio ? 'Enabled' : 'Disabled'}`);

    const inputParams = {
      prompt,
      duration: durationStr,
      aspect_ratio,
      generate_audio: enable_audio
    };
    console.log(`   📋 Full API parameters:`, JSON.stringify(inputParams, null, 2));

    const result = await fal.subscribe('fal-ai/veo3/fast', {
      input: inputParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('   ⏳ Video generation in progress (this may take 30-90 seconds)...');
        }
      }
    });

    const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Video generated successfully in ${generationDuration}s`);
    console.log(`   URL: ${result.data.video.url}`);
    console.log(`   Duration: ${result.data.video.duration}s`);
    if (enable_audio) {
      console.log(`   Audio: Included`);
    }

    return result;
  }
}

/**
 * Generate audio for a video using MMAudio V2
 * @param {string} videoUrl - URL of the video
 * @param {string} prompt - Audio description prompt
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Generated audio+video result
 */
async function generateAudioWithMMAudio(videoUrl, prompt, options = {}) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  const {
    negative_prompt,
    seed,
    num_steps = 25,
    duration = 8,
    cfg_strength = 4.5,
    mask_away_clip = false
  } = options;

  console.log('🎵 Starting video-to-audio generation...');
  console.log(`   Video URL: ${videoUrl}`);
  console.log(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  console.log(`   Model: MMAudio V2`);
  console.log(`   Duration: ${duration}s`);

  const inputParams = {
    video_url: videoUrl,
    prompt,
    num_steps,
    duration,
    cfg_strength,
    mask_away_clip,
    ...(negative_prompt && { negative_prompt }),
    ...(seed && { seed })
  };
  console.log(`   📋 Full API parameters:`, JSON.stringify(inputParams, null, 2));

  const startTime = Date.now();

  const result = await fal.subscribe('fal-ai/mmaudio-v2', {
    input: inputParams,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        console.log('   ⏳ Audio generation in progress (this may take 30-60 seconds)...');
      }
    }
  });

  const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Audio generated successfully in ${generationDuration}s`);
  console.log(`   Output URL: ${result.data.video.url}`);

  return result;
}

/**
 * Generate auto-captions for a video using fal.ai
 * @param {string} videoUrl - URL to the video file
 * @param {Object} options - Caption options
 * @returns {Promise<Object>} Result with captioned video URL
 */
async function generateAutoCaptions(videoUrl, options = {}) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  const {
    txt_color = 'white',
    txt_font = 'Standard',
    font_size = 24,
    stroke_width = 1,
    left_align = 'center',
    top_align = 'center',
    refresh_interval = 1.5
  } = options;

  console.log('🎬 Starting auto-caption generation...');
  console.log(`   Video URL: ${videoUrl}`);
  console.log(`   Font: ${txt_font}, Size: ${font_size}, Color: ${txt_color}`);

  const startTime = Date.now();

  try {
    const result = await fal.subscribe('fal-ai/auto-caption', {
      input: {
        video_url: videoUrl,
        txt_color,
        txt_font,
        font_size,
        stroke_width,
        left_align,
        top_align,
        refresh_interval
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log(`   Processing: ${update.logs?.map(l => l.message).join(', ') || 'working...'}`);
        }
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Auto-caption generation complete in ${duration}s`);
    console.log(`   Full result:`, JSON.stringify(result, null, 2));

    // The response might have the video at different keys
    const outputVideoUrl = result.video_url || result.video || result.output_video || result.data?.video_url;

    if (!outputVideoUrl) {
      console.error('❌ No video URL found in result:', result);
      throw new Error('Auto-caption did not return a video URL');
    }

    console.log(`   Output: ${outputVideoUrl}`);

    return {
      video_url: outputVideoUrl
    };
  } catch (error) {
    console.error('❌ Auto-caption generation failed:', error);
    throw new Error(`Auto-caption generation failed: ${error.message}`);
  }
}

/**
 * Download media from a URL and optionally backup to R2
 * @param {string} url - URL of the media to download
 * @param {string} type - Type of media ('image' or 'video')
 * @param {string} generationId - ID of the AI generation
 * @param {Object} metadata - Additional metadata for R2
 * @returns {Promise<Object|null>} R2 backup info or null if R2 disabled
 */
async function backupMediaToR2(url, type, generationId, metadata = {}) {
  if (!isR2Enabled) {
    console.log('R2 backup skipped: R2 not enabled');
    return null;
  }

  try {
    console.log(`📥 Downloading ${type} from fal.ai for R2 backup...`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${type}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ||
                       (type === 'video' ? 'video/mp4' : 'image/png');

    const extension = type === 'video' ? 'mp4' :
                     contentType.includes('jpeg') ? 'jpg' : 'png';
    const filename = `ai-${type}-${generationId}.${extension}`;

    console.log(`☁️  Uploading ${type} to R2 (${(buffer.length / 1024 / 1024).toFixed(2)} MB)...`);

    const r2Result = await uploadMediaToR2(buffer, filename, contentType, {
      source: 'fal.ai',
      generationId,
      type,
      ...metadata
    });

    console.log(`✅ ${type} backed up to R2: ${r2Result.url}`);

    return {
      url: r2Result.url,
      key: r2Result.key,
      size: r2Result.size,
      bucket: r2Result.bucket
    };
  } catch (error) {
    console.error(`❌ Failed to backup ${type} to R2:`, error.message);
    // Don't throw - backup failure shouldn't fail the generation
    return null;
  }
}

/**
 * Extract the last frame from a video
 * @param {string} videoUrl - URL of the video
 * @returns {Promise<Buffer>} Buffer containing the last frame as PNG
 */
async function extractLastFrame(videoUrl) {
  console.log('🎞️  Extracting last frame from video...');
  console.log(`   Video URL: ${videoUrl}`);

  const tempDir = os.tmpdir();
  const videoPath = path.join(tempDir, `video-${Date.now()}.mp4`);
  const framePath = path.join(tempDir, `frame-${Date.now()}.png`);

  try {
    // Download video
    console.log('   📥 Downloading video...');
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    const videoBuffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(videoPath, videoBuffer);
    console.log(`   ✅ Video downloaded (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // Get video duration first
    console.log('   🎬 Getting video duration...');
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });

    const duration = metadata.format.duration;
    const lastFrameTime = Math.max(0, duration - 0.1); // Get frame 0.1 seconds before end
    console.log(`   📊 Video duration: ${duration}s, extracting frame at ${lastFrameTime}s`);

    // Extract last frame using ffmpeg
    console.log('   🎬 Extracting last frame...');
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(lastFrameTime) // Seek to near end of video (in seconds)
        .frames(1)
        .output(framePath)
        .outputOptions(['-q:v 2']) // High quality
        .on('end', () => {
          console.log('   ✅ Frame extracted');
          resolve();
        })
        .on('error', (err) => {
          console.error('   ❌ FFmpeg error:', err.message);
          reject(err);
        })
        .run();
    });

    // Read the extracted frame
    const frameBuffer = await fs.readFile(framePath);
    console.log(`✅ Last frame extracted (${(frameBuffer.length / 1024).toFixed(2)} KB)`);

    // Cleanup
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(framePath).catch(() => {});

    return frameBuffer;
  } catch (error) {
    // Cleanup on error
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(framePath).catch(() => {});
    throw new Error(`Failed to extract last frame: ${error.message}`);
  }
}

/**
 * Upload an image buffer to fal.ai storage
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} filename - Filename
 * @returns {Promise<string>} URL of the uploaded image
 */
async function uploadImageBuffer(imageBuffer, filename) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  console.log(`📤 Uploading image buffer to fal.ai: ${filename} (${(imageBuffer.length / 1024).toFixed(2)} KB)`);

  const file = new File([imageBuffer], filename, { type: 'image/png' });
  const url = await fal.storage.upload(file);

  console.log(`✅ Image uploaded to fal.ai: ${url}`);

  return url;
}

/**
 * Generate lipsync video using Sync Lipsync v2
 * @param {string} videoUrl - URL of the video
 * @param {string} audioUrl - URL of the audio file
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Generated lipsync video result
 */
async function generateLipsync(videoUrl, audioUrl, options = {}) {
  if (!process.env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  console.log('🎬 Starting lipsync generation...');
  console.log(`   Video URL: ${videoUrl}`);
  console.log(`   Audio URL: ${audioUrl}`);
  console.log(`   Model: Sync Lipsync v2`);

  const startTime = Date.now();

  const result = await fal.subscribe('fal-ai/sync-lipsync/v2', {
    input: {
      video_url: videoUrl,
      audio_url: audioUrl
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        console.log('   ⏳ Lipsync generation in progress (this may take 30-90 seconds)...');
      }
    }
  });

  const generationDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Lipsync video generated successfully in ${generationDuration}s`);
  console.log(`   URL: ${result.data.video.url}`);

  return result;
}

module.exports = {
  generateImage,
  generateVideo,
  generateVideoFromText,
  generateAutoCaptions,
  generateAudioWithMMAudio,
  generateLipsync,
  uploadFile,
  uploadImageBuffer,
  extractLastFrame,
  backupMediaToR2,
  isFalConfigured
};
