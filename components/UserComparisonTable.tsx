import React, { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { UserComparison } from '../hooks/useUserComparison';
import { User } from '../services/usersApi';

interface UserComparisonTableProps {
  comparisons: UserComparison[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onBulkUpdate: (selectedComparisons: UserComparison[]) => Promise<void>;
  isLoading?: boolean;
  toast?: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
}

export const UserComparisonTable: React.FC<UserComparisonTableProps> = ({
  comparisons,
  selectedIds,
  onSelectionChange,
  onBulkUpdate,
  isLoading = false,
  toast
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  // Filtrar solo los que necesitan actualización
  const needsUpdateComparisons = useMemo(() => {
    return comparisons.filter(c => c.needsUpdate && c.existingUser);
  }, [comparisons]);

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
    if (selectedIds.size === 0) {
      toast?.error('Por favor selecciona al menos un usuario para actualizar');
      return;
    }

    setIsUpdating(true);
    try {
      const selectedComparisons = comparisons.filter(c => 
        c.existingUser && selectedIds.has(c.existingUser.id)
      );
      
      await onBulkUpdate(selectedComparisons);
      
      // Limpiar selección después de actualizar
      onSelectionChange(new Set());
      
      toast?.success(`${selectedIds.size} usuario(s) actualizado(s) exitosamente`);
    } catch (error: any) {
      toast?.error(`Error al actualizar usuarios: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const allSelected = needsUpdateComparisons.length > 0 && 
    needsUpdateComparisons.every(c => c.existingUser && selectedIds.has(c.existingUser.id));
  const someSelected = needsUpdateComparisons.some(c => c.existingUser && selectedIds.has(c.existingUser.id));

  return (
    <div className="space-y-4">
      {/* Header con acciones */}
      {needsUpdateComparisons.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-blue-900">
              {needsUpdateComparisons.length} usuario(s) necesitan actualización
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkUpdate}
              disabled={selectedIds.size === 0 || isUpdating || isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUpdating ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Aplicar Cambios ({selectedIds.size})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de comparación */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
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
                const isSelected = comparison.existingUser ? selectedIds.has(comparison.existingUser.id) : false;
                const canSelect = comparison.needsUpdate && comparison.existingUser;
                
                return (
                  <tr
                    key={index}
                    className={`hover:bg-slate-50 transition-colors ${
                      canSelect && isSelected ? 'bg-green-50' : ''
                    } ${!comparison.existingUser ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectOne(comparison.existingUser!.id, e.target.checked)}
                          className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                        />
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
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
                      {comparison.differences.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {comparison.differences.map((diff, idx) => (
                            <span key={idx} className="text-xs text-orange-600">
                              {diff.field}: {String(diff.existingValue)} → {String(diff.excelValue)}
                            </span>
                          ))}
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

