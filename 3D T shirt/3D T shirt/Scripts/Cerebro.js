const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getNextFolderPath(baseFolder) {
    let folderIndex = 1;
    let folderPath = path.join(baseFolder, `Cerebro${folderIndex}`);

    // Kiểm tra thư mục có tồn tại không, nếu có thì tăng số lên
    while (fs.existsSync(folderPath)) {
        folderIndex++;
        folderPath = path.join(baseFolder, `Cerebro${folderIndex}`);
    }

    return folderPath;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    userDataDir: path.join('D:'),
    args: ['--profile-directory=Profile 5', '--start-maximized'],
    defaultViewport: null,
  });

  // Đọc file và lấy danh sách ASIN
  const asinList = JSON.parse(fs.readFileSync('D:/Zecom AutoAgents/POD Project/T-shirt/Scripts/ASIN.json', 'utf8'))
    .map(obj => obj.asin)
    .slice(0, 10) // chỉ lấy 10 ASIN đầu
    .join(', ');  // format chuỗi
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  // Đường dẫn thư mục cơ sở
    const baseFolder = 'D:/Zecom AutoAgents/POD Project/T-shirt/XLSX';

    // Lấy đường dẫn thư mục tiếp theo
    const downloadPath = await getNextFolderPath(baseFolder);

    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }
    // In ra đường dẫn của thư mục vừa tạo
    console.log(downloadPath);

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath
    });


  // Vào trang google.com
  await page.goto('https://members.helium10.com/cerebro?accountId=1547036478');

  // Sử dụng selector theo placeholder
  const inputSelector1 = 'input[placeholder="Enter up to 10 product identifiers for keyword comparison."]';

  // Đợi input xuất hiện
  await page.waitForSelector(inputSelector1);

  // Nhập chuỗi ASIN vào input
  await page.type(inputSelector1, asinList);
  await delay(2000); // Đợi 1 giây để nhập xong

  // Nhấn Get Keywords
  await page.waitForSelector('button[data-testid="getkeywords"]', { timeout: 10000 });
  await page.click('button[data-testid="getkeywords"]'); 
  
  try {
    await page.waitForSelector('button[data-testid="runnewsearch"]', { timeout: 10000 });
    await page.click('button[data-testid="runnewsearch"]');
  } catch (err) {}

  // Nhập filter
  await page.waitForSelector('input[data-testid="searchvolume"][placeholder="Min"]', { visible: true });
  await page.type('input[data-testid="searchvolume"][placeholder="Min"]', '100'); 

  await page.waitForSelector('input[data-testid="searchvolume"][placeholder="Max"]', { visible: true });
  await page.type('input[data-testid="searchvolume"][placeholder="Max"]', '5000'); 

  await page.waitForSelector('input[data-testid="titledensity"][placeholder="Min"]', { visible: true });
  await page.type('input[data-testid="titledensity"][placeholder="Min"]', '0');

  await page.waitForSelector('input[data-testid="titledensity"][placeholder="Max"]', { visible: true });
  await page.type('input[data-testid="titledensity"][placeholder="Max"]', '5');

  

  await page.waitForSelector('input[name="phrase"][placeholder="Ex: red dress"]', { visible: true });
  await page.type('input[name="phrase"][placeholder="Ex: red dress"]', 'shirt');

 
  await page.waitForSelector('button[data-testid="applyfilters"]', { timeout: 10000 });
  await page.click('button[data-testid="applyfilters"]');


  await page.waitForSelector('button[data-testid="exportdata"]', { timeout: 10000 });
  await page.click('button[data-testid="exportdata"]');

  await page.waitForSelector('div[data-testid="xlsx"]', { timeout: 10000 });
  await page.click('div[data-testid="xlsx"]');

  await delay(5000);

  await browser.close();
})();
