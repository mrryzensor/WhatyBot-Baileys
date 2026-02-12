import React, { useState, useEffect } from 'react';
import { UserCircle, Download, Upload, Send, CheckSquare, Square, Search, RefreshCw, AlertCircle, Users, Trash2, FileImage } from 'lucide-react';
import { Contact, Group, Tab } from '../types';
import { getContacts, getGroups, getSocket, getApiUrl } from '../services/api';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface ContactsManagerProps {
    isConnected: boolean;
    onNavigate?: (tab: string) => void;
    toast: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
    initialGroups?: Group[];
    onGroupsUpdate?: (groups: Group[]) => void;
}

interface ExtendedContact {
    id: string;
    phone: string;
    name: string;
    groupNames?: string;
    groups?: Array<{ id: string; name: string; image?: string | null }>;
    profilePicUrl?: string | null;
    [key: string]: any; // Allow dynamic variables
}

export const ContactsManager: React.FC<ContactsManagerProps> = ({ isConnected, onNavigate, toast, initialGroups = [], onGroupsUpdate }) => {
    const [contacts, setContacts] = useState<ExtendedContact[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectAll, setSelectAll] = useState(false);

    // Group selection state
    const [groups, setGroups] = useState<Group[]>(initialGroups);
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
    const [showGroupSelector, setShowGroupSelector] = useState(true);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [groupSearchTerm, setGroupSearchTerm] = useState('');

    // Progress tracking state
    const [extractionProgress, setExtractionProgress] = useState<{
        current: number;
        total: number;
        groupName: string;
        percentage: number;
    } | null>(null);

    // Saved contacts history
    const [savedContactSets, setSavedContactSets] = useState<Array<{
        id: string;
        timestamp: Date;
        count: number;
        groupIds: string[];
    }>>([]);

    // Ref for auto-scroll
    const contactsListRef = React.useRef<HTMLDivElement>(null);

    // Update groups when initialGroups changes
    useEffect(() => {
        if (initialGroups && initialGroups.length > 0) {
            setGroups(initialGroups);
        }
    }, [initialGroups]);

    // Load saved contact sets from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('savedContactSets');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setSavedContactSets(parsed.map((s: any) => ({
                    ...s,
                    timestamp: new Date(s.timestamp)
                })));
            } catch (error) {
                console.error('Error loading saved contact sets:', error);
            }
        }
    }, []);

    // Don't auto-load groups on mount - use cached groups from App
    // Load groups only when user clicks "Actualizar Grupos"

    // Load groups
    const loadGroups = async () => {
        if (!isConnected) {
            toast.error('WhatsApp no está conectado');
            return;
        }

        setIsLoadingGroups(true);
        try {
            const data = await getGroups();

            if (data.success && data.groups) {
                setGroups(data.groups);
                // Update global cache
                if (onGroupsUpdate) {
                    onGroupsUpdate(data.groups);
                }
                toast.success(`${data.groups.length} grupos cargados`);
            } else {
                toast.error('No se pudieron cargar los grupos');
            }
        } catch (error: any) {
            console.error('Error loading groups:', error);
            toast.error(`Error al cargar grupos: ${error.message}`);
        } finally {
            setIsLoadingGroups(false);
        }
    };

    // Load contacts from WhatsApp (filtered by selected groups)
    const loadContacts = async () => {
        if (!isConnected) {
            toast.error('WhatsApp no está conectado');
            return;
        }

        if (selectedGroups.size === 0) {
            toast.warning('Selecciona al menos un grupo');
            return;
        }

        setIsLoading(true);
        setExtractionProgress(null);

        // Setup socket listeners for progress
        const socket = getSocket();

        const progressHandler = (progress: any) => {
            setExtractionProgress(progress);
        };

        const errorHandler = (error: any) => {
            toast.warning(`Error en ${error.groupName}: ${error.error}`, {
                duration: 3000
            });
        };

        socket?.on('contacts:extraction:progress', progressHandler);
        socket?.on('contacts:extraction:error', errorHandler);

        try {
            const groupIds = Array.from(selectedGroups) as string[];
            const data = await getContacts(groupIds);

            if (data.success && data.contacts) {
                const formattedContacts: ExtendedContact[] = data.contacts.map((c: any, index: number) => ({
                    id: c.id || `c-${index}`,
                    phone: c.phone || '',
                    name: c.name || c.phone || 'Sin nombre',
                    groupNames: c.groupNames || 'Sin grupo',
                    groups: c.groups || [],
                    profilePicUrl: c.profilePicUrl
                }));

                // Sync with existing contacts if any
                const syncedContacts = contacts.length > 0
                    ? syncContacts(formattedContacts, contacts)
                    : formattedContacts;

                setContacts(syncedContacts);

                // Save to localStorage automatically
                const savedSet = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    count: syncedContacts.length,
                    groupIds: groupIds,
                    contacts: syncedContacts
                };

                localStorage.setItem(`contacts_${savedSet.id}`, JSON.stringify(savedSet));

                // Update saved sets list
                const newSavedSets = [
                    {
                        id: savedSet.id,
                        timestamp: new Date(savedSet.timestamp),
                        count: savedSet.count,
                        groupIds: savedSet.groupIds
                    },
                    ...savedContactSets
                ].slice(0, 10); // Keep only last 10

                setSavedContactSets(newSavedSets);
                localStorage.setItem('savedContactSets', JSON.stringify(newSavedSets));

                toast.success(`${syncedContacts.length} contactos cargados y guardados`);

                // Auto-scroll to contacts list
                setTimeout(() => {
                    contactsListRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 300);
            } else {
                toast.error('No se pudieron cargar los contactos');
            }
        } catch (error: any) {
            console.error('Error loading contacts:', error);
            toast.error(`Error al cargar contactos: ${error.message}`);
        } finally {
            setIsLoading(false);
            setExtractionProgress(null);

            // Cleanup socket listeners
            socket?.off('contacts:extraction:progress', progressHandler);
            socket?.off('contacts:extraction:error', errorHandler);
        }
    };

    // Filter contacts based on search term
    const filteredContacts = contacts.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.phone.includes(searchTerm) ||
        (contact.groupNames && contact.groupNames.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Filter groups based on search term
    const filteredGroups = groups.filter(group =>
        group.name.toLowerCase().includes(groupSearchTerm.toLowerCase())
    );

    // Helper: Sync contacts (merge new with existing)
    const syncContacts = (newContacts: ExtendedContact[], existingContacts: ExtendedContact[]): ExtendedContact[] => {
        const contactMap = new Map<string, ExtendedContact>();

        // Add all new contacts
        newContacts.forEach(contact => {
            contactMap.set(contact.phone, contact);
        });

        // Keep existing contacts that are not in new set (optional - could remove instead)
        existingContacts.forEach(existing => {
            if (!contactMap.has(existing.phone)) {
                // Contact no longer in selected groups - keep it for now
                contactMap.set(existing.phone, existing);
            }
        });

        return Array.from(contactMap.values()).sort((a, b) => a.phone.localeCompare(b.phone));
    };

    // Helper: Load saved contact set
    const loadSavedContactSet = (id: string) => {
        const saved = localStorage.getItem(`contacts_${id}`);
        if (saved) {
            try {
                const set = JSON.parse(saved);
                setContacts(set.contacts);
                toast.success(`${set.count} contactos cargados desde historial`);

                // Auto-scroll to contacts
                setTimeout(() => {
                    contactsListRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 300);
            } catch (error) {
                console.error('Error loading saved contact set:', error);
                toast.error('Error al cargar contactos guardados');
            }
        }
    };

    // Helper: Delete saved contact set
    const deleteSavedContactSet = (id: string) => {
        localStorage.removeItem(`contacts_${id}`);
        const newSavedSets = savedContactSets.filter(s => s.id !== id);
        setSavedContactSets(newSavedSets);
        localStorage.setItem('savedContactSets', JSON.stringify(newSavedSets));
        toast.success('Contactos eliminados del historial');
    };

    // Helper: Format date
    const formatDate = (date: Date): string => {
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    // Toggle individual contact selection
    const toggleContact = (contactId: string) => {
        const newSelected = new Set(selectedContacts);
        if (newSelected.has(contactId)) {
            newSelected.delete(contactId);
        } else {
            newSelected.add(contactId);
        }
        setSelectedContacts(newSelected);
        setSelectAll(newSelected.size === filteredContacts.length);
    };

    // Toggle select all
    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedContacts(new Set());
            setSelectAll(false);
        } else {
            const allIds = new Set(filteredContacts.map(c => c.id));
            setSelectedContacts(allIds);
            setSelectAll(true);
        }
    };

    // Toggle group selection
    const toggleGroup = (groupId: string) => {
        const newSelected = new Set(selectedGroups);
        if (newSelected.has(groupId)) {
            newSelected.delete(groupId);
        } else {
            newSelected.add(groupId);
        }
        setSelectedGroups(newSelected);
    };

    // Toggle all groups (filtered)
    const toggleAllGroups = () => {
        const filteredIds = new Set(filteredGroups.map(g => g.id));
        const allFilteredSelected = filteredGroups.every(g => selectedGroups.has(g.id));

        if (allFilteredSelected) {
            // Deselect all filtered groups
            const newSelected = new Set(selectedGroups);
            filteredGroups.forEach(g => newSelected.delete(g.id));
            setSelectedGroups(newSelected);
        } else {
            // Select all filtered groups
            const newSelected = new Set(selectedGroups);
            filteredGroups.forEach(g => newSelected.add(g.id));
            setSelectedGroups(newSelected);
        }
    };

    // Export selected contacts to Excel
    const exportContacts = () => {
        const contactsToExport = contacts.filter(c => selectedContacts.has(c.id));

        if (contactsToExport.length === 0) {
            toast.warning('No hay contactos seleccionados para exportar');
            return;
        }

        const exportData = contactsToExport.map(c => ({
            phone: c.phone,
            name: c.name,
            grupos: c.groupNames
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Contactos');

        // Set column widths
        worksheet['!cols'] = [
            { wch: 18 }, // phone
            { wch: 25 }, // name
            { wch: 40 }  // grupos
        ];

        const timestamp = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `contactos_whatsapp_${timestamp}.xlsx`);

        toast.success(`${contactsToExport.length} contactos exportados a Excel`);
    };

    // Export selected contacts to JSON
    const exportToJSON = () => {
        const contactsToExport = contacts.filter(c => selectedContacts.has(c.id));

        if (contactsToExport.length === 0) {
            toast.warning('No hay contactos seleccionados para exportar');
            return;
        }

        const exportData = contactsToExport.map(c => ({
            phone: c.phone,
            name: c.name,
            grupos: c.groupNames
        }));

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().toISOString().split('T')[0];
        link.download = `contactos_whatsapp_${timestamp}.json`;
        link.click();
        URL.revokeObjectURL(url);

        toast.success(`${contactsToExport.length} contactos exportados a JSON`);
    };

    // Export profile pictures to ZIP
    const exportProfilePhotos = async () => {
        const contactsToExport = contacts.filter(c => selectedContacts.has(c.id));
        const contactsWithImages = contactsToExport.filter(c => c.profilePicUrl);

        if (contactsWithImages.length === 0) {
            toast.warning('No hay contactos seleccionados con imagen de perfil');
            return;
        }

        try {
            toast.info(`Preparando descarga de ${contactsWithImages.length} fotos de perfil...`);

            const apiUrl = getApiUrl();
            // Fallback base URL for the API
            const baseUrl = (apiUrl && !apiUrl.includes('5173') && !apiUrl.includes('12345')) ? apiUrl : window.location.origin;

            console.log('[ExportPhotos] Using Base URL:', baseUrl);

            const response = await axios({
                url: `${baseUrl}/api/contacts/export-photos`,
                method: 'POST',
                data: { contacts: contactsWithImages },
                responseType: 'blob',
                headers: {
                    'x-user-id': localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : '',
                    'x-session-id': localStorage.getItem('selectedSessionId') || ''
                }
            });

            // Create download link for the blob
            const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', `fotos_perfil_${new Date().getTime()}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);

            toast.success('Descarga iniciada con éxito');
        } catch (error: any) {
            console.error('Error al exportar fotos:', error);
            let errorMessage = error.message;
            if (error.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const json = JSON.parse(text);
                    errorMessage = json.error || errorMessage;
                } catch (e) { /* ignore */ }
            }
            toast.error('Error al exportar fotos: ' + errorMessage);
        }
    };

    // Send selected contacts to Mass Sender
    const sendToMassSender = () => {
        const contactsToSend = contacts.filter(c => selectedContacts.has(c.id));

        if (contactsToSend.length === 0) {
            toast.warning('No hay contactos seleccionados');
            return;
        }

        // Save to localStorage for MassSender to pick up
        localStorage.setItem('selectedGroupMembers', JSON.stringify(contactsToSend));

        toast.success(`${contactsToSend.length} contactos enviados a Envíos Masivos`);

        // Navigate to Mass Sender using Tab enum
        if (onNavigate) {
            onNavigate(Tab.MASS_SENDER);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                    <UserCircle size={32} />
                    <h2 className="text-2xl font-bold">Gestión de Contactos</h2>
                </div>
                <p className="text-blue-100">
                    Selecciona grupos, extrae contactos y envíalos a campañas masivas
                </p>
            </div>

            {/* Connection Warning */}
            {!isConnected && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                        <p className="font-medium text-yellow-800">WhatsApp no está conectado</p>
                        <p className="text-sm text-yellow-700">
                            Conecta WhatsApp desde el Panel Principal para cargar grupos y contactos
                        </p>
                    </div>
                </div>
            )}

            {/* Saved Contacts Selector */}
            {savedContactSets.length > 0 && (
                <div className="bg-theme-card rounded-lg shadow-sm border border-theme">
                    <div className="border-b border-theme p-4 bg-gradient-to-r from-primary-50 to-emerald-50">
                        <div className="flex items-center gap-3">
                            <Download size={24} className="text-primary-600" />
                            <div>
                                <h3 className="font-bold text-theme-main">Contactos Guardados</h3>
                                <p className="text-sm text-theme-muted">
                                    {savedContactSets.length} conjunto(s) de contactos guardados
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {savedContactSets.map(set => (
                                <div
                                    key={set.id}
                                    className="flex items-center justify-between p-3 border-2 border-theme rounded-lg hover:border-primary-300 hover:bg-primary-50 cursor-pointer transition-all"
                                    onClick={() => loadSavedContactSet(set.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-theme-main">
                                            {set.count} contactos
                                        </p>
                                        <p className="text-xs text-theme-muted">
                                            {formatDate(set.timestamp)} · {set.groupIds.length} grupo(s)
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteSavedContactSet(set.id);
                                        }}
                                        className="ml-3 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Group Selector */}
            <div className="bg-theme-card rounded-lg shadow-sm border border-theme">
                <div className="border-b border-theme p-4 bg-gradient-to-r from-purple-50 to-blue-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Users size={24} className="text-purple-600" />
                            <div>
                                <h3 className="font-bold text-theme-main">Paso 1: Selecciona Grupos</h3>
                                <p className="text-sm text-theme-muted">
                                    Elige los grupos desde donde extraer contactos ({selectedGroups.size} seleccionados)
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={loadGroups}
                            disabled={!isConnected || isLoadingGroups}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <RefreshCw size={18} className={isLoadingGroups ? 'animate-spin' : ''} />
                            {isLoadingGroups ? 'Cargando...' : 'Actualizar Grupos'}
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {groups.length === 0 ? (
                        <div className="text-center py-8">
                            <Users size={48} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-theme-muted font-medium">No hay grupos cargados</p>
                            {isConnected && (
                                <button
                                    onClick={loadGroups}
                                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                >
                                    Cargar Grupos
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Group Search Bar */}
                            <div className="mb-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar grupos..."
                                        value={groupSearchTerm}
                                        onChange={(e) => setGroupSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-theme rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="mb-3 flex items-center justify-between">
                                <button
                                    onClick={toggleAllGroups}
                                    className="flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium"
                                >
                                    {filteredGroups.every(g => selectedGroups.has(g.id)) ? <CheckSquare size={20} /> : <Square size={20} />}
                                    {filteredGroups.every(g => selectedGroups.has(g.id)) ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                                </button>
                                <span className="text-sm text-theme-muted">
                                    {filteredGroups.length} de {groups.length} grupos
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
                                {filteredGroups.map((group) => (
                                    <div
                                        key={group.id}
                                        onClick={() => toggleGroup(group.id)}
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedGroups.has(group.id)
                                            ? 'border-purple-500 bg-purple-50'
                                            : 'border-theme hover:border-theme hover:bg-theme-base'
                                            }`}
                                    >
                                        <div className="flex-shrink-0">
                                            {selectedGroups.has(group.id) ? (
                                                <CheckSquare size={20} className="text-purple-600" />
                                            ) : (
                                                <Square size={20} className="text-slate-400" />
                                            )}
                                        </div>
                                        {/* Group Image */}
                                        <div className="flex-shrink-0">
                                            {group.image ? (
                                                <img
                                                    src={group.image}
                                                    alt={group.name}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold">
                                                    {group.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-theme-main truncate">{group.name}</p>
                                            <p className="text-sm text-theme-muted">{group.participants} miembros</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Extract Contacts Button & Search Filter */}
            <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-4">
                <button
                    onClick={loadContacts}
                    disabled={!isConnected || isLoading || selectedGroups.size === 0}
                    className={`w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-lg ${contacts.length > 0 ? 'mb-4' : ''}`}
                >
                    <UserCircle size={24} className={isLoading ? 'animate-pulse' : ''} />
                    {isLoading ? 'Extrayendo Contactos...' : `Paso 2: Extraer Contactos de ${selectedGroups.size} Grupo(s)`}
                </button>

                {/* Integrated Search and Selection Controls */}
                {contacts.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-theme">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por teléfono, nombre o grupo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-theme rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                        <div className="flex items-center justify-between bg-theme-base p-3 rounded-lg border border-theme">
                            <button
                                onClick={toggleSelectAll}
                                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
                            >
                                {selectAll ? <CheckSquare size={20} /> : <Square size={20} />}
                                {selectAll ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                            </button>
                            <span className="text-xs font-semibold text-theme-muted">
                                ({selectedContacts.size} de {filteredContacts.length} seleccionados)
                            </span>
                        </div>
                    </div>
                )}
                {/* Contacts Section - Only show if contacts are loaded */}
                {contacts.length > 0 && (
                    <div className="space-y-6">
                        {/* Contacts List Grid */}
                        <div ref={contactsListRef} className="bg-theme-card rounded-lg shadow-sm border border-theme overflow-hidden">
                            <div className="p-4">
                                {filteredContacts.length === 0 ? (
                                    <div className="text-center py-12">
                                        <UserCircle size={48} className="mx-auto text-slate-300 mb-3" />
                                        <p className="text-theme-muted font-medium">
                                            No se encontraron contactos con ese criterio de búsqueda
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-2">
                                        {filteredContacts.map((contact) => (
                                            <div
                                                key={contact.id}
                                                onClick={() => toggleContact(contact.id)}
                                                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedContacts.has(contact.id)
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-theme hover:border-theme hover:bg-theme-base'
                                                    }`}
                                            >
                                                <div className="flex-shrink-0">
                                                    {selectedContacts.has(contact.id) ? (
                                                        <CheckSquare size={20} className="text-blue-600" />
                                                    ) : (
                                                        <Square size={20} className="text-slate-400" />
                                                    )}
                                                </div>
                                                {/* Contact Image */}
                                                <div className="flex-shrink-0">
                                                    {contact.profilePicUrl ? (
                                                        <img
                                                            src={contact.profilePicUrl}
                                                            alt={contact.name}
                                                            className="w-12 h-12 rounded-full object-cover"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                                            {contact.name.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-theme-main truncate">{contact.phone}</p>
                                                    <p className="text-sm text-theme-muted truncate mb-2">{contact.name}</p>
                                                    {/* Group Badges */}
                                                    {contact.groups && contact.groups.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {contact.groups.map((group, idx) => (
                                                                <span
                                                                    key={`${group.id}-${idx}`}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium"
                                                                    title={group.name}
                                                                >
                                                                    {group.image && (
                                                                        <img
                                                                            src={group.image}
                                                                            alt=""
                                                                            className="w-3 h-3 rounded-full object-cover"
                                                                            onError={(e) => {
                                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span className="truncate max-w-[120px]">{group.name}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stats Footer */}
                        <div className="bg-theme-base rounded-lg p-4 border border-theme">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-2xl font-bold text-theme-main">{contacts.length}</p>
                                    <p className="text-sm text-theme-muted">Total Contactos</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-blue-600">{selectedContacts.size}</p>
                                    <p className="text-sm text-theme-muted">Seleccionados</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-purple-600">{selectedGroups.size}</p>
                                    <p className="text-sm text-theme-muted">Grupos Activos</p>
                                </div>
                            </div>
                        </div>

                        {/* Actions Bar */}
                        <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-4">
                            <div className="flex flex-wrap gap-3 items-center justify-center sm:justify-between">
                                <div className="flex flex-wrap gap-2 justify-center">
                                    <button
                                        onClick={exportContacts}
                                        disabled={selectedContacts.size === 0}
                                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                    >
                                        <Download size={18} />
                                        Exportar Excel ({selectedContacts.size})
                                    </button>

                                    <button
                                        onClick={exportToJSON}
                                        disabled={selectedContacts.size === 0}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                    >
                                        <Download size={18} />
                                        Exportar JSON ({selectedContacts.size})
                                    </button>

                                    <button
                                        onClick={exportProfilePhotos}
                                        disabled={selectedContacts.size === 0}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                        title="Descargar fotos de perfil en un archivo ZIP"
                                    >
                                        <FileImage size={18} />
                                        Exportar Fotos ({contacts.filter(c => selectedContacts.has(c.id) && c.profilePicUrl).length})
                                    </button>
                                </div>

                                <button
                                    onClick={sendToMassSender}
                                    disabled={selectedContacts.size === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                >
                                    <Send size={18} />
                                    Enviar a Masivos ({selectedContacts.size})
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            {extractionProgress && (
                <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-theme-main">
                            Extrayendo contactos...
                        </span>
                        <span className="text-sm font-semibold text-blue-600">
                            {extractionProgress.current} / {extractionProgress.total} grupos ({extractionProgress.percentage}%)
                        </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${extractionProgress.percentage}%` }}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <p className="text-xs text-theme-muted truncate">
                            Procesando: <span className="font-medium">{extractionProgress.groupName}</span>
                        </p>
                    </div>
                </div>
            )}


        </div>
    );
};
