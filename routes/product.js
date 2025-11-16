const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { z } = require('zod');
const { apiAuthMiddleware } = require('../middleware/apiAuth');
const { getNextApiKey } = require('../lib/apiKeyRotator');
const prisma = require('../lib/prisma'); // Use your shared Prisma client

const router = express.Router();

// --- Multer Setup ---
const MAX_FILE_SIZE_MB = 2;
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
  productImageUrl: z.string().optional()
});

// --- Helper Function: Get Image Data ---
/**
 * Gets image data (Base64 + MIME) from either an uploaded file or a URL.
 * @param {object} file - The file from multer (req.files).
 * @param {string} url - The URL from req.body.
 * @returns {Promise<{data: string, mimeType: string}>}
 */
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

// 1. Health Check Route
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// 2. Apply API Auth Middleware to all routes below this point
router.use(apiAuthMiddleware);

// 3. Virtual Try-On Route
router.post('/try-on', upload, async (req, res,next) => {
  try {
    // 1. Validate inputs (body and files)
    const { customPrompt, userImageUrl, productImageUrl } = tryOnSchema.parse(req.body);
    const userImageFile = req.files?.userImage?.[0];
    const productImageFile = req.files?.productImage?.[0];

    // 2. Get image data from files OR URLs
    const userImageData = await getImageData(userImageFile, userImageUrl);
    const productImageData = await getImageData(productImageFile, productImageUrl);

    // 3. Get a rotating Gemini API key
    const geminiKey = await getNextApiKey();

    // 4. Build the prompt and payload
    const basePrompt = "Generate a virtual try-on image. Place the clothing item from the second image onto the person in the first image. The new clothing should fit naturally and match the person's pose and background. The result must be photorealistic.";
    const finalPrompt = customPrompt ? `${basePrompt} Additional instructions: ${customPrompt}` : basePrompt;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: finalPrompt },
            { inlineData: userImageData },
            { inlineData: productImageData }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    };

    // 5. Call Google AI API (securely from your backend)
    const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";
    
    const response = await axios.post(`${API_URL}?key=${geminiKey}`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    // 6. Extract and send the image back
    const base64Data = response.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

    if (!base64Data) {
      throw new Error("Could not find generated image data in the API response.");
    }

    res.json({ base64Image: base64Data });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.flatten().fieldErrors 
      });
    }
    console.error('Error in /v1/try-on:', error.message);
    next(error);
  }
});

module.exports = router;