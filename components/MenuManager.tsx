import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit2, Save, X, Menu as MenuIcon, ArrowRight, CheckCircle, Circle, Users, Clock, Download, Upload } from 'lucide-react';
import { InteractiveMenu, MenuOption } from '../types';
import { getInteractiveMenus, createInteractiveMenu, updateInteractiveMenu, deleteInteractiveMenu, getUserSessions, clearUserSession, uploadOptionMedia, exportMenus, importMenus, getApiUrl } from '../services/api';
import { ConfirmModal } from './ConfirmModal';
import { MediaUpload } from './MediaUpload';
import { useMedia } from '../hooks/useMedia';
import { GlobalSessionIndicator } from './GlobalSessionToggle';
import { useGlobalSessions } from '../hooks/useGlobalSessions';
import { ImportModal } from './ImportModal';
import { MessageEditorToolbar } from './MessageEditorToolbar';

interface MenuManagerProps {
    toast?: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
}

export const MenuManager: React.FC<MenuManagerProps> = ({ toast }) => {
    const [menus, setMenus] = useState<InteractiveMenu[]>([]);
    const [sessions, setSessions] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [menuToDelete, setMenuToDelete] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isExporting, setIsExporting] = useState(false);

    const [formData, setFormData] = useState<Partial<InteractiveMenu>>({
        name: '',
        message: '',
        options: [],
        isActive: true
    });

    const [editingOption, setEditingOption] = useState<MenuOption | null>(null);
    const [showOptionEditor, setShowOptionEditor] = useState(false);

    // Local state for triggers input (to handle commas and spaces properly)
    const [triggersInput, setTriggersInput] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);

    const menuMedia = useMedia({ maxFiles: 10 }); // For menu-level media
    const optionMedia = useMedia({ maxFiles: 10 }); // For option-level media
    const { globalSessionsEnabled } = useGlobalSessions();

    // Refs para los textareas del editor de formato
    const menuMessageRef = useRef<HTMLTextAreaElement>(null);
    const optionMessageRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
    const optionResponseRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        loadMenus();
        loadSessions();
        // Refresh sessions every 30 seconds
        const interval = setInterval(loadSessions, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadMenus = async () => {
        try {
            const response = await getInteractiveMenus();
            if (response.success) {
                setMenus(response.menus);
            }
        } catch (error: any) {
            console.error('Error loading menus:', error);
            if (toast) {
                toast.error('Error al cargar menús: ' + error.message);
            }
        }
    };

    const loadSessions = async () => {
        try {
            const response = await getUserSessions();
            if (response.success) {
                setSessions(response.sessions);
            }
        } catch (error: any) {
            console.error('Error loading sessions:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            message: '',
            options: [],
            isActive: true
        });
        setEditingId(null);
        setFormErrors({});
        menuMedia.setMediaItems([]); // Clear menu media
    };

    const handleEdit = (menu: InteractiveMenu) => {
        setEditingId(menu.id);
        setFormData({ ...menu });

        // Load menu-level media
        if (menu.mediaPaths && menu.mediaPaths.length > 0) {
            const mediaItems = menu.mediaPaths.map((path, index) => {
                const previewUrl = path.startsWith('http')
                    ? path
                    : `${getApiUrl()}/uploads/${path.replace(/^.*[\\/]/, '')}`;

                let type: 'image' | 'video' | 'document' = 'document';
                const lowerPath = path.toLowerCase();
                if (lowerPath.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                    type = 'image';
                } else if (lowerPath.match(/\.(mp4|avi|mov|webm)$/)) {
                    type = 'video';
                }

                return {
                    id: `menu-${index}`,
                    mediaPath: path,
                    type,
                    caption: menu.captions?.[index] || '',
                    preview: previewUrl,
                    file: undefined
                };
            });
            menuMedia.setMediaItems(mediaItems);
        } else {
            menuMedia.setMediaItems([]);
        }
    };

    const handleSave = async () => {
        const errors: { [key: string]: string } = {};

        if (!formData.name) {
            errors.name = 'Nombre es requerido';
        }

        // Message is optional if there's at least one caption in media
        const hasCaption = menuMedia.mediaItems.some(item => item.caption && item.caption.trim().length > 0);
        if (!formData.message && !hasCaption) {
            errors.message = 'Mensaje es requerido (o agrega un caption en los archivos multimedia)';
        }

        if (!formData.options || formData.options.length === 0) {
            errors.options = 'Debes agregar al menos una opción';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setFormErrors({});
        setIsLoading(true);

        try {
            // Extract menu-level media files
            const menuFiles = menuMedia.mediaItems
                .filter(item => item.file)
                .map(item => item.file!);

            // Extract existing menu media paths
            const existingMenuPaths = menuMedia.mediaItems
                .filter(item => !item.file && item.mediaPath)
                .map(item => item.mediaPath!);

            const menuData = {
                name: formData.name!,
                message: formData.message!,
                options: formData.options!,
                isActive: formData.isActive ?? true,
                mediaPaths: existingMenuPaths,
                captions: menuMedia.mediaItems.map(item => item.caption || '')
            };

            console.log('--- ENVIANDO DATOS AL SERVIDOR ---');
            console.log('Menu Name:', menuData.name);
            menuData.options.forEach((opt, i) => {
                console.log(`Option ${i}: ${opt.label}, nextMenuId: ${opt.nextMenuId}`);
            });

            if (editingId) {
                const response = await updateInteractiveMenu(editingId, menuData, menuFiles);
                if (response.success) {
                    setMenus(menus.map(m => m.id === editingId ? response.menu : m));
                    if (toast) {
                        toast.success('Menú actualizado exitosamente');
                    }
                    resetForm();
                }
            } else {
                const response = await createInteractiveMenu(menuData, menuFiles);
                if (response.success) {
                    setMenus([...menus, response.menu]);
                    if (toast) {
                        toast.success('Menú creado exitosamente');
                    }
                    resetForm();
                }
            }
        } catch (error: any) {
            console.error('Error saving menu:', error);
            if (toast) {
                // Enhanced error message
                const serverMsg = error.response?.data?.error || error.message;
                toast.error('Error al guardar menú: ' + serverMsg);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = (id: string) => {
        setMenuToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!menuToDelete) return;

        const menu = menus.find(m => m.id === menuToDelete);
        const menuName = menu?.name || 'este menú';

        try {
            setIsLoading(true);
            await deleteInteractiveMenu(menuToDelete);
            setMenus(menus.filter(m => m.id !== menuToDelete));
            if (toast) {
                toast.success(`Menú "${menuName}" eliminado exitosamente`);
            }
        } catch (error: any) {
            console.error('Error deleting menu:', error);
            if (toast) {
                toast.error('Error al eliminar menú: ' + error.message);
            }
        } finally {
            setIsLoading(false);
            setShowDeleteModal(false);
            setMenuToDelete(null);
        }
    };

    const toggleStatus = async (id: string) => {
        const menu = menus.find(m => m.id === id);
        if (!menu) return;

        try {
            setIsLoading(true);
            const updatedMenu = { ...menu, isActive: !menu.isActive };
            const response = await updateInteractiveMenu(id, updatedMenu);
            if (response.success) {
                setMenus(menus.map(m => m.id === id ? response.menu : m));
                if (toast) {
                    const newStatus = response.menu.isActive;
                    toast.success(`Menú "${menu.name}" ${newStatus ? 'activado' : 'desactivado'} exitosamente`);
                }
            }
        } catch (error: any) {
            console.error('Error toggling status:', error);
            if (toast) {
                toast.error('Error al actualizar estado: ' + error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearSession = async (userId: string) => {
        try {
            await clearUserSession(userId);
            loadSessions();
            if (toast) {
                toast.success('Sesión limpiada exitosamente');
            }
        } catch (error: any) {
            console.error('Error clearing session:', error);
            if (toast) {
                toast.error('Error al limpiar sesión: ' + error.message);
            }
        }
    };

    // Option Editor Functions
    const openOptionEditor = (option?: MenuOption) => {
        if (option) {
            setEditingOption({ ...option });
            // Load existing media into optionMedia
            if (option.mediaPaths && option.mediaPaths.length > 0) {
                const mediaItems = option.mediaPaths.map((path, index) => {
                    const previewUrl = path.startsWith('http')
                        ? path
                        : `${getApiUrl()}/uploads/${path.replace(/^.*[\\/]/, '')}`;

                    let type: 'image' | 'video' | 'document' = 'document';
                    const lowerPath = path.toLowerCase();
                    if (lowerPath.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                        type = 'image';
                    } else if (lowerPath.match(/\.(mp4|avi|mov|webm)$/)) {
                        type = 'video';
                    }

                    return {
                        id: `existing-${index}`,
                        mediaPath: path,
                        type,
                        caption: option.captions?.[index] || '',
                        preview: previewUrl,
                        file: undefined
                    };
                });
                optionMedia.setMediaItems(mediaItems);
            } else {
                optionMedia.setMediaItems([]);
            }
            // Initialize triggers input
            setTriggersInput(option.triggers.join(', '));
        } else {
            setEditingOption({
                id: Date.now().toString(),
                label: '',
                triggers: [],
                response: '',
                mediaPaths: [],
                captions: [],
                nextMenuId: undefined,
                endConversation: false
            });
            optionMedia.setMediaItems([]);
            // Initialize empty triggers input
            setTriggersInput('');
        }
        setShowOptionEditor(true);
    };

    const saveOption = async () => {
        if (!editingOption) return;

        const parsedTriggers = triggersInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

        if (!editingOption.label || parsedTriggers.length === 0) {
            if (toast) {
                toast.error('La opción debe tener etiqueta y al menos un trigger');
            }
            return;
        }

        try {
            // Upload new files if any
            const filesToUpload = optionMedia.mediaItems
                .filter(item => item.file)
                .map(item => item.file!);

            let uploadedPaths: string[] = [];
            if (filesToUpload.length > 0) {
                if (toast) {
                    toast.info('Subiendo archivos...');
                }
                const uploadResponse = await uploadOptionMedia(filesToUpload);
                if (uploadResponse.success) {
                    uploadedPaths = uploadResponse.files.map((f: any) => f.path);
                }
            }

            // Combine existing paths + new uploaded paths
            const existingPaths = optionMedia.mediaItems
                .filter(item => !item.file && item.mediaPath)
                .map(item => item.mediaPath!);

            const mediaPaths = [...existingPaths, ...uploadedPaths];
            const captions = optionMedia.mediaItems.map(item => item.caption || '');

            const updatedOption: MenuOption = {
                ...editingOption,
                triggers: parsedTriggers,
                mediaPaths,
                captions
            };

            setFormData(prev => {
                const currentOptions = prev.options || [];
                const existingIndex = currentOptions.findIndex(o => o.id === updatedOption.id);

                let updatedOptions;
                if (existingIndex >= 0) {
                    updatedOptions = [...currentOptions];
                    updatedOptions[existingIndex] = updatedOption;
                } else {
                    updatedOptions = [...currentOptions, updatedOption];
                }

                return { ...prev, options: updatedOptions };
            });

            setShowOptionEditor(false);
            setEditingOption(null);
            optionMedia.setMediaItems([]);

            if (toast) {
                toast.success('Opción guardada localmente');
            }
        } catch (error: any) {
            console.error('Error saving option:', error);
            if (toast) {
                toast.error('Error al guardar opción: ' + error.message);
            }
        }
    };

    const deleteOption = (optionId: string) => {
        const updatedOptions = (formData.options || []).filter(o => o.id !== optionId);
        setFormData({ ...formData, options: updatedOptions });
    };

    // Quick option templates
    const addQuickOption = (type: 'main' | 'exit' | 'back') => {
        if (type === 'main') {
            // Go to main menu - find first menu
            const mainMenu = menus.length > 0 ? menus[0] : null;
            setEditingOption({
                id: Date.now().toString(),
                label: '🏠 Menú Principal',
                triggers: ['0', 'menu', 'inicio', 'principal'],
                response: 'Volviendo al menú principal...',
                mediaPaths: [],
                captions: [],
                nextMenuId: mainMenu?.id,
                endConversation: false
            });
        } else if (type === 'exit') {
            // Exit menu
            setEditingOption({
                id: Date.now().toString(),
                label: '❌ Salir',
                triggers: ['salir', 'exit', 'cancelar', 'terminar'],
                response: '¡Hasta pronto! 👋',
                mediaPaths: [],
                captions: [],
                nextMenuId: undefined,
                endConversation: true
            });
        } else if (type === 'back') {
            // Back to previous level
            setEditingOption({
                id: Date.now().toString(),
                label: '🔙 Volver Anterior',
                triggers: ['9', 'volver', 'atras', 'back'],
                response: 'Volviendo...',
                mediaPaths: [],
                captions: [],
                nextMenuId: undefined,
                goBack: true,
                endConversation: false
            });
            // Reset triggersInput to match
            setTriggersInput('9, volver, atras, back');
        }
        optionMedia.setMediaItems([]);
        if (type !== 'back') {
            // Initial triggers for other types
            if (type === 'main') setTriggersInput('0, menu, inicio, principal');
            if (type === 'exit') setTriggersInput('salir, exit, cancelar, terminar');
        }
        setShowOptionEditor(true);
    };

    // Import/Export functions
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/menus/export`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Error al exportar menús');
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/zip')) {
                // Download ZIP file
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `menus-export-${new Date().toISOString().split('T')[0]}.zip`;
                link.click();
                URL.revokeObjectURL(url);

                if (toast) {
                    toast.success('Menús exportados exitosamente');
                }
            } else {
                // Download JSON file (legacy, no media files)
                const data = await response.json();
                const dataStr = JSON.stringify(data.menus, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `menus-export-${new Date().toISOString().split('T')[0]}.json`;
                link.click();
                URL.revokeObjectURL(url);

                if (toast) {
                    toast.success(`${data.count} menú(s) exportado(s) exitosamente`);
                }
            }
        } catch (error: any) {
            console.error('Error exporting menus:', error);
            if (toast) {
                toast.error('Error al exportar menús: ' + error.message);
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleImportFromModal = async (file: File, applyToAllSessions: boolean) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('applyToAllSessions', String(applyToAllSessions));

            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/menus/import`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al importar');
            }

            const result = await response.json();

            if (result.success) {
                await loadMenus(); // Reload menus
                if (toast) {
                    const parts = [];
                    if (result.imported > 0) parts.push(`${result.imported} nuevo(s)`);
                    if (result.replaced > 0) parts.push(`${result.replaced} reemplazado(s)`);
                    if (result.skipped > 0) parts.push(`${result.skipped} omitido(s)`);

                    const sessionScope = applyToAllSessions ? ' (todas las sesiones)' : ' (sesión activa)';
                    const message = parts.length > 0
                        ? `Menús importados: ${parts.join(', ')}${sessionScope}`
                        : `Importación completada${sessionScope}`;
                    toast.success(message);
                }
                if (result.errors && result.errors.length > 0) {
                    console.warn('Import errors:', result.errors);
                }
            }
        } catch (error: any) {
            console.error('Error importing menus:', error);
            if (toast) {
                toast.error('Error al importar menús: ' + error.message);
            }
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const formData = new FormData();
            formData.append('file', file);

            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/menus/import`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al importar');
            }

            const result = await response.json();

            if (result.success) {
                await loadMenus(); // Reload menus
                if (toast) {
                    const parts = [];
                    if (result.imported > 0) parts.push(`${result.imported} nuevo(s)`);
                    if (result.replaced > 0) parts.push(`${result.replaced} reemplazado(s)`);
                    if (result.skipped > 0) parts.push(`${result.skipped} omitido(s)`);

                    const message = parts.length > 0
                        ? `Menús importados: ${parts.join(', ')}`
                        : 'Importación completada';
                    toast.success(message);
                }
                if (result.errors && result.errors.length > 0) {
                    console.warn('Import errors:', result.errors);
                }
            }
        } catch (error: any) {
            console.error('Error importing menus:', error);
            if (toast) {
                toast.error('Error al importar menús: ' + error.message);
            }
        } finally {
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
                {/* Left Column: Menus List */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                    <div className="bg-theme-card p-6 rounded-xl shadow-sm border border-theme">
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-theme-main flex items-center gap-2">
                                    <MenuIcon size={20} className="text-blue-600" /> Menús Interactivos
                                </h3>
                                <GlobalSessionIndicator enabled={globalSessionsEnabled} />
                            </div>
                            <p className="text-xs text-theme-muted mt-2">
                                Crea menús con opciones para guiar conversaciones.
                            </p>

                            {/* Import/Export Buttons */}
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={handleExport}
                                    disabled={isExporting}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Exportar menús"
                                >
                                    {isExporting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent"></div>
                                            Exportando...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={14} />
                                            Exportar
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowImportModal(true)}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors text-xs font-medium"
                                    title="Importar menús"
                                >
                                    <Upload size={14} />
                                    Importar
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json,.zip"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 bg-theme-card rounded-xl shadow-sm border border-theme overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-theme bg-theme-base flex justify-between items-center">
                            <span className="font-medium text-theme-main text-sm">Lista de Menús</span>
                            <span className="bg-slate-200 text-theme-muted px-2 py-0.5 rounded text-xs">{menus.length}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {menus.length === 0 ? (
                                <div className="text-center p-8 text-slate-400 italic text-sm">
                                    No hay menús creados.
                                </div>
                            ) : (
                                menus.map(menu => (
                                    <div key={menu.id} className={`p-4 rounded-lg border transition-all ${editingId === menu.id ? 'border-blue-500 bg-blue-50' : menu.isActive ? 'border-theme hover:border-blue-200 bg-theme-card' : 'border-theme bg-theme-base opacity-75'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-theme-main text-sm">{menu.name}</h4>
                                                {!menu.isActive && (
                                                    <span className="px-2 py-0.5 text-xs font-medium bg-slate-200 text-theme-muted rounded-full">
                                                        Desactivado
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => toggleStatus(menu.id)}
                                                    className={`p-1.5 rounded transition-colors ${menu.isActive ? 'text-primary-600 hover:bg-primary-50' : 'text-slate-400 hover:bg-slate-100'}`}
                                                    title={menu.isActive ? 'Desactivar' : 'Activar'}
                                                >
                                                    {menu.isActive ? <CheckCircle size={16} /> : <Circle size={16} />}
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(menu)}
                                                    className="p-1.5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                                    title="Editar menú"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(menu.id)}
                                                    className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    title="Eliminar menú"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-theme-muted mb-2 line-clamp-2">{menu.message}</p>
                                        <div className="text-xs text-slate-400">
                                            {menu.options.length} opción(es)
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Active Sessions */}
                    {sessions.length > 0 && (
                        <div className="bg-theme-card p-4 rounded-xl shadow-sm border border-theme">
                            <div className="flex items-center gap-2 mb-3">
                                <Users size={16} className="text-primary-600" />
                                <h4 className="font-semibold text-theme-main text-sm">Sesiones Activas ({sessions.length})</h4>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {sessions.map(session => {
                                    const menu = menus.find(m => m.id === session.currentMenuId);
                                    return (
                                        <div key={session.userId} className="flex items-center justify-between p-2 bg-theme-base rounded text-xs">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-theme-main truncate">{session.userId.split('@')[0]}</div>
                                                <div className="text-theme-muted">{menu?.name || session.currentMenuId}</div>
                                            </div>
                                            <button
                                                onClick={() => handleClearSession(session.userId)}
                                                className="ml-2 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                title="Limpiar sesión"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Editor */}
                <div className="lg:col-span-2">
                    <div className="bg-theme-card p-6 rounded-xl shadow-sm border border-theme h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-semibold text-theme-main flex items-center gap-2">
                                {editingId ? <><Edit2 size={18} /> Editar Menú</> : <><Plus size={18} /> Nuevo Menú</>}
                            </h3>
                            {editingId && (
                                <button onClick={resetForm} className="text-xs text-theme-muted flex items-center gap-1 hover:text-red-500">
                                    <X size={14} /> Cancelar Edición
                                </button>
                            )}
                        </div>

                        {formErrors.general && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                                <p className="text-sm text-red-600">{formErrors.general}</p>
                            </div>
                        )}

                        <div className="space-y-4 flex-1 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-theme-main mb-1">Nombre del Menú</label>
                                <input
                                    type="text"
                                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 ${formErrors.name ? 'border-red-300' : 'border-theme'
                                        }`}
                                    placeholder="Ej: Menú Principal"
                                    value={formData.name}
                                    onChange={e => {
                                        setFormData({ ...formData, name: e.target.value });
                                        if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                                    }}
                                />
                                {formErrors.name && (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                                )}
                            </div>


                            <div>
                                <label className="block text-sm font-medium text-theme-main mb-1">
                                    Mensaje del Menú <span className="text-slate-400 text-xs font-normal">(opcional si hay captions)</span>
                                </label>

                                {/* Barra de Formato */}
                                <MessageEditorToolbar
                                    textareaRef={menuMessageRef}
                                    value={formData.message}
                                    onChange={(value) => {
                                        setFormData({ ...formData, message: value });
                                        if (formErrors.message) setFormErrors({ ...formErrors, message: '' });
                                    }}
                                    showVariables={false}
                                />

                                <textarea
                                    ref={menuMessageRef}
                                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 resize-none mt-2 ${formErrors.message ? 'border-red-300' : 'border-theme'
                                        }`}
                                    placeholder="¡Hola! 👋 ¿En qué puedo ayudarte?&#10;&#10;1️⃣ Información&#10;2️⃣ Precios&#10;3️⃣ Soporte"
                                    rows={6}
                                    value={formData.message}
                                    onChange={e => {
                                        setFormData({ ...formData, message: e.target.value });
                                        if (formErrors.message) setFormErrors({ ...formErrors, message: '' });
                                    }}
                                />
                                {formErrors.message && (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.message}</p>
                                )}
                                <p className="text-xs text-slate-400 mt-1">
                                    Este mensaje se mostrará cuando el usuario entre al menú. Puede estar vacío si agregas el mensaje en los captions de los archivos multimedia.
                                </p>
                            </div>

                            {/* Menu-level Media Upload */}
                            <div>
                                <label className="block text-sm font-medium text-theme-main mb-2">
                                    Archivos Multimedia del Menú (opcional)
                                </label>
                                <MediaUpload
                                    mediaItems={menuMedia.mediaItems}
                                    onMediaChange={menuMedia.setMediaItems}
                                    maxFiles={10}
                                    fileInputRef={menuMedia.fileInputRef}
                                    onFileSelect={menuMedia.handleFileSelect}
                                    onDrop={menuMedia.handleDrop}
                                    onOpenFileSelector={menuMedia.openFileSelector}
                                    onRemoveMedia={menuMedia.removeMedia}
                                    onUpdateCaption={menuMedia.updateCaption}
                                />
                                <p className="text-xs text-slate-400 mt-2">
                                    Estos archivos se enviarán junto con el mensaje del menú.
                                </p>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-theme-main">Opciones del Menú</label>
                                    <button
                                        onClick={() => openOptionEditor()}
                                        className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                                    >
                                        <Plus size={14} /> Agregar Opción
                                    </button>
                                </div>

                                {/* Quick Options */}
                                <div className="flex gap-2 mb-3">
                                    <button
                                        onClick={() => addQuickOption('main')}
                                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors text-xs font-medium"
                                        title="Agregar opción para volver al menú principal"
                                    >
                                        🏠 Principal
                                    </button>
                                    <button
                                        onClick={() => addQuickOption('back')}
                                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
                                        title="Agregar opción para volver al nivel anterior"
                                    >
                                        🔙 Volver
                                    </button>
                                    <button
                                        onClick={() => addQuickOption('exit')}
                                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-medium"
                                        title="Agregar opción para salir del menú"
                                    >
                                        ❌ Salir
                                    </button>
                                </div>

                                {formErrors.options && (
                                    <p className="mb-2 text-sm text-red-600">{formErrors.options}</p>
                                )}

                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {(formData.options || []).length === 0 ? (
                                        <div className="text-center p-6 text-slate-400 italic text-sm border-2 border-dashed border-theme rounded-lg">
                                            No hay opciones. Agrega al menos una opción.
                                        </div>
                                    ) : (
                                        (formData.options || []).map((option, index) => (
                                            <div key={option.id} className="p-3 bg-theme-base rounded-lg border border-theme">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-theme-main text-sm mb-1">{option.label}</div>
                                                        <div className="text-xs text-theme-muted mb-1">
                                                            Triggers: {option.triggers.join(', ')}
                                                        </div>
                                                        {option.response && (
                                                            <div className="text-xs text-theme-muted line-clamp-2 italic">"{option.response}"</div>
                                                        )}
                                                        {option.nextMenuId && (
                                                            <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                                                <ArrowRight size={12} />
                                                                {menus.find(m => m.id === option.nextMenuId)?.name || option.nextMenuId}
                                                            </div>
                                                        )}
                                                        {option.endConversation && (
                                                            <div className="text-xs text-red-600 mt-1">🔚 Termina conversación</div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-1 ml-2">
                                                        <button
                                                            onClick={() => openOptionEditor(option)}
                                                            className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteOption(option.id)}
                                                            className="p-1 text-red-400 hover:bg-red-50 rounded transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 mt-4 border-t border-theme flex justify-end">
                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="bg-theme-sidebar text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 flex items-center gap-2 shadow-lg disabled:opacity-50"
                            >
                                <Save size={18} /> {editingId ? 'Actualizar Menú' : 'Guardar Menú'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Option Editor Modal */}
            {showOptionEditor && editingOption && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-theme-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-theme-main">
                                    {editingOption.label ? 'Editar Opción' : 'Nueva Opción'}
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowOptionEditor(false);
                                        setEditingOption(null);
                                    }}
                                    className="text-slate-400 hover:text-theme-muted"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-theme-main mb-1">Etiqueta de la Opción</label>
                                    <input
                                        type="text"
                                        className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Ej: Información"
                                        value={editingOption.label}
                                        onChange={e => setEditingOption({ ...editingOption, label: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-theme-main mb-1">Triggers (separados por coma)</label>
                                    <input
                                        type="text"
                                        className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="1, info, información"
                                        value={triggersInput}
                                        onChange={e => setTriggersInput(e.target.value)}
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Palabras o números que activan esta opción</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-theme-main mb-1">Respuesta (opcional)</label>

                                    {/* Barra de Formato */}
                                    <MessageEditorToolbar
                                        textareaRef={optionResponseRef}
                                        value={editingOption.response || ''}
                                        onChange={(value) => setEditingOption({ ...editingOption, response: value })}
                                        showVariables={false}
                                    />

                                    <textarea
                                        ref={optionResponseRef}
                                        className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 resize-none mt-2"
                                        placeholder="Texto de respuesta cuando se selecciona esta opción"
                                        rows={4}
                                        value={editingOption.response || ''}
                                        onChange={e => setEditingOption({ ...editingOption, response: e.target.value })}
                                    />
                                </div>

                                {/* Media Upload */}
                                <div>
                                    <label className="block text-sm font-medium text-theme-main mb-2">
                                        Archivos Multimedia (opcional)
                                    </label>
                                    <MediaUpload
                                        mediaItems={optionMedia.mediaItems}
                                        onMediaChange={optionMedia.setMediaItems}
                                        maxFiles={10}
                                        fileInputRef={optionMedia.fileInputRef}
                                        onFileSelect={optionMedia.handleFileSelect}
                                        onDrop={optionMedia.handleDrop}
                                        onOpenFileSelector={optionMedia.openFileSelector}
                                        onRemoveMedia={optionMedia.removeMedia}
                                        onUpdateCaption={optionMedia.updateCaption}
                                    />
                                    <p className="text-xs text-slate-400 mt-2">
                                        Puedes adjuntar imágenes, videos o documentos con sus respectivos captions.
                                    </p>
                                </div>

                                <div className={editingOption.goBack ? 'opacity-50 pointer-events-none grayscale' : ''}>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-theme-main">Siguiente Menú (opcional)</label>
                                        <button
                                            onClick={async () => {
                                                const subMenuName = `${editingOption.label} - Submenú`;
                                                try {
                                                    const response = await createInteractiveMenu({
                                                        name: subMenuName,
                                                        message: `Bienvenido al menú: ${subMenuName}`,
                                                        options: [],
                                                        isActive: true,
                                                        mediaPaths: [],
                                                        captions: []
                                                    }, []);
                                                    if (response.success) {
                                                        setMenus(prev => [...prev, response.menu]);
                                                        setEditingOption(prev => prev ? { ...prev, nextMenuId: String(response.menu.id) } : null);
                                                        if (toast) toast.success('Submenú creado y vinculado');
                                                    }
                                                } catch (e: any) {
                                                    if (toast) toast.error('Error al crear submenú: ' + e.message);
                                                }
                                            }}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                            title="Crear un nuevo menú y vincularlo automáticamente a esta opción"
                                        >
                                            <Plus size={12} /> Crear Nuevo Menú
                                        </button>
                                    </div>
                                    <select
                                        className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-theme-card"
                                        value={String(editingOption.nextMenuId || '')}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditingOption(prev => prev ? { ...prev, nextMenuId: val || undefined } : null);
                                        }}
                                        disabled={editingOption.goBack}
                                    >
                                        <option value="">-- Sin navegación --</option>
                                        {menus.filter(m => String(m.id) !== String(editingId)).map(menu => (
                                            <option key={menu.id} value={String(menu.id)}>{menu.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-slate-400 mt-1">Menú al que navegar después de esta opción</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="goBack"
                                        checked={editingOption.goBack || false}
                                        onChange={e => {
                                            const checked = e.target.checked;
                                            setEditingOption({
                                                ...editingOption,
                                                goBack: checked,
                                                nextMenuId: checked ? undefined : editingOption.nextMenuId,
                                                endConversation: checked ? false : editingOption.endConversation
                                            });
                                        }}
                                        className="w-4 h-4 text-blue-600 border-theme rounded focus:ring-blue-500"
                                    />
                                    <label htmlFor="goBack" className="text-sm text-theme-main font-medium">
                                        🔙 Esta opción vuelve al menú anterior (Nivel Superior)
                                    </label>
                                </div>

                                <div className="flex items-center gap-2 opacity-80" style={{ pointerEvents: editingOption.goBack ? 'none' : 'auto', filter: editingOption.goBack ? 'grayscale(1)' : 'none' }}>
                                    <input
                                        type="checkbox"
                                        id="endConversation"
                                        checked={editingOption.endConversation || false}
                                        onChange={e => setEditingOption({ ...editingOption, endConversation: e.target.checked })}
                                        className="w-4 h-4 text-blue-600 border-theme rounded focus:ring-blue-500"
                                        disabled={editingOption.goBack}
                                    />
                                    <label htmlFor="endConversation" className="text-sm text-theme-main">
                                        Terminar conversación después de esta opción
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-theme">
                                <button
                                    onClick={() => {
                                        setShowOptionEditor(false);
                                        setEditingOption(null);
                                    }}
                                    className="px-4 py-2 text-theme-muted hover:text-theme-main font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={saveOption}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                                >
                                    <Save size={16} /> Guardar Opción
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setMenuToDelete(null);
                }}
                onConfirm={confirmDelete}
                title="Eliminar Menú"
                message={`¿Estás seguro de que deseas eliminar el menú "${menus.find(m => m.id === menuToDelete)?.name}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                confirmButtonClass="bg-red-600 hover:bg-red-700"
            />

            <ImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImport={handleImportFromModal}
                title="Importar Menús"
                description="Selecciona un archivo ZIP o JSON con menús"
                acceptedFormats=".json,.zip"
            />
        </>
    );
};
