import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, X, Image, File, Video, FileText as FileTextIcon, Bold, Italic, Type, Eye, Code, List, Hash, Quote, Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { MediaItem } from '../hooks/useMedia';
import { MessagePreview } from './MessagePreview';
import { MediaThumbnail } from './MediaThumbnail';

interface MediaUploadProps {
  mediaItems: MediaItem[];
  onMediaChange: (items: MediaItem[]) => void;
  maxFiles?: number;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop?: (e: React.DragEvent) => void;
  onOpenFileSelector?: () => void;
  onRemoveMedia?: (index: number) => void;
  onUpdateCaption?: (index: number, caption: string) => void;
  variables?: string[]; // Available variables for insertion
  sampleVariables?: Record<string, string>; // Sample values for preview
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
  mediaItems,
  onMediaChange,
  maxFiles = 50,
  fileInputRef,
  onFileSelect,
  onDrop: externalOnDrop,
  onOpenFileSelector,
  onRemoveMedia,
  onUpdateCaption,
  variables = [],
  sampleVariables = {}
}) => {
  const internalFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedCaptionIndex, setExpandedCaptionIndex] = useState<number | null>(null);
  const captionTextareaRefs = React.useRef<{ [key: number]: HTMLTextAreaElement | null }>({});

  // Emoji picker states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerIndex, setEmojiPickerIndex] = useState<number | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ top: number; left: number } | null>(null);
  const emojiButtonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const emojiContainerRef = useRef<HTMLDivElement>(null);

  const inputRef = fileInputRef || internalFileInputRef;
  const handleFileSelect = onFileSelect || (async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Default behavior if no handler provided
  });

  // Handle emoji picker click outside and position calculation
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiContainerRef.current && !emojiContainerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
        setEmojiPickerIndex(null);
      }
    };

    if (showEmojiPicker && emojiPickerIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside);

      // Calculate position for fixed emoji picker (show above button)
      const button = emojiButtonRefs.current[emojiPickerIndex];
      if (button) {
        const rect = button.getBoundingClientRect();
        setEmojiPickerPosition({
          top: rect.top,
          left: rect.left
        });
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker, emojiPickerIndex]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (mediaItems.length >= maxFiles) {
      return;
    }

    if (externalOnDrop) {
      externalOnDrop(e);
      return;
    }

    // Fallback: create synthetic event for onFileSelect
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0 && onFileSelect) {
      const syntheticEvent = {
        target: { files: files as any }
      } as React.ChangeEvent<HTMLInputElement>;
      await onFileSelect(syntheticEvent);
    }
  };

  const handleClick = () => {
    if (onOpenFileSelector) {
      onOpenFileSelector();
    } else if (inputRef.current) {
      inputRef.current.click();
    }
  };

  // Emoji picker handlers
  const toggleEmojiPicker = (index: number) => {
    if (showEmojiPicker && emojiPickerIndex === index) {
      setShowEmojiPicker(false);
      setEmojiPickerIndex(null);
    } else {
      setShowEmojiPicker(true);
      setEmojiPickerIndex(index);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    if (emojiPickerIndex !== null) {
      const textarea = captionTextareaRefs.current[emojiPickerIndex];
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentValue = mediaItems[emojiPickerIndex].caption;
        const newValue = currentValue.substring(0, start) + emojiData.emoji + currentValue.substring(end);
        updateCaption(emojiPickerIndex, newValue);

        // Set cursor position after emoji
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length);
        }, 0);
      }
    }
  };

  const removeMedia = (index: number) => {
    if (onRemoveMedia) {
      onRemoveMedia(index);
    } else {
      const updated = mediaItems.filter((_, i) => i !== index);
      onMediaChange(updated);
    }
  };

  const updateCaption = (index: number, caption: string) => {
    if (onUpdateCaption) {
      onUpdateCaption(index, caption);
    } else {
      const updated = mediaItems.map((item, i) =>
        i === index ? { ...item, caption } : item
      );
      onMediaChange(updated);
    }
  };

  // Insert text at cursor position in textarea
  const insertTextAtCursor = (index: number, text: string, newCursorPos?: number) => {
    const textarea = captionTextareaRefs.current[index];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = textarea.value;
    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);

    updateCaption(index, newValue);

    // Restore cursor position after text insertion
    setTimeout(() => {
      const updatedTextarea = captionTextareaRefs.current[index];
      if (updatedTextarea) {
        updatedTextarea.focus();
        const cursorPos = newCursorPos !== undefined ? newCursorPos : start + text.length;
        updatedTextarea.setSelectionRange(cursorPos, cursorPos);
      }
    }, 10);
  };

  // Insert formatting
  const insertFormatting = (index: number, format: 'bold' | 'italic' | 'strikethrough' | 'code' | 'monospace') => {
    const textarea = captionTextareaRefs.current[index];
    if (!textarea) return;

    const formats: Record<string, string> = {
      bold: '*',
      italic: '_',
      strikethrough: '~',
      code: '`',
      monospace: '```'
    };

    const symbol = formats[format] || '';
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    if (selectedText) {
      // Wrap selected text
      insertTextAtCursor(index, `${symbol}${selectedText}${symbol}`);
    } else {
      // Insert format markers and position cursor between them
      const cursorPos = start;
      insertTextAtCursor(index, `${symbol}${symbol}`, cursorPos + symbol.length);
    }
  };

  // Insert variable
  const insertVariable = (index: number, variable: string) => {
    insertTextAtCursor(index, `{{${variable}}}`);
  };

  // Insert bullet list
  const insertBulletList = (index: number) => {
    const textarea = captionTextareaRefs.current[index];
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];

    if (currentLine.trim() === '') {
      insertTextAtCursor(index, '* ');
    } else {
      insertTextAtCursor(index, '\n* ');
    }
  };

  // Insert numbered list
  const insertNumberedList = (index: number) => {
    const textarea = captionTextareaRefs.current[index];
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];

    // Find the last numbered item to continue numbering
    let nextNumber = 1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/^(\d+)\.\s/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
        break;
      }
    }

    if (currentLine.trim() === '') {
      insertTextAtCursor(index, `${nextNumber}. `);
    } else {
      insertTextAtCursor(index, `\n${nextNumber}. `);
    }
  };

  // Insert quote
  const insertQuote = (index: number) => {
    const textarea = captionTextareaRefs.current[index];
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];

    if (currentLine.trim() === '') {
      insertTextAtCursor(index, '> ');
    } else {
      insertTextAtCursor(index, '\n> ');
    }
  };

  const getMediaIcon = (type: 'image' | 'video' | 'document') => {
    switch (type) {
      case 'image': return <Image size={16} />;
      case 'video': return <Video size={16} />;
      case 'document': return <FileTextIcon size={16} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleClick}
          disabled={mediaItems.length >= maxFiles}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${mediaItems.length >= maxFiles
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
        >
          <Paperclip size={18} />
          Adjuntar Multimedia
          <span className="text-sm opacity-75">
            ({mediaItems.length}/{maxFiles})
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Drag and Drop Zone - Now clickable */}
      {mediaItems.length < maxFiles && (
        <div
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg transition-colors ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-200 hover:border-blue-300'
            } cursor-pointer`}
        >
          {mediaItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Paperclip size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Arrastra y suelta archivos aquí</p>
              <p className="text-xs mt-1">o haz clic para seleccionar archivos</p>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-slate-500">
              <p className="font-medium">Arrastra más archivos aquí o haz clic para agregar</p>
              <p className="text-xs mt-1 opacity-75">
                {maxFiles - mediaItems.length} espacios disponibles
              </p>
            </div>
          )}
        </div>
      )}

      {/* Media Grid */}
      {mediaItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mediaItems.map((item, index) => (
            <div key={index} className="bg-white border border-slate-200 rounded-lg p-3 space-y-3 relative">
              {/* Preview with delete button in top-right corner */}
              <div className="relative">
                <MediaThumbnail
                  src={item.preview}
                  mediaPath={item.mediaPath}
                  type={item.type}
                  fileName={item.file?.name || item.fileName || 'Archivo'}
                  caption={item.caption}
                />

                {/* Delete button in top-right corner of preview */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMedia(index);
                  }}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-all hover:scale-110 z-10"
                  title="Eliminar"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Header */}
              <div className="flex items-center gap-2 text-sm text-slate-600">
                {getMediaIcon(item.type)}
                <span className="truncate flex-1">{item.file?.name || item.fileName || 'Archivo'}</span>
                {item.mediaPath && !item.file && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Existente</span>
                )}
              </div>

              {/* Caption Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Caption (opcional)
                  </label>
                  <button
                    onClick={() => setExpandedCaptionIndex(expandedCaptionIndex === index ? null : index)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Eye size={12} />
                    {expandedCaptionIndex === index ? 'Ocultar' : 'Vista Previa'}
                  </button>
                </div>

                {/* Formatting Toolbar - Similar to MessageEditorToolbar */}
                <div className="flex flex-wrap gap-1 mb-1 p-1 bg-slate-50 rounded border border-slate-200">
                  {/* Emoji Picker Button */}
                  <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
                    <button
                      ref={(el) => { if (el) emojiButtonRefs.current[index] = el; }}
                      onClick={() => toggleEmojiPicker(index)}
                      className={`p-1.5 rounded transition-colors ${showEmojiPicker && emojiPickerIndex === index ? 'bg-slate-200 text-yellow-600' : 'hover:bg-slate-200 text-slate-600'}`}
                      title="Insertar Emoji"
                      type="button"
                    >
                      <Smile size={18} />
                    </button>
                  </div>

                  {/* Formatting Buttons */}
                  <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
                    <button
                      onClick={() => insertFormatting(index, 'bold')}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Negrita (*texto*)"
                    >
                      <Bold size={16} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => insertFormatting(index, 'italic')}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Cursiva (_texto_)"
                    >
                      <Italic size={16} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => insertFormatting(index, 'strikethrough')}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Tachado (~texto~)"
                    >
                      <Type size={16} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => insertFormatting(index, 'code')}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Código alineado (`texto`)"
                    >
                      <Code size={16} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => insertFormatting(index, 'monospace')}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors text-xs font-mono"
                      title="Monoespaciado (```texto```)"
                    >
                      ```
                    </button>
                  </div>

                  {/* List Buttons */}
                  <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
                    <button
                      onClick={() => insertBulletList(index)}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Lista con viñetas (* texto)"
                    >
                      <List size={16} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => insertNumberedList(index)}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Lista numerada (1. texto)"
                    >
                      <Hash size={16} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => insertQuote(index)}
                      className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                      title="Cita (> texto)"
                    >
                      <Quote size={16} className="text-slate-600" />
                    </button>
                  </div>

                  {/* Variables */}
                  {variables.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-slate-500 self-center px-1">Variables:</span>
                      {variables.map(v => (
                        <button
                          key={v}
                          onClick={() => insertVariable(index, v)}
                          className="text-xs bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-100 text-slate-700 font-mono"
                          title={`Insertar {{${v}}}`}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <textarea
                  ref={(el) => { captionTextareaRefs.current[index] = el; }}
                  data-index={index}
                  value={item.caption}
                  onChange={(e) => updateCaption(index, e.target.value)}
                  placeholder="Añade una descripción para este archivo... Usa *negrita*, _cursiva_, ~tachado~, `código` o {{variables}}"
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded resize-none h-20 focus:outline-none focus:border-blue-500 font-mono"
                  maxLength={1024}
                />
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>{item.caption.length}/1024</span>
                  <span className="text-slate-500">Formatos: *negrita* _cursiva_ ~tachado~ `código`</span>
                </div>

                {/* Preview */}
                {expandedCaptionIndex === index && item.caption && (
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <MessagePreview
                      message={item.caption}
                      variables={sampleVariables}
                      inline={true}
                      showContactInfo={false}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Emoji Picker - Rendered with fixed position above the button */}
      {showEmojiPicker && emojiPickerIndex !== null && emojiPickerPosition && (
        <div
          ref={emojiContainerRef}
          className="fixed z-[9999] shadow-xl border border-slate-200 rounded-lg"
          style={{
            bottom: `${window.innerHeight - emojiPickerPosition.top + 4}px`,
            left: `${emojiPickerPosition.left}px`
          }}
        >
          <style>{`
            /* Hacer el emoji picker más compacto */
            .EmojiPickerReact {
              --epr-emoji-size: 28px !important;
              --epr-category-label-height: 28px !important;
            }
            .EmojiPickerReact .epr-emoji-category-label {
              font-size: 11px !important;
              padding: 4px 8px !important;
            }
            .EmojiPickerReact button.epr-emoji {
              padding: 2px !important;
            }
            .EmojiPickerReact .epr-search-container input {
              font-size: 12px !important;
              padding: 6px 8px 6px 32px !important;
            }
            .EmojiPickerReact .epr-category-nav {
              padding: 4px !important;
            }
            .EmojiPickerReact .epr-category-nav button {
              padding: 4px !important;
            }
          `}</style>
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={Theme.LIGHT}
            searchPlaceholder="Buscar emoji..."
            width={300}
            height={300}
            lazyLoadEmojis={true}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

    </div>
  );
};
