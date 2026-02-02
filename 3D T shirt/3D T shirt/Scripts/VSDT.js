const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    userDataDir: path.join('D:/'), // Đường dẫn đến thư mục dữ liệu người dùng của bạn
    args: ['--profile-directory=Profile 5', '--start-maximized'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // ✅ Đọc file và map ra danh sách từ khóa
   const rawData = JSON.parse(fs.readFileSync('D:/Zecom AutoAgents/POD Project/T-shirt/Scripts/ASIN.json', 'utf8'));
   const keywords = rawData.map(entry => entry.Keyword); // 👈 Lấy giá trị "Keyword"
 
   for (const keyword of keywords) {
    const keywordForUrl = keyword.trim().replace(/\s+/g, '+');
    const url = `https://www.amazon.com/s?k=${keywordForUrl}`; 

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Chờ các liên kết sản phẩm tải xong
  await page.waitForSelector('div.s-result-item');

  // Lấy liên kết sản phẩm và kiểm tra xem có nhãn "Amazon's Choice" hay không
  const productLinks = await page.$$eval('div.s-result-item', items => 
    items
      .map(item => {
        const asin = item.getAttribute('data-asin'); // Lấy ASIN
        const isAmazonChoice = item.querySelector('[aria-label="Amazon\'s Choice"]') !== null; // Kiểm tra nhãn "Amazon's Choice"
        const isSponsored = item.querySelector('.puis-sponsored-label-text') !== null; 
        return { asin, isAmazonChoice, isSponsored };
      })
      .filter(product => product.isAmazonChoice && !product.isSponsored) // Lọc ra những sản phẩm có nhãn "Amazon's Choice" và không có nhãn "Sponsored"
      .map(product => product.asin)
  );


  // Mảng chứa kết quả tất cả các sản phẩm lấy được từ các store
  const allResults = [];

  for (const asin of productLinks) {

    const storeUrl = `https://www.amazon.com/dp/${asin}`;  // Truy cập vào cửa hàng của ASIN

    await page.goto(storeUrl, { waitUntil: 'domcontentloaded' });



    

    const hasSellerProfile = await page.$('#sellerProfileTriggerId');
    if (hasSellerProfile) {
      await page.click('#sellerProfileTriggerId');
    } else {
      console.log('❌ Không tìm thấy sellerProfileTriggerId. Dừng toàn bộ quá trình.');
      await browser.close();
      process.exit(1);
    }

    await delay(2000); // Nghỉ 2s mỗi vòng
    await page.waitForSelector('.a-link-normal', { visible: true });

    // Click vào sản phẩm để vào cửa hàng chính
    await page.click('.a-link-normal');
    await delay(2000); // Nghỉ 2s mỗi vòng

    // Tìm ô nhập từ khóa "shirt" và nhập vào
    await page.waitForSelector('#twotabsearchtextbox');
    await page.type('#twotabsearchtextbox', 'shirt', { delay: 100 });

    // Nhấn Enter hoặc tìm nút search và click vào
    await page.keyboard.press('Enter');

    // Chờ kết quả tìm kiếm sản phẩm
    await page.waitForSelector('div.s-main-slot > div[data-asin]', { timeout: 5000 }).catch(() => console.log('❌ Không tìm thấy sản phẩm'));

// Chờ kết quả tìm kiếm sản phẩm
await page.waitForSelector('div.s-main-slot.s-result-list.s-search-results.sg-row > div[data-asin]', { timeout: 5000 })
  .catch(() => console.log('❌ Không tìm thấy sản phẩm'));

// Lấy top 5 sản phẩm sticker
const productsOnPage = await page.$$eval('div.s-main-slot.s-result-list.s-search-results.sg-row > div[data-asin]', items =>
  items
    .map(item => {
      const asin = item.getAttribute('data-asin');
      return asin && asin.length > 5 ? { asin } : null;
    })
    .filter(entry => entry !== null)
    .slice(0, 5) // Lấy top 5
);


    allResults.push(...productsOnPage);

    await delay(3000); // Nghỉ 3s mỗi vòng
  }

  // Console log all results sau khi đã thu thập hết
  console.log(`${JSON.stringify(allResults, null, 2)}`);}

  await browser.close();
})();
