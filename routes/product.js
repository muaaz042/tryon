const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { z } = require('zod');

const { apiAuthMiddleware } = require('../middleware/apiAuth');
const { getNextApiKey } = require('../lib/apiKeyRotator');
const prisma = require('../lib/prisma'); 

const router = express.Router();

// --- Multer Setup ---
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
}).fields([
  { name: 'userImage', maxCount: 1 },
  { name: 'productImage', maxCount: 1 }
]);

// --- Validation Schema ---
const tryOnSchema = z.object({
  customPrompt: z.string().optional(),
  userImageUrl: z.string().optional(),
  productImageUrl: z.string().optional(),
  // siteUrl: z.string().optional(),
  // siteName: z.string().optional()
});

// --- Helper Function: Get Image Data ---
async function getImageData(file, url) {
  if (file) {
    return {
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype
    };
  }

  if (url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer'
      });

      if (response.headers['content-length'] > MAX_FILE_SIZE_BYTES) {
        throw new Error(`Image from URL is too large (Max: ${MAX_FILE_SIZE_MB}MB).`);
      }

      const mimeType = response.headers['content-type'];
      if (!mimeType.startsWith('image/')) {
        throw new Error('URL did not point to a valid image.');
      }

      const data = Buffer.from(response.data, 'binary').toString('base64');
      return { data, mimeType };
    } catch (error) {
      throw new Error(`Failed to fetch image from URL: ${error.message}`);
    }
  }

  throw new Error('No image file or URL provided.');
}

// --- Routes ---

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

router.use(apiAuthMiddleware);

// Virtual Try-On Route
router.post('/try-on', upload, async (req, res, next) => {
  try {
    // 1. Validate inputs
    const { 
      customPrompt, 
      userImageUrl, 
      productImageUrl,
      // siteUrl,
      // siteName 
    } = tryOnSchema.parse(req.body);
    
    const userImageFile = req.files?.userImage?.[0];
    const productImageFile = req.files?.productImage?.[0];

    // 2. Get image data
    const userImageData = await getImageData(userImageFile, userImageUrl);
    const productImageData = await getImageData(productImageFile, productImageUrl);

    // 3. Get a rotating OpenRouter API key
    let openRouterKey = await getNextApiKey();
    console.log('🔄 Rotated to OpenRouter API key.',openRouterKey);
    if (!openRouterKey) {
      console.error('❌ getNextApiKey returned:', openRouterKey);
      throw new Error('No OpenRouter API key available. Please check your API key configuration.');
    }
    
    // Trim any whitespace
    openRouterKey = openRouterKey.trim();
    
    // Validate key format
    if (!openRouterKey.startsWith('sk-or-')) {
      console.warn('⚠️ API key format unexpected. OpenRouter keys typically start with sk-or-');
      console.warn('Key preview:', openRouterKey.substring(0, 10) + '...');
    }
    
    console.log('🔑 Using API key:', openRouterKey.substring(0, 15) + '... (length: ' + openRouterKey.length + ')');

    // 4. Build the prompt
    const basePrompt = `Create a photorealistic virtual try-on image where the clothing item from the product image is seamlessly placed on the person in the user image.

Requirements:
- Maintain the person's exact pose, body proportions, and positioning
- Ensure the clothing fits naturally with proper draping and shadows
- Match the lighting, color tone, and background of the original user image
- Preserve all original details except for the clothing being replaced
- The result must look completely realistic and natural

I am providing you with two images:
1. User Image: The person wearing current clothing
2. Product Image: The clothing item to be virtually tried on

Please generate the virtual try-on result.`;

    const finalPrompt = customPrompt 
      ? `${basePrompt}\n\nAdditional requirements: ${customPrompt}` 
      : basePrompt;

    // 5. Prepare the request payload for OpenRouter API
    const payload = {
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: finalPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${userImageData.mimeType};base64,${userImageData.data}`
              }
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${productImageData.mimeType};base64,${productImageData.data}`
              }
            }
          ]
        }
      ],
      modalities: ['image', 'text']
    };

    // 6. Send request to OpenRouter API directly
    console.log('🚀 Sending virtual try-on request to OpenRouter...');
    
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          // 'HTTP-Referer': siteUrl || process.env.SITE_URL || 'https://virtual-tryon.app',
          // 'X-Title': siteName || process.env.SITE_NAME || 'Virtual Try-On App',
        },
        timeout: 120000 // 2 minutes timeout
      }
    );

    const result = response.data;

    // 7. Extract generated image from response
    if (result.choices && result.choices.length > 0) {
      const message = result.choices[0].message;
      
      // Check for generated images
      if (message.images && message.images.length > 0) {
        const generatedImage = message.images[0];
        const imageUrl = generatedImage.imageUrl?.url || generatedImage.url;
        
        if (imageUrl) {
          console.log('✅ Successfully generated virtual try-on image');
          
          // Extract base64 data from data URL if present
          let base64Image = imageUrl;
          let mimeType = 'image/png';
          
          if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              base64Image = matches[2];
            }
          }
          
          return res.json({ 
            success: true,
            base64Image: base64Image,
            imageUrl: imageUrl,
            mimeType: mimeType,
            message: 'Virtual try-on image generated successfully'
          });
        }
      }
      
      // Check for text response
      if (message.content) {
        console.log('⚠️ Model returned text instead of image:', message.content);
        return res.status(400).json({ 
          success: false,
          message: 'Model returned text instead of image.',
          textResult: message.content 
        });
      }
    }

    // No image found
    console.error('❌ No image data found in response');
    console.error('Response:', JSON.stringify(result, null, 2));
    return res.status(500).json({ 
      success: false,
      message: 'Failed to generate virtual try-on image. No image data in response.',
      response: result 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed', 
        errors: error.flatten().fieldErrors 
      });
    }
    
    console.error('❌ Error in /v1/try-on:', error);
    
    // Handle Axios errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      console.error('API Error Response:', errorData);
      
      if (status === 401) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid or expired OpenRouter API key',
          error: errorData
        });
      }
      
      if (status === 429) {
        return res.status(429).json({ 
          success: false,
          message: 'Rate limit exceeded. Please try again later.',
          error: errorData
        });
      }
      
      if (status === 400) {
        return res.status(400).json({ 
          success: false,
          message: 'Bad request to OpenRouter API',
          error: errorData
        });
      }
      
      return res.status(status).json({ 
        success: false,
        message: 'OpenRouter API error',
        error: errorData
      });
    }
    
    // Handle other errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired OpenRouter API key' 
      });
    }
    
    next(error);
  }
});

module.exports = router;