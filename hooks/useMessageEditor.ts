import React, { useRef, useCallback } from 'react';

interface UseMessageEditorOptions {
  textareaRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
  onTextChange?: (text: string) => void;
  variables?: string[];
  value?: string; // Optional: current value for more reliable insertion
}

export const useMessageEditor = (options: UseMessageEditorOptions = {}) => {
  const { textareaRef, onTextChange, variables = [], value: propValue } = options;
  const internalTextareaRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const getTextarea = useCallback(() => {
    return textareaRef?.current || internalTextareaRef.current;
  }, [textareaRef]);

  // Insert text at cursor position
  const insertTextAtCursor = useCallback((text: string, cursorOffset?: number) => {
    const textarea = getTextarea();
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    // Prioritize DOM value to ensure we have exactly what's in the textarea
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

    // Restore cursor position and focus
    const newCursorPos = cursorOffset !== undefined ? cursorOffset : start + text.length;

    // We use requestAnimationFrame or a slightly longer timeout to ensure React bit finished the update
    const restoreRef = () => {
      const currentTextarea = getTextarea();
      if (currentTextarea) {
        currentTextarea.focus();
        currentTextarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    };

    // Try multiple times to be absolutely sure focus is restored after potential re-renders
    restoreRef();
    setTimeout(restoreRef, 0);
    setTimeout(restoreRef, 50);
  }, [getTextarea, onTextChange]);

  // Insert formatting
  const insertFormatting = useCallback((format: 'bold' | 'italic' | 'strikethrough' | 'code' | 'monospace') => {
    const textarea = getTextarea();
    if (!textarea) return;

    const formats: Record<string, string> = {
      bold: '*',
      italic: '_',
      strikethrough: '~',
      code: '`',
      monospace: '```'
    };

    const symbol = formats[format] || '';
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selectedText = textarea.value.substring(start, end);

    if (selectedText) {
      // Wrap selected text
      insertTextAtCursor(`${symbol}${selectedText}${symbol}`);
    } else {
      // Insert format markers and position cursor between them
      const cursorPos = start;
      insertTextAtCursor(`${symbol}${symbol}`, cursorPos + symbol.length);
    }
  }, [getTextarea, insertTextAtCursor]);

  // Insert variable
  const insertVariable = useCallback((variable: string) => {
    insertTextAtCursor(`{{${variable}}}`);
  }, [insertTextAtCursor]);

  // Insert list item (bullet)
  const insertBulletList = useCallback(() => {
    const textarea = getTextarea();
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];

    // Check if we're at the start of a line or need a new line
    if (currentLine.trim() === '') {
      insertTextAtCursor('* ');
    } else {
      insertTextAtCursor('\n* ');
    }
  }, [getTextarea, insertTextAtCursor]);

  // Insert numbered list item
  const insertNumberedList = useCallback(() => {
    const textarea = getTextarea();
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
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
  }, [getTextarea, insertTextAtCursor]);

  // Insert quote
  const insertQuote = useCallback(() => {
    const textarea = getTextarea();
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const lines = textarea.value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];

    if (currentLine.trim() === '') {
      insertTextAtCursor('> ');
    } else {
      insertTextAtCursor('\n> ');
    }
  }, [getTextarea, insertTextAtCursor]);

  return {
    textareaRef: internalTextareaRef,
    insertFormatting,
    insertVariable,
    insertBulletList,
    insertNumberedList,
    insertQuote,
    insertText: insertTextAtCursor,
    variables
  };
};
