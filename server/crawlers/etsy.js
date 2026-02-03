const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Crawl images from Etsy search results
 * @param {string} keyword - Search keyword
 * @param {number} maxImages - Maximum number of images to crawl (default: 5)
 * @returns {Promise<string[]>} - Array of image URLs
 */
async function crawlEtsyImages(keyword, maxImages = 5) {
  console.log(`[Etsy Crawler] Starting for keyword: "${keyword}"`);
  
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
    
    // Anti-detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    });
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to Etsy search
    const searchUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    console.log(`[Etsy Crawler] Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait longer for dynamic content (like your script)
    await delay(5000);
    
    // Try to wait for listing grid (from your script selectors)
    try {
      await page.waitForSelector('.wt-grid__item-xs-6', { timeout: 10000 });
      console.log(`[Etsy Crawler] Found .wt-grid__item-xs-6 selector`);
    } catch (e) {
      console.log(`[Etsy Crawler] .wt-grid__item-xs-6 not found, trying alternatives...`);
    }
    
    // Scroll down to trigger lazy loading
    await page.evaluate(() => {
      window.scrollBy(0, 1000);
    });
    await delay(2000);
    
    // Extract product image URLs using selectors from your script
    const images = await page.evaluate((max) => {
      const urls = [];
      
      // Method 1: Use .wt-grid__item-xs-6 listing elements (from your script)
      const listingElements = document.querySelectorAll('.wt-grid__item-xs-6');
      
      listingElements.forEach((listing) => {
        if (urls.length >= max) return;
        
        // Try the exact selector from your script
        let imageElement = listing.querySelector('.placeholder img[src*="i.etsystatic.com"]');
        
        // Fallback to other selectors
        if (!imageElement) {
          imageElement = listing.querySelector('img[src*="etsystatic.com"]');
        }
        if (!imageElement) {
          imageElement = listing.querySelector('img');
        }
        
        if (imageElement) {
          let src = imageElement.src || imageElement.getAttribute('data-src');
          
          if (!src) return;
          if (!src.includes('etsystatic.com')) return;
          if (src.includes('placeholder') || src.includes('icon') || src.includes('avatar')) return;
          
          // Get higher resolution
          if (src.includes('il_')) {
            src = src.replace(/il_\d+x\d+N?/, 'il_794xN');
          }
          
          if (!urls.includes(src)) {
            urls.push(src);
          }
        }
      });
      
      // Method 2: Fallback - get all product images if method 1 didn't work
      if (urls.length < max) {
        const allImages = document.querySelectorAll('img[src*="etsystatic.com"]');
        
        allImages.forEach((img) => {
          if (urls.length >= max) return;
          
          let src = img.src;
          if (!src || !src.includes('il_')) return;
          if (src.includes('avatar') || src.includes('icon') || src.includes('75x75')) return;
          
          src = src.replace(/il_\d+x\d+N?/, 'il_794xN');
          
          if (!urls.includes(src)) {
            urls.push(src);
          }
        });
      }
      
      return urls;
    }, maxImages);
    
    console.log(`[Etsy Crawler] Found ${images.length} images`);
    
    return images;
    
  } catch (error) {
    console.error('[Etsy Crawler] Error:', error.message);
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
        'Referer': 'https://www.etsy.com/'
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

module.exports = { crawlEtsyImages, downloadImageAsBase64 };

// CLI support
if (require.main === module) {
  const keyword = process.argv[2] || 'cat';
  crawlEtsyImages(keyword, 5)
    .then(images => {
      console.log('Results:', JSON.stringify(images, null, 2));
    })
    .catch(err => {
      console.error('Failed:', err);
      process.exit(1);
    });
}
