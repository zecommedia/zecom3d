const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const params = JSON.parse(fs.readFileSync('D:/Zecom AutoAgents/POD Project/T-shirt/Scripts/H10_ExportXLSX_input.json', 'utf-8'))[0];

// Define field configurations with selectors and corresponding param values
const fieldConfigs = [
  { selector: 'input[data-testid="magnetiqscore"][type="number"][placeholder="Min"]', value: params.magnetiqscoreMin },
  { selector: 'input[data-testid="magnetiqscore"][type="number"][placeholder="Max"]', value: params.magnetiqscoreMax },
  { selector: 'input[data-testid="searchvolume"][type="number"][placeholder="Min"]', value: params.searchVolumeMin },
  { selector: 'input[data-testid="searchvolume"][type="number"][placeholder="Max"]', value: params.searchVolumeMax },
  { selector: 'input[placeholder="Current"]', value: params.timeperiod },
  { selector: 'input[data-testid="wordcount"][type="number"][placeholder="Min"]', value: params.wordCountMin },
  { selector: 'input[data-testid="wordcount"][type="number"][placeholder="Max"]', value: params.wordCountMax },
  { selector: 'input[data-testid="competingproducts"][type="number"][placeholder="Min"]', value: params.competingproductsMin },
  { selector: 'input[data-testid="competingproducts"][type="number"][placeholder="Max"]', value: params.competingproductsMax },
  { selector: 'input[data-testid="phrasescontaining"][placeholder="Ex: red dress"], input[placeholder="Ex: red dress"]', value: params.phrasescontaining },
  { selector: 'input[data-testid="titledensity"][placeholder="Min"]', value: params.titleDensityMin },
  { selector: 'input[data-testid="titledensity"][placeholder="Max"]', value: params.titleDensityMax },
  { selector: 'input[data-testid="searchvolumetrend"][placeholder="Min"]', value: params.searchvolumetrendMin },
  { selector: 'input[data-testid="searchvolumetrend"][placeholder="Max"]', value: params.searchvolumetrendMax },
  { selector: 'input[name="exclude"]', value: params.excludeKeywords },
  { selector: 'input[data-testid="abaTotalClickShare"][placeholder="Min"]', value: params.abaTotalClickShareMin },
  { selector: 'input[data-testid="abaTotalClickShare"][placeholder="Max"]', value: params.abaTotalClickShareMax },
  { selector: 'input[data-testid="abaTotalConvShare"][placeholder="Min"]', value: params.abaTotalConvShareMin },
  { selector: 'input[data-testid="abaTotalConvShare"][placeholder="Max"]', value: params.abaTotalConvShareMax },
  { selector: 'input[data-testid="cpc"][placeholder="Min"]', value: params.cpcMin },
  { selector: 'input[data-testid="cpc"][placeholder="Max"]', value: params.cpcMax },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    userDataDir: path.join('D:'),
    args: ['--profile-directory=Profile 5', '--start-maximized'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.goto('https://members.helium10.com/magnet?accountId=1547036478');
 await delay(5000);

  console.log('Đang nhập từ khóa:', params.keyword);
  await page.waitForSelector('input[placeholder="Enter a keyword"]', { timeout: 30000 });
  const keywordInput = await page.$('input[placeholder="Enter a keyword"]');
  await keywordInput.click({ clickCount: 3 });
  await keywordInput.press('Backspace');
  await keywordInput.type(String(params.keyword || ''));

  await page.waitForSelector('button[data-testid="getkeywords"]:not([disabled])', { timeout: 30000 });
  await page.click('button[data-testid="getkeywords"]');

  // SỬA TẠI ĐÂY: Chỉ click Run New Search nếu xuất hiện; nếu không thì bỏ qua
  try {
    await page.waitForSelector('button[data-testid="runnewsearch"]', { timeout: 5000 });
    await page.click('button[data-testid="runnewsearch"]');
    console.log('Đã bấm Run New Search');
  } catch (e) {
    console.log('Không thấy nút Run New Search, bỏ qua và tiếp tục...');
  }

  async function clearAndType(selector, value) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      const el = await page.$(selector);
      await el.click({ clickCount: 3 });
      await el.press('Backspace');
      await el.type(String(value));
      console.log(`Đã nhập ${value} vào ${selector}`);
    } catch (error) {
      console.error(`Lỗi khi nhập vào ${selector}:`, error.message);
    }
  }

  console.log('Đang nhập các trường filter...');
  // Filter out empty or invalid values
  const validFields = fieldConfigs.filter(config => config.value != null && String(config.value).trim() !== '');
  for (const { selector, value } of validFields) {
    await clearAndType(selector, value);
  }

  console.log('Đang nhấn nút Apply Filter...');
  await page.waitForSelector('button[data-testid="applyfilters"]', { timeout: 10000 });
  await page.click('button[data-testid="applyfilters"]');

  console.log('Đang nhấn nút Export...');
  await page.waitForSelector('button[data-testid="exportdata"]', { timeout: 10000 });
  await page.click('button[data-testid="exportdata"]');

  console.log('Đang chọn định dạng XLSX...');
  await page.waitForSelector('div[data-testid="xlsx"]', { timeout: 10000 });
  await page.click('div[data-testid="xlsx"]');

  console.log('Đang chờ tải file XLSX...');
  // Lệnh dưới không bắt buộc, giữ nguyên như bản gốc
  await keywordInput.press('Backspace');

  
  await delay(7000);

  console.log('Hoàn tất! Đóng trình duyệt...');
  await browser.close();
})();
