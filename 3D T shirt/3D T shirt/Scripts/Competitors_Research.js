const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Đọc file JSON và lấy phần tử đầu tiên
const params = JSON.parse(fs.readFileSync('D:/Zecom AutoAgents/POD Project/T-shirt/Scripts/Extract_Images_keyword.json', 'utf-8'))[0];

(async () => {
  // Mở trình duyệt (headless: false để dễ debug, có thể đổi về true khi deploy)
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    userDataDir: 'D:',
    args: ['--profile-directory=Profile 5', '--start-maximized'],
    defaultViewport: null,
  });
  const page = await browser.newPage();

  // --- Lấy keyword từ params và tạo folder ---
  const keyword = params.keyword;  
  const folderName = keyword.replace(/\s+/g, ' ').toLowerCase();
  const downloadDir = path.resolve('D:/Zecom AutoAgents/POD Project/T-shirt/Output Folder', folderName);
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  // --- Vào trang Amazon với keyword động ---
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'networkidle2' });

  // --- Đợi ảnh load và thu thập URL 5 ảnh đầu (không phải sponsored) ---
  await page.waitForSelector('img.s-image');
  const imageUrls = await page.evaluate(() => {
    const urls = [];
    const items = document.querySelectorAll('.s-result-item.s-asin');
    let count = 0;

    for (const item of items) {
      // Kiểm tra xem phần tử có chứa nhãn "Sponsored" hay không
      const isSponsored = item.querySelector('span[data-action="a-popover"][data-a-popover*="sp-info-popover"]');
      if (isSponsored) continue; // Bỏ qua nếu là sponsored

      const img = item.querySelector('img.s-image');
      if (img && img.src && count < 5) {
        urls.push(img.src);
        count++;
      }
    }
    return urls;
  });
  console.log(`Found ${imageUrls.length} non-sponsored images for keyword: ${keyword}`);

  // --- Tải và lưu ảnh theo thứ tự 1.jpg → 5.jpg ---
  for (let i = 0; i < imageUrls.length; i++) {
    const src = imageUrls[i];
    const filePath = path.join(downloadDir, `${i + 1}.jpg`);
    const fileStream = fs.createWriteStream(filePath);
    https.get(src, res => {
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
      });
    }).on('error', err => {
      console.error(`❌ [${keyword}] Error downloading image ${i + 1}:`, err.message);
    });
  }

  // Đóng browser
  await browser.close();
})();