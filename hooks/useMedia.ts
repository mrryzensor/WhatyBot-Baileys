import { useState, useRef } from 'react';

export interface MediaItem {
  file?: File; // Optional for existing files from server
  preview: string;
  caption: string;
  type: 'image' | 'video' | 'document';
  mediaPath?: string; // Server path for existing files
  fileName?: string; // Original filename for existing files
}

interface UseMediaOptions {
  maxFiles?: number;
  initialItems?: MediaItem[];
}

export const useMedia = (options: UseMediaOptions = {}) => {
  const { maxFiles = 50, initialItems = [] } = options;
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialItems);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getMediaType = (file: File): 'image' | 'video' | 'document' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  };

  const createPreview = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: File[]) => {
    const remainingSlots = maxFiles - mediaItems.length;
    const filesToProcess = files.slice(0, remainingSlots);

    if (filesToProcess.length === 0) return;

    // Start progress tracking
    setUploadProgress({ current: 0, total: filesToProcess.length });

    const newMediaItems: MediaItem[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      
      // Update progress
      setUploadProgress({ current: i, total: filesToProcess.length });
      
      // Small delay to allow UI update
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const preview = await createPreview(file);
      newMediaItems.push({
        file,
        preview,
        caption: '',
        type: getMediaType(file)
      });
    }

    // Complete progress
    setUploadProgress({ current: filesToProcess.length, total: filesToProcess.length });
    
    setMediaItems([...mediaItems, ...newMediaItems]);
    
    // Clear progress after a short delay
    setTimeout(() => {
      setUploadProgress(null);
    }, 1000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      await processFiles(files);
    }
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (mediaItems.length >= maxFiles) {
      return;
    }

    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const openFileSelector = () => {
    if (mediaItems.length < maxFiles) {
      fileInputRef.current?.click();
    }
  };

  const removeMedia = (index: number) => {
    const updated = mediaItems.filter((_, i) => i !== index);
    setMediaItems(updated);
  };

  const updateCaption = (index: number, caption: string) => {
    const updated = mediaItems.map((item, i) => 
      i === index ? { ...item, caption } : item
    );
    setMediaItems(updated);
  };

  const clearAll = () => {
    setMediaItems([]);
  };

  return {
    mediaItems,
    setMediaItems,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    processFiles,
    openFileSelector,
    removeMedia,
    updateCaption,
    clearAll,
    maxFiles,
    canAddMore: mediaItems.length < maxFiles,
    uploadProgress
  };
};

