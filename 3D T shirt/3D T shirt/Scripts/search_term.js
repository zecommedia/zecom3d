const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Đọc file JSON và lấy giá trị Search by Niche
const niches = JSON.parse(fs.readFileSync('D:/Zecom AutoAgents/POD Project/Sticker/Scripts/Keyword.json', 'utf8'));
const keyword = niches[0]['Keyword']; // e.g. "car accessories"

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    userDataDir: path.join('D:'),
    args: ['--profile-directory=Profile 7', '--start-maximized'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  await page.goto('https://sellercentral.amazon.com/opportunity-explorer', { waitUntil: 'networkidle2' });
// Đợi input xuất hiện
const element = await page.waitForSelector('pierce/#katal-id-1');

// Focus để đảm bảo input đã sẵn sàng
await page.focus('pierce/#katal-id-1');
await delay(200); // đợi thêm để ổn định focus

 // Gõ keyword
 for (const char of keyword) {
  await page.keyboard.type(char, { delay: 20 });
}
// Đợi nút Submit Search có thể click được
await page.waitForFunction(() => {
  const btn = document.querySelector('[data-testid="SearchSubmitButton"]');
  return btn && !btn.disabled;
});
// Click vào nút
await page.click('[data-testid="SearchSubmitButton"]');
// Chờ đến khi có một link chứa '/opportunity-explorer/niche/' trong href
await page.waitForFunction(() => {
  return Array.from(document.querySelectorAll('a')).some(a => a.href.includes('/opportunity-explorer/niche/'));
});


await page.evaluate(() => {
  // Tìm phần tử cha có class .css-10mmn6v
  const container = document.querySelector('.css-10mmn6v');
  if (!container) return;

  // Tìm tbody bên trong container
  const tbody = container.querySelector('tbody');
  if (!tbody) return;

  // Tìm thẻ <a> đầu tiên bên trong tbody
  const link = tbody.querySelector('a');
  if (link) link.click();
});
// Đợi phần tử kat-tab xuất hiện
  await page.waitForSelector('[data-testid="SearchQueriesTab"]', { visible: true });

  // Click vào nó
  await page.click('[data-testid="SearchQueriesTab"]');

// lấy top 10
await page.waitForSelector('tbody tr');

   const products = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 10);
    return rows.map(row => {
      const tdList = row.querySelectorAll('td');
      return {
        searchT: tdList[0]?.innerText.trim() || null 
      };
    });
  });
  // ✅ In kết quả ra console dưới dạng JSON format
  console.log(JSON.stringify(products, null, 2));

await browser.close();
})();