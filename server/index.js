const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;

// Paths
const MOCKUP_FOLDER = path.join(__dirname, '../3D T shirt/3D T shirt/Mockup');
const SCRIPTS_FOLDER = path.join(__dirname, '../3D T shirt/3D T shirt/Scripts');
const PHOTOSHOP_PATH = 'C:/Program Files/Adobe/Adobe Photoshop 2023/Photoshop.exe';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============= QUEUE SYSTEM =============
const jobQueue = [];
let isProcessing = false;
let currentJob = null;
const progressClients = new Map();

// Check if Photoshop is running
function isPhotoshopRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq Photoshop.exe" /NH', (error, stdout) => {
      resolve(stdout.toLowerCase().includes('photoshop.exe'));
    });
  });
}

// Wait for Photoshop to close
async function waitForPhotoshopToClose(maxWaitMs = 30000) {
  const startTime = Date.now();
  while (await isPhotoshopRunning()) {
    if (Date.now() - startTime > maxWaitMs) {
      console.log('⏳ Photoshop still running, proceeding anyway...');
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
    console.log('⏳ Waiting for Photoshop to close...');
  }
}

// Process queue
async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;
  
  isProcessing = true;
  currentJob = jobQueue.shift();
  
  try {
    await waitForPhotoshopToClose();
    const result = await currentJob.execute();
    currentJob.resolve(result);
  } catch (error) {
    currentJob.reject(error);
  } finally {
    isProcessing = false;
    currentJob = null;
    processQueue();
  }
}

// Add job to queue
function queueJob(execute) {
  return new Promise((resolve, reject) => {
    const job = { execute, resolve, reject, id: Date.now() };
    jobQueue.push(job);
    console.log(`📥 Job queued. Queue length: ${jobQueue.length}`);
    processQueue();
  });
}

// Broadcast progress to SSE clients
function broadcastProgress(jobId, step, progress, message) {
  const data = JSON.stringify({ jobId, step, progress, message });
  progressClients.forEach((res) => {
    res.write(`data: ${data}\n\n`);
  });
}

// ============= ENDPOINTS =============

// Health check
app.get('/api/health', async (req, res) => {
  const psRunning = await isPhotoshopRunning();
  res.json({ 
    status: 'ok', 
    photoshopPath: PHOTOSHOP_PATH,
    photoshopRunning: psRunning,
    queueLength: jobQueue.length,
    isProcessing
  });
});

// SSE endpoint for progress updates
app.get('/api/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const clientId = Date.now();
  progressClients.set(clientId, res);
  
  req.on('close', () => {
    progressClients.delete(clientId);
  });
});

// Queue status
app.get('/api/queue-status', (req, res) => {
  res.json({
    queueLength: jobQueue.length,
    isProcessing,
    currentJobId: currentJob?.id || null
  });
});

// Run Photoshop script
function runPhotoshopScript(scriptPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PHOTOSHOP_PATH)) {
      reject(new Error(`Photoshop not found at: ${PHOTOSHOP_PATH}`));
      return;
    }
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Script not found: ${scriptPath}`));
      return;
    }
    const command = `"${PHOTOSHOP_PATH}" -r "${scriptPath}"`;
    console.log(`🚀 Running: ${command}`);
    exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Script error:', error);
      }
      resolve({ stdout, stderr });
    });
  });
}

// Wait for file with progress callback
function waitForFile(filePath, timeoutMs = 90000, onProgress) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let lastProgress = 0;
    
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(95, (elapsed / timeoutMs) * 100);
      
      if (onProgress && progress > lastProgress + 5) {
        onProgress(progress);
        lastProgress = progress;
      }
      
      if (fs.existsSync(filePath)) {
        setTimeout(() => {
          clearInterval(checkInterval);
          if (onProgress) onProgress(100);
          resolve(true);
        }, 1000);
      } else if (elapsed > timeoutMs) {
        clearInterval(checkInterval);
        reject(new Error(`Timeout waiting for file: ${filePath}`));
      }
    }, 300);
  });
}

// Save pattern image as temp.png
app.post('/api/save-pattern', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const tempPath = path.join(MOCKUP_FOLDER, 'temp.png');
    fs.writeFileSync(tempPath, buffer);
    
    console.log(`✅ Saved pattern to: ${tempPath}`);
    res.json({ success: true, path: tempPath });
  } catch (error) {
    console.error('❌ Save error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Full pipeline with queue
app.post('/api/export-mockup', async (req, res) => {
  const jobId = Date.now();
  
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const result = await queueJob(async () => {
      broadcastProgress(jobId, 1, 5, 'Saving pattern...');
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const tempPath = path.join(MOCKUP_FOLDER, 'temp.png');
      fs.writeFileSync(tempPath, buffer);
      
      broadcastProgress(jobId, 1, 10, 'Pattern saved!');
      broadcastProgress(jobId, 2, 15, 'Starting PRINT generation...');
      const printScriptPath = path.join(SCRIPTS_FOLDER, 'Print_Scripts.jsx');
      const printOutputPath = path.join(MOCKUP_FOLDER, 'PRINT.png');
      
      if (fs.existsSync(printOutputPath)) fs.unlinkSync(printOutputPath);
      
      await runPhotoshopScript(printScriptPath);
      
      broadcastProgress(jobId, 2, 25, 'Waiting for PRINT.png...');
      await waitForFile(printOutputPath, 90000, (p) => {
        broadcastProgress(jobId, 2, 25 + (p * 0.25), 'Generating PRINT...');
      });
      
      broadcastProgress(jobId, 2, 50, 'PRINT.png ready!');
      broadcastProgress(jobId, 3, 55, 'Starting Mockup generation...');
      const mockupScriptPath = path.join(SCRIPTS_FOLDER, 'Mockup_Scripts.jsx');
      const mockupOutputPath = path.join(MOCKUP_FOLDER, 'Mockup.png');
      
      if (fs.existsSync(mockupOutputPath)) fs.unlinkSync(mockupOutputPath);
      
      await runPhotoshopScript(mockupScriptPath);
      
      broadcastProgress(jobId, 3, 65, 'Waiting for Mockup.png...');
      await waitForFile(mockupOutputPath, 90000, (p) => {
        broadcastProgress(jobId, 3, 65 + (p * 0.30), 'Generating Mockup...');
      });

      broadcastProgress(jobId, 4, 95, 'Reading output files...');
      
      const printBuffer = fs.readFileSync(printOutputPath);
      const printBase64 = `data:image/png;base64,${printBuffer.toString('base64')}`;
      
      const mockupBuffer = fs.readFileSync(mockupOutputPath);
      const mockupBase64 = `data:image/png;base64,${mockupBuffer.toString('base64')}`;
      
      broadcastProgress(jobId, 4, 100, 'Complete!');

      return { 
        success: true, 
        printPath: printOutputPath,
        mockupPath: mockupOutputPath,
        printImage: printBase64,
        mockupImage: mockupBase64 
      };
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Export mockup error:', error);
    broadcastProgress(jobId, 0, 0, `Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Batch export - multiple patterns
app.post('/api/export-batch', async (req, res) => {
  const { patterns } = req.body;
  
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
    return res.status(400).json({ error: 'No patterns provided' });
  }

  const results = [];
  const batchId = Date.now();
  
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const overallProgress = ((i) / patterns.length) * 100;
    
    try {
      broadcastProgress(batchId, i + 1, overallProgress, `Processing ${pattern.name || `Pattern ${i + 1}`}...`);
      
      const result = await queueJob(async () => {
        const base64Data = pattern.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const tempPath = path.join(MOCKUP_FOLDER, 'temp.png');
        fs.writeFileSync(tempPath, buffer);
        
        const printScriptPath = path.join(SCRIPTS_FOLDER, 'Print_Scripts.jsx');
        const printOutputPath = path.join(MOCKUP_FOLDER, 'PRINT.png');
        
        if (fs.existsSync(printOutputPath)) fs.unlinkSync(printOutputPath);
        await runPhotoshopScript(printScriptPath);
        await waitForFile(printOutputPath, 90000);
        
        const mockupScriptPath = path.join(SCRIPTS_FOLDER, 'Mockup_Scripts.jsx');
        const mockupOutputPath = path.join(MOCKUP_FOLDER, 'Mockup.png');
        
        if (fs.existsSync(mockupOutputPath)) fs.unlinkSync(mockupOutputPath);
        await runPhotoshopScript(mockupScriptPath);
        await waitForFile(mockupOutputPath, 90000);
        
        const printBuffer = fs.readFileSync(printOutputPath);
        const mockupBuffer = fs.readFileSync(mockupOutputPath);
        
        return {
          id: pattern.id,
          name: pattern.name,
          printImage: `data:image/png;base64,${printBuffer.toString('base64')}`,
          mockupImage: `data:image/png;base64,${mockupBuffer.toString('base64')}`
        };
      });
      
      results.push({ ...result, success: true });
      broadcastProgress(batchId, i + 1, ((i + 1) / patterns.length) * 100, `Completed ${pattern.name || `Pattern ${i + 1}`}`);
    } catch (error) {
      results.push({ 
        id: pattern.id, 
        name: pattern.name, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  broadcastProgress(batchId, patterns.length, 100, 'Batch complete!');
  res.json({ success: true, results });
});

// Get mockup image
app.get('/api/mockup-image', (req, res) => {
  const mockupPath = path.join(MOCKUP_FOLDER, 'Mockup.png');
  if (fs.existsSync(mockupPath)) {
    res.sendFile(mockupPath);
  } else {
    res.status(404).json({ error: 'Mockup not found' });
  }
});

// ============= CRAWL ENDPOINTS =============
let amazonCrawler, etsyCrawler;
try {
  amazonCrawler = require('./crawlers/amazon');
  etsyCrawler = require('./crawlers/etsy');
  console.log('✅ Crawlers loaded');
} catch (err) {
  console.log('⚠️ Crawlers not loaded:', err.message);
}

// Crawl Amazon images
app.post('/api/crawl/amazon', async (req, res) => {
  const { keyword, maxImages = 5 } = req.body;
  
  if (!keyword) {
    return res.status(400).json({ error: 'No keyword provided' });
  }
  
  if (!amazonCrawler) {
    return res.status(500).json({ error: 'Amazon crawler not available. Install puppeteer: npm install puppeteer' });
  }
  
  try {
    console.log(`🔍 Crawling Amazon for: "${keyword}"`);
    const imageUrls = await amazonCrawler.crawlAmazonImages(keyword, maxImages);
    
    // Convert URLs to base64
    const images = await Promise.all(
      imageUrls.map(url => amazonCrawler.downloadImageAsBase64(url).catch(() => null))
    );
    
    res.json({ 
      success: true, 
      keyword,
      images: images.filter(Boolean)
    });
  } catch (error) {
    console.error('❌ Amazon crawl error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Crawl Etsy images
app.post('/api/crawl/etsy', async (req, res) => {
  const { keyword, maxImages = 5 } = req.body;
  
  if (!keyword) {
    return res.status(400).json({ error: 'No keyword provided' });
  }
  
  if (!etsyCrawler) {
    return res.status(500).json({ error: 'Etsy crawler not available. Install puppeteer: npm install puppeteer' });
  }
  
  try {
    console.log(`🔍 Crawling Etsy for: "${keyword}"`);
    const imageUrls = await etsyCrawler.crawlEtsyImages(keyword, maxImages);
    
    // Convert URLs to base64
    const images = await Promise.all(
      imageUrls.map(url => etsyCrawler.downloadImageAsBase64(url).catch(() => null))
    );
    
    res.json({ 
      success: true, 
      keyword,
      images: images.filter(Boolean)
    });
  } catch (error) {
    console.error('❌ Etsy crawl error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Crawl both Amazon and Etsy
app.post('/api/crawl/both', async (req, res) => {
  const { keyword, maxImages = 3 } = req.body;
  
  if (!keyword) {
    return res.status(400).json({ error: 'No keyword provided' });
  }
  
  try {
    console.log(`🔍 Crawling both sources for: "${keyword}"`);
    
    const results = { amazon: [], etsy: [] };
    
    if (amazonCrawler) {
      try {
        const amazonUrls = await amazonCrawler.crawlAmazonImages(keyword, maxImages);
        results.amazon = await Promise.all(
          amazonUrls.map(url => amazonCrawler.downloadImageAsBase64(url).catch(() => null))
        );
        results.amazon = results.amazon.filter(Boolean);
      } catch (err) {
        console.error('Amazon crawl failed:', err.message);
      }
    }
    
    if (etsyCrawler) {
      try {
        const etsyUrls = await etsyCrawler.crawlEtsyImages(keyword, maxImages);
        results.etsy = await Promise.all(
          etsyUrls.map(url => etsyCrawler.downloadImageAsBase64(url).catch(() => null))
        );
        results.etsy = results.etsy.filter(Boolean);
      } catch (err) {
        console.error('Etsy crawl failed:', err.message);
      }
    }
    
    res.json({ 
      success: true, 
      keyword,
      images: [...results.amazon, ...results.etsy]
    });
  } catch (error) {
    console.error('❌ Crawl error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Zecom3D Mockup Server running at http://localhost:${PORT}`);
  console.log(`📁 Mockup folder: ${MOCKUP_FOLDER}`);
  console.log(`📁 Scripts folder: ${SCRIPTS_FOLDER}`);
  console.log(`🎨 Photoshop path: ${PHOTOSHOP_PATH}`);
  console.log(`📋 Queue system: ENABLED\n`);
});
