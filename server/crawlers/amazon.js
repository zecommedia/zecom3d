const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

/**
 * Crawl images from Amazon search results
 * @param {string} keyword - Search keyword
 * @param {number} maxImages - Maximum number of images to crawl (default: 5)
 * @returns {Promise<string[]>} - Array of image URLs or base64 data
 */
async function crawlAmazonImages(keyword, maxImages = 5) {
  console.log(`[Amazon Crawler] Starting for keyword: "${keyword}"`);
  
  const browser = await puppeteer.launch({
    headless: false, // Visible browser - less likely to be blocked
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Anti-detection: Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    });
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to Amazon search (without fashion filter for more results)
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
    console.log(`[Amazon Crawler] Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for images to load
    try {
      await page.waitForSelector('img.s-image', { timeout: 10000 });
    } catch (e) {
      console.log('[Amazon Crawler] Timeout waiting for .s-image, trying to continue...');
    }
    
    // Wait a bit more for dynamic content
    await new Promise(r => setTimeout(r, 2000));
    
    // Extract product image URLs using data-image-index (from your script)
    const images = await page.evaluate((max) => {
      const urls = [];
      
      // Method 1: Use data-image-index (more reliable)
      for (let i = 1; i <= max; i++) {
        const img = document.querySelector(`img.s-image[data-image-index="${i}"]`);
        if (img && img.src && !img.src.includes('data:') && !img.src.includes('gif')) {
          let src = img.src;
          // Get higher resolution
          if (src.includes('._AC_')) {
            src = src.replace(/\._AC_[^.]+\./, '._AC_SX679_.');
          }
          if (!urls.includes(src)) {
            urls.push(src);
          }
        }
      }
      
      // Method 2: Fallback to all .s-image if method 1 didn't get enough
      if (urls.length < max) {
        const allImages = document.querySelectorAll('img.s-image');
        allImages.forEach((img) => {
          if (urls.length >= max) return;
          if (img.src && !img.src.includes('data:') && !img.src.includes('gif')) {
            let src = img.src;
            if (src.includes('._AC_')) {
              src = src.replace(/\._AC_[^.]+\./, '._AC_SX679_.');
            }
            if (!urls.includes(src)) {
              urls.push(src);
            }
          }
        });
      }
      
      return urls;
    }, maxImages);
    
    console.log(`[Amazon Crawler] Found ${images.length} images`);
    
    return images;
    
  } catch (error) {
    console.error('[Amazon Crawler] Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Download image and convert to base64
 * @param {string} url - Image URL
 * @returns {Promise<string>} - Base64 data URL
 */
function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.amazon.com/'
      } 
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        return downloadImageAsBase64(response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || 'image/jpeg';
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;
        resolve(base64);
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { crawlAmazonImages, downloadImageAsBase64 };

// CLI support
if (require.main === module) {
  const keyword = process.argv[2] || 'cat';
  crawlAmazonImages(keyword, 5)
    .then(images => {
      console.log('Results:', JSON.stringify(images, null, 2));
    })
    .catch(err => {
      console.error('Failed:', err);
      process.exit(1);
    });
}
