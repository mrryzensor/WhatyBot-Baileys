import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { createUser, getAllUsers, updateUser, User } from '../services/usersApi';
import { useUserComparison } from '../hooks/useUserComparison';
import { UserComparisonTable } from './UserComparisonTable';
import * as XLSX from 'xlsx';

interface BulkUserCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
  subscriptionLimits: any[];
}

export const BulkUserCreator: React.FC<BulkUserCreatorProps> = ({
  isOpen,
  onClose,
  onSuccess,
  toast,
  subscriptionLimits
}) => {
  const [defaultSubscriptionType, setDefaultSubscriptionType] = useState<string>('gratuito');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Índices de filas seleccionadas en la tabla (incluye usuarios nuevos)
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    excelUsers,
    setExcelUsers,
    existingUsers,
    setExistingUsers,
    processExcelFile,
    compareUsers
  } = useUserComparison();

  // Cargar usuarios existentes cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      loadExistingUsers();
    } else {
      // Limpiar al cerrar
      setExcelUsers([]);
      setExistingUsers([]);
      setShowComparison(false);
      setSelectedIds(new Set());
      setSelectedRowIndices(new Set());
    }
  }, [isOpen]);

  const loadExistingUsers = async () => {
    try {
      const response = await getAllUsers();
      if (response.success) {
        setExistingUsers(response.users);
      }
    } catch (error: any) {
      console.error('Error loading users:', error);
    }
  };

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);

      // Si es Excel, usar el hook de comparación
      if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        const users = await processExcelFile(file);
        setExcelUsers(users);
        setShowComparison(true);
        toast.success(`${users.length} usuarios detectados desde Excel. Comparando con usuarios existentes...`);
      } else {
        // Para otros formatos, mantener el comportamiento anterior
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        const parsedUsers: any[] = [];

        const isCSV = file.name.endsWith('.csv') || text.includes(',');
        const isJSON = file.name.endsWith('.json') || text.trim().startsWith('[');

        if (isJSON) {
          try {
            const jsonData = JSON.parse(text);
            if (Array.isArray(jsonData)) {
              jsonData.forEach((item: any) => {
                if (item.username || item.email) {
                  parsedUsers.push({
                    email: item.email || '',
                    username: item.username || item.email?.split('@')[0] || `user_${Date.now()}`,
                    subscriptionType: item.subscriptionType || item.subscription_type || defaultSubscriptionType,
                    subscriptionStartDate: item.subscriptionStartDate || item.subscription_start_date,
                    subscriptionEndDate: item.subscriptionEndDate || item.subscription_end_date
                  });
                }
              });
            }
          } catch (e) {
            toast.error('Error al parsear JSON. Verifica el formato.');
            return;
          }
        } else {
          // CSV or TXT format
          lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            if (trimmed.includes(',')) {
              const parts = trimmed.split(',').map(p => p.trim());
              if (parts.length >= 2) {
                parsedUsers.push({
                  email: parts[1] || '',
                  username: parts[0] || `user_${index}`,
                  subscriptionType: parts[2] || defaultSubscriptionType,
                  subscriptionEndDate: parts[3] || undefined
                });
              }
            } else {
              if (trimmed.includes('@')) {
                parsedUsers.push({
                  email: trimmed,
                  username: trimmed.split('@')[0],
                  subscriptionType: defaultSubscriptionType
                });
              }
            }
          });
        }

        if (parsedUsers.length > 0) {
          setExcelUsers(parsedUsers);
          setShowComparison(true);
          toast.success(`${parsedUsers.length} usuarios detectados`);
        } else {
          toast.error('No se detectaron usuarios en el archivo');
        }
      }
    } catch (error: any) {
      toast.error(`Error al procesar archivo: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePasteText = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const parsedUsers: any[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.includes(',')) {
        const parts = trimmed.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          parsedUsers.push({
            email: parts[1] || '',
            username: parts[0] || `user_${index}`,
            subscriptionType: parts[2] || defaultSubscriptionType
          });
        }
      } else {
        if (trimmed.includes('@')) {
          parsedUsers.push({
            email: trimmed,
            username: trimmed.split('@')[0],
            subscriptionType: defaultSubscriptionType
          });
        }
      }
    });

    if (parsedUsers.length > 0) {
      setExcelUsers(parsedUsers);
      setShowComparison(true);
      toast.success(`${parsedUsers.length} usuarios detectados`);
    }
  };

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files: File[] = Array.from(e.dataTransfer.files);
    const file = files.find((f: File) =>
      f.name.endsWith('.csv') ||
      f.name.endsWith('.txt') ||
      f.name.endsWith('.json') ||
      f.name.endsWith('.xlsx') ||
      f.name.endsWith('.xls')
    );

    if (file) {
      handleFileUpload(file as File);
    } else {
      toast.error('Por favor, sube un archivo CSV, TXT, JSON o Excel');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Asignar plan y vigencia masivamente a usuarios del Excel
  const handleBulkAssign = (selectedIndices: number[], plan: string, endDate: string) => {
    setExcelUsers(prev => {
      const updated = [...prev];
      selectedIndices.forEach(index => {
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            subscriptionType: plan,
            subscriptionEndDate: endDate,
            subscriptionStartDate: new Date().toISOString().split('T')[0]
          };
        }
      });
      return updated;
    });
  };

  // Procesar usuarios (Crear o Actualizar según corresponda)
  const handleProcessUsers = async () => {
    // Obtener todas las comparaciones seleccionadas por índice
    const selectedComparisonsWithIndex = compareUsers
      .map((c, index) => ({ comparison: c, index }))
      .filter(({ index }) => selectedRowIndices.has(index));

    if (selectedComparisonsWithIndex.length === 0) {
      toast.error('Selecciona al menos un usuario para procesar');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: selectedComparisonsWithIndex.length });
    const results = { success: 0, failed: 0, created: 0, updated: 0, errors: [] as string[] };

    for (let i = 0; i < selectedComparisonsWithIndex.length; i++) {
      const { comparison } = selectedComparisonsWithIndex[i];
      try {
        if (comparison.existingUser) {
          // ACTUALIZAR USUARIO EXISTENTE
          const updates: any = {};
          if (comparison.excelUser.subscriptionType) updates.subscriptionType = comparison.excelUser.subscriptionType;
          if (comparison.excelUser.subscriptionStartDate) updates.subscriptionStartDate = comparison.excelUser.subscriptionStartDate;
          if (comparison.excelUser.subscriptionEndDate) updates.subscriptionEndDate = comparison.excelUser.subscriptionEndDate;

          await updateUser(comparison.existingUser.id, updates);
          results.updated++;
        } else {
          // CREAR USUARIO NUEVO
          const username = comparison.excelUser.username ||
            comparison.excelUser.email?.split('@')[0] ||
            `user_${Date.now()}`;
          const email = comparison.excelUser.email || '';
          const subscriptionType = comparison.excelUser.subscriptionType || defaultSubscriptionType;
          const startDate = comparison.excelUser.subscriptionStartDate || null;
          const endDate = comparison.excelUser.subscriptionEndDate || null;

          await createUser(
            username,
            email,
            subscriptionType,
            undefined,
            startDate || undefined,
            endDate || undefined
          );
          results.created++;
        }
        results.success++;
      } catch (error: any) {
        results.failed++;
        const errorMsg = error.response?.data?.error || error.message;
        results.errors.push(`${comparison.excelUser.email || comparison.excelUser.username}: ${errorMsg}`);
      }
      setProgress({ current: i + 1, total: selectedComparisonsWithIndex.length });
    }

    setIsProcessing(false);
    setProgress({ current: 0, total: 0 });

    if (results.success > 0) {
      let successMsg = '';
      if (results.created > 0 && results.updated > 0) {
        successMsg = `${results.created} creados y ${results.updated} actualizados exitosamente`;
      } else if (results.created > 0) {
        successMsg = `${results.created} usuarios creados exitosamente`;
      } else {
        successMsg = `${results.updated} usuarios actualizados exitosamente`;
      }
      toast.success(successMsg);
      await loadExistingUsers(); // Recargar usuarios
    }

    if (results.failed > 0) {
      toast.error(`${results.failed} fallaron. Errores: ${results.errors.slice(0, 3).join(', ')}`);
    }

    // Limpiar selección después de procesar
    setSelectedRowIndices(new Set());
    setSelectedIds(new Set());
  };

  const handleDownloadExample = () => {
    // Crear ejemplo con columnas inteligentes
    const exampleData = [
      ['email', 'username', 'subscriptionType', 'subscriptionEndDate', 'vigencia'],
      ['usuario1@example.com', 'usuario1', 'gratuito', '2024-12-31', '30 días'],
      ['usuario2@example.com', 'usuario2', 'pro', '2025-01-31', ''],
      ['usuario3@example.com', 'usuario3', 'elite', '', '2025-06-30'],
    ];

    // Usar xlsx para generar el archivo
    const ws = XLSX.utils.aoa_to_sheet(exampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.writeFile(wb, 'ejemplo-usuarios.xlsx');

    toast.success('Archivo Excel de ejemplo descargado');
  };

  const newUsersCount = compareUsers.filter(c => !c.existingUser).length;
  const selectedNewUsersCount = compareUsers
    .map((c, index) => ({ comparison: c, index }))
    .filter(({ comparison, index }) => !comparison.existingUser && selectedRowIndices.has(index))
    .length;
  const needsUpdateCount = compareUsers.filter(c => c.needsUpdate && c.existingUser).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Crear Usuarios por Volumen</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadExample}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              title="Descargar archivo de ejemplo"
            >
              <Download size={16} />
              Descargar Ejemplo
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {!showComparison ? (
            <>
              {/* Upload Section */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de Suscripción por Defecto
                </label>
                <select
                  value={defaultSubscriptionType}
                  onChange={(e) => setDefaultSubscriptionType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg mb-4"
                >
                  {subscriptionLimits
                    .filter(limit => limit.type !== 'administrador')
                    .map(limit => {
                      const messagesText = limit.messages === Infinity || limit.messages === null || limit.messages === undefined
                        ? 'Ilimitados'
                        : `${limit.messages.toLocaleString()} mensajes`;
                      const durationText = limit.duration
                        ? `${limit.duration} día(s)`
                        : 'Permanente';
                      const priceText = limit.price > 0
                        ? `$${limit.price}/mes`
                        : 'Gratis';
                      const displayText = limit.price > 0
                        ? `${limit.type.charAt(0).toUpperCase() + limit.type.slice(1)} (${priceText}, ${messagesText})`
                        : `${limit.type.charAt(0).toUpperCase() + limit.type.slice(1)} (${messagesText}, ${durationText})`;

                      return (
                        <option key={limit.type} value={limit.type}>
                          {displayText}
                        </option>
                      );
                    })}
                </select>

                {/* File Upload */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Subir Archivo Excel
                    </label>
                    <button
                      onClick={handleDownloadExample}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      title="Descargar archivo de ejemplo"
                    >
                      <Download size={12} />
                      Descargar ejemplo Excel
                    </button>
                  </div>
                  <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging ? 'border-green-500 bg-green-50' : 'border-slate-300'
                      }`}
                  >
                    <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-600 mb-2">
                      Arrastra archivos aquí o haz clic para seleccionar
                    </p>
                    <p className="text-xs text-slate-500 mb-4">
                      Formatos soportados: Excel (.xls, .xlsx), CSV, TXT, JSON
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.json,.xlsx,.xls"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw size={16} className="animate-spin inline mr-2" />
                          Procesando...
                        </>
                      ) : (
                        'Seleccionar Archivo'
                      )}
                    </button>
                  </div>
                </div>

                {/* Paste Text */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    O pega texto (uno por línea, formato: username,email,subscriptionType)
                  </label>
                  <textarea
                    ref={pasteTextareaRef}
                    placeholder="usuario1,email1@example.com,gratuito&#10;usuario2,email2@example.com,pro&#10;..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg h-32 font-mono text-sm"
                    onPaste={(e) => {
                      const target = e.currentTarget;
                      setTimeout(() => {
                        const text = target.value;
                        if (text) {
                          handlePasteText(text);
                          target.value = '';
                        }
                      }, 100);
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Tabla de Comparación */}
              <UserComparisonTable
                comparisons={compareUsers}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onBulkUpdate={async () => { }} // Ya no se usa desde la tabla
                onBulkAssign={handleBulkAssign}
                selectedRowIndices={selectedRowIndices}
                onRowSelectionChange={setSelectedRowIndices}
                isLoading={isProcessing}
                toast={toast}
                subscriptionTypes={subscriptionLimits.map((l: any) => l.subscription_type || l.type).filter(Boolean)}
              />

              {/* Acciones */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowComparison(false);
                    setExcelUsers([]);
                    setSelectedIds(new Set());
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cargar Otro Archivo
                </button>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={handleProcessUsers}
                    disabled={isProcessing || selectedRowIndices.size === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Procesando {progress.current}/{progress.total}...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Aplicar Cambios a {selectedRowIndices.size} Usuarios
                      </>
                    )}
                  </button>
                  {isProcessing && progress.total > 0 && (
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Finalizar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
