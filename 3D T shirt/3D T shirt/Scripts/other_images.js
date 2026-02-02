// File: other_images.js

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// --- CẤU HÌNH API KEY ---
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyC5KxgW7ktDUzLC6gR244nTPQfzICw9XSM';

const PROMPT_LIST = [
  // Prompt 1 -> Sẽ lưu thành Image_2
  `A close-up, medium shot of a tightly-knit, happy four-person white American family, consisting of a father, mother, a 2-year-old daughter, and a 7-year-old son, all wearing matching plain T-shirts (no logos, no text, no brand marks). The father is holding the daughter in his arms and holding hands with his wife. The mother is holding hands with their son. They are in a cozy home setting during a joyful family gathering or casual party (living room or backyard patio), with soft party decorations like balloons and warm string lights, a table with snacks slightly blurred in the background. Bright, clean front lighting evenly illuminates their T-shirts and faces. The focus is on their upper bodies, natural candid smiles, photorealistic, shallow depth of field`,

  // Prompt 2 -> Sẽ lưu thành Image_3
  `A young Caucasian couple in a white studio. The man is on the left, facing forward, wearing the t shirt design from the left side of the provided image. The woman is on the right, facing away, wearing the t shirt design from the right side of the provided image. Her hand is placed on the man's shoulder. Focus on the upper body`
];

// --- HÀM HỖ TRỢ XỬ LÝ FILE ---

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.heic': return 'image/heic';
    case '.heif': return 'image/heif';
    default: return 'image/png';
  }
}

function getExtensionFromMime(mimeType) {
  if (!mimeType) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
}

function saveBinaryFile(filePath, content) {
  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error(`[ERROR] Writing file ${filePath}:`, err);
      return;
    }
    console.log(`[SUCCESS] Saved image: ${filePath}`);
  });
}

function readImageFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  return {
    data: buffer.toString('base64'),
    mimeType: mimeType
  };
}

// Hàm xử lý từng prompt
async function processSinglePrompt(ai, imageInput, promptText, index, outputDir) {
  const model = 'gemini-2.5-flash-image';
  const config = { responseModalities: ['IMAGE'] };

  console.log(`\n--- Processing Prompt #${index + 1} ---`);

  try {
    const contents = [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: imageInput.mimeType,
              data: imageInput.data,
            },
          },
        ],
      },
    ];

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    let hasSaved = false;
    for await (const chunk of response) {
      if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts[0].inlineData) {
        
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        const fileExtension = getExtensionFromMime(inlineData.mimeType); 
        const buffer = Buffer.from(inlineData.data || '', 'base64');
        
        // --- ĐỔI TÊN FILE TẠI ĐÂY ---
        // Sẽ lưu thành Image_1.png, Image_2.png, Image_3.png
        const fileName = `Image_0_${index + 1}.${fileExtension}`;
        const fullOutputPath = path.join(outputDir, fileName);
        
        saveBinaryFile(fullOutputPath, buffer);
        hasSaved = true;
      } 
    }
    
    if (!hasSaved) {
        console.log(`Warning: Prompt #${index + 1} did not return an image.`);
    }

  } catch (error) {
    console.error(`Error processing prompt #${index + 1}:`, error);
  }
}

async function main() {
  console.log("Script starting...");

  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node other_images.js <path_to_image>');
    process.exit(1);
  }

  const imagePath = args[0];
  console.log(`Input Image: ${imagePath}`);

  // 1. Xác định thư mục output (Chính là thư mục chứa ảnh)
  const outputDir = path.dirname(imagePath);
  console.log(`Output Directory: ${outputDir}`);

  // 2. Kiểm tra API Key
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
      console.error("Error: API Key is missing. Please edit the script and add your key.");
      process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // 3. Đọc ảnh
  let imageInput;
  try {
    imageInput = readImageFile(imagePath);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 4. Chạy các prompt
  for (let i = 0; i < PROMPT_LIST.length; i++) {
    // Không cần truyền baseName nữa
    await processSinglePrompt(ai, imageInput, PROMPT_LIST[i], i, outputDir);
  }

  console.log('\nAll tasks completed.');
}

main();