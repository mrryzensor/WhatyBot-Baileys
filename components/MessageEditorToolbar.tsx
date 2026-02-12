import React, { useState, useRef, useEffect } from 'react';
import { Bold, Italic, Type, Code, List, Hash, Quote, Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useMessageEditor } from '../hooks/useMessageEditor';

interface MessageEditorToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  variables?: string[];
  showVariables?: boolean;
  showEmojiPickerBelow?: boolean; // true = debajo, false = arriba (default)
}

export const MessageEditorToolbar: React.FC<MessageEditorToolbarProps> = ({
  textareaRef,
  value,
  onChange,
  variables = [],
  showVariables = true,
  showEmojiPickerBelow = false
}) => {
  const editor = useMessageEditor({
    textareaRef,
    onTextChange: onChange,
    variables,
    value
  });

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ top: number; left: number } | null>(null);
  const emojiContainerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiContainerRef.current && !emojiContainerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);

      // Calculate position for fixed emoji picker
      if (emojiButtonRef.current) {
        const rect = emojiButtonRef.current.getBoundingClientRect();
        if (showEmojiPickerBelow) {
          // Show below the button
          setEmojiPickerPosition({
            top: rect.bottom + 4,
            left: rect.left
          });
        } else {
          // Show above the button
          setEmojiPickerPosition({
            top: rect.top,
            left: rect.left
          });
        }
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);


  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = value;
      const newValue = currentValue.substring(0, start) + emojiData.emoji + currentValue.substring(end);

      // Call onChange with the new value
      onChange(newValue);

      // Set cursor position after emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length);
      }, 0);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 bg-theme-base rounded-lg border border-theme relative">

      {/* Emoji Picker Button & Popup */}
      <div className="flex items-center gap-1 pr-2 border-r border-theme">
        <button
          ref={emojiButtonRef}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-1.5 rounded transition-colors ${showEmojiPicker ? 'bg-slate-200 text-yellow-600' : 'hover:bg-slate-200 text-theme-muted'}`}
          title="Insertar Emoji"
          type="button"
        >
          <Smile size={18} />
        </button>
      </div>

      {/* Emoji Picker - Rendered with fixed position */}
      {showEmojiPicker && emojiPickerPosition && (
        <div
          ref={emojiContainerRef}
          className="fixed z-[9999] shadow-xl border border-theme rounded-lg"
          style={
            showEmojiPickerBelow
              ? {
                top: `${emojiPickerPosition.top}px`,
                left: `${emojiPickerPosition.left}px`
              }
              : {
                bottom: `${window.innerHeight - emojiPickerPosition.top + 4}px`,
                left: `${emojiPickerPosition.left}px`
              }
          }
          onMouseDown={(e) => e.stopPropagation()}
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

      {/* Formatting Buttons */}
      <div className="flex items-center gap-1 pr-2 border-r border-theme">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertFormatting('bold')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Negrita (*texto*)"
        >
          <Bold size={16} className="text-theme-muted" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertFormatting('italic')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Cursiva (_texto_)"
        >
          <Italic size={16} className="text-theme-muted" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertFormatting('strikethrough')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Tachado (~texto~)"
        >
          <Type size={16} className="text-theme-muted" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertFormatting('code')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Código alineado (`texto`)"
        >
          <Code size={16} className="text-theme-muted" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertFormatting('monospace')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors text-xs font-mono"
          title="Monoespaciado (```texto```)"
        >
          ```
        </button>
      </div>

      {/* List Buttons */}
      <div className="flex items-center gap-1 pr-2 border-r border-theme">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertBulletList()}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Lista con viñetas (* texto)"
        >
          <List size={16} className="text-theme-muted" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertNumberedList()}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Lista numerada (1. texto)"
        >
          <Hash size={16} className="text-theme-muted" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.insertQuote()}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Cita (> texto)"
        >
          <Quote size={16} className="text-theme-muted" />
        </button>
      </div>

      {/* Variables */}
      {showVariables && variables.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-theme-muted self-center px-1">Variables:</span>
          {variables.map(v => (
            <button
              key={v}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.insertVariable(v)}
              className="text-xs bg-theme-card border border-theme px-2 py-1 rounded hover:bg-slate-100 text-theme-main font-mono"
              title={`Insertar {{${v}}}`}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
