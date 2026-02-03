const MOCKUP_SERVER_URL = 'http://localhost:3001';

export interface MockupExportResult {
  success: boolean;
  printPath?: string;
  mockupPath?: string;
  printImage?: string;
  mockupImage?: string;
  error?: string;
}

export interface BatchExportResult {
  success: boolean;
  results: Array<{
    id: string;
    name: string;
    success: boolean;
    printImage?: string;
    mockupImage?: string;
    error?: string;
  }>;
}

export interface ProgressUpdate {
  jobId: number;
  step: number;
  progress: number;
  message: string;
}

/**
 * Check if mockup server is running
 */
export async function checkMockupServer(): Promise<boolean> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Subscribe to progress updates via SSE
 */
export function subscribeToProgress(onProgress: (update: ProgressUpdate) => void): () => void {
  const eventSource = new EventSource(`${MOCKUP_SERVER_URL}/api/progress`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ProgressUpdate;
      onProgress(data);
    } catch (e) {
      console.error('Failed to parse progress update:', e);
    }
  };
  
  eventSource.onerror = () => {
    console.error('SSE connection error');
  };
  
  // Return cleanup function
  return () => eventSource.close();
}

/**
 * Export pattern to Photoshop mockup
 */
export async function exportToMockup(imageBase64: string): Promise<MockupExportResult> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/export-mockup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64 }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Export failed');
    }

    return data;
  } catch (error) {
    console.error('Export mockup error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch export multiple patterns
 */
export async function exportBatch(patterns: Array<{ id: string; imageBase64: string; name: string }>): Promise<BatchExportResult> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/export-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ patterns }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Batch export failed');
    }

    return data;
  } catch (error) {
    console.error('Batch export error:', error);
    return {
      success: false,
      results: [],
    };
  }
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{ queueLength: number; isProcessing: boolean }> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/queue-status`);
    return await response.json();
  } catch {
    return { queueLength: 0, isProcessing: false };
  }
}

/**
 * Crawl images from Amazon
 */
export async function crawlAmazon(keyword: string, maxImages: number = 5): Promise<string[]> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/crawl/amazon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, maxImages }),
    });
    
    const data = await response.json();
    return data.success ? data.images : [];
  } catch (error) {
    console.error('Amazon crawl error:', error);
    return [];
  }
}

/**
 * Crawl images from Etsy
 */
export async function crawlEtsy(keyword: string, maxImages: number = 5): Promise<string[]> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/crawl/etsy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, maxImages }),
    });
    
    const data = await response.json();
    return data.success ? data.images : [];
  } catch (error) {
    console.error('Etsy crawl error:', error);
    return [];
  }
}

/**
 * Crawl images from both Amazon and Etsy
 */
export async function crawlBoth(keyword: string, maxImages: number = 3): Promise<string[]> {
  try {
    const response = await fetch(`${MOCKUP_SERVER_URL}/api/crawl/both`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, maxImages }),
    });
    
    const data = await response.json();
    return data.success ? data.images : [];
  } catch (error) {
    console.error('Crawl error:', error);
    return [];
  }
}
