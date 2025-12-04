import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, Trash2, Edit2 } from 'lucide-react';
import { Group, GroupSelection } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { getGroupSelections, createGroupSelection, deleteGroupSelection } from '../services/api';

interface GroupSelectionManagerProps {
  groups: Group[];
  selectedGroups: Set<string>;
  onSelectionLoad: (groupIds: string[]) => void;
  onSelectionChange: (groupIds: string[]) => void;
  toast?: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

export const GroupSelectionManager: React.FC<GroupSelectionManagerProps> = ({
  groups,
  selectedGroups,
  onSelectionLoad,
  onSelectionChange,
  toast
}) => {
  const [savedSelections, setSavedSelections] = useState<GroupSelection[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectionToDelete, setSelectionToDelete] = useState<string | null>(null);
  const [selectionName, setSelectionName] = useState('');
  const [selectionDescription, setSelectionDescription] = useState('');

  // Track if selections have been loaded to avoid multiple loads
  const [selectionsLoaded, setSelectionsLoaded] = useState(false);

  // Load saved selections from API when groups are available
  useEffect(() => {
    // Only load selections when groups are loaded and we haven't loaded them yet
    if (groups.length > 0 && !selectionsLoaded) {
      loadSelections();
      setSelectionsLoaded(true);
    }
  }, [groups.length, selectionsLoaded]);

  // Reload selections when groups change (to update counts) - only if selections are already loaded
  useEffect(() => {
    if (savedSelections.length > 0 && groups.length > 0 && selectionsLoaded) {
      // Update selections with current group data
      const updatedSelections = savedSelections.map(selection => {
        const validGroupIds = selection.groupIds.filter(groupId => 
          groups.some(g => g.id === groupId)
        );
        return {
          ...selection,
          groupIds: validGroupIds
        };
      }).filter(selection => selection.groupIds.length > 0);
      
      // Only update if there are changes (avoid infinite loop)
      const hasChanges = updatedSelections.length !== savedSelections.length ||
        updatedSelections.some((sel, idx) => 
          sel.groupIds.length !== savedSelections[idx]?.groupIds.length
        );
      
      if (hasChanges) {
        setSavedSelections(updatedSelections);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, selectionsLoaded]);

  const loadSelections = async () => {
    try {
      const response = await getGroupSelections();
      if (response.success) {
        // Filter selections to only include groups that currently exist
        const validSelections = response.selections.map(selection => {
          // Filter groupIds to only include groups that exist
          const validGroupIds = selection.groupIds.filter(groupId => 
            groups.some(g => g.id === groupId)
          );
          return {
            ...selection,
            groupIds: validGroupIds
          };
        }).filter(selection => selection.groupIds.length > 0); // Only keep selections with at least one valid group
        
        setSavedSelections(validSelections);

        // Show warning if some selections were filtered out
        const filteredCount = response.selections.length - validSelections.length;
        if (filteredCount > 0) {
          toast?.warning(`${filteredCount} selección(es) fueron omitidas porque contenían grupos que ya no existen`);
        }
      }
    } catch (error: any) {
      console.error('Error loading group selections:', error);
      toast?.error('Error al cargar selecciones guardadas');
    }
  };

  // Save selection to database
  const saveSelection = async () => {
    if (!selectionName.trim()) {
      toast?.error('Por favor ingresa un nombre para la selección');
      return;
    }
    if (selectedGroups.size === 0) {
      toast?.error('No hay grupos seleccionados para guardar');
      return;
    }

    try {
      const response = await createGroupSelection(
        selectionName.trim(),
        selectionDescription.trim(),
        Array.from(selectedGroups)
      );
      
      if (response.success) {
    toast?.success(`Selección "${selectionName}" guardada exitosamente`);
    setSelectionName('');
    setSelectionDescription('');
        // Reload selections
        await loadSelections();
        setSelectionsLoaded(true);
      }
    } catch (error: any) {
      console.error('Error saving group selection:', error);
      toast?.error(error.response?.data?.error || 'Error al guardar la selección');
    }
  };

  // Load selection
  const loadSelection = (selection: GroupSelection) => {
    onSelectionLoad(selection.groupIds);
    if (toast) {
      toast.success(`Selección "${selection.name}" cargada`);
    }
  };

  // Delete selection
  const deleteSelection = (id: string) => {
    setSelectionToDelete(id);
    setShowConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (selectionToDelete) {
      try {
        const response = await deleteGroupSelection(selectionToDelete);
        if (response.success) {
      toast?.success('Selección eliminada exitosamente');
          // Reload selections
          await loadSelections();
          setSelectionsLoaded(true);
        }
      } catch (error: any) {
        console.error('Error deleting group selection:', error);
        toast?.error(error.response?.data?.error || 'Error al eliminar la selección');
      }
    }
    setShowConfirmModal(false);
    setSelectionToDelete(null);
  };

  // Get selection info
  const getSelectionInfo = (groupIds: string[]) => {
    // Only count groups that actually exist
    const selectedGroups = groups.filter(g => groupIds.includes(g.id));
    const totalParticipants = selectedGroups.reduce((sum, g) => sum + (g.participants || 0), 0);
    return {
      count: selectedGroups.length,
      participants: totalParticipants,
      names: selectedGroups.map(g => g.name).slice(0, 3),
      missingCount: groupIds.length - selectedGroups.length // Count of groups that don't exist anymore
    };
  };

  const currentSelectionInfo = getSelectionInfo(Array.from(selectedGroups));

  return (
    <div className="space-y-4">
      {/* Current Selection Info */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-semibold text-slate-800">Selección Actual</h4>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectionName('new-selection')}
              disabled={selectedGroups.size === 0}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedGroups.size === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Save size={14} />
              Guardar
            </button>
          </div>
        </div>
        
        <div className="text-sm text-slate-600">
          <span className="font-bold">{currentSelectionInfo.count}</span> grupos seleccionados
          <span className="ml-4">
            <span className="font-bold">{currentSelectionInfo.participants.toLocaleString()}</span> participantes totales
          </span>
        </div>
        
        {currentSelectionInfo.names.length > 0 && (
          <div className="mt-2 text-xs text-slate-500">
            Grupos: {currentSelectionInfo.names.join(', ')}
            {currentSelectionInfo.count > 3 && ` y ${currentSelectionInfo.count - 3} más`}
          </div>
        )}
      </div>

      {/* Saved Selections */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <FolderOpen size={16} />
          Selecciones Guardadas
        </h4>
        
        {savedSelections.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay selecciones guardadas</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {savedSelections.map(selection => {
              const info = getSelectionInfo(selection.groupIds);
              return (
                <div
                  key={selection.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <h5 className="font-medium text-slate-800">{selection.name}</h5>
                    {selection.description && (
                      <p className="text-xs text-slate-500 mb-1">{selection.description}</p>
                    )}
                    <div className="text-xs text-slate-600">
                      {info.count} grupos • {info.participants.toLocaleString()} participantes
                      {info.missingCount > 0 && (
                        <span className="text-yellow-600 ml-2">
                          ({info.missingCount} grupo(s) ya no disponible(s))
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      Guardado: {selection.createdAt instanceof Date 
                        ? selection.createdAt.toLocaleDateString() 
                        : new Date(selection.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => loadSelection(selection)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      title="Cargar selección"
                    >
                      <FolderOpen size={14} />
                    </button>
                    <button
                      onClick={() => deleteSelection(selection.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Eliminar selección"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Dialog */}
      {selectionName && selectionName !== '' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
            <h3 className="font-semibold text-slate-800 mb-4">Guardar Selección de Grupos</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre de la selección *
                </label>
                <input
                  type="text"
                  value={selectionName === 'new-selection' ? '' : selectionName}
                  onChange={(e) => setSelectionName(e.target.value)}
                  placeholder="Ej: Clientes VIP, Grupos de marketing, etc."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-green-500"
                  maxLength={50}
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción (opcional)
                </label>
                <textarea
                  value={selectionDescription}
                  onChange={(e) => setSelectionDescription(e.target.value)}
                  placeholder="Describe el propósito de esta selección..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-none h-20 focus:outline-none focus:border-green-500"
                  maxLength={200}
                />
              </div>
              
              <div className="bg-slate-50 p-3 rounded-lg">
                <div className="text-sm text-slate-600">
                  Se guardarán {currentSelectionInfo.count} grupos con {currentSelectionInfo.participants.toLocaleString()} participantes
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setSelectionName('');
                  setSelectionDescription('');
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={saveSelection}
                disabled={!selectionName.trim() || selectionName === 'new-selection'}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmDelete}
        title="Eliminar Selección"
        message="¿Estás seguro de que deseas eliminar esta selección guardada? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  );
};
