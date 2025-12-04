import React from 'react';
import { Bold, Italic, Type, Code, List, Hash, Quote } from 'lucide-react';
import { useMessageEditor } from '../hooks/useMessageEditor';

interface MessageEditorToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  variables?: string[];
  showVariables?: boolean;
}

export const MessageEditorToolbar: React.FC<MessageEditorToolbarProps> = ({
  textareaRef,
  value,
  onChange,
  variables = [],
  showVariables = true
}) => {
  const editor = useMessageEditor({
    textareaRef,
    onTextChange: onChange,
    variables
  });

  return (
    <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-lg border border-slate-200">
      {/* Formatting Buttons */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
        <button
          onClick={() => editor.insertFormatting('bold')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Negrita (*texto*)"
        >
          <Bold size={16} className="text-slate-600" />
        </button>
        <button
          onClick={() => editor.insertFormatting('italic')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Cursiva (_texto_)"
        >
          <Italic size={16} className="text-slate-600" />
        </button>
        <button
          onClick={() => editor.insertFormatting('strikethrough')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Tachado (~texto~)"
        >
          <Type size={16} className="text-slate-600" />
        </button>
        <button
          onClick={() => editor.insertFormatting('code')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Código alineado (`texto`)"
        >
          <Code size={16} className="text-slate-600" />
        </button>
        <button
          onClick={() => editor.insertFormatting('monospace')}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors text-xs font-mono"
          title="Monoespaciado (```texto```)"
        >
          ```
        </button>
      </div>

      {/* List Buttons */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
        <button
          onClick={() => editor.insertBulletList()}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Lista con viñetas (* texto)"
        >
          <List size={16} className="text-slate-600" />
        </button>
        <button
          onClick={() => editor.insertNumberedList()}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Lista numerada (1. texto)"
        >
          <Hash size={16} className="text-slate-600" />
        </button>
        <button
          onClick={() => editor.insertQuote()}
          className="p-1.5 hover:bg-slate-200 rounded transition-colors"
          title="Cita (> texto)"
        >
          <Quote size={16} className="text-slate-600" />
        </button>
      </div>

      {/* Variables */}
      {showVariables && variables.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-500 self-center px-1">Variables:</span>
          {variables.map(v => (
            <button
              key={v}
              onClick={() => editor.insertVariable(v)}
              className="text-xs bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-100 text-slate-700 font-mono"
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

