
import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { ImageFile, BatchItem, ImageAdjustments } from './types';
import { generatePodImage, analyzeInsights, redesignPattern, creativePattern, cloneMockupToPattern } from './services/geminiService';
import { exportToMockup, checkMockupServer, subscribeToProgress, exportBatch, crawlBoth } from './services/mockupService';
import JSZip from 'jszip';

// Lazy load 3D viewer
const TShirt3DViewer = lazy(() => import('./components/TShirt3DViewer'));

type ViewMode = '3D'; // Only 3D mode now
type WorkspaceMode = 'generate' | 'clone'; // Generate or Clone workspace

const EditModal: React.FC<{
  image: string;
  batchName: string;
  onSave: (newBase64: string, applyToAll: boolean) => void;
  onRegenerate: (prompt: string, currentImage: string) => Promise<void>;
  onClose: () => void;
}> = ({ image, batchName, onSave, onRegenerate, onClose }) => {
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({ brightness: 100, contrast: 100, rotation: 0 });
  const [prompt, setPrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const isRotated = adjustments.rotation % 180 !== 0;
      canvas.width = isRotated ? img.height : img.width;
      canvas.height = isRotated ? img.width : img.height;
      if (ctx) {
        ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((adjustments.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      }
    };
    img.src = image;
  }, [image, adjustments]);

  const handleRegenerate = async () => {
    if (!prompt.trim()) return;
    setHistory(prev => [...prev, image]);
    setRedoStack([]); 
    setIsRegenerating(true);
    await onRegenerate(prompt, image);
    setIsRegenerating(false);
    setPrompt('');
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, image]);
    setHistory(prev => prev.slice(0, -1));
    onSave(previous, false);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, image]);
    setRedoStack(prev => prev.slice(0, -1));
    onSave(next, false);
  };

  const cleanFileName = (name: string) => {
    return name.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();                        
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${cleanFileName(batchName)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[90vh]">
        <div className="flex-1 bg-slate-100 p-8 flex items-center justify-center overflow-hidden bg-checkered relative">
          <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-2xl rounded-xl" />
          {isRegenerating && (
             <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <span className="text-xs font-black uppercase tracking-widest text-indigo-600">Redesigning Asset...</span>
                </div>
             </div>
          )}
        </div>
        <div className="w-full md:w-80 border-l border-slate-100 flex flex-col">
          <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg">Asset Refiner</h3>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Adjustments</label>
                <div className="space-y-4 bg-slate-50 p-4 rounded-2xl">
                   <div className="space-y-2">
                      <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase"><span>Brightness</span><span>{adjustments.brightness}%</span></div>
                      <input type="range" min="0" max="200" value={adjustments.brightness} onChange={e => setAdjustments(p => ({...p, brightness: parseInt(e.target.value)}))} className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-full appearance-none" />
                   </div>
                   <div className="space-y-2">
                      <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase"><span>Contrast</span><span>{adjustments.contrast}%</span></div>
                      <input type="range" min="0" max="200" value={adjustments.contrast} onChange={e => setAdjustments(p => ({...p, contrast: parseInt(e.target.value)}))} className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-full appearance-none" />
                   </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Redesign Output</label>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g., xóa chiếc quần đi, đổi màu áo sang đỏ..."
                  className="w-full h-24 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={handleUndo} disabled={history.length === 0 || isRegenerating} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50">Undo</button>
                  <button onClick={handleRedo} disabled={redoStack.length === 0 || isRegenerating} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50">Redo</button>
                </div>
                <button 
                  onClick={handleRegenerate}
                  disabled={isRegenerating || !prompt.trim()}
                  className="w-full mt-2 bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:bg-slate-300"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Redesign
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-8 border-t border-slate-50 space-y-3">
            <button onClick={handleDownload} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              SAVE AS {cleanFileName(batchName).slice(0, 15)}...
            </button>
            <button onClick={() => onSave(canvasRef.current!.toDataURL('image/png'), false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all">Apply to this</button>
            <button onClick={() => onSave(canvasRef.current!.toDataURL('image/png'), true)} className="w-full bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100">Apply to all</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Lightbox: React.FC<{ image: string; onClose: () => void }> = ({ image, onClose }) => (
  <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 p-12 cursor-zoom-out animate-in fade-in" onClick={onClose}>
    <img src={image} className="max-w-full max-h-full object-contain shadow-2xl" />
  </div>
);

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('3D');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('generate');
  
  // Only keep 3D batches
  const [batches3D, setBatches3D] = useState<BatchItem[]>([]);
  
  // Current image for 3D preview
  const [current3DImage, setCurrent3DImage] = useState<string | null>(null);
  
  // Current theme name for creative mode
  const [currentThemeName, setCurrentThemeName] = useState<string>('');
  
  // Edit panel state
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editMode, setEditMode] = useState<'redesign' | 'creative'>('redesign');
  const [isEditing, setIsEditing] = useState(false);
  
  // Mockup export state
  const [isExportingMockup, setIsExportingMockup] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [exportedPrint, setExportedPrint] = useState<string | null>(null);
  const [exportedMockup, setExportedMockup] = useState<string | null>(null);
  const [showExportResult, setShowExportResult] = useState(false);
  const [mockupServerStatus, setMockupServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  // Keywords workspace state
  const [showKeywordsInput, setShowKeywordsInput] = useState(false);
  const [keywordsText, setKeywordsText] = useState('');
  
  // Export All state
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportAllProgress, setExportAllProgress] = useState(0);
  const [exportAllResults, setExportAllResults] = useState<Array<{ name: string; printImage: string; mockupImage: string }>>([]);
  
  // Crawling state
  const [crawlingBatchId, setCrawlingBatchId] = useState<string | null>(null);
  
  // Clone workspace state
  const [cloneImage, setCloneImage] = useState<string | null>(null);
  const [clonedPattern, setClonedPattern] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  
  // Resizable columns - left column width percentage (30-70%)
  const [leftColumnWidth, setLeftColumnWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [shouldStopGlobal, setShouldStopGlobal] = useState(false);
  const [outputsPerBatch, setOutputsPerBatch] = useState(1);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ batchId: string; index: number; data: string; mode: 'normal' | 'pro' | 'white' | 'pattern' } | null>(null);
  const [hasProKey, setHasProKey] = useState(false);
  const [dragSlotId, setDragSlotId] = useState<string | null>(null); // Feedback khi kéo thả vào slot cụ thể
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Handle column resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left - 80) / (containerRect.width - 80)) * 100; // 80px for sidebar
    
    // Clamp between 30% and 70%
    const clampedWidth = Math.max(30, Math.min(70, newWidth));
    setLeftColumnWidth(clampedWidth);
  }, [isResizing]);
  
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);
  
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasProKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleConnectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasProKey(true);
    } else {
      alert("Hệ thống quản lý Key không khả dụng.");
    }
  };

  const getActiveBatches = () => {
    return batches3D;
  };

  const setActiveBatches = (updater: (prev: BatchItem[]) => BatchItem[]) => {
    setBatches3D(updater);
  };

  const removeBatchById = (id: string) => {
    setActiveBatches(p => p.filter(b => b.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });

  const handleInputDropAdd = async (batchId: string, file: File, slotIndex?: number) => {
    const base64 = await fileToBase64(file);
    const newImg: ImageFile = {
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      base64
    };
    setActiveBatches(p => p.map(b => {
      if (b.id === batchId) {
        const newImages = [...b.images];
        if (slotIndex !== undefined) {
          // Thay thế nếu slot có ảnh, hoặc thêm vào cuối nếu slot trống và nằm ở cuối list
          if (slotIndex < newImages.length) {
            newImages[slotIndex] = newImg;
          } else {
            newImages.push(newImg);
          }
        } else {
          newImages.push(newImg);
        }
        return { ...b, images: newImages.slice(0, 5) };
      }
      return b;
    }));
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const grouped: { [key: string]: File[] } = {};
    files.forEach(f => {
      if (!f.type.startsWith('image/')) return;
      const parts = (f as any).webkitRelativePath.split('/');
      if (parts.length > 2) {
        const name = parts[parts.length - 2];
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(f);
      }
    });

    const newBatches: BatchItem[] = await Promise.all(Object.entries(grouped).map(async ([name, fs]) => ({
      id: Math.random().toString(36).substr(2, 9),
      name,
      images: await Promise.all(fs.slice(0, 5).map(async f => ({ id: Math.random().toString(36).substr(2, 9), file: f, preview: URL.createObjectURL(f), base64: await fileToBase64(f) }))),
      status: 'idle',
      resultsNormal: [],
      resultsPro: [],
      resultsWhite: [],
      resultsPattern: [],
      proBackgroundColor: viewMode === 'STICKER' ? "#ffffff" : "#000000"
    })));

    e.target.value = '';
    setActiveBatches(p => [...p, ...newBatches]);
    
    // Don't auto show 3D preview - user must click "SHOW 3D" button after generating
  };

  const processBatch = async (batchId: string, mode: 'normal' | 'pro' | 'white' | 'pattern') => {
    const batches = getActiveBatches();
    const idx = batches.findIndex(b => b.id === batchId);
    if (idx === -1) return;

    setActiveBatches(p => p.map(b => {
      if (b.id === batchId) {
        const keyMap: Record<string, keyof BatchItem> = { 'pro': 'resultsPro', 'normal': 'resultsNormal', 'white': 'resultsWhite', 'pattern': 'resultsPattern' };
        const key = keyMap[mode];
        return { ...b, status: 'processing', processingMode: mode, error: undefined, [key]: [] };
      }
      return b;
    }));

    try {
      const batch = batches[idx];
      const resUrls: string[] = [];
      for (let i = 0; i < outputsPerBatch; i++) {
        if (shouldStopGlobal) break;
        
        const currentBatches = getActiveBatches();
        const currentBatch = currentBatches.find(b => b.id === batchId);
        const sourceBase = (mode === 'white' && currentBatch?.resultsPro.length && currentBatch.resultsPro.length > 0) ? currentBatch.resultsPro[0] : undefined;
        
        const b64 = await generatePodImage(
          batch.images, 
          batch.customPrompt, 
          sourceBase, 
          mode, 
          batch.name,
          mode === 'pro' ? batch.proBackgroundColor : undefined,
          viewMode === 'STICKER'
        );
        resUrls.push(b64);
      }
      
      setActiveBatches(p => p.map(b => {
        if (b.id === batchId) {
          const keyMap: Record<string, keyof BatchItem> = { 'pro': 'resultsPro', 'normal': 'resultsNormal', 'white': 'resultsWhite', 'pattern': 'resultsPattern' };
          const key = keyMap[mode];
          return { ...b, status: 'completed', [key]: resUrls };
        }
        return b;
      }));
      
      // Save theme name for creative mode (but don't auto apply to 3D - user must click "SHOW 3D")
      if (mode === 'pattern' && resUrls.length > 0) {
        setCurrentThemeName(batch.name);
      }
    } catch (err: any) {
      if (err.message.includes("PRO_KEY_REQUIRED")) { handleConnectKey(); }
      setActiveBatches(p => p.map(b => b.id === batchId ? { ...b, status: 'error', error: err.message } : b));
    }
  };

  const handleAnalyzeInsights = async (batchId: string) => {
    const batches = getActiveBatches();
    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.images.length === 0) return;

    setActiveBatches(p => p.map(b => b.id === batchId ? { ...b, isAnalyzingInsights: true } : b));
    try {
      const insightText = await analyzeInsights(batch.name, batch.images);
      const cleanInsight = insightText.replace(/[#*]/g, '');
      setActiveBatches(p => p.map(b => b.id === batchId ? { ...b, insights: cleanInsight, isAnalyzingInsights: false } : b));
    } catch (err: any) {
      alert("Lỗi khi phân tích insight: " + err.message);
      setActiveBatches(p => p.map(b => b.id === batchId ? { ...b, isAnalyzingInsights: false } : b));
    }
  };

  const processAllMode = async (mode: 'normal' | 'pro' | 'white' | 'pattern') => {
    setIsProcessingAll(true);
    setShouldStopGlobal(false);
    const batches = getActiveBatches();
    for (const b of batches) {
      if (shouldStopGlobal) break;
      await processBatch(b.id, mode);
    }
    setIsProcessingAll(false);
  };

  const downloadProject = async () => {
    const batches = getActiveBatches();
    const zip = new JSZip();
    for (const batch of batches) {
      const folder = zip.folder(batch.name);
      if (!folder) continue;
      const cleanName = batch.name.replace(/[^a-zA-Z0-9 ]/g, ' ');
      if (batch.resultsNormal.length) {
        const f = folder.folder("Normal");
        batch.resultsNormal.forEach((res, i) => f?.file(`${cleanName} Normal ${i+1}.png`, res.split(',')[1], {base64: true}));
      }
      if (batch.resultsPro.length) {
        const f = folder.folder("Pro");
        batch.resultsPro.forEach((res, i) => f?.file(`${cleanName} Pro ${i+1}.png`, res.split(',')[1], {base64: true}));
      }
      if (batch.resultsWhite.length) {
        const f = folder.folder("White");
        batch.resultsWhite.forEach((res, i) => f?.file(`${cleanName} White ${i+1}.png`, res.split(',')[1], {base64: true}));
      }
      if (batch.resultsPattern.length) {
        const f = folder.folder("Pattern3D");
        batch.resultsPattern.forEach((res, i) => f?.file(`${cleanName} Pattern ${i+1}.png`, res.split(',')[1], {base64: true}));
      }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `POD-${viewMode}-${new Date().getTime()}.zip`;
    link.click();
  };

  // Handle edit pattern (redesign or creative mode)
  const handleEditPattern = async (mode: 'redesign' | 'creative') => {
    if (!editPrompt.trim() || !current3DImage) return;
    
    setEditMode(mode);
    setIsEditing(true);
    try {
      let newPattern: string;
      
      if (mode === 'redesign') {
        // Redesign: use current pattern + edit prompt
        newPattern = await redesignPattern(current3DImage, editPrompt);
      } else {
        // Creative: combine original theme with edit prompt to create new pattern
        newPattern = await creativePattern(currentThemeName || 'abstract design', editPrompt);
      }
      
      // Apply new pattern to 3D model
      setCurrent3DImage(null);
      setTimeout(() => setCurrent3DImage(newPattern), 50);
      setEditPrompt('');
      setShowEditPanel(false);
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsEditing(false);
    }
  };

  // Handle clone mockup to pattern (only generate, don't auto apply)
  const handleCloneMockup = async () => {
    if (!cloneImage) return;
    
    setIsCloning(true);
    setClonedPattern(null);
    try {
      const pattern = await cloneMockupToPattern(cloneImage);
      setClonedPattern(pattern);
    } catch (err: any) {
      alert("Lỗi Clone: " + err.message);
    } finally {
      setIsCloning(false);
    }
  };

  // Handle apply cloned pattern to 3D
  const handleApplyClonedPattern = () => {
    if (!clonedPattern) return;
    setCurrent3DImage(null);
    setTimeout(() => setCurrent3DImage(clonedPattern), 50);
  };

  // Check mockup server status
  useEffect(() => {
    const checkServer = async () => {
      setMockupServerStatus('checking');
      const isOnline = await checkMockupServer();
      setMockupServerStatus(isOnline ? 'online' : 'offline');
    };
    checkServer();
    // Check every 30 seconds
    const interval = setInterval(checkServer, 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to SSE progress updates
  useEffect(() => {
    if (mockupServerStatus !== 'online') return;
    
    const unsubscribe = subscribeToProgress((update) => {
      if (isExportingMockup || isExportingAll) {
        setExportProgress(update.progress);
        setExportMessage(update.message);
      }
    });
    
    return unsubscribe;
  }, [mockupServerStatus, isExportingMockup, isExportingAll]);

  // Handle export mockup (full pipeline via Photoshop)
  const handleExportMockup = async () => {
    if (!current3DImage) return;
    
    if (mockupServerStatus !== 'online') {
      alert('Mockup Server chưa chạy!\n\nChạy lệnh: cd server && npm start');
      return;
    }
    
    setIsExportingMockup(true);
    setExportProgress(0);
    setExportMessage('Starting export...');
    setExportedPrint(null);
    setExportedMockup(null);
    
    try {
      const result = await exportToMockup(current3DImage);
      
      setExportProgress(100);
      setExportMessage('Complete!');
      
      if (result.success && result.mockupImage) {
        setExportedPrint(result.printImage || null);
        setExportedMockup(result.mockupImage);
        setShowExportResult(true);
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (err: any) {
      alert("Lỗi Export Mockup: " + err.message);
    } finally {
      setIsExportingMockup(false);
      setExportProgress(0);
      setExportMessage('');
    }
  };

  // Handle Export All - batch export all patterns
  const handleExportAll = async () => {
    const patternsToExport = activeBatches
      .filter(batch => batch.resultsPattern && batch.resultsPattern.length > 0)
      .map(batch => ({
        id: batch.id,
        name: batch.name,
        imageBase64: batch.resultsPattern[0]
      }));
    
    if (patternsToExport.length === 0) {
      alert('Không có pattern nào để export!');
      return;
    }
    
    if (mockupServerStatus !== 'online') {
      alert('Mockup Server chưa chạy!\n\nChạy lệnh: cd server && npm start');
      return;
    }
    
    setIsExportingAll(true);
    setExportAllProgress(0);
    setExportAllResults([]);
    
    try {
      const result = await exportBatch(patternsToExport);
      
      if (result.success) {
        const successResults = result.results
          .filter(r => r.success && r.printImage && r.mockupImage)
          .map(r => ({
            name: r.name,
            printImage: r.printImage!,
            mockupImage: r.mockupImage!
          }));
        
        setExportAllResults(successResults);
        alert(`✅ Export hoàn tất!\n\n${successResults.length}/${patternsToExport.length} patterns đã được export.`);
      }
    } catch (err: any) {
      alert("Lỗi Export All: " + err.message);
    } finally {
      setIsExportingAll(false);
      setExportAllProgress(0);
    }
  };

  // Handle add keywords from text
  const handleAddKeywords = () => {
    if (!keywordsText.trim()) return;
    
    const keywords = keywordsText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    if (keywords.length === 0) return;
    
    const newBatches: BatchItem[] = keywords.map((keyword, index) => ({
      id: `keyword-${Date.now()}-${index}`,
      name: keyword,
      images: [], // No images yet - will be crawled
      status: 'idle' as const,
      resultsNormal: [],
      resultsPro: [],
      resultsWhite: [],
      resultsPattern: [],
    }));
    
    setActiveBatches(prev => [...prev, ...newBatches]);
    setKeywordsText('');
    setShowKeywordsInput(false);
  };

  // Handle crawl images for ALL batches
  const handleCrawlAll = async () => {
    const batchesToCrawl = activeBatches.filter(b => b.images.length === 0);
    
    if (batchesToCrawl.length === 0) {
      alert('Tất cả batches đã có ảnh rồi!');
      return;
    }
    
    if (mockupServerStatus !== 'online') {
      alert('Server chưa chạy! Chạy: cd server && npm start');
      return;
    }
    
    setCrawlingBatchId('all');
    
    for (const batch of batchesToCrawl) {
      try {
        console.log(`🔍 Crawling for: ${batch.name}`);
        const imageBase64List = await crawlBoth(batch.name, 3);
        console.log(`📸 Received ${imageBase64List.length} images for ${batch.name}`);
        
        if (imageBase64List.length > 0) {
          // Convert base64 strings to ImageFile objects
          const imageFiles: ImageFile[] = imageBase64List.map((base64, idx) => ({
            id: `crawled-${Date.now()}-${idx}`,
            file: new File([], `crawled-${idx}.jpg`), // Dummy file
            preview: base64,
            base64: base64
          }));
          
          console.log(`✅ Adding ${imageFiles.length} images to batch ${batch.name}`);
          
          setActiveBatches(prev => prev.map(b => 
            b.id === batch.id 
              ? { ...b, images: [...b.images, ...imageFiles] }
              : b
          ));
        } else {
          console.log(`⚠️ No images found for ${batch.name}`);
        }
      } catch (err: any) {
        console.error(`❌ Crawl failed for ${batch.name}:`, err.message);
      }
    }
    
    setCrawlingBatchId(null);
    console.log('✅ Crawl All completed!');
  };

  // Handle clone image drop
  const handleCloneImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const base64 = await fileToBase64(files[0]);
      setCloneImage(base64);
      setClonedPattern(null); // Reset cloned pattern when new image is dropped
    }
  };

  // Handle paste image for clone
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (workspaceMode !== 'clone') return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const base64 = await fileToBase64(file);
            setCloneImage(base64);
            setClonedPattern(null); // Reset cloned pattern when new image is pasted
          }
          break;
        }
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [workspaceMode]);

  const handleCloneImageSelect = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      if (e.target.files[0]) {
        const base64 = await fileToBase64(e.target.files[0]);
        setCloneImage(base64);
        setClonedPattern(null); // Reset cloned pattern when new image is selected
      }
    };
    input.click();
  };

  const onEditRegenerate = async (prompt: string, currentImage: string) => {
    if (!editTarget) return;
    try {
      const batches = getActiveBatches();
      const b = batches.find(x => x.id === editTarget.batchId);
      const newB64 = await generatePodImage([], prompt, currentImage, editTarget.mode, b?.name || "design");
      setEditTarget(prev => prev ? { ...prev, data: newB64 } : null);
      setActiveBatches(p => p.map(b => {
        if (b.id === editTarget.batchId) {
          const keyMap: Record<string, keyof BatchItem> = { 'pro': 'resultsPro', 'normal': 'resultsNormal', 'white': 'resultsWhite', 'pattern': 'resultsPattern' };
          const key = keyMap[editTarget.mode];
          return { ...b, [key]: (b[key] as string[]).map((r, i) => (i === editTarget.index) ? newB64 : r) };
        }
        return b;
      }));
    } catch (e) { alert(e); }
  };

  const handleKeywordClick = (keyword: string) => {
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
    // Mở một cửa sổ mới (popup) thay vì tab mới
    const windowFeatures = 'width=1200,height=900,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes';
    window.open(searchUrl, `amazon_search_${keyword.replace(/\s+/g, '_')}`, windowFeatures);
  };

  // Kéo thả logic cho từng slot
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (slotId: string) => {
    setDragSlotId(slotId);
  };

  const handleDragLeave = () => {
    setDragSlotId(null);
  };

  const handleDropOnSlot = async (e: React.DragEvent, batchId: string, idx: number) => {
    e.preventDefault();
    setDragSlotId(null);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        await handleInputDropAdd(batchId, file, idx);
      }
    }
  };

  const activeBatches = getActiveBatches();

  return (
    <div ref={containerRef} className="min-h-screen bg-[#F8FAFC] flex">
      <aside className="w-20 bg-white border-r border-slate-100 flex flex-col items-center py-8 gap-10 fixed h-full z-40">
         <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white font-black text-lg">3D</div>
         <nav className="flex flex-col gap-6">
            <button 
              onClick={() => setWorkspaceMode('generate')}
              title="Generate Workspace"
              className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-all ${workspaceMode === 'generate' ? 'bg-violet-50 text-violet-600 border border-violet-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
            >
               <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
               <span className="text-[7px] font-black">GEN</span>
            </button>
            <button 
              onClick={() => setWorkspaceMode('clone')}
              title="Clone Workspace"
              className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-all ${workspaceMode === 'clone' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
            >
               <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
               <span className="text-[7px] font-black">CLONE</span>
            </button>
         </nav>
      </aside>

      <main className="flex-1 ml-20 pb-20" style={{ width: 'calc(100% - 80px)' }}>
        <div className="flex relative" style={{ width: '100%' }}>
          {/* LEFT COLUMN - Inputs & Insights */}
          <div 
            style={{ width: `${leftColumnWidth}%` }} 
            className="min-h-screen overflow-y-auto px-6 pt-10 pb-20 custom-scrollbar transition-[width] duration-75"
          >
          
          {/* CLONE WORKSPACE */}
          {workspaceMode === 'clone' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-5">
                   <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg bg-emerald-600">
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                   </div>
                   <div>
                     <h1 className="text-xl font-black text-slate-900 uppercase leading-none mb-1">
                        CLONE <span className="text-slate-400">MOCKUP</span>
                     </h1>
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">CONVERT 3D MOCKUP TO PATTERN</p>
                   </div>
                </div>
              </div>
              
              {/* Drop zone for mockup */}
              <div 
                onDragOver={handleDragOver}
                onDrop={handleCloneImageDrop}
                onClick={handleCloneImageSelect}
                className={`bg-white rounded-[40px] border-4 border-dashed p-12 flex flex-col items-center justify-center min-h-[400px] cursor-pointer transition-all hover:border-emerald-300 ${cloneImage ? 'border-emerald-300' : 'border-slate-200'}`}
              >
                {cloneImage ? (
                  <div className="relative group">
                    <img src={cloneImage} className="max-w-full max-h-[350px] object-contain rounded-2xl shadow-lg" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setCloneImage(null); setClonedPattern(null); }}
                      className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                      <svg className="w-12 h-12 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-400 uppercase tracking-tight mb-2">Drop Mockup Image Here</h3>
                    <p className="text-sm text-slate-400">or click to browse</p>
                  </>
                )}
              </div>
              
              {/* Clone button */}
              {cloneImage && !clonedPattern && (
                <button 
                  onClick={handleCloneMockup}
                  disabled={isCloning}
                  className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isCloning ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      CLONING TO PATTERN...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      CLONE TO PATTERN
                    </>
                  )}
                </button>
              )}
              
              {/* Apply to 3D button (shown after cloning) */}
              {clonedPattern && (
                <div className="flex gap-3">
                  <button 
                    onClick={handleApplyClonedPattern}
                    className="flex-1 bg-violet-600 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all flex items-center justify-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    SHOW 3D
                  </button>
                  <button 
                    onClick={() => setClonedPattern(null)}
                    className="px-5 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm uppercase hover:bg-red-50 hover:text-red-500 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              )}
              
              {/* Instructions */}
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                <h4 className="text-sm font-black text-slate-600 uppercase mb-4">How it works</h4>
                <ol className="space-y-3 text-sm text-slate-500">
                  <li className="flex items-start gap-3">
                    <span className="bg-emerald-100 text-emerald-600 w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0">1</span>
                    <span>Drop a T-shirt mockup image (photo or render)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-emerald-100 text-emerald-600 w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0">2</span>
                    <span>AI will analyze the design and recreate it as a 3D Preview</span>
                  </li>
                </ol>
              </div>
            </div>
          )}
          
          {/* GENERATE WORKSPACE */}
          {workspaceMode === 'generate' && (
            <>
          <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-5">
               <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg bg-violet-600">
                 3D
               </div>
               <div>
                 <h1 className="text-xl font-black text-slate-900 uppercase leading-none mb-1">
                    3D DESIGN <span className="text-slate-400">GEN</span>
                 </h1>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">CUT-AND-SEW / ALL-OVER PRINT</p>
               </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
               <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-500">Output Qty:</span>
                  <select value={outputsPerBatch} onChange={e => setOutputsPerBatch(Number(e.target.value))} className="bg-transparent text-sm font-black text-violet-600 focus:outline-none">
                    {[1,2,3,4,5,10].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
               </div>
               <button onClick={() => setShouldStopGlobal(true)} className="bg-red-50 text-red-500 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Emergency Stop</button>
               <button onClick={() => setShowKeywordsInput(true)} className="bg-amber-50 text-amber-600 border border-amber-200 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-all flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                 Keywords
               </button>
               <button 
                 disabled={crawlingBatchId !== null || activeBatches.length === 0 || mockupServerStatus !== 'online'} 
                 onClick={handleCrawlAll} 
                 className="bg-cyan-50 text-cyan-600 border border-cyan-200 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-cyan-100 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {crawlingBatchId === 'all' ? (
                   <>
                     <div className="w-4 h-4 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
                     Crawling...
                   </>
                 ) : (
                   <>
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                     Crawl All
                   </>
                 )}
               </button>
               <button onClick={() => folderInputRef.current?.click()} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-violet-600 transition-all">Import Project</button>
               <button 
                 disabled={isExportingAll || activeBatches.filter(b => b.resultsPattern?.length > 0).length === 0 || mockupServerStatus !== 'online'} 
                 onClick={handleExportAll} 
                 className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {isExportingAll ? (
                   <>
                     <svg className="w-4 h-4" viewBox="0 0 36 36">
                       <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                       <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${exportProgress}, 100`} strokeLinecap="round"/>
                     </svg>
                     {Math.round(exportProgress)}%
                   </>
                 ) : (
                   <>Export All</>
                 )}
               </button>
               <button disabled={isProcessingAll || activeBatches.length === 0} onClick={() => processAllMode('pattern')} className="bg-violet-600 text-white px-8 py-4 rounded-2xl font-black text-[12px] uppercase shadow-lg shadow-violet-100">RUN ALL 3D DESIGN</button>
            </div>
          </div>

          <div className="space-y-8">
            {activeBatches.map((batch, index) => (
              <div key={batch.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm hover:border-indigo-100 transition-all p-8">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-50">
                   <div className="flex items-center gap-6">
                      <div className="px-4 py-2 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm border border-indigo-100 min-w-[70px]">
                         {index + 1} / {activeBatches.length}
                      </div>
                      <button 
                        onClick={() => handleKeywordClick(batch.name)}
                        className="group/kw text-left focus:outline-none"
                      >
                        <h3 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight group-hover/kw:text-indigo-600 transition-colors flex items-center gap-2">
                          {batch.name}
                          <svg className="w-4 h-4 opacity-0 group-hover/kw:opacity-100 transition-opacity text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </h3>
                      </button>
                      {/* Anchor links to Amazon/Etsy */}
                      <div className="flex gap-2 ml-2">
                        <a 
                          href={`https://www.amazon.com/s?k=${encodeURIComponent(batch.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-orange-50 text-orange-600 rounded-lg text-[9px] font-bold uppercase hover:bg-orange-100 transition-all flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.493.13.109.18.054.39-.166.54-.054.04-.108.08-.163.12-.15.11-.336.25-.556.39-.594.39-1.22.755-1.872 1.09-2.19 1.13-4.5 1.69-6.93 1.69-3.08 0-5.98-.63-8.69-1.89-.07-.03-.15-.08-.24-.14-.15-.1-.32-.23-.5-.39-.18-.15-.31-.28-.37-.4-.06-.08-.06-.18 0-.3-.02-.02-.03-.07 0-.13zm5.65-1.91c.075-.16.21-.1.41.02.18.08.31.12.41.15 1.3.37 2.66.56 4.1.56 1.64 0 3.4-.32 5.3-.97.76-.26 1.37-.65 1.82-1.18.08-.1.24-.23.48-.39.24-.16.45-.24.62-.24.17 0 .32.07.45.22l.09.13c.08.13.16.29.24.49.08.2.1.35.07.45-.04.16-.15.32-.34.48-.78.72-1.68 1.24-2.7 1.55-2.3.7-4.46 1.06-6.47 1.06-2.2 0-4.13-.36-5.78-1.08-.1-.04-.18-.1-.23-.18-.05-.08-.02-.2.09-.35l.13-.19.12-.15.13-.13c.08-.07.17-.13.27-.18z"/></svg>
                          Amazon
                        </a>
                        <a 
                          href={`https://www.etsy.com/search?q=${encodeURIComponent(batch.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-[9px] font-bold uppercase hover:bg-orange-100 transition-all flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8.559 1.058c-.163.038-.315.076-.453.114C4.953 2.107 2.715 4.4 1.683 7.635c-.124.396-.23.853-.32 1.37-.09.516-.133 1.016-.133 1.5 0 2.533.666 4.733 2 6.6 1.333 1.867 3.133 3.2 5.4 4 .15.054.343.124.578.21l.578.21c.066.023.166.058.3.103.134.045.239.079.315.1.076.023.168.054.275.094l.275.094c.1.033.21.07.33.11.12.04.21.07.27.09l.15.05c.23.077.39.13.48.16l.18.06c.09.03.15.05.19.06.09.03.14.05.16.05.033 0 .093-.02.18-.06l.18-.06c.1-.03.21-.07.33-.11.12-.04.22-.08.3-.1.08-.02.18-.06.29-.1.11-.03.2-.06.26-.09l.15-.05.33-.11c.21-.07.36-.12.45-.15l.3-.1c.1-.03.22-.08.37-.13l.37-.13c.14-.05.28-.1.43-.16.14-.05.24-.09.29-.11l.15-.06c.19-.073.46-.183.81-.33.35-.147.65-.277.9-.39.25-.113.51-.237.78-.37.27-.133.49-.25.66-.35l.42-.24c.267-.153.52-.313.76-.48.24-.167.457-.33.65-.49l.43-.36.36-.33c.107-.1.23-.22.37-.36.14-.14.26-.267.36-.38l.25-.29c.08-.1.18-.23.29-.38.11-.15.2-.277.26-.38l.15-.23c.067-.1.15-.24.25-.42.1-.18.18-.34.24-.48l.13-.3c.06-.14.13-.32.2-.54.08-.22.14-.413.18-.58l.09-.33c.027-.113.06-.273.1-.48.04-.207.073-.39.1-.55.027-.16.047-.347.06-.56.013-.213.027-.39.04-.53l.02-.21c.007-.087.013-.23.02-.43.007-.2.01-.38.01-.54 0-.36-.02-.75-.06-1.17-.04-.42-.1-.82-.18-1.2l-.15-.66c-.047-.18-.11-.39-.19-.63-.08-.24-.15-.453-.21-.64l-.13-.36c-.053-.14-.127-.32-.22-.54-.093-.22-.177-.413-.25-.58l-.13-.28c-.053-.1-.13-.24-.23-.42-.1-.18-.19-.337-.27-.47l-.17-.28c-.08-.12-.18-.27-.31-.45-.13-.18-.25-.34-.36-.48l-.22-.27c-.093-.113-.21-.253-.35-.42-.14-.167-.27-.31-.39-.43l-.24-.24c-.08-.08-.2-.19-.35-.33-.15-.14-.29-.263-.42-.37l-.27-.22c-.147-.12-.337-.267-.57-.44-.233-.173-.44-.317-.62-.43l-.36-.22c-.113-.067-.27-.16-.47-.28-.2-.12-.38-.22-.54-.3l-.33-.16c-.127-.06-.3-.14-.52-.24-.22-.1-.42-.187-.6-.26l-.38-.15c-.06-.023-.19-.07-.39-.14-.2-.07-.38-.127-.54-.17l-.33-.09c-.113-.033-.29-.08-.53-.14-.24-.06-.457-.107-.65-.14l-.38-.07c-.127-.027-.32-.06-.58-.1-.26-.04-.5-.07-.72-.09l-.44-.04c-.087-.007-.243-.017-.47-.03-.227-.013-.437-.02-.63-.02-.347 0-.723.03-1.13.09-.407.06-.79.133-1.15.22l-.56.14c-.173.047-.393.113-.66.2-.267.087-.507.17-.72.25l-.44.16c-.14.053-.333.137-.58.25-.247.113-.47.22-.67.32l-.41.2c-.113.06-.27.15-.47.27-.2.12-.38.233-.54.34l-.33.22c-.12.08-.287.2-.5.36-.213.16-.407.313-.58.46l-.35.3c-.093.08-.227.203-.4.37-.173.167-.33.323-.47.47l-.28.29c-.08.087-.197.217-.35.39-.153.173-.29.33-.41.47l-.24.28c-.087.107-.21.27-.37.49-.16.22-.303.423-.43.61l-.25.38c-.107.167-.25.4-.43.7-.18.3-.337.573-.47.82l-.26.5c-.053.107-.133.28-.24.52-.107.24-.2.46-.28.66l-.17.42c-.047.113-.11.293-.19.54-.08.247-.15.477-.21.69l-.12.44c-.053.2-.117.467-.19.8-.073.333-.13.64-.17.92l-.08.55c-.02.16-.043.39-.07.69-.027.3-.043.58-.05.84l-.01.52c0 .187 0 .463 0 .83 0 .367.017.697.05.99.033.293.07.56.11.8.04.24.09.49.15.75l.12.52c.047.18.11.397.19.65.08.253.157.477.23.67.073.193.16.4.26.62.1.22.193.413.28.58l.17.34c.08.147.19.34.33.58.14.24.273.453.4.64l.25.37c.087.12.21.287.37.5.16.213.31.403.45.57l.28.33c.1.113.24.263.42.45.18.187.347.35.5.49l.31.28c.12.1.29.24.51.42.22.18.423.337.61.47l.38.27c.133.087.32.207.56.36.24.153.463.287.67.4l.42.23c.14.073.337.17.59.29.253.12.483.22.69.3l.42.16c.147.053.353.123.62.21.267.087.51.157.73.21l.45.11c.16.033.39.077.69.13.3.053.577.09.83.11l.51.04c.173.013.423.02.75.02.34 0 .64-.017.9-.05.26-.033.5-.073.72-.12.22-.047.443-.11.67-.19.227-.08.427-.16.6-.24l.35-.16c.107-.053.257-.133.45-.24.193-.107.367-.21.52-.31l.31-.2c.093-.067.227-.17.4-.31.173-.14.327-.27.46-.39l.27-.24c.087-.08.21-.2.37-.36.16-.16.3-.31.42-.45l.24-.28c.087-.113.21-.28.37-.5.16-.22.3-.42.42-.6l.24-.36c.08-.127.19-.31.33-.55.14-.24.267-.463.38-.67l.23-.41c.06-.113.15-.29.27-.53.12-.24.22-.46.3-.66l.17-.42c.06-.16.14-.387.24-.68.1-.293.18-.56.24-.8l.12-.49c.04-.173.09-.42.15-.74.06-.32.1-.613.12-.88l.04-.53c.02-.207.03-.49.03-.85 0-.333-.013-.64-.04-.92-.027-.28-.06-.537-.1-.77-.04-.233-.093-.48-.16-.74-.067-.26-.133-.49-.2-.69l-.13-.4c-.053-.153-.133-.363-.24-.63-.107-.267-.21-.503-.31-.71l-.2-.41c-.087-.167-.21-.39-.37-.67-.16-.28-.313-.527-.46-.74l-.29-.43c-.113-.153-.27-.36-.47-.62-.2-.26-.39-.487-.57-.68l-.36-.39c-.12-.127-.29-.297-.51-.51-.22-.213-.423-.397-.61-.55l-.38-.31c-.14-.107-.34-.253-.6-.44-.26-.187-.5-.347-.72-.48l-.44-.27c-.16-.093-.38-.217-.66-.37-.28-.153-.533-.28-.76-.38l-.46-.21c-.173-.073-.41-.163-.71-.27-.3-.107-.57-.193-.81-.26l-.48-.13c-.18-.04-.43-.09-.75-.15-.32-.06-.613-.103-.88-.13l-.53-.05c-.213-.02-.51-.03-.89-.03-.533 0-1.013.03-1.44.09-.427.06-.82.133-1.18.22l-.57.14c-.173.047-.41.117-.71.21-.3.093-.573.187-.82.28l-.5.19c-.14.053-.34.137-.6.25-.26.113-.497.227-.71.34l-.43.23c-.127.073-.307.187-.54.34-.233.153-.45.3-.65.44l-.4.29c-.12.1-.29.247-.51.44-.22.193-.423.38-.61.56l-.38.36c-.1.1-.24.25-.42.45-.18.2-.347.39-.5.57l-.31.36c-.1.12-.24.3-.42.54-.18.24-.343.463-.49.67l-.29.42c-.093.14-.22.343-.38.61-.16.267-.307.517-.44.75l-.27.47c-.087.16-.2.38-.34.66-.14.28-.26.537-.36.77l-.21.48c-.067.16-.153.39-.26.69-.107.3-.193.573-.26.82l-.13.5c-.053.2-.117.473-.19.82-.073.347-.127.663-.16.95l-.07.57c-.02.193-.037.47-.05.83-.013.36-.02.69-.02.99 0 .393.013.753.04 1.08.027.327.063.633.11.92.047.287.1.563.16.83.06.267.133.523.22.77l.17.5c.047.133.117.32.21.56.093.24.183.453.27.64l.17.38c.08.16.19.373.33.64.14.267.273.5.4.7l.25.4c.093.14.227.333.4.58.173.247.333.463.48.65l.29.37c.1.12.243.287.43.5.187.213.36.397.52.55l.32.31c.12.11.29.26.51.45.22.19.423.353.61.49l.38.27c.147.1.35.237.61.41.26.173.5.32.72.44l.44.24c.16.087.38.2.66.34.28.14.537.257.77.35l.47.19c.16.06.39.14.69.24.3.1.573.18.82.24l.5.12c.193.047.467.1.82.16.353.06.68.103.98.13l.6.05c.193.013.473.02.84.02.587 0 1.127-.04 1.62-.12.493-.08.947-.183 1.36-.31l.65-.2c.18-.06.423-.153.73-.28.307-.127.58-.25.82-.37l.48-.24c.18-.1.42-.247.72-.44.3-.193.567-.377.8-.55l.47-.35c.14-.113.337-.277.59-.49.253-.213.48-.42.68-.62l.4-.4c.127-.133.3-.323.52-.57.22-.247.42-.48.6-.7l.36-.44c.12-.16.287-.39.5-.69.213-.3.4-.577.56-.83l.32-.51c.113-.193.26-.457.44-.79.18-.333.337-.643.47-.93l.27-.58c.06-.14.147-.353.26-.64.113-.287.21-.55.29-.79l.17-.49c.053-.173.123-.42.21-.74.087-.32.157-.613.21-.88l.11-.53c.04-.2.087-.48.14-.84.053-.36.09-.69.11-.99l.04-.6c.02-.227.03-.543.03-.95 0-.68-.043-1.307-.13-1.88-.087-.573-.2-1.1-.34-1.58l-.22-.72c-.08-.227-.197-.523-.35-.89-.153-.367-.303-.693-.45-.98l-.29-.57c-.113-.213-.273-.49-.48-.83-.207-.34-.403-.643-.59-.91l-.37-.53c-.14-.193-.333-.443-.58-.75-.247-.307-.48-.577-.7-.81l-.44-.47c-.147-.153-.353-.357-.62-.61-.267-.253-.513-.47-.74-.65l-.45-.36c-.16-.12-.383-.283-.67-.49-.287-.207-.55-.38-.79-.52l-.48-.28c-.173-.093-.41-.22-.71-.38-.3-.16-.573-.293-.82-.4l-.5-.22c-.18-.073-.43-.167-.75-.28-.32-.113-.61-.203-.87-.27l-.52-.13c-.2-.047-.477-.1-.83-.16-.353-.06-.68-.103-.98-.13l-.6-.05c-.193-.013-.473-.02-.84-.02-.413 0-.797.023-1.15.07-.353.047-.68.11-.98.19l-.47.12c-.14.04-.337.1-.59.18-.253.08-.483.163-.69.25l-.42.18c-.12.053-.29.137-.51.25-.22.113-.42.227-.6.34l-.36.23c-.12.08-.287.2-.5.36-.213.16-.407.317-.58.47l-.35.31c-.1.093-.243.233-.43.42-.187.187-.357.367-.51.54l-.31.35c-.107.127-.257.313-.45.56-.193.247-.367.48-.52.7l-.31.44c-.093.14-.22.343-.38.61-.16.267-.303.517-.43.75l-.26.47c-.08.153-.19.373-.33.66-.14.287-.26.55-.36.79l-.2.48c-.067.167-.153.407-.26.72-.107.313-.193.6-.26.86l-.13.52c-.047.193-.1.467-.16.82-.06.353-.103.677-.13.97l-.05.58c-.013.193-.02.473-.02.84 0 .533.027 1.017.08 1.45.053.433.127.827.22 1.18l.15.54c.047.16.117.377.21.65.093.273.187.517.28.73l.19.43c.087.173.21.403.37.69.16.287.313.543.46.77l.29.45c.1.147.247.35.44.61.193.26.377.487.55.68l.35.39c.127.133.303.31.53.53.227.22.437.41.63.57l.39.32c.147.113.353.267.62.46.267.193.513.357.74.49l.45.27c.153.087.37.203.65.35.28.147.537.27.77.37l.47.2c.173.073.42.163.74.27.32.107.613.193.88.26l.53.13c.2.047.48.1.84.16.36.06.693.103 1 .13l.61.05c.2.013.49.02.87.02.573 0 1.1-.037 1.58-.11.48-.073.92-.167 1.32-.28l.63-.18c.18-.053.42-.137.72-.25.3-.113.573-.23.82-.35l.5-.24c.153-.08.363-.2.63-.36.267-.16.507-.317.72-.47l.43-.31c.14-.107.333-.263.58-.47.247-.207.47-.407.67-.6l.4-.39c.127-.133.3-.32.52-.56.22-.24.42-.467.6-.68l.36-.43c.12-.153.283-.373.49-.66.207-.287.393-.553.56-.8l.33-.49c.107-.167.247-.4.42-.7.173-.3.327-.577.46-.83l.27-.51c.08-.16.19-.39.33-.69.14-.3.26-.573.36-.82l.2-.5c.073-.193.163-.46.27-.8.107-.34.193-.65.26-.93l.13-.56c.053-.227.11-.543.17-.95.06-.407.1-.78.12-1.12l.04-.68c.007-.2.01-.487.01-.86 0-.587-.033-1.123-.1-1.61-.067-.487-.153-.933-.26-1.34l-.17-.63c-.067-.213-.17-.5-.31-.86-.14-.36-.28-.68-.42-.96l-.28-.56c-.113-.213-.27-.49-.47-.83-.2-.34-.39-.647-.57-.92l-.36-.55c-.127-.18-.307-.42-.54-.72-.233-.3-.45-.567-.65-.8l-.4-.47c-.133-.147-.32-.34-.56-.58-.24-.24-.46-.45-.66-.63l-.4-.36c-.153-.127-.367-.3-.64-.52-.273-.22-.523-.407-.75-.56l-.45-.31c-.167-.107-.4-.25-.7-.43-.3-.18-.573-.333-.82-.46l-.5-.26c-.187-.093-.447-.21-.78-.35-.333-.14-.637-.253-.91-.34l-.55-.18c-.213-.06-.513-.133-.9-.22-.387-.087-.747-.15-1.08-.19l-.66-.08c-.22-.02-.53-.037-.93-.05-.4-.013-.773-.02-1.12-.02-.473 0-.913.027-1.32.08-.407.053-.783.127-1.13.22l-.54.15c-.16.053-.383.133-.67.24-.287.107-.547.22-.78.34l-.47.24c-.14.08-.337.2-.59.36-.253.16-.483.32-.69.48l-.42.32c-.12.1-.29.25-.51.45-.22.2-.42.393-.6.58l-.36.38c-.113.12-.27.3-.47.54-.2.24-.38.467-.54.68l-.32.42c-.107.147-.253.36-.44.64-.187.28-.353.54-.5.78l-.29.48c-.093.16-.22.39-.38.69-.16.3-.3.577-.42.83l-.24.51c-.067.16-.16.39-.28.69-.12.3-.22.573-.3.82l-.16.5c-.06.193-.133.467-.22.82-.087.353-.153.677-.2.97l-.09.58c-.033.227-.06.543-.08.95-.02.407-.03.78-.03 1.12z"/></svg>
                          Etsy
                        </a>
                      </div>
                   </div>
                   <div className="flex gap-2">
                      <button 
                        onClick={() => handleAnalyzeInsights(batch.id)} 
                        disabled={batch.isAnalyzingInsights}
                        className="bg-indigo-50 text-indigo-600 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-3 border border-indigo-100 hover:bg-indigo-100 transition-all disabled:opacity-50"
                      >
                         {batch.isAnalyzingInsights ? (
                           <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                         ) : (
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                         )}
                         PHÂN TÍCH INSIGHT
                      </button>
                      <button onClick={() => removeBatchById(batch.id)} className="bg-red-500 text-white px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-3">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                         DELETE
                      </button>
                   </div>
                </div>

                <div className="flex flex-col gap-8">
                  {/* INPUTS ROW */}
                  <div className="flex flex-col gap-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">INPUTS (DRAG & DROP TO REPLACE/ADD)</label>
                    <div className="flex flex-row gap-2 flex-wrap">
                      {[0, 1, 2, 3, 4].map(idx => {
                        const img = batch.images[idx];
                        const slotId = `${batch.id}-${idx}`;
                        const isDraggingOver = dragSlotId === slotId;
                        
                        return (
                          <div 
                            key={img?.id || idx} 
                            onDragOver={handleDragOver}
                            onDragEnter={() => handleDragEnter(slotId)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDropOnSlot(e, batch.id, idx)}
                            className={`w-32 h-44 rounded-2xl border-2 shadow-sm overflow-hidden bg-slate-50/50 cursor-pointer transition-all relative group shrink-0 ${isDraggingOver ? 'border-violet-600 border-dashed bg-violet-50/30 scale-105 z-10' : 'border-slate-50 hover:ring-2 hover:ring-violet-500/10'}`}
                          >
                            {img ? (
                              <>
                                <img src={img.preview} onClick={() => setZoomImage(img.preview)} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                   <span className="text-[8px] text-white font-black uppercase tracking-widest bg-violet-600/80 px-2 py-1 rounded-full">REPLACE</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); setActiveBatches(p => p.map(b => b.id === batch.id ? {...b, images: b.images.filter(i => i.id !== img.id)} : b)); }} className="absolute top-2 right-2 z-30 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
                              </>
                            ) : (
                              <div onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e: any) => e.target.files[0] && handleInputDropAdd(batch.id, e.target.files[0], idx); input.click(); }} className="w-full h-full flex flex-col items-center justify-center text-slate-200 hover:text-violet-400 transition-colors bg-white/50">
                                 <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                                 <span className="text-[7px] font-black uppercase tracking-widest opacity-40">ADD</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* GENERATE BUTTON */}
                  <div className="flex items-center justify-between border-b border-violet-100 pb-4">
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-black text-violet-500 uppercase tracking-[0.2em]">GENERATE 3D DESIGN</label>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => processBatch(batch.id, 'pattern')} 
                        disabled={batch.status === 'processing'}
                        className="bg-violet-600 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase disabled:opacity-50"
                      >
                        {batch.status === 'processing' && batch.processingMode === 'pattern' ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            GENERATING...
                          </span>
                        ) : 'RUN 3D'}
                      </button>
                      {batch.resultsPattern.length > 0 && (
                        <button 
                          onClick={() => {
                            // Force re-trigger by setting null first, then the image
                            setCurrent3DImage(null);
                            setTimeout(() => setCurrent3DImage(batch.resultsPattern[0]), 50);
                          }} 
                          className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          SHOW 3D
                        </button>
                      )}
                    </div>
                  </div>
                  
{/* Generated output preview - hidden, auto apply to 3D */}

                  {/* INSIGHTS SECTION */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${batch.insights ? 'bg-emerald-500' : 'bg-slate-200 animate-pulse'}`} />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CUSTOMER INSIGHT ANALYSIS</span>
                    </div>
                    <div className="p-6 rounded-[24px] border-2 border-dashed border-slate-100 bg-slate-50/30 min-h-[300px] max-h-[500px] overflow-y-auto custom-scrollbar">
                      {batch.isAnalyzingInsights ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-4" />
                          <span className="text-sm font-black text-slate-500 uppercase animate-pulse tracking-widest">Đang giải mã Insight...</span>
                        </div>
                      ) : batch.insights ? (
                        <div className="prose prose-slate prose-sm max-w-none whitespace-pre-line text-slate-700 font-medium text-sm">
                          {batch.insights.split('\n').map((line, lIdx) => {
                             if (line.startsWith('Keyword sản phẩm:')) return <div key={lIdx} className="text-lg font-black text-violet-600 mb-4">{line}</div>;
                             if (line.includes('🖌') || line.includes('💡') || line.includes('🧍')) return <div key={lIdx} className="text-sm font-black text-slate-900 mt-6 mb-3 uppercase tracking-tight border-b border-slate-200 pb-2">{line}</div>;
                             if (line.startsWith('Kết luận:')) return <div key={lIdx} className="mt-6 p-4 bg-violet-50 rounded-xl border border-violet-100 text-violet-900 font-bold italic">{line}</div>;
                             return <div key={lIdx} className="mb-1.5 leading-relaxed">{line}</div>;
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 opacity-40">
                          <svg className="w-12 h-12 text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                          <span className="text-xs font-black uppercase text-slate-400 tracking-widest text-center">Chưa có dữ liệu phân tích</span>
                          <p className="text-[10px] text-slate-400 font-bold uppercase text-center mt-2">Click "PHÂN TÍCH INSIGHT" để AI quét dữ liệu</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {activeBatches.length === 0 && (
              <div className="py-40 flex flex-col items-center justify-center border-4 border-dashed border-slate-100 rounded-[60px] bg-white/50">
                 <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-8 shadow-sm border border-slate-100"><svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></div>
                 <h2 className="text-xl font-black text-slate-400 uppercase tracking-tighter">No 3D Projects Loaded</h2>
                 <p className="text-sm text-slate-400 mt-2">Import folders to extract themes and generate 3D assets.</p>
                 <button onClick={() => folderInputRef.current?.click()} className="mt-8 text-white px-8 py-4 rounded-3xl font-black text-[12px] uppercase shadow-2xl bg-violet-600 shadow-violet-100">Upload Folder</button>
              </div>
            )}
          </div>
          </>
          )}
          </div>
          
          {/* RESIZABLE DIVIDER */}
          <div 
            onMouseDown={handleMouseDown}
            className={`absolute top-0 bottom-0 w-2 cursor-col-resize z-40 group transition-colors ${isResizing ? 'bg-violet-500' : 'bg-transparent hover:bg-violet-200'}`}
            style={{ left: `${leftColumnWidth}%`, transform: 'translateX(-50%)' }}
          >
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-16 rounded-full transition-colors ${isResizing ? 'bg-white' : 'bg-slate-300 group-hover:bg-violet-400'}`} />
          </div>
          
          {/* RIGHT COLUMN - Fixed 3D T-Shirt Viewer */}
          <div 
            style={{ width: `calc((100vw - 80px) * ${(100 - leftColumnWidth) / 100})` }} 
            className="h-screen fixed top-0 right-0 p-6 bg-white border-l border-slate-100 flex flex-col z-30 transition-[width] duration-75"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white font-black text-sm">3D</div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">T-SHIRT PREVIEW</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Live 3D Model • Drag divider to resize</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                  {Math.round(leftColumnWidth)}% / {Math.round(100 - leftColumnWidth)}%
                </span>
                {current3DImage && (
                  <>
                    <button 
                      onClick={() => setShowEditPanel(true)} 
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-indigo-700 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      Edit
                    </button>
                    <button 
                      onClick={handleExportMockup}
                      disabled={isExportingMockup || mockupServerStatus !== 'online'}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExportingMockup ? (
                        <>
                          {/* Circular progress indicator */}
                          <svg className="w-5 h-5" viewBox="0 0 36 36">
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke="rgba(255,255,255,0.3)"
                              strokeWidth="3"
                            />
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              strokeDasharray={`${exportProgress}, 100`}
                              strokeLinecap="round"
                            />
                          </svg>
                          {Math.round(exportProgress)}%
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          Export
                        </>
                      )}
                    </button>
                    {mockupServerStatus === 'offline' && (
                      <span className="text-[9px] text-red-500 font-bold">Server Offline</span>
                    )}
                    <button 
                      onClick={() => setCurrent3DImage(null)} 
                      className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex-1 rounded-3xl overflow-hidden relative">
              {current3DImage ? (
                <Suspense fallback={
                  <div className="w-full h-full bg-slate-100 rounded-3xl flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
                      <span className="text-xs font-black uppercase tracking-widest text-slate-400">Loading 3D Model...</span>
                    </div>
                  </div>
                }>
                  <TShirt3DViewer 
                    newImageBase64={current3DImage} 
                    onApplyComplete={() => console.log('Applied to 3D model')}
                  />
                </Suspense>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl flex flex-col items-center justify-center">
                  <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8 shadow-sm border border-slate-100">
                    <svg className="w-16 h-16 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                  </div>
                  <h3 className="text-xl font-black text-slate-300 uppercase tracking-tight mb-2">Nothing Applied Yet...</h3>
                  <p className="text-sm text-slate-400 text-center max-w-xs">Click Run 3D from the left panel or use Clone workspace to create 3D Designs</p>
                </div>
              )}
              
              {/* Edit Panel Bubble - Small floating panel */}
              {showEditPanel && current3DImage && (
                <div className="absolute bottom-4 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
                  {/* Header */}
                  <div className="flex items-center justify-between p-3 border-b border-slate-100">
                    <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      Edit Pattern
                    </h3>
                    <button onClick={() => setShowEditPanel(false)} className="p-1 hover:bg-slate-100 rounded-full">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                  
                  {/* Content */}
                  <div className="p-3 space-y-3">
                    {/* Edit prompt */}
                    <textarea 
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="e.g., xóa text ở mặt trước, đổi màu áo sang đỏ..."
                      className="w-full h-20 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleEditPattern('redesign')}
                        disabled={isEditing || !editPrompt.trim()}
                        className="flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        {isEditing && editMode === 'redesign' ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>🎨 Redesign</>
                        )}
                      </button>
                      <button 
                        onClick={() => handleEditPattern('creative')}
                        disabled={isEditing || !editPrompt.trim()}
                        className="flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-violet-600 text-white hover:bg-violet-700"
                      >
                        {isEditing && editMode === 'creative' ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>✨ Creative</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <input 
        type="file" 
        ref={folderInputRef} 
        className="hidden" 
        multiple 
        onChange={handleFolderUpload} 
        {...({ webkitdirectory: '', directory: '' } as any)} 
      />
      
      {editTarget && (
        <EditModal 
          image={editTarget.data} 
          batchName={activeBatches.find(b => b.id === editTarget.batchId)?.name || 'design'}
          onClose={() => setEditTarget(null)} 
          onSave={(newB64, applyToAll) => {
            const keyMap: Record<string, keyof BatchItem> = { 'pro': 'resultsPro', 'normal': 'resultsNormal', 'white': 'resultsWhite', 'pattern': 'resultsPattern' };
            const key = keyMap[editTarget.mode];
            setActiveBatches(p => p.map(b => b.id === editTarget.batchId ? { ...b, [key]: (b[key] as string[]).map((r, i) => (i === editTarget.index || applyToAll) ? newB64 : r) } : b));
            if (!applyToAll) setEditTarget(prev => prev ? { ...prev, data: newB64 } : null);
          }}
          onRegenerate={onEditRegenerate}
        />
      )}
      
      {zoomImage && <Lightbox image={zoomImage} onClose={() => setZoomImage(null)} />}

      {/* Export Result Modal */}
      {showExportResult && (exportedPrint || exportedMockup) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase">Export Complete!</h2>
                  <p className="text-sm text-slate-500">Your mockup files are ready to download</p>
                </div>
              </div>
              <button 
                onClick={() => setShowExportResult(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            {/* Content - Images Grid */}
            <div className="p-6 grid grid-cols-2 gap-6">
              {/* PRINT File */}
              {exportedPrint && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900 uppercase">PRINT.png</span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">Print File</span>
                  </div>
                  <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
                    <img src={exportedPrint} alt="PRINT" className="w-full h-full object-contain" />
                  </div>
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.download = 'PRINT.png';
                      link.href = exportedPrint;
                      link.click();
                    }}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Download PRINT
                  </button>
                </div>
              )}
              
              {/* Mockup File */}
              {exportedMockup && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900 uppercase">Mockup.png</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Main Image</span>
                  </div>
                  <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
                    <img src={exportedMockup} alt="Mockup" className="w-full h-full object-contain" />
                  </div>
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.download = 'Mockup.png';
                      link.href = exportedMockup;
                      link.click();
                    }}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Download Mockup
                  </button>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-500">Files are also saved in: <code className="bg-slate-200 px-2 py-1 rounded">3D T shirt/Mockup/</code></p>
              <button
                onClick={() => {
                  // Download both
                  if (exportedPrint) {
                    const link1 = document.createElement('a');
                    link1.download = 'PRINT.png';
                    link1.href = exportedPrint;
                    link1.click();
                  }
                  setTimeout(() => {
                    if (exportedMockup) {
                      const link2 = document.createElement('a');
                      link2.download = 'Mockup.png';
                      link2.href = exportedMockup;
                      link2.click();
                    }
                  }, 500);
                }}
                className="px-6 py-2 bg-violet-600 text-white rounded-xl font-black text-xs uppercase flex items-center gap-2 hover:bg-violet-700 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Download All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keywords Input Modal */}
      {showKeywordsInput && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                  Add Keywords
                </h2>
                <p className="text-xs text-slate-500 mt-1">Paste keywords from Google Sheets (one per line)</p>
              </div>
              <button
                onClick={() => setShowKeywordsInput(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-4">
              <textarea
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="keyword 1&#10;keyword 2&#10;keyword 3&#10;..."
                className="w-full h-64 p-4 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 resize-none"
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{keywordsText.split('\n').filter(k => k.trim()).length} keywords</span>
                <button
                  onClick={() => setKeywordsText('')}
                  className="text-red-500 hover:text-red-600 font-medium"
                >
                  Clear All
                </button>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowKeywordsInput(false)}
                className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddKeywords}
                className="px-6 py-2 bg-yellow-500 text-white rounded-xl font-bold text-sm hover:bg-yellow-600 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                Add {keywordsText.split('\n').filter(k => k.trim()).length} Keywords
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .bg-checkered { background-color: #ffffff; background-image: linear-gradient(45deg, #F8FAFC 25%, transparent 25%), linear-gradient(-45deg, #F8FAFC 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #F8FAFC 75%), linear-gradient(-45deg, transparent 75%, #F8FAFC 75%); background-size: 20px 20px; }
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #F1F5F9; border-radius: 20px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 20px; border: 2px solid #F1F5F9; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-from-bottom { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fade-in 0.2s ease-out forwards; }
        .slide-in-from-bottom-4 { animation: slide-in-from-bottom 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
