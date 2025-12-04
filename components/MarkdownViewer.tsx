import React from 'react';
import { X, FileText } from 'lucide-react';

interface MarkdownViewerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ isOpen, onClose, title, content }) => {
  if (!isOpen) return null;

  // Parse markdown to HTML
  const parseMarkdown = (text: string) => {
    let html = text;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-slate-800 mb-2 mt-4">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-slate-800 mb-3 mt-6">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-slate-900 mb-4 mt-8">$1</h1>');

    // Bold
    html = html.replace(/\*(.*?)\*/g, '<strong class="font-bold text-slate-900">$1</strong>');

    // Italic
    html = html.replace(/_(.*?)_/g, '<em class="italic text-slate-700">$1</em>');

    // Strikethrough
    html = html.replace(/~(.*?)~/g, '<del class="line-through text-slate-500">$1</del>');

    // Inline code
    html = html.replace(/`(.*?)`/g, '<code class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

    // Code blocks
    html = html.replace(/```(.*?)```/gs, '<pre class="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto my-4"><code>$1</code></pre>');

    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-blue-500 pl-4 py-2 my-2 bg-blue-50 text-slate-700 italic">$1</blockquote>');

    // Lists
    html = html.replace(/^\* (.*$)/gim, '<li class="ml-4 my-1 list-disc text-slate-700">$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li class="ml-4 my-1 list-disc text-slate-700">$1</li>');
    html = html.replace(/^\d+\. (.*$)/gim, '<li class="ml-4 my-1 list-decimal text-slate-700">$1</li>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p class="mb-4 text-slate-700">');
    html = `<p class="mb-4 text-slate-700">${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p class="mb-4 text-slate-700"><\/p>/g, '');
    html = html.replace(/<p class="mb-4 text-slate-700">(.*?)<\/p>/g, '<div class="mb-4 text-slate-700">$1</div>');

    return html;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-600" size={24} />
            <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div 
            className="prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
          />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                const blob = new Blob([content], { type: 'text/markdown' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = title.toLowerCase().replace(/\s+/g, '-') + '.md';
                a.click();
                window.URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Descargar
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
