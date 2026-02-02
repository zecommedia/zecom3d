
export interface ImageFile {
  id: string;
  file: File;
  preview: string;
  base64: string;
}

export interface BatchItem {
  id: string;
  name: string;
  images: ImageFile[];
  status: 'idle' | 'processing' | 'completed' | 'error' | 'stopping';
  processingMode?: 'normal' | 'pro' | 'white' | 'pattern';
  resultsNormal: string[];
  resultsPro: string[];
  resultsWhite: string[];
  resultsPattern: string[];
  proBackgroundColor?: string; // Mặc định là đen
  customPrompt?: string;
  insights?: string; // Lưu trữ phân tích insight
  isAnalyzingInsights?: boolean; // Trạng thái đang phân tích
  error?: string;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  rotation: number;
}
