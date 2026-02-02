import React, { useRef, useState, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Center, useGLTF, Decal, OrbitControls } from '@react-three/drei';
import { easing } from 'maath';
import * as THREE from 'three';

/**
 * TShirt3DViewer Component
 * 
 * This component displays a 3D T-shirt model based on the preset configuration
 * from "shirt finale.json". The default shirt color is yellow (#EFBD48).
 * 
 * Preset original image size: 1376x768px
 * Each layer has specific cropInfo to extract the right portion of the image.
 * 
 * IMPORTANT: Layers are ordered in the preset as [Color, Front, Back, Right, Left]
 * When rendering, we use .reverse() so that Left renders first (bottom) and Color renders last (top)
 */

// Preset configuration from "shirt finale.json"
// LAYERS ORDER MATCHES PRESET: Color(7) -> Front(4) -> Back(2) -> Right(3) -> Left(5)
const PRESET_CONFIG = {
  naturalWidth: 1376,
  naturalHeight: 768,
  color: "#EFBD48",
  // Estimated display dimensions (from the cropper UI that created the preset)
  // Based on max display area 800x600 with aspect 1376/768 = 1.79
  estimatedDisplayWidth: 800,
  estimatedDisplayHeight: 447,  // 800 / 1.79
  layers: [
    // Layer 7 - Color Circle (first in preset, renders on TOP after reverse)
    {
      id: 7,
      name: "Color Circle",
      position: [0, 0.33, -0.04],
      rotation: [0.258407346410207, 0, 0],
      scale: [0.2, 0.2, 0.5],
      borderRadius: 50,
      cropInfo: null,
      layerType: 'color'
    },
    // Layer 4 - Front 
    {
      id: 4,
      name: "Front",
      position: [0, 0, 0.07],
      rotation: [0.008407346410207, 0.008407346410207, 0.008407346410207],
      scale: [0.35, 0.7, 0.2],
      borderRadius: 0,
      cropInfo: { x: 317, y: 18.59375, width: 210, height: 435 },
      layerType: 'image'
    },
    // Layer 2 - Back
    {
      id: 2,
      name: "Back",
      position: [0, 0, -0.12],
      rotation: [0.008407346410207, 0.008407346410207, 0.058407346410207],
      scale: [0.35, 0.75, 0.2],
      borderRadius: 0,
      cropInfo: { x: 2, y: 17, width: 273, height: 441 },
      layerType: 'image'
    },
    // Layer 3 - Right Side
    {
      id: 3,
      name: "Right Side",
      position: [0.29, -0.12, -0.07],
      rotation: [-0.341592653589793, -0.441592653589793, -0.141592653589793],
      scale: [0.25, 0.7, 1.15],
      borderRadius: 0,
      cropInfo: { x: 585, y: 29, width: 236, height: 428 },
      layerType: 'image'
    },
    // Layer 5 - Left Side (last in preset, renders FIRST/BOTTOM after reverse)
    {
      id: 5,
      name: "Left Side",
      position: [-0.23, -0.08, 0.01],
      rotation: [0.058407346410207, 0.008407346410207, 0.008407346410207],
      scale: [0.2, 0.65, 1.5],
      borderRadius: 0,
      cropInfo: { x: 585, y: 29, width: 236, height: 428 },
      layerType: 'image'
    }
  ]
};

// Resize image to preset dimensions (1376x768) and return base64
const resizeImageToPreset = (imageSrc: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = PRESET_CONFIG.naturalWidth;
      canvas.height = PRESET_CONFIG.naturalHeight;
      
      // Draw image scaled to fit preset dimensions
      ctx.drawImage(img, 0, 0, PRESET_CONFIG.naturalWidth, PRESET_CONFIG.naturalHeight);
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
};

/**
 * Apply crop to image based on cropInfo (OLD FORMAT - display coordinates)
 * 
 * The cropInfo from preset uses DISPLAY coordinates (from the cropper UI).
 * We need to convert these to NATURAL coordinates before cropping.
 * 
 * displayScaleX = naturalWidth / displayWidth = 1376 / 800 = 1.72
 * displayScaleY = naturalHeight / displayHeight = 768 / 447 = 1.72
 */
const applyCropToImage = (imageSrc: string, cropInfo: { x: number; y: number; width: number; height: number }): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      // Calculate display scale (natural / display)
      const displayScaleX = PRESET_CONFIG.naturalWidth / PRESET_CONFIG.estimatedDisplayWidth;
      const displayScaleY = PRESET_CONFIG.naturalHeight / PRESET_CONFIG.estimatedDisplayHeight;
      
      // Convert display coordinates to natural coordinates
      const natCropX = cropInfo.x * displayScaleX;
      const natCropY = cropInfo.y * displayScaleY;
      const natCropW = cropInfo.width * displayScaleX;
      const natCropH = cropInfo.height * displayScaleY;
      
      // Ensure we don't exceed image bounds
      const safeX = Math.max(0, Math.min(natCropX, img.naturalWidth - 1));
      const safeY = Math.max(0, Math.min(natCropY, img.naturalHeight - 1));
      const safeW = Math.min(natCropW, img.naturalWidth - safeX);
      const safeH = Math.min(natCropH, img.naturalHeight - safeY);
      
      // Set canvas to cropped dimensions
      canvas.width = Math.max(1, Math.round(safeW));
      canvas.height = Math.max(1, Math.round(safeH));
      
      // Draw the cropped portion
      ctx.drawImage(
        img,
        safeX, safeY, safeW, safeH,  // Source rect (natural coords)
        0, 0, canvas.width, canvas.height  // Dest rect
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
};

// Apply border radius to image and return THREE.Texture
const applyBorderRadius = (imageSrc: string, borderRadius: number): Promise<THREE.Texture> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const MIN_SIZE = 512;
      const scale = Math.max(1, MIN_SIZE / Math.min(img.width, img.height));
      const canvasWidth = Math.round(img.width * scale);
      const canvasHeight = Math.round(img.height * scale);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (borderRadius > 0) {
        const minDim = Math.min(canvasWidth, canvasHeight);
        const radius = (borderRadius / 100) * (minDim / 2);
        
        ctx.beginPath();
        if (borderRadius >= 50) {
          ctx.ellipse(canvasWidth / 2, canvasHeight / 2, canvasWidth / 2, canvasHeight / 2, 0, 0, Math.PI * 2);
        } else {
          const x = 0, y = 0, w = canvasWidth, h = canvasHeight;
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + w - radius, y);
          ctx.arcTo(x + w, y, x + w, y + radius, radius);
          ctx.lineTo(x + w, y + h - radius);
          ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
          ctx.lineTo(x + radius, y + h);
          ctx.arcTo(x, y + h, x, y + h - radius, radius);
          ctx.lineTo(x, y + radius);
          ctx.arcTo(x, y, x + radius, y, radius);
        }
        ctx.closePath();
        ctx.clip();
      }
      
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.flipY = true;
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = () => {
      const texture = new THREE.TextureLoader().load(imageSrc);
      resolve(texture);
    };
    img.src = imageSrc;
  });
};

// Get center color from image
const getCenterColor = (imageSrc: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const centerX = Math.floor(img.width / 2);
      const centerY = Math.floor(img.height / 2);
      const pixel = ctx.getImageData(centerX, centerY, 1, 1).data;
      
      const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
      resolve(hex);
    };
    img.onerror = () => resolve('#888888');
    img.src = imageSrc;
  });
};

// Layer Decal Component
interface LayerData {
  id: number;
  image: string;
  visible: boolean;
  position: number[];
  rotation: number[];
  scale: number[];
  borderRadius: number;
  layerType: string;
  color: string | null;
  _updateKey?: number;
  renderOrder?: number;  // Control render order to prevent z-fighting
}

/**
 * LayerDecal - Renders a single decal on the shirt mesh
 * 
 * IMPORTANT: This component is heavily memoized to prevent flickering during rotation.
 * The texture is loaded ONCE when the layer data changes, not on every frame.
 * 
 * Uses depthTest=false and depthWrite=true to prevent z-fighting.
 * renderOrder controls which layer appears on top.
 */
const LayerDecal: React.FC<{ layer: LayerData; index: number }> = React.memo(({ layer, index }) => {
  const textureRef = useRef<THREE.Texture | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Load texture only when layer content changes
  useEffect(() => {
    if (!layer.visible) {
      setIsLoaded(false);
      return;
    }
    
    let isCancelled = false;
    
    const loadTexture = async () => {
      let tex: THREE.Texture;
      
      if (layer.layerType === 'color' && layer.color) {
        const canvas = document.createElement('canvas');
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        
        ctx.clearRect(0, 0, size, size);
        
        if (layer.borderRadius > 0) {
          const radius = (layer.borderRadius / 100) * (size / 2);
          ctx.beginPath();
          if (layer.borderRadius >= 50) {
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          } else {
            ctx.moveTo(radius, 0);
            ctx.lineTo(size - radius, 0);
            ctx.arcTo(size, 0, size, radius, radius);
            ctx.lineTo(size, size - radius);
            ctx.arcTo(size, size, size - radius, size, radius);
            ctx.lineTo(radius, size);
            ctx.arcTo(0, size, 0, size - radius, radius);
            ctx.lineTo(0, radius);
            ctx.arcTo(0, 0, radius, 0, radius);
          }
          ctx.closePath();
          ctx.clip();
        }
        
        ctx.fillStyle = layer.color;
        ctx.fillRect(0, 0, size, size);
        
        tex = new THREE.CanvasTexture(canvas);
        tex.flipY = true;
        tex.needsUpdate = true;
      } else if (layer.image) {
        tex = await applyBorderRadius(layer.image, layer.borderRadius);
      } else {
        return;
      }
      
      if (!isCancelled) {
        // Dispose old texture before setting new one
        if (textureRef.current) {
          textureRef.current.dispose();
        }
        textureRef.current = tex;
        setIsLoaded(true);
      } else {
        tex.dispose();
      }
    };
    loadTexture();
    
    return () => {
      isCancelled = true;
    };
  }, [layer.id, layer.image, layer.color, layer._updateKey, layer.visible, layer.borderRadius, layer.layerType]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, []);
  
  if (!layer.visible || !isLoaded || !textureRef.current) return null;
  
  // Calculate polygon offset based on renderOrder to prevent z-fighting
  // Higher renderOrder = more offset toward camera
  const offsetFactor = -1 - (layer.renderOrder ?? index);
  const offsetUnits = -1 - (layer.renderOrder ?? index);
  
  return (
    <Decal
      position={layer.position as [number, number, number]}
      rotation={layer.rotation as [number, number, number]}
      scale={layer.scale as [number, number, number]}
      map={textureRef.current}
      // Render order: higher = rendered later = appears on top
      renderOrder={layer.renderOrder ?? index}
    >
      {/* Custom material with polygonOffset to prevent z-fighting */}
      <meshStandardMaterial
        attach="material"
        map={textureRef.current}
        transparent={true}
        polygonOffset={true}
        polygonOffsetFactor={offsetFactor}
        polygonOffsetUnits={offsetUnits}
        depthTest={true}
        depthWrite={false}
      />
    </Decal>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if layer content actually changed
  if (prevProps.index !== nextProps.index) return false;
  
  const prev = prevProps.layer;
  const next = nextProps.layer;
  return (
    prev.id === next.id &&
    prev.image === next.image &&
    prev.color === next.color &&
    prev.visible === next.visible &&
    prev._updateKey === next._updateKey &&
    prev.borderRadius === next.borderRadius &&
    prev.layerType === next.layerType &&
    prev.renderOrder === next.renderOrder &&
    prev.position[0] === next.position[0] &&
    prev.position[1] === next.position[1] &&
    prev.position[2] === next.position[2] &&
    prev.rotation[0] === next.rotation[0] &&
    prev.rotation[1] === next.rotation[1] &&
    prev.rotation[2] === next.rotation[2] &&
    prev.scale[0] === next.scale[0] &&
    prev.scale[1] === next.scale[1] &&
    prev.scale[2] === next.scale[2]
  );
});

LayerDecal.displayName = 'LayerDecal';

// TShirt Model Component
interface TShirtProps {
  color: string;
  layers: LayerData[];
}

const TShirt: React.FC<TShirtProps> = React.memo(({ color, layers }) => {
  const { nodes, materials } = useGLTF('/shirt.glb') as any;
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Use ref to store color for useFrame without causing re-renders
  const colorRef = useRef(color);
  colorRef.current = color;
  
  // Memoize visible layers - only recalculate when layers array identity changes
  const visibleLayers = useMemo(() => {
    return layers.filter(l => l.visible);
  }, [layers]);
  
  // Animate color without triggering re-renders
  useFrame((state, delta) => {
    if (meshRef.current && meshRef.current.material) {
      easing.dampC((meshRef.current.material as THREE.MeshStandardMaterial).color, colorRef.current, 0.25, delta);
    }
  });

  return (
    <group scale={11}>
      <mesh
        ref={meshRef}
        castShadow
        geometry={nodes.T_Shirt_male.geometry}
        material={materials.lambert1}
        material-roughness={1}
        dispose={null}
      >
        {visibleLayers.map((layer, index) => (
          <LayerDecal key={layer.id} layer={layer} index={index} />
        ))}
      </mesh>
    </group>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if layers content changed
  if (prevProps.color !== nextProps.color) return false;
  if (prevProps.layers.length !== nextProps.layers.length) return false;
  
  // Compare layers by reference (they should be stable)
  for (let i = 0; i < prevProps.layers.length; i++) {
    if (prevProps.layers[i] !== nextProps.layers[i]) return false;
  }
  return true;
});

TShirt.displayName = 'TShirt';

// Camera Rig for pointer-based rotation
// IMPORTANT: This component must NOT cause re-renders of children
const CameraRig: React.FC<{ children: React.ReactNode }> = React.memo(({ children }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // useFrame does NOT cause re-renders, it runs every frame without React re-render
  useFrame((state, delta) => {
    if (groupRef.current) {
      easing.dampE(
        groupRef.current.rotation,
        [0, -state.pointer.x * 0.3, 0],
        0.25,
        delta
      );
    }
  });
  
  return <group ref={groupRef}>{children}</group>;
});

// Main 3D Viewer Component
interface TShirt3DViewerProps {
  newImageBase64?: string | null;
  onApplyComplete?: () => void;
}

// Default preset color from "shirt finale.json"
const DEFAULT_SHIRT_COLOR = "#EFBD48";

const TShirt3DViewer: React.FC<TShirt3DViewerProps> = ({ newImageBase64, onApplyComplete }) => {
  // Always start with the preset yellow color
  const [shirtColor, setShirtColor] = useState(DEFAULT_SHIRT_COLOR);
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  
  // Memoize layers to prevent re-renders during drag
  const memoizedLayers = useMemo(() => layers, [layers]);
  const memoizedColor = useMemo(() => shirtColor, [shirtColor]);

  // Apply new image to the preset
  useEffect(() => {
    if (!newImageBase64) {
      // Reset to default - no layers, but keep preset yellow color
      setLayers([]);
      setShirtColor(DEFAULT_SHIRT_COLOR);
      return;
    }
    
    const applyNewImage = async () => {
      setIsApplying(true);
      
      try {
        // Step 1: Resize image to preset dimensions (1376x768)
        console.log('[TShirt3D] Resizing image to preset dimensions 1376x768...');
        const resizedImage = await resizeImageToPreset(newImageBase64);
        
        // Step 2: Get center color from resized image for the shirt base color
        const newCenterColor = await getCenterColor(resizedImage);
        console.log('[TShirt3D] Center color extracted:', newCenterColor);
        
        // Step 3: Apply cropInfo to get cropped images for each layer
        // Using exact cropInfo from "shirt finale.json" preset
        
        // Front crop: x=317, y=18.59375, width=210, height=435
        const frontCropped = await applyCropToImage(resizedImage, { x: 317, y: 18.59375, width: 210, height: 435 });
        
        // Back crop: x=2, y=17, width=273, height=441
        const backCropped = await applyCropToImage(resizedImage, { x: 2, y: 17, width: 273, height: 441 });
        
        // Right side crop: x=585, y=29, width=236, height=428
        const rightCropped = await applyCropToImage(resizedImage, { x: 585, y: 29, width: 236, height: 428 });
        
        // Left side crop: x=585, y=29, width=236, height=428 (same as right in preset)
        const leftCropped = await applyCropToImage(resizedImage, { x: 585, y: 29, width: 236, height: 428 });
        
        console.log('[TShirt3D] All crop operations completed');
        
        /**
         * Layer configurations from "shirt finale.json" preset:
         * Each layer uses its cropped portion of the source image
         * 
         * RENDER ORDER: Decals render in array order.
         * Later items in array render ON TOP of earlier items.
         * So we put background layers first, foreground layers last.
         * 
         * Order: Left(bottom) -> Right -> Back -> Front -> Color(top)
         */
        
        // Use fixed IDs to prevent flickering from ID changes
        const timestamp = Date.now();
        
        // Left side layer (renders FIRST - bottom layer)
        const leftSideLayer: LayerData = {
          id: 1,  // Fixed ID
          image: leftCropped,
          visible: true,
          position: [-0.23, -0.08, 0.01],
          rotation: [0.058407346410207, 0.008407346410207, 0.008407346410207],
          scale: [0.2, 0.65, 1.5],
          borderRadius: 0,
          layerType: 'image',
          color: null,
          _updateKey: timestamp,
          renderOrder: 0,  // Bottom layer
        };
        
        // Right side layer
        const rightSideLayer: LayerData = {
          id: 2,  // Fixed ID
          image: rightCropped,
          visible: true,
          position: [0.29, -0.12, -0.07],
          rotation: [-0.341592653589793, -0.441592653589793, -0.141592653589793],
          scale: [0.25, 0.7, 1.15],
          borderRadius: 0,
          layerType: 'image',
          color: null,
          _updateKey: timestamp,
          renderOrder: 1,
        };
        
        // Back image layer
        const backImageLayer: LayerData = {
          id: 3,  // Fixed ID
          image: backCropped,
          visible: true,
          position: [0, 0, -0.12],
          rotation: [0.008407346410207, 0.008407346410207, 0.058407346410207],
          scale: [0.35, 0.75, 0.2],
          borderRadius: 0,
          layerType: 'image',
          color: null,
          _updateKey: timestamp,
          renderOrder: 2,
        };
        
        // Front image layer
        const frontImageLayer: LayerData = {
          id: 4,  // Fixed ID
          image: frontCropped,
          visible: true,
          position: [0, 0, 0.07],
          rotation: [0.008407346410207, 0.008407346410207, 0.008407346410207],
          scale: [0.35, 0.7, 0.2],
          borderRadius: 0,
          layerType: 'image',
          color: null,
          _updateKey: timestamp,
          renderOrder: 3,
        };
        
        // Color circle layer (renders LAST - top layer)
        const colorCircleLayer: LayerData = {
          id: 5,  // Fixed ID
          image: '',
          visible: true,
          position: [0, 0.33, -0.04],
          rotation: [0.258407346410207, 0, 0],
          scale: [0.2, 0.2, 0.5],
          borderRadius: 50,
          layerType: 'color',
          color: newCenterColor,
          _updateKey: timestamp,
          renderOrder: 4,  // Top layer
        };
        
        // Use the center color from the pattern as the shirt color
        setShirtColor(newCenterColor);
        
        /**
         * Layer order: [Left, Right, Back, Front, Color]
         * renderOrder controls which appears on top (higher = on top)
         */
        setLayers([leftSideLayer, rightSideLayer, backImageLayer, frontImageLayer, colorCircleLayer]);
        
        console.log('[TShirt3D] All layers applied successfully');
        onApplyComplete?.();
      } catch (err) {
        console.error('Error applying new image:', err);
      } finally {
        setIsApplying(false);
      }
    };
    
    applyNewImage();
  }, [newImageBase64, onApplyComplete]);

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl overflow-hidden">
      {isApplying && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <span className="text-xs font-black uppercase tracking-widest text-violet-600">Applying to 3D Model...</span>
          </div>
        </div>
      )}
      
      <Canvas
        camera={{ position: [0, 0, 2], fov: 25 }}
        gl={{ preserveDrawingBuffer: true }}
        className="w-full h-full"
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />
        
        <CameraRig>
          <Center>
            <Suspense fallback={null}>
              <TShirt color={memoizedColor} layers={memoizedLayers} />
            </Suspense>
          </Center>
        </CameraRig>
        
        <OrbitControls 
          enablePan={false}
          enableZoom={true}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.5}
        />
      </Canvas>
      
      <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">3D Preview • Drag to rotate</span>
      </div>
    </div>
  );
};

// Preload the model
useGLTF.preload('/shirt.glb');

export default TShirt3DViewer;
