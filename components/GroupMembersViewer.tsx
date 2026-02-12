import React, { useState, useEffect } from 'react';
import { Users, Search, X, Check, User, Send } from 'lucide-react';
import { getGroupMembers } from '../services/api';

interface GroupMember {
  id: string;
  phone: string;
  name: string;
  isAdmin?: boolean;
}

interface GroupMembersViewerProps {
  groupId: string;
  groupName: string;
  isOpen: boolean;
  onClose: () => void;
  onMembersSelect: (selectedMembers: GroupMember[]) => void;
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
  onNavigate?: (tab: string) => void;
}

export const GroupMembersViewer: React.FC<GroupMembersViewerProps> = ({
  groupId,
  groupName,
  isOpen,
  onClose,
  onMembersSelect,
  toast,
  onNavigate
}) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<GroupMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && groupId) {
      loadMembers();
    } else {
      // Reset state when closed
      setMembers([]);
      setFilteredMembers([]);
      setSelectedMembers(new Set());
      setSearchQuery('');
    }
  }, [isOpen, groupId]);

  useEffect(() => {
    // Filter members based on search query
    if (searchQuery.trim() === '') {
      setFilteredMembers(members);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = members.filter(member =>
        member.name.toLowerCase().includes(query) ||
        member.phone.includes(query)
      );
      setFilteredMembers(filtered);
    }
  }, [searchQuery, members]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const response = await getGroupMembers(groupId);
      if (response.success) {
        setMembers(response.members);
        setFilteredMembers(response.members);
      } else {
        toast.error('Error al cargar los miembros del grupo');
      }
    } catch (error: any) {
      console.error('Error loading group members:', error);
      toast.error('Error al cargar los miembros del grupo');
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const selectAll = () => {
    const allIds = new Set(filteredMembers.map(m => m.id));
    setSelectedMembers(allIds);
  };

  const deselectAll = () => {
    setSelectedMembers(new Set());
  };

  const handleSendMessage = () => {
    if (selectedMembers.size === 0) {
      toast.error('Selecciona al menos un contacto');
      return;
    }

    const selected = members.filter(m => selectedMembers.has(m.id));
    
    // Convert to Contact format for MassSender
    const contacts = selected.map(m => ({
      id: m.id,
      phone: m.phone,
      name: m.name
    }));

    // Save to localStorage for MassSender to load
    localStorage.setItem('selectedGroupMembers', JSON.stringify(contacts));
    
    // Call the callback
    onMembersSelect(selected);
    
    // Show success message
    toast.success(`${contacts.length} contacto(s) transferido(s) a Envíos Masivos`);
    
    // Close the modal
    onClose();
    
    // Navigate to Mass Sender tab
    if (onNavigate) {
      setTimeout(() => {
        onNavigate('mass');
      }, 300);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-card rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-theme bg-theme-base">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Users size={20} className="text-primary-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-main">Miembros del Grupo</h3>
              <p className="text-sm text-theme-muted">{groupName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-theme-muted" />
          </button>
        </div>

        {/* Search and Actions */}
        <div className="p-4 border-b border-theme bg-theme-card">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar miembros por nombre o teléfono..."
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                Seleccionar Todos
              </button>
              <button
                onClick={deselectAll}
                className="px-3 py-2 text-sm font-medium text-theme-muted hover:bg-theme-base rounded-lg transition-colors"
              >
                Deseleccionar
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-theme-muted">
              {filteredMembers.length} miembro(s) encontrado(s)
            </span>
            <span className="text-primary-600 font-medium">
              {selectedMembers.size} seleccionado(s)
            </span>
          </div>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p>Cargando miembros...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <User size={48} className="mb-3 opacity-20" />
              <p>{searchQuery ? 'No se encontraron miembros' : 'No hay miembros en este grupo'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map(member => {
                const isSelected = selectedMembers.has(member.id);

                const cleanValue = (value: string | undefined) => {
                  if (!value) return '';
                  const atIndex = value.indexOf('@');
                  return atIndex >= 0 ? value.slice(0, atIndex) : value;
                };

                const displayPhone = cleanValue(member.phone) || cleanValue(member.id);
                return (
                  <div
                    key={member.id}
                    onClick={() => toggleMember(member.id)}
                    className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary-50 border-2 border-primary-200'
                        : 'hover:bg-theme-base border-2 border-transparent'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-primary-600 border-primary-600'
                        : 'border-theme'
                    }`}>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-semibold text-sm">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-theme-main truncate">
                          {displayPhone}
                        </h4>
                        {member.isAdmin && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-theme-muted truncate">{member.id || 'Sin identificador'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-theme bg-theme-base flex justify-between items-center">
          <div className="text-sm text-theme-muted">
            <span className="font-medium">{selectedMembers.size}</span> contacto(s) seleccionado(s)
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-theme-muted hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSendMessage}
              disabled={selectedMembers.size === 0}
              className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                selectedMembers.size === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              <Send size={16} />
              Enviar Mensaje
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

