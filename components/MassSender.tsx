import React, { useState, useRef, useEffect } from 'react';
import { Send, Upload, AlertCircle, Download, HelpCircle, Eye, X } from 'lucide-react';
import { Contact, MessageLog, ScheduledMessage } from '../types';
import { sendBulkMessages, scheduleBulkMessages } from '../services/api';
import { ScheduleManager } from './ScheduleManager';
import { MarkdownViewer } from './MarkdownViewer';
import { MessagePreview } from './MessagePreview';
import { MediaUpload } from './MediaUpload';
import { SubscriptionUpgradeModal } from './SubscriptionUpgradeModal';
import { BulkProgressBar } from './BulkProgressBar';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { useSchedule } from '../hooks/useSchedule';
import { useMedia } from '../hooks/useMedia';
import { getSubscriptionLimits } from '../services/usersApi';
import { getCurrentUser as getAuthUser } from '../services/authApi';
import * as XLSX from 'xlsx';

interface MassSenderProps {
  isConnected: boolean;
  addLog: (log: MessageLog) => void;
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
  onNavigate?: (tab: string) => void;
  defaultCountryCode?: string;
}

export const MassSender: React.FC<MassSenderProps> = ({ isConnected, addLog, toast, onNavigate, defaultCountryCode }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [variables, setVariables] = useState<string[]>([]);
  const media = useMedia({ maxFiles: 50 });
  const [isSending, setIsSending] = useState(false);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showExample, setShowExample] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [limitError, setLimitError] = useState<any>(null);

  const isAdmin = (currentUser?.subscription_type || '').toString().toLowerCase() === 'administrador';
  const [isDraggingCSV, setIsDraggingCSV] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<any[][]>([]);
  const [selectedPhoneColumn, setSelectedPhoneColumn] = useState<number>(-1);
  const [countryCode, setCountryCode] = useState<string>(defaultCountryCode || '');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileProcessingProgress, setFileProcessingProgress] = useState<{ current: number; total: number } | null>(null);

  const schedule = useSchedule();

  // Store original phone values before normalization to allow re-normalization
  const originalPhoneValuesRef = useRef<Map<string, string>>(new Map());
  const lastCountryCodeRef = useRef<string>('');

  // Re-normalize phone numbers when country code changes (only if contacts are already loaded)
  React.useEffect(() => {
    // Only re-normalize if country code actually changed and we have contacts with stored original values
    if (contacts.length > 0 && countryCode && countryCode !== lastCountryCodeRef.current && originalPhoneValuesRef.current.size > 0) {
      const previousCountryCode = lastCountryCodeRef.current;
      lastCountryCodeRef.current = countryCode;
      
      // Only proceed if we have original values stored
      const renormalizedContacts = contacts.map(contact => {
        // Get original phone value from ref
        const originalPhone = originalPhoneValuesRef.current.get(contact.id);
        if (!originalPhone) {
          // If no original value stored, keep current phone
          return contact;
        }
        
        // Re-normalize with current country code
        const normalizedPhone = normalizePhoneNumber(originalPhone, countryCode);
        return {
          ...contact,
          phone: normalizedPhone || contact.phone
        };
      }).filter(c => c.phone && c.phone.length >= 8);
      
      if (renormalizedContacts.length !== contacts.length) {
        toast.warning('Algunos números no pudieron ser normalizados con el nuevo código de país');
      } else if (previousCountryCode) {
        toast.success(`Números re-normalizados con código de país: ${countryCode.replace(/^\+/, '')}`);
      }
      
      setContacts(renormalizedContacts);
    } else if (countryCode && countryCode !== lastCountryCodeRef.current) {
      lastCountryCodeRef.current = countryCode;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  React.useEffect(() => {
    loadUserInfo();
    // Load selected group members from localStorage if available
    const savedMembers = localStorage.getItem('selectedGroupMembers');
    if (savedMembers) {
      try {
        const members = JSON.parse(savedMembers);
        if (Array.isArray(members) && members.length > 0) {
          setContacts(members);
          // Extract variables from first member
          if (members.length > 0) {
            const keys = Object.keys(members[0]);
            setVariables(keys);
          }
          toast.success(`${members.length} contacto(s) cargado(s) desde grupos`);
          // Clear localStorage after loading
          localStorage.removeItem('selectedGroupMembers');
        }
      } catch (error) {
        console.error('Error loading selected group members:', error);
      }
    }
  }, []);

  React.useEffect(() => {
    // Si cambia la configuración global, actualizamos el valor por defecto visual
    if (defaultCountryCode && !countryCode) {
      setCountryCode(defaultCountryCode);
    }
  }, [defaultCountryCode]);


  const loadUserInfo = async () => {
    try {
      const user = getAuthUser();
      setCurrentUser(user);
      
      const limitsResponse = await getSubscriptionLimits();
      if (limitsResponse.success) {
        setSubscriptionLimits(limitsResponse.limits);
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  // Normalize phone number: remove + and format correctly
  const normalizePhoneNumber = (phone: string, countryCode?: string): string => {
    if (!phone) return '';
    
    // Remove all non-digit characters except + (we'll handle + separately)
    let normalized = phone.trim();
    
    // Remove + if present at the start
    if (normalized.startsWith('+')) {
      normalized = normalized.substring(1);
    }
    
    // Remove spaces, dashes, parentheses, dots
    normalized = normalized.replace(/[\s\-\(\)\.]/g, '');
    
    // Remove any remaining non-digit characters
    normalized = normalized.replace(/[^\d]/g, '');
    
    // Validate that it contains at least 8 digits
    if (normalized.length < 8) {
      return '';
    }
    
    // Apply country code if provided
    if (countryCode) {
      // Remove + from country code if present
      let cleanCountryCode = countryCode.trim();
      if (cleanCountryCode.startsWith('+')) {
        cleanCountryCode = cleanCountryCode.substring(1);
      }
      // Remove any non-digit characters from country code
      cleanCountryCode = cleanCountryCode.replace(/[^\d]/g, '');
      
      // Remove leading zeros from phone number
      normalized = normalized.replace(/^0+/, '');
      
      // Add country code (without +)
      normalized = `${cleanCountryCode}${normalized}`;
    }
    
    return normalized;
  };

  // Process Excel contacts with selected column and country code
  const processExcelContacts = (jsonData: any[][], headers: string[], phoneColumnIndex: number) => {
    // All other columns become variables
    const variableHeaders = headers.filter((_, index) => index !== phoneColumnIndex);
    setVariables([...variableHeaders, headers[phoneColumnIndex]]);

    const parsedContacts: Contact[] = [];
    const totalRows = jsonData.length - 1; // Exclude header row
    
    // Process data rows
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] || [];
      if (row.length === 0) continue;

      // Update progress
      setFileProcessingProgress({ current: i, total: totalRows });

      const contact: any = { id: `c-${i}`, phone: '', name: '' };
      const phoneValue = String(row[phoneColumnIndex] || '').trim();
      
      // Store original phone value before normalization
      const originalPhoneValue = phoneValue;
      
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phoneValue, countryCode);
      
      if (!normalizedPhone) {
        // Skip this contact if phone is invalid
        continue;
      }
      
      contact.phone = normalizedPhone;
      
      // Store original phone value for potential re-normalization
      originalPhoneValuesRef.current.set(contact.id, originalPhoneValue);

      headers.forEach((header, index) => {
        if (index !== phoneColumnIndex) {
          const cellValue = String(row[index] || '').trim();
          contact[header] = cellValue;
          if (header.toLowerCase().includes('name') || header.toLowerCase().includes('nombre')) {
            contact.name = cellValue;
          }
        } else {
          contact[header] = phoneValue;
        }
      });

      // Try to find name from various columns
      if (!contact.name) {
        // Look for columns that might contain names
        headers.forEach((header, index) => {
          if (index !== phoneColumnIndex) {
            const headerLower = header.toLowerCase();
            if ((headerLower.includes('name') || 
                 headerLower.includes('nombre') || 
                 headerLower.includes('apellido') ||
                 headerLower.includes('cliente')) && 
                !contact.name) {
              const nameValue = String(row[index] || '').trim();
              if (nameValue) {
                contact.name = nameValue;
              }
            }
          }
        });
        
        // If still no name, use first non-phone column
        if (!contact.name && variableHeaders.length > 0) {
          const firstVarIndex = headers.findIndex((h, idx) => idx !== phoneColumnIndex);
          if (firstVarIndex !== -1) {
            const nameValue = String(row[firstVarIndex] || '').trim();
            contact.name = nameValue || 'Sin nombre';
          }
        }
        
        // Final fallback
        if (!contact.name) {
          contact.name = 'Sin nombre';
        }
      }

      // Only add contact if phone is valid (already validated above)
      if (contact.phone && contact.phone.length >= 8) {
        parsedContacts.push(contact);
      }
    }

    if (parsedContacts.length === 0) {
      toast.error('No se encontraron contactos válidos en el archivo Excel');
      return;
    }

    // Validate that we actually have valid phone numbers
    const validContacts = parsedContacts.filter(c => c.phone && c.phone.length >= 8);
    
    if (validContacts.length === 0) {
      toast.error(`No se encontraron números de teléfono válidos en la columna "${headers[phoneColumnIndex]}". Por favor, verifica que la columna seleccionada contiene números de teléfono.`);
      // Show column selector to allow user to choose different column
      setExcelHeaders(headers);
      setExcelData(jsonData);
      setShowColumnSelector(true);
      return;
    }
    
    if (validContacts.length < parsedContacts.length) {
      toast.warning(`Se cargaron ${validContacts.length} de ${parsedContacts.length} contactos. ${parsedContacts.length - validContacts.length} contactos fueron omitidos por tener números inválidos.`);
    }
    
    setContacts(validContacts);
    setIsProcessingFile(false);
    setFileProcessingProgress(null);
    const countryCodeMsg = countryCode ? ` con código de país ${countryCode.replace(/^\+/, '')}` : '';
    toast.success(`Se cargaron ${validContacts.length} contacto(s) desde Excel. Columna de teléfono detectada: "${headers[phoneColumnIndex]}"${countryCodeMsg}`);
  };

  // Process contact file (CSV, TXT, Excel, JSON) or paste numbers
  const processContactFile = async (file: File) => {
    setIsProcessingFile(true);
    setFileProcessingProgress({ current: 0, total: 100 });
    
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    // Handle Excel files separately (need array buffer)
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: ''
        }) as any[][];
        
        if (jsonData.length === 0) {
          toast.error('El archivo Excel está vacío');
          return;
        }

        const headers = (jsonData[0] || []).map((h: any) => String(h).trim()).filter((h: string) => h);
        
        if (headers.length === 0) {
          toast.error('No se encontraron encabezados en el archivo Excel');
          return;
        }

        // Analyze multiple rows to detect phone column more accurately
        let phoneColumnIndex = -1;
        const sampleRows = jsonData.slice(1, Math.min(6, jsonData.length)); // Check first 5 data rows
        
        // Try to find by header name first (most reliable)
        headers.forEach((header, index) => {
          const headerLower = header.toLowerCase();
          if (headerLower.includes('phone') || 
              headerLower.includes('telefono') || 
              headerLower.includes('numero') ||
              headerLower.includes('celular') ||
              headerLower.includes('whatsapp') ||
              headerLower.includes('tel') ||
              headerLower.includes('movil') ||
              headerLower === 'teléfono' ||
              headerLower === 'número') {
            phoneColumnIndex = index;
          }
        });

        // If not found by header, analyze cell content across multiple rows
        if (phoneColumnIndex === -1 && sampleRows.length > 0) {
          // Score each column based on how many rows contain phone-like values
          const columnScores = headers.map((_, colIndex) => {
            let score = 0;
            sampleRows.forEach((row: any[]) => {
              const cellValue = String(row[colIndex] || '').trim();
              if (cellValue) {
                // Remove common formatting characters
                const digitsOnly = cellValue.replace(/[\s\-\(\)\+\.]/g, '');
                // Check if it looks like a phone number (8+ digits, mostly numeric)
                if (digitsOnly.length >= 8 && digitsOnly.length <= 15 && /^\d+$/.test(digitsOnly)) {
                  score += 1;
                }
                // Bonus for numbers starting with + or having country code pattern
                if (cellValue.startsWith('+') || /^(\+?\d{1,4}[\s\-]?)?\d{8,}$/.test(cellValue)) {
                  score += 2;
                }
              }
            });
            return score;
          });
          
          // Find column with highest score
          const maxScore = Math.max(...columnScores);
          if (maxScore > 0) {
            phoneColumnIndex = columnScores.indexOf(maxScore);
          }
        }

        // Fallback: check if first column contains phone-like values
        if (phoneColumnIndex === -1 && sampleRows.length > 0) {
          let firstColumnScore = 0;
          sampleRows.forEach((row: any[]) => {
            const firstValue = String(row[0] || '').trim();
            if (firstValue) {
              const digitsOnly = firstValue.replace(/[\s\-\(\)\+\.]/g, '');
              if (digitsOnly.length >= 8 && digitsOnly.length <= 15 && /^\d+$/.test(digitsOnly)) {
                firstColumnScore += 1;
              }
            }
          });
          if (firstColumnScore >= sampleRows.length * 0.5) { // At least 50% of rows
            phoneColumnIndex = 0;
          }
        }

        // Always show column selector, with detected column pre-selected if found
        setExcelHeaders(headers);
        setExcelData(jsonData);
        if (phoneColumnIndex !== -1) {
          setSelectedPhoneColumn(phoneColumnIndex);
        }
        setShowColumnSelector(true);
        setIsProcessingFile(false);
        setFileProcessingProgress(null);
        return;
      } catch (error: any) {
        console.error('Error processing Excel:', error);
        toast.error(`Error al procesar Excel: ${error.message || 'Formato no válido'}`);
        setIsProcessingFile(false);
        setFileProcessingProgress(null);
        return;
      }
    }

    // Handle CSV, TXT, JSON files
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let parsedContacts: Contact[] = [];

        if (fileExtension === 'csv' || fileExtension === 'txt') {
          // Process CSV or TXT (tab or comma separated)
          const lines = text.split('\n').filter(line => line.trim());
          if (lines.length === 0) {
            toast.error('El archivo está vacío');
            setIsProcessingFile(false);
            setFileProcessingProgress(null);
            return;
          }

          // Detect delimiter (comma or tab)
          const firstLine = lines[0];
          const delimiter = firstLine.includes('\t') ? '\t' : ',';
          
          const headers = lines[0].split(delimiter).map(h => h.trim());
          setVariables(headers);

          const totalLines = lines.length - 1; // Exclude header
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            // Update progress
            setFileProcessingProgress({ current: i, total: totalLines });
            
            // Small delay to allow UI update
            if (i % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            const values = lines[i].split(delimiter);
            const contact: any = { id: `c-${i}`, phone: '', name: '' };

            headers.forEach((header, index) => {
              contact[header] = values[index]?.trim() || '';
              if (header.toLowerCase().includes('phone') || header.toLowerCase().includes('telefono') || header.toLowerCase().includes('numero')) {
                contact.phone = values[index]?.trim();
              }
              if (header.toLowerCase().includes('name') || header.toLowerCase().includes('nombre')) {
                contact.name = values[index]?.trim();
              }
            });

            // Fallback if no specific phone column found but data exists
            if (!contact.phone && values.length > 0) {
              // Try to find phone in first column
              const firstValue = values[0]?.trim();
              if (firstValue && /[\d+]/.test(firstValue)) {
                contact.phone = firstValue;
              }
            }

            // Store original phone value
            const originalPhoneValue = contact.phone;
            
            // Normalize phone number
            const normalizedPhone = normalizePhoneNumber(contact.phone, countryCode);
            if (normalizedPhone) {
              contact.phone = normalizedPhone;
              // Store original phone value
              originalPhoneValuesRef.current.set(contact.id, originalPhoneValue);
              parsedContacts.push(contact);
            }
          }
        } else if (fileExtension === 'json') {
          // Process JSON file
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            const totalItems = data.length;
            parsedContacts = data.map((item, index) => {
              // Update progress
              if (index % 10 === 0) {
                setFileProcessingProgress({ current: index, total: totalItems });
              }
              
              const phone = item.phone || item.telefono || item.numero || item.number || '';
              
              // Store original phone value
              const originalPhoneValue = phone;
              
              // Normalize phone number
              const normalizedPhone = normalizePhoneNumber(phone, countryCode);
              
              // Create contact object, ensuring phone is processed value
              const contact: any = {
              id: `c-${index}`,
                phone: normalizedPhone,
              name: item.name || item.nombre || '',
              ...item
              };
              // Override phone with processed value (after spread)
              contact.phone = normalizedPhone;
              
              // Store original phone value
              if (normalizedPhone) {
                originalPhoneValuesRef.current.set(contact.id, originalPhoneValue);
              }
              
              return contact;
            }).filter(c => c.phone && c.phone.length >= 8);
            
            // Extract variables from first object keys
            if (data.length > 0) {
              const keys = Object.keys(data[0]);
              setVariables(keys);
            }
          } else {
            toast.error('El archivo JSON debe contener un array de contactos');
            return;
          }
        } else {
          toast.error('Formato de archivo no soportado. Usa CSV, TXT, JSON o Excel (XLSX/XLS)');
          return;
        }

        if (parsedContacts.length === 0) {
          toast.error('No se encontraron contactos válidos en el archivo');
          return;
        }

        setContacts(parsedContacts);
        const countryCodeMsg = countryCode ? ` con código de país ${countryCode.replace(/^\+/, '')}` : '';
        toast.success(`Se cargaron ${parsedContacts.length} contactos desde el archivo${countryCodeMsg}`);
      } catch (error: any) {
        console.error('Error processing file:', error);
        toast.error(`Error al procesar el archivo: ${error.message}`);
      } finally {
        setIsProcessingFile(false);
        setFileProcessingProgress(null);
      }
    };
    
    reader.readAsText(file);
  };

  // Process pasted numbers (one per line or comma/tab separated)
  const processPastedNumbers = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const parsedContacts: Contact[] = [];
    
    lines.forEach((line, index) => {
      // Try to split by comma or tab if multiple values
      const parts = line.split(/[,\t]/).map(p => p.trim());
      const phone = parts[0];
      const name = parts[1] || '';
      
      // Store original phone value
      const originalPhoneValue = phone;
      
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phone, countryCode);
      
      if (normalizedPhone) {
        const contactId = `c-${index}`;
        parsedContacts.push({
          id: contactId,
          phone: normalizedPhone,
          name: name
        });
        
        // Store original phone value
        originalPhoneValuesRef.current.set(contactId, originalPhoneValue);
      }
    });

    if (parsedContacts.length === 0) {
      toast.error('No se encontraron números válidos en el texto pegado');
      return;
    }

    setContacts(parsedContacts);
    const countryCodeMsg = countryCode ? ` con código de país ${countryCode.replace(/^\+/, '')}` : '';
    toast.success(`Se cargaron ${parsedContacts.length} contactos desde el texto pegado${countryCodeMsg}`);
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processContactFile(file);
  };

  const handleCSVDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCSV(true);
  };

  const handleCSVDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCSV(false);
  };

  const handleCSVDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCSVDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCSV(false);

    const files = Array.from(e.dataTransfer.files) as File[];
    const contactFile = files.find((f: File) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'csv' || ext === 'txt' || ext === 'json' || ext === 'xlsx' || ext === 'xls';
    });
    if (contactFile) {
      processContactFile(contactFile);
    } else {
      toast.error('Por favor arrastra un archivo CSV, TXT, JSON o Excel válido');
    }
  };


  const downloadExampleCSV = () => {
    // Create example data
    const exampleData = [
      ['phone', 'name', 'empresa', 'producto', 'fecha_vencimiento'],
      ['+5491123456789', 'Juan Pérez', 'Tech Solutions', 'Software CRM', '2024-12-31'],
      ['+5491134567890', 'María García', 'Marketing Pro', 'Servicios SEO', '2025-01-15'],
      ['+5491145678901', 'Carlos López', 'Store Online', 'Tienda E-commerce', '2024-11-30'],
      ['+5491156789012', 'Ana Martínez', 'Consultoría Plus', 'Asesoría Legal', '2025-02-20'],
      ['+5491167890123', 'Pedro Sánchez', 'Digital Agency', 'Marketing Digital', '2024-12-15']
    ];

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(exampleData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 18 }, // phone
      { wch: 15 }, // name
      { wch: 18 }, // empresa
      { wch: 20 }, // producto
      { wch: 18 }  // fecha_vencimiento
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contactos');

    // Generate Excel file
    XLSX.writeFile(workbook, 'contactos_ejemplo.xlsx');
    
    toast.success('Archivo Excel de ejemplo descargado');
  };

  const openInstructions = () => {
    setShowInstructions(true);
  };

  // Handle column selection confirmation
  const handleConfirmColumnSelection = () => {
    if (selectedPhoneColumn === -1) {
      toast.error('Por favor selecciona una columna para el número de teléfono');
      return;
    }
    
    processExcelContacts(excelData, excelHeaders, selectedPhoneColumn);
    setShowColumnSelector(false);
    setSelectedPhoneColumn(-1);
  };

  // Get sample variables for preview - use first contact if available, otherwise use defaults
  const getSampleVariables = () => {
    if (variables.length === 0) return {};
    const sampleVars: Record<string, string> = {};
    
    // Use first contact's real values if available
    if (contacts.length > 0) {
      const firstContact = contacts[0];
      variables.forEach(v => {
        sampleVars[v] = firstContact[v] || (v === 'name' ? 'Juan Pérez' : 
                          v === 'phone' ? '+5491123456789' :
                          v === 'empresa' ? 'Tech Solutions' :
                          v === 'producto' ? 'Software CRM' :
                          v === 'fecha_vencimiento' ? '2024-12-31' :
                          `[${v}]`);
      });
    } else {
      // Fallback to default values
    variables.forEach(v => {
      sampleVars[v] = v === 'name' ? 'Juan Pérez' : 
                    v === 'phone' ? '+5491123456789' :
                    v === 'empresa' ? 'Tech Solutions' :
                    v === 'producto' ? 'Software CRM' :
                    v === 'fecha_vencimiento' ? '2024-12-31' :
                    `[${v}]`;
    });
    }
    return sampleVars;
  };

  const startSending = async () => {
    if (contacts.length === 0) {
      toast.error('No hay contactos cargados');
      return;
    }
    if (!messageTemplate && media.mediaItems.length === 0) {
      toast.error('Se requiere un mensaje de texto o un archivo multimedia');
      return;
    }

    // Validate schedule using the unified hook
    if (!schedule.validateSchedule(toast)) {
      return;
    }

    // Send directly without confirmation modal
    await handleSending();
  };

  const handleSending = async () => {
    setIsSending(true);

    try {
      const files = media.mediaItems
        .map((item) => item.file)
        .filter((f): f is File => !!f);
      const captions = media.mediaItems.map((item) => item.caption || '');

      if (schedule.scheduleType === 'now') {
        await sendBulkMessages(
          contacts, 
          messageTemplate, // Text message sent separately
          files,
          captions // Captions por archivo
        );
        toast.success('¡Campaña iniciada! Los mensajes se están enviando en segundo plano.');
      } else {
        const response = await scheduleBulkMessages(
          contacts,
          messageTemplate, // Text message sent separately
          schedule.scheduleType,
          schedule.delayMinutes,
          schedule.scheduledAt,
          files,
          captions // Captions por archivo
        );
        
        if (response.success) {
          // Save scheduled message to localStorage
          const scheduledMessage: ScheduledMessage = {
            id: response.jobId,
            type: 'bulk',
            recipients: contacts.map(c => c.phone),
            message: messageTemplate || '[Archivo multimedia]',
            scheduleType: schedule.scheduleType,
            delayMinutes: schedule.delayMinutes,
            scheduledAt: schedule.scheduledAt ? new Date(schedule.scheduledAt) : undefined,
            status: 'scheduled',
            createdAt: new Date(),
            file: files.length > 0 ? files[0] : undefined,
            variables: variables
          };
          
          // Load existing scheduled messages
          const existing = localStorage.getItem('scheduledMessages');
          const scheduledMessages = existing ? JSON.parse(existing) : [];
          // Convert dates to ISO strings for storage
          const messageToSave = {
            ...scheduledMessage,
            scheduledAt: scheduledMessage.scheduledAt?.toISOString(),
            createdAt: scheduledMessage.createdAt.toISOString()
          };
          scheduledMessages.push(messageToSave);
          localStorage.setItem('scheduledMessages', JSON.stringify(scheduledMessages));
          
          toast.success('¡Campaña programada exitosamente!');
          schedule.reset();
          
          // Navigate to scheduled messages tab
          if (onNavigate) {
            setTimeout(() => onNavigate('scheduled'), 1000);
          }
        }
      }
    } catch (error: any) {
      console.error('Error sending bulk messages:', error);
      
      // Check if error is due to limit exceeded (but not for administrators)
      if (error.response?.status === 403 && error.response?.data?.limitExceeded && !isAdmin) {
        setLimitError(error.response.data);
        setShowUpgradeModal(true);
      } else {
        toast.error(`Error al ${schedule.scheduleType === 'now' ? 'enviar' : 'programar'} mensajes: ${error.message}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* File Processing Progress Bar */}
      {isProcessingFile && fileProcessingProgress && (
        <BulkProgressBar
          current={fileProcessingProgress.current}
          total={fileProcessingProgress.total}
          isActive={true}
          title="Procesando archivo..."
          subtitle="Leyendo y normalizando contactos"
        />
      )}

      {/* Media Upload Progress Bar */}
      {media.uploadProgress && (
        <BulkProgressBar
          current={media.uploadProgress.current}
          total={media.uploadProgress.total}
          isActive={true}
          title="Subiendo archivos..."
          subtitle="Procesando archivos multimedia"
        />
      )}

      {showUpgradeModal && currentUser && limitError && (
        <SubscriptionUpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => {
            setShowUpgradeModal(false);
            setLimitError(null);
          }}
          currentPlan={currentUser.subscription_type}
          currentLimit={limitError.limit || 0}
          currentUsed={limitError.currentCount || 0}
          subscriptionLimits={subscriptionLimits}
          userEmail={currentUser.email || ''}
          isConnected={isConnected}
        />
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-4rem)]">
      {/* Left Column: Data Input */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Upload size={18} /> Cargar Contactos (CSV)
          </h3>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <HelpCircle size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">¿Necesitas ayuda?</p>
                  <p>Descarga el archivo ejemplo y lee las instrucciones para usar variables correctamente.</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={downloadExampleCSV}
                  className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                >
                  <Download size={12} />
                  Descargar Ejemplo
                </button>
                <button
                  onClick={openInstructions}
                  className="flex items-center gap-1 text-xs bg-white text-blue-600 border border-blue-300 px-3 py-1.5 rounded hover:bg-blue-50"
                >
                  <HelpCircle size={12} />
                  Ver Instructivo
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-2">
                Sube un archivo CSV, TXT, JSON o Excel (XLSX/XLS). La primera fila debe contener los encabezados. Para Excel, se detectará automáticamente la columna de teléfono.
                Requerido: 'phone'. Opcional: 'name' + otras variables.
              </p>
              
              {/* Country Code Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Código de País (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: +51, +54, +1"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.trim())}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Se aplicará automáticamente a todos los números que no tengan código de país (+)
                </p>
              </div>
              
              {/* Drag and Drop Zone for CSV */}
              <div
                onDragEnter={handleCSVDragEnter}
                onDragOver={handleCSVDragOver}
                onDragLeave={handleCSVDragLeave}
                onDrop={handleCSVDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  isDraggingCSV
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-green-300 bg-slate-50'
                }`}
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm text-slate-600 font-medium mb-1">
                  Arrastra y suelta tu archivo XLSX, CSV, TXT o JSON aquí
                  <br />
                  <span className="text-xs text-slate-400 mt-1">O pega números directamente en el área de texto</span>
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  o haz clic para seleccionar un archivo
                </p>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,.txt,.json,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {contacts.length > 0 && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-green-600 font-medium">
                    ✓ {contacts.length} contactos cargados
                    </div>
                    <button
                      onClick={() => {
                        setContacts([]);
                        setVariables([]);
                        setCountryCode('');
                        originalPhoneValuesRef.current.clear();
                        lastCountryCodeRef.current = '';
                        if (csvInputRef.current) {
                          csvInputRef.current.value = '';
                        }
                        toast.success('Archivo eliminado. Puedes cargar otro archivo.');
                      }}
                      className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                    >
                      <X size={12} />
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
              
              {/* Paste numbers textarea */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  O pega números directamente (uno por línea o separados por coma/tab)
                </label>
                <textarea
                  placeholder="51977638887&#10;51977638888, Juan Pérez&#10;51977638889	María García"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 min-h-[100px] font-mono text-sm"
                  onPaste={(e) => {
                    const pastedText = e.clipboardData.getData('text');
                    if (pastedText.trim()) {
                      processPastedNumbers(pastedText);
                      e.currentTarget.value = '';
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.value.trim() && e.target.value.includes('\n')) {
                      processPastedNumbers(e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Formato: un número por línea, o número y nombre separados por coma o tab
                </p>
              </div>
            </div>
          </div>
        </div>

        {contacts.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-800">Vista Previa</h3>
              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">
                {contacts.length} Contactos
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {contacts.slice(0, 10).map((c, idx) => (
                <div key={idx} className={`text-sm p-3 rounded border ${
                  c.phone && c.phone.length >= 8 
                    ? 'bg-slate-50 border-slate-100' 
                    : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 mb-1">
                        {c.name || 'Sin nombre'}
                      </div>
                      {c.phone && c.phone.length >= 8 ? (
                        <div className="space-y-1">
                          <div className="font-mono text-slate-600 text-xs">
                            {c.phone}
                          </div>
                          {countryCode && (
                            <div className="text-xs text-blue-600 font-medium">
                              ✓ Normalizado con código: {countryCode.replace(/^\+/, '')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-yellow-700 font-medium">
                          ⚠️ Número de teléfono no válido o faltante
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {contacts.length > 10 && (
                <div className="text-xs text-center text-slate-400 py-2">
                  + {contacts.length - 10} más
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Message Composer & Schedule */}
      <div className="lg:col-span-2 space-y-6">
        <ScheduleManager
          scheduleType={schedule.scheduleType}
          delayMinutes={schedule.delayMinutes}
          scheduledAt={schedule.scheduledAt}
          scheduledDate={schedule.scheduledDate}
          scheduledTime={schedule.scheduledTime}
          onScheduleChange={schedule.updateSchedule}
          onDateChange={(date) => {
            schedule.setScheduledDate(date);
            schedule.handleDateTimeChange(date, schedule.scheduledTime);
          }}
          onTimeChange={(time) => {
            schedule.setScheduledTime(time);
            schedule.handleDateTimeChange(schedule.scheduledDate, time);
          }}
          disabled={isSending}
        />
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <h3 className="font-semibold text-slate-800 mb-4">Redactor de Mensajes</h3>

          <div className="flex-1 flex flex-col gap-4">
            {/* Message Editor Toolbar */}
            <MessageEditorToolbar
              textareaRef={messageTextareaRef}
              value={messageTemplate}
              onChange={setMessageTemplate}
              variables={variables}
              showVariables={variables.length > 0}
            />

            <textarea
              ref={messageTextareaRef}
              className="w-full h-48 p-4 border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Escribe tu mensaje aquí... Usa variables como {{name}}"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
            />

            {/* Inline Preview */}
            {messageTemplate && (
              <div className="mt-4">
                <MessagePreview 
                  message={messageTemplate}
                  variables={getSampleVariables()}
                  inline={true}
                />
              </div>
            )}

            {/* Attachments */}
            <div className="py-4 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Archivos Adjuntos (opcional)
              </label>
              <MediaUpload 
                mediaItems={media.mediaItems}
                onMediaChange={media.setMediaItems}
                maxFiles={50}
                fileInputRef={media.fileInputRef}
                onFileSelect={media.handleFileSelect}
                onDrop={media.handleDrop}
                onOpenFileSelector={media.openFileSelector}
                onRemoveMedia={media.removeMedia}
                onUpdateCaption={media.updateCaption}
                variables={variables}
                sampleVariables={getSampleVariables()}
              />
              <p className="text-xs text-slate-400 mt-2">
                Si adjuntas archivos, el mensaje de texto se enviará por separado después de los archivos.
              </p>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
              <div className="flex items-center gap-2 text-yellow-600 text-xs">
                {!isConnected && (
                  <>
                    <AlertCircle size={14} />
                    <span>Cliente no conectado</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={!messageTemplate}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                    !messageTemplate
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <Eye size={18} />
                  Vista Previa
                </button>
                <button
                  onClick={startSending}
                  disabled={!isConnected || isSending || (contacts.length === 0)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-white transition-all ${!isConnected || isSending || contacts.length === 0
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20'
                    }`}
                >
                  <Send size={18} />
                  {isSending ? (
                    schedule.scheduleType === 'now' ? 'Enviando...' : 'Programando...'
                  ) : (
                    schedule.scheduleType === 'now' ? 'Enviar Masivamente' : 'Programar Envío'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions Modal */}
      <MarkdownViewer
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Instructivo de Variables"
        content={`# Instructivo: Uso de Variables en Mensajes

## Formato del Archivo CSV

Tu archivo CSV debe tener la siguiente estructura:

### Encabezados Obligatorios
- **phone**: Número de teléfono con código de país (ej: +5491123456789)
- **name**: Nombre del contacto (opcional pero recomendado)

### Variables Personalizadas
Puedes agregar cualquier columna adicional para usar como variable:
- empresa
- producto  
- fecha_vencimiento
- direccion
- etc.

## Ejemplo de Archivo CSV

\`\`\`csv
phone,name,empresa,producto,fecha_vencimiento
+5491123456789,Juan Pérez,Tech Solutions,Software CRM,2024-12-31
+5491134567890,María García,Marketing Pro,Servicios SEO,2025-01-15
\`\`\`

## Cómo Usar las Variables

En el campo del mensaje, usa las variables con doble llave:

\`\`\`
Hola {{name}}, te saluda {{empresa}}.

Tu producto {{producto}} está por vencer el {{fecha_vencimiento}}.

Contáctanos para renovar.
\`\`\`

## Variables Especiales

- {{name}}: Nombre del contacto
- {{phone}}: Número de teléfono
- Cualquier encabezado de tu CSV: {{nombre_columna}}

## Tips

1. **No uses espacios** en los nombres de columnas
2. **Usa guiones bajos** en lugar de espacios: \`nombre_cliente\`
3. **Verifica números** con formato internacional: +código + número
4. **Prueba con pocos contactos** antes de enviar a grandes listas
5. **Guarda copias** de tus archivos CSV originales

## Ejemplos de Mensajes

### Mensaje de Vencimiento
\`\`\`
Estimado/a {{name}},
Le recordamos que su servicio {{producto}} con {{empresa}} vence el {{fecha_vencimiento}}.
Por favor contacte con nosotros para renovar.
\`\`\`

### Mensaje de Marketing
\`\`\`
¡Hola {{name}}!
{{empresa}} tiene una oferta especial para ti en {{producto}}.
No te la pierdas!
\`\`\`

### Mensaje Personalizado
\`\`\`
Querido {{name}},
Esperamos que esté disfrutando de {{producto}} de {{empresa}}.
Si necesita ayuda, estamos aquí para asistirle.
\`\`\`

## Descarga Archivo Ejemplo

Puedes descargar el archivo ejemplo desde el botón "Descargar Ejemplo" en la interfaz.`}
      />

      {/* Message Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Vista Previa del Mensaje</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <MessagePreview 
                message={messageTemplate}
                variables={getSampleVariables()}
              />
            </div>
          </div>
        </div>
      )}

      {/* Column Selector Modal */}
      {showColumnSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-slate-800">Seleccionar Columna de Teléfono</h3>
              <button
                onClick={() => {
                  setShowColumnSelector(false);
                  setSelectedPhoneColumn(-1);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedPhoneColumn !== -1 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-800 font-medium mb-1">
                    ✓ Columna detectada automáticamente
                  </p>
                  <p className="text-xs text-blue-700">
                    Se detectó la columna <strong>"{excelHeaders[selectedPhoneColumn]}"</strong> como columna de teléfono. 
                    Puedes confirmar esta selección o elegir otra columna.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-600 mb-4">
                  No se pudo detectar automáticamente la columna de teléfono. Por favor, selecciona manualmente la columna que contiene los números de WhatsApp.
                </p>
              )}
              
              <div className="space-y-2 mb-4">
                {excelHeaders.map((header, index) => {
                  const sampleValue = excelData[1]?.[index] ? String(excelData[1][index]).trim() : '';
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedPhoneColumn(index)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedPhoneColumn === index
                          ? 'border-green-500 bg-green-50'
                          : 'border-slate-200 hover:border-green-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-800">{header}</p>
                          {sampleValue && (
                            <p className="text-xs text-slate-500 mt-1">Ejemplo: {sampleValue}</p>
                          )}
                        </div>
                        {selectedPhoneColumn === index && (
                          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3 justify-end p-4 border-t border-slate-200 flex-shrink-0">
              <button
                onClick={() => {
                  setShowColumnSelector(false);
                  setSelectedPhoneColumn(-1);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmColumnSelection}
                disabled={selectedPhoneColumn === -1}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  selectedPhoneColumn === -1
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
};