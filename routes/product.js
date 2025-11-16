const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { z } = require('zod');
const { GoogleGenAI } = require('@google/genai'); // Import Google GenAI SDK
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
      // Basic check to ensure we got an image
      if (!mimeType || !mimeType.startsWith('image/')) {
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
router.post('/try-on', upload, async (req, res, next) => {
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

    // 4. Initialize Google GenAI Client
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // 5. Build the prompt and contents for the SDK
    const basePrompt = "Generate a virtual try-on image. Place the clothing item from the second image onto the person in the first image. The new clothing should fit naturally and match the person's pose and background. The result must be photorealistic.";
    const finalPrompt = customPrompt ? `${basePrompt} Additional instructions: ${customPrompt}` : basePrompt;

    const contents = [
      {
        role: "user",
        parts: [
          { text: finalPrompt },
          {
            inlineData: {
              mimeType: userImageData.mimeType,
              data: userImageData.data,
            },
          },
          {
            inlineData: {
              mimeType: productImageData.mimeType,
              data: productImageData.data,
            },
          },
        ],
      },
    ];

    // 6. Call Google AI API using the SDK
    // Note: Using generateContent is the standard method. For image generation specifically,
    // check if the model supports it or if you need a specific method.
    // Assuming 'gemini-2.5-flash-image-preview' or similar model name is correct for your use case.
    // If using an older SDK version, the method might slightly differ.
    
    // Based on your request example:
    // const response = await ai.models.generateContent({ ... });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview", 
      contents: contents,
      // Add any generation config if needed, e.g., responseMimeType: "application/json" is not typical for image gen unless structured output requested
    });

    // 7. Extract and send the image back
    // The SDK response structure might differ slightly from raw REST API.
    // Typically response.response.candidates[0].content.parts...
    // But checking your provided example: response.parts...
    
    let base64Data = null;
    
    // Using the SDK response format logic provided in your example
    // The SDK simplifies access, but let's be robust.
    const parts = response?.response?.candidates?.[0]?.content?.parts || []; 
    
    // Or if the SDK returns a flat parts array directly on the main object in newer versions:
    // const parts = response.parts || [];

    // Let's try to find the image part
    const imagePart = parts.find(p => p.inlineData);
    
    if (imagePart) {
        base64Data = imagePart.inlineData.data;
    }

    if (!base64Data) {
        // Fallback or error if no image found
        console.error("Full API Response:", JSON.stringify(response, null, 2));
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
    console.error('Error in /v1/try-on:', error);
    next(error);
  }
});

module.exports = router;