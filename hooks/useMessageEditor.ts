import { useRef, useCallback } from 'react';

interface UseMessageEditorOptions {
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onTextChange?: (text: string) => void;
  variables?: string[];
}

export const useMessageEditor = (options: UseMessageEditorOptions = {}) => {
  const { textareaRef, onTextChange, variables = [] } = options;
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textarea = textareaRef?.current || internalTextareaRef.current;

  // Insert text at cursor position
  const insertTextAtCursor = useCallback((text: string, cursorOffset?: number) => {
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = textarea.value;
    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
    
    if (onTextChange) {
      onTextChange(newValue);
    } else {
      // Direct update if no handler provided
      textarea.value = newValue;
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
    }
    
    // Restore cursor position after text insertion
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const cursorPos = cursorOffset !== undefined ? cursorOffset : start + text.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
      }
    }, 10);
  }, [textarea, onTextChange]);

  // Insert formatting
  const insertFormatting = useCallback((format: 'bold' | 'italic' | 'strikethrough' | 'code' | 'monospace') => {
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
      insertTextAtCursor(`${symbol}${selectedText}${symbol}`);
    } else {
      // Insert format markers and position cursor between them
      const cursorPos = start;
      insertTextAtCursor(`${symbol}${symbol}`, cursorPos + symbol.length);
    }
  }, [textarea, insertTextAtCursor]);

  // Insert variable
  const insertVariable = useCallback((variable: string) => {
    insertTextAtCursor(`{{${variable}}}`);
  }, [insertTextAtCursor]);

  // Insert list item (bullet)
  const insertBulletList = useCallback(() => {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];
    
    // Check if we're at the start of a line or need a new line
    if (currentLine.trim() === '') {
      insertTextAtCursor('* ');
    } else {
      insertTextAtCursor('\n* ');
    }
  }, [textarea, insertTextAtCursor]);

  // Insert numbered list item
  const insertNumberedList = useCallback(() => {
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
      insertTextAtCursor(`${nextNumber}. `);
    } else {
      insertTextAtCursor(`\n${nextNumber}. `);
    }
  }, [textarea, insertTextAtCursor]);

  // Insert quote
  const insertQuote = useCallback(() => {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];
    
    if (currentLine.trim() === '') {
      insertTextAtCursor('> ');
    } else {
      insertTextAtCursor('\n> ');
    }
  }, [textarea, insertTextAtCursor]);

  return {
    textareaRef: internalTextareaRef,
    insertFormatting,
    insertVariable,
    insertBulletList,
    insertNumberedList,
    insertQuote,
    variables
  };
};

