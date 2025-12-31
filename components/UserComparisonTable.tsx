import React, { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Calendar, Clock } from 'lucide-react';
import { UserComparison, ExcelUser } from '../hooks/useUserComparison';
import { User } from '../services/usersApi';

interface UserComparisonTableProps {
  comparisons: UserComparison[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onBulkUpdate: (selectedComparisons: UserComparison[]) => Promise<void>;
  onBulkAssign?: (selectedIndices: number[], plan: string, endDate: string) => void;
  // Selección por índice para acciones masivas (incluye nuevos usuarios)
  selectedRowIndices: Set<number>;
  onRowSelectionChange: (indices: Set<number>) => void;
  isLoading?: boolean;
  toast?: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
  subscriptionTypes?: string[];
}

export const UserComparisonTable: React.FC<UserComparisonTableProps> = ({
  comparisons,
  selectedIds,
  onSelectionChange,
  onBulkUpdate,
  onBulkAssign,
  selectedRowIndices,
  onRowSelectionChange,
  isLoading = false,
  toast,
  subscriptionTypes = ['gratuito', 'pro', 'elite']
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [bulkPlan, setBulkPlan] = useState<string>('gratuito');
  const [bulkEndDate, setBulkEndDate] = useState<string>('');

  // Filtrar solo los que necesitan actualización
  const needsUpdateComparisons = useMemo(() => {
    return comparisons.filter(c => c.needsUpdate && c.existingUser);
  }, [comparisons]);

  const selectedUpdateComparisons = useMemo(() => {
    return comparisons.filter((c, index) => {
      if (!selectedRowIndices.has(index)) return false;
      return !!c.existingUser && !!c.needsUpdate;
    });
  }, [comparisons, selectedRowIndices]);

  // Seleccionar/deseleccionar todos
  const handleSelectAll = (checked: boolean) => {
    const newSelection = new Set<number>();
    if (checked) {
      needsUpdateComparisons.forEach(c => {
        if (c.existingUser) {
          newSelection.add(c.existingUser.id);
        }
      });
    }
    onSelectionChange(newSelection);
  };

  // Seleccionar/deseleccionar individual
  const handleSelectOne = (userId: number, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(userId);
    } else {
      newSelection.delete(userId);
    }
    onSelectionChange(newSelection);
  };

  // Aplicar actualizaciones masivas
  const handleBulkUpdate = async () => {
    if (selectedUpdateComparisons.length === 0) {
      toast?.error('Por favor selecciona al menos un usuario para actualizar');
      return;
    }

    setIsUpdating(true);
    try {
      await onBulkUpdate(selectedUpdateComparisons);

      // Limpiar selección después de actualizar
      onSelectionChange(new Set());
      onRowSelectionChange(new Set());

      toast?.success(`${selectedUpdateComparisons.length} usuario(s) actualizado(s) exitosamente`);
    } catch (error: any) {
      toast?.error(`Error al actualizar usuarios: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const allSelected = needsUpdateComparisons.length > 0 &&
    needsUpdateComparisons.every(c => c.existingUser && selectedIds.has(c.existingUser.id));
  const someSelected = needsUpdateComparisons.some(c => c.existingUser && selectedIds.has(c.existingUser.id));

  // Detectar si hay usuarios sin plan o vigencia
  const usersWithoutPlanOrDate = useMemo(() => {
    return comparisons.filter(c =>
      !c.excelUser.subscriptionType || !c.excelUser.subscriptionEndDate
    );
  }, [comparisons]);

  // Selección por índice para acciones masivas (todos los usuarios, no solo los que necesitan update)
  const allRowsSelected = comparisons.length > 0 && selectedRowIndices.size === comparisons.length;
  const someRowsSelected = selectedRowIndices.size > 0 && selectedRowIndices.size < comparisons.length;

  const handleSelectAllRows = (checked: boolean) => {
    if (checked) {
      onRowSelectionChange(new Set(comparisons.map((_, i) => i)));
    } else {
      onRowSelectionChange(new Set());
    }
  };

  const handleSelectRow = (index: number, checked: boolean) => {
    const newSelection = new Set(selectedRowIndices);
    if (checked) {
      newSelection.add(index);
    } else {
      newSelection.delete(index);
    }
    onRowSelectionChange(newSelection);
  };

  // Funciones para calcular fechas
  const addMonthsToDate = (months: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
  };

  const handleApplyBulkAssign = () => {
    if (selectedRowIndices.size === 0) {
      toast?.error('Selecciona al menos un usuario');
      return;
    }
    if (!bulkPlan) {
      toast?.error('Selecciona un plan');
      return;
    }
    if (!bulkEndDate) {
      toast?.error('Selecciona una fecha de vigencia');
      return;
    }
    if (onBulkAssign) {
      onBulkAssign(Array.from(selectedRowIndices), bulkPlan, bulkEndDate);
      toast?.success(`Plan y vigencia asignados a ${selectedRowIndices.size} usuario(s)`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Panel de acciones masivas para asignar plan y vigencia */}
      {onBulkAssign && comparisons.length > 0 && (
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="text-amber-600" size={20} />
            <span className="text-sm font-medium text-amber-900">
              Asignar plan y vigencia masivamente
              {usersWithoutPlanOrDate.length > 0 && (
                <span className="ml-2 text-amber-700">
                  ({usersWithoutPlanOrDate.length} sin definir)
                </span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Selector de Plan */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan a asignar</label>
              <select
                value={bulkPlan}
                onChange={(e) => setBulkPlan(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {subscriptionTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Selector de Fecha */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Vigencia hasta</label>
              <input
                type="date"
                value={bulkEndDate}
                onChange={(e) => setBulkEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Botón Aplicar */}
            <div className="flex items-end">
              <button
                onClick={handleApplyBulkAssign}
                disabled={selectedRowIndices.size === 0 || !bulkPlan || !bulkEndDate}
                className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Calendar size={16} />
                Aplicar a {selectedRowIndices.size} seleccionados
              </button>
            </div>
          </div>

          {/* Botones rápidos de meses */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 self-center">Atajos:</span>
            {[1, 2, 3, 6, 9, 12].map(months => (
              <button
                key={months}
                onClick={() => setBulkEndDate(addMonthsToDate(months))}
                className="px-3 py-1 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                +{months} {months === 1 ? 'mes' : 'meses'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header con resumen de cambios (opcional, ahora unificado en footer) */}
      {needsUpdateComparisons.length > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-200 mb-2">
          <AlertCircle className="text-blue-600" size={18} />
          <span className="text-xs font-medium text-blue-900">
            {needsUpdateComparisons.length} usuario(s) existentes detectados con cambios en el archivo.
            Selecciónalos para actualizar sus datos automáticamente.
          </span>
        </div>
      )}

      {/* Tabla de comparación */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allRowsSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someRowsSelected;
                    }}
                    onChange={(e) => handleSelectAllRows(e.target.checked)}
                    className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Email/Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Plan Actual</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Plan Nuevo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Vigencia Actual</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Vigencia Nueva</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Diferencias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {comparisons.map((comparison, index) => {
                const isRowSelected = selectedRowIndices.has(index);

                return (
                  <tr
                    key={index}
                    className={`hover:bg-slate-50 transition-colors ${isRowSelected ? 'bg-green-50' : ''
                      } ${!comparison.existingUser ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={(e) => handleSelectRow(index, e.target.checked)}
                        className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {comparison.existingUser ? (
                        comparison.needsUpdate ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                            <AlertCircle size={12} />
                            Actualizar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                            <CheckCircle2 size={12} />
                            Actualizado
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                          <XCircle size={12} />
                          Nuevo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">
                          {comparison.excelUser.email || comparison.excelUser.username || 'N/A'}
                        </span>
                        {comparison.matchType !== 'none' && (
                          <span className="text-xs text-slate-500">
                            Coincide por: {comparison.matchType === 'email' ? 'Email' : 'Usuario'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {comparison.existingUser ? (
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                          {comparison.existingUser.subscription_type}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {comparison.excelUser.subscriptionType ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {comparison.excelUser.subscriptionType}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {comparison.existingUser?.subscription_end_date ? (
                        <span className="text-xs text-slate-600">
                          {new Date(comparison.existingUser.subscription_end_date).toLocaleDateString('es-ES')}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {comparison.excelUser.subscriptionEndDate ? (
                        <span className="text-xs text-blue-600 font-medium">
                          {new Date(comparison.excelUser.subscriptionEndDate).toLocaleDateString('es-ES')}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!comparison.existingUser ? (
                        // Usuario nuevo: mostrar plan y vigencia a crear
                        <div className="flex flex-col gap-1">
                          {comparison.excelUser.subscriptionType && (
                            <span className="text-xs text-blue-600">
                              Plan: {comparison.excelUser.subscriptionType}
                            </span>
                          )}
                          {comparison.excelUser.subscriptionEndDate && (
                            <span className="text-xs text-blue-600">
                              Vigencia: {new Date(comparison.excelUser.subscriptionEndDate).toLocaleDateString('es-ES')}
                            </span>
                          )}
                          {!comparison.excelUser.subscriptionType && !comparison.excelUser.subscriptionEndDate && (
                            <span className="text-slate-400 text-xs">Sin definir</span>
                          )}
                        </div>
                      ) : comparison.differences.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {comparison.differences.map((diff, idx) => {
                            // Formatear fechas a dd/mm/aaaa
                            const formatValue = (val: any, field: string) => {
                              if (field.toLowerCase().includes('date') && val) {
                                try {
                                  return new Date(val).toLocaleDateString('es-ES');
                                } catch { return String(val); }
                              }
                              return String(val);
                            };
                            return (
                              <span key={idx} className="text-xs text-orange-600">
                                {diff.field}: {formatValue(diff.existingValue, diff.field)} → {formatValue(diff.excelValue, diff.field)}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Sin cambios</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen */}
      <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
        <div className="flex items-center gap-4">
          <span>
            Total: <strong>{comparisons.length}</strong>
          </span>
          <span>
            Nuevos: <strong className="text-blue-600">
              {comparisons.filter(c => !c.existingUser).length}
            </strong>
          </span>
          <span>
            Actualizar: <strong className="text-yellow-600">
              {needsUpdateComparisons.length}
            </strong>
          </span>
          <span>
            Sin cambios: <strong className="text-green-600">
              {comparisons.filter(c => c.existingUser && !c.needsUpdate).length}
            </strong>
          </span>
        </div>
        {selectedIds.size > 0 && (
          <span className="text-green-600 font-medium">
            {selectedIds.size} seleccionado(s)
          </span>
        )}
      </div>
    </div>
  );
};

