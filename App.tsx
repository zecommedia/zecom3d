
import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { ImageFile, BatchItem, ImageAdjustments } from './types';
import { generatePodImage, analyzeInsights, redesignPattern, creativePattern, cloneMockupToPattern } from './services/geminiService';
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
                    3D PATTERN <span className="text-slate-400">GEN</span>
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
               <button onClick={() => folderInputRef.current?.click()} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-violet-600 transition-all">Import Project</button>
               <button disabled={activeBatches.length === 0} onClick={downloadProject} className="bg-white border border-slate-200 text-slate-900 px-5 py-3 rounded-2xl font-black text-[10px] uppercase">Export ZIP</button>
               <button disabled={isProcessingAll || activeBatches.length === 0} onClick={() => processAllMode('pattern')} className="bg-violet-600 text-white px-8 py-4 rounded-2xl font-black text-[12px] uppercase shadow-lg shadow-violet-100">RUN ALL 3D PATTERN</button>
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
                  <h3 className="text-xl font-black text-slate-300 uppercase tracking-tight mb-2">No Pattern Applied</h3>
                  <p className="text-sm text-slate-400 text-center max-w-xs">Generate a 3D pattern from the left panel or use Clone workspace to convert a mockup</p>
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
