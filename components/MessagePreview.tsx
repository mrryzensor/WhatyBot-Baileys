import React from 'react';
import { MessageSquare, User } from 'lucide-react';

interface MessagePreviewProps {
  message: string;
  variables?: Record<string, string>;
  showContactInfo?: boolean;
  contactName?: string;
  inline?: boolean;
}

export const MessagePreview: React.FC<MessagePreviewProps> = ({ 
  message, 
  variables = {}, 
  showContactInfo = true,
  contactName = 'Juan Pérez',
  inline = false
}) => {
  // Parse WhatsApp formatting
  const parseWhatsAppFormatting = (text: string) => {
    let formatted = text;

    // Replace variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      formatted = formatted.replace(regex, String(value || ''));
    });

    // WhatsApp formatting rules
    const rules = [
      // Bold: *text*
      { pattern: /\*(.*?)\*/g, replacement: '<strong>$1</strong>' },
      // Italic: _text_
      { pattern: /_(.*?)_/g, replacement: '<em>$1</em>' },
      // Strikethrough: ~text~
      { pattern: /~(.*?)~/g, replacement: '<del>$1</del>' },
      // Monospace: ```text```
      { pattern: /```(.*?)```/g, replacement: '<code class="bg-gray-200 px-1 rounded">$1</code>' },
      // Inline code: `text`
      { pattern: /`(.*?)`/g, replacement: '<code class="bg-gray-200 px-1 rounded text-sm">$1</code>' },
      // Blockquote: > text
      { pattern: /^> (.*$)/gim, replacement: '<div class="border-l-2 border-gray-400 pl-2 italic text-gray-600">$1</div>' },
      // Bulleted list: * text or - text
      { pattern: /^[*|-] (.*$)/gim, replacement: '<div class="flex items-start"><span class="mr-2">•</span><span>$1</span></div>' },
      // Numbered list: 1. text
      { pattern: /^\d+\. (.*$)/gim, replacement: '<div class="flex items-start"><span class="mr-2 font-semibold">1.</span><span>$1</span></div>' }
    ];

    rules.forEach(rule => {
      formatted = formatted.replace(rule.pattern, rule.replacement);
    });

    // Handle line breaks
    formatted = formatted.replace(/\n/g, '<br />');

    return formatted;
  };

  const formattedMessage = parseWhatsAppFormatting(message);

  if (inline) {
    return (
      <div className="bg-theme-card rounded-lg border border-theme overflow-hidden">
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-2">
          <div className="flex items-center gap-2 text-white text-sm">
            <MessageSquare size={14} />
            <span className="font-medium">Vista Previa</span>
          </div>
        </div>

        <div className="p-3 bg-gray-50">
          <div className="bg-theme-card rounded-lg p-3 shadow-sm border border-gray-200">
            <div 
              className="text-theme-main text-sm whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: formattedMessage }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-card rounded-xl shadow-sm border border-theme overflow-hidden">
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-3">
        <div className="flex items-center gap-2 text-white">
          <MessageSquare size={18} />
          <h3 className="font-semibold">Vista Previa del Mensaje</h3>
        </div>
      </div>

      {/* Chat Message */}
      <div className="p-4 bg-gray-50">
        {showContactInfo && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <User size={20} className="text-primary-600" />
            </div>
            <div>
              <div className="font-medium text-theme-main">{contactName}</div>
              <div className="text-xs text-theme-muted">+5491123456789</div>
            </div>
          </div>
        )}

        {/* Message bubble */}
        <div className="bg-theme-card rounded-lg p-4 shadow-sm border border-gray-200 max-w-lg">
          <div 
            className="text-theme-main whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formattedMessage }}
          />
          
          {/* Message metadata */}
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
            <div className="text-xs text-slate-400">
              {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Variables info */}
      {Object.keys(variables).length > 0 && (
        <div className="p-4 bg-blue-50 border-t border-blue-100">
          <div className="text-sm font-medium text-blue-800 mb-2">Variables utilizadas:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(variables).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-mono">
                  {`{{${key}}}`}
                </span>
                <span className="text-theme-muted">→</span>
                <span className="font-medium text-theme-main">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formatting guide */}
      <div className="p-4 bg-theme-base border-t border-theme">
        <div className="text-sm font-medium text-theme-main mb-2">Guía de formato WhatsApp:</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-theme-muted">
          <div><code className="bg-slate-200 px-1 rounded">*texto*</code> → <strong>Negrita</strong></div>
          <div><code className="bg-slate-200 px-1 rounded">_texto_</code> → <em>Cursiva</em></div>
          <div><code className="bg-slate-200 px-1 rounded">~texto~</code> → <del>Tachado</del></div>
          <div><code className="bg-slate-200 px-1 rounded">`texto`</code> → <code>Código</code></div>
          <div><code className="bg-slate-200 px-1 rounded">* elemento</code> → Lista</div>
          <div><code className="bg-slate-200 px-1 rounded">{`>`} texto</code> → Cita</div>
        </div>
      </div>
    </div>
  );
};
