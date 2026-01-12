import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, Bot, Clock, ToggleLeft, ToggleRight, X, Download, Upload, Image, Video, FileText, Paperclip, Menu as MenuIcon } from 'lucide-react';
import { AutoReplyRule, InteractiveMenu } from '../types';
import { createAutoReplyRule, updateAutoReplyRule, deleteAutoReplyRule, importAutoReplyRules, getAutoReplyRules, getInteractiveMenus, getApiUrl } from '../services/api';
import { MediaUpload } from './MediaUpload';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { MessagePreview } from './MessagePreview';
import { BulkProgressBar } from './BulkProgressBar';
import { ConfirmModal } from './ConfirmModal';
import { useMedia, MediaItem as UseMediaItem } from '../hooks/useMedia';
import { MediaThumbnail } from './MediaThumbnail';
import { GlobalSessionIndicator } from './GlobalSessionToggle';
import { useGlobalSessions } from '../hooks/useGlobalSessions';
import { ImportModal } from './ImportModal';

interface AutoReplyManagerProps {
    rules: AutoReplyRule[];
    setRules: (rules: AutoReplyRule[]) => void;
    toast?: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
}

export const AutoReplyManager: React.FC<AutoReplyManagerProps> = ({ rules, setRules, toast }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [menus, setMenus] = useState<InteractiveMenu[]>([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const { globalSessionsEnabled } = useGlobalSessions();

    // Load interactive menus
    useEffect(() => {
        loadMenus();
    }, []);

    const loadMenus = async () => {
        try {
            const response = await getInteractiveMenus();
            if (response.success) {
                setMenus(response.menus.filter((m: InteractiveMenu) => m.isActive));
            }
        } catch (error) {
            console.error('Error loading menus:', error);
        }
    };

    // Helper function to get media preview URL
    const getMediaPreviewUrl = (mediaPath: string): string => {
        if (mediaPath.startsWith('http')) {
            return mediaPath;
        }
        const fileName = mediaPath.split(/[/\\]/).pop() || '';
        return `${getApiUrl()}/uploads/${fileName}`;
    };

    // Helper function to get media type from path
    const getMediaTypeFromPath = (path: string): 'image' | 'video' | 'document' => {
        const ext = path.toLowerCase().split('.').pop() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
        if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv'].includes(ext)) return 'video';
        return 'document';
    };

    // Form State
    const [formData, setFormData] = useState<Partial<AutoReplyRule>>({
        name: '',
        keywords: [],
        response: '',
        matchType: 'contains',
        delay: 2,
        isActive: true,
        type: 'simple'
    });

    const [keywordInput, setKeywordInput] = useState('');
    const media = useMedia({ maxFiles: 50 });
    const importInputRef = useRef<HTMLInputElement>(null);
    const messageTextareaRef = useRef<HTMLTextAreaElement>(null);

    const resetForm = () => {
        setFormData({
            name: '',
            keywords: [],
            response: '',
            matchType: 'contains',
            delay: 2,
            isActive: true,
            type: 'simple'
        });
        setKeywordInput('');
        media.setMediaItems([]);
        setEditingId(null);
    };

    const handleEdit = (rule: AutoReplyRule) => {
        setEditingId(rule.id);
        setFormData({ ...rule });

        // Normalize keywords to array before joining
        let keywordsArray: string[] = [];
        if (Array.isArray(rule.keywords)) {
            keywordsArray = rule.keywords;
        } else if (typeof rule.keywords === 'string') {
            try {
                keywordsArray = JSON.parse(rule.keywords as string);
            } catch {
                keywordsArray = (rule.keywords as string)
                    .split(',')
                    .map((k: string) => k.trim())
                    .filter((k: string) => k.length > 0);
            }
        }
        setKeywordInput(keywordsArray.join(', '));

        // Helper to infer media type from path
        const getMediaTypeFromPath = (path: string): 'image' | 'video' | 'document' => {
            const ext = path.toLowerCase().split('.').pop() || '';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
            if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv'].includes(ext)) return 'video';
            return 'document';
        };

        // Cargar múltiples medias si existen en la regla (mediaPaths + captions)
        if (Array.isArray((rule as any).mediaPaths) && (rule as any).mediaPaths.length > 0) {
            const mediaPaths: string[] = (rule as any).mediaPaths.filter((p: any) => !!p);

            // Get captions array - each file should have its own caption or empty string
            const captionsArray: string[] = Array.isArray((rule as any).captions)
                ? (rule as any).captions
                : mediaPaths.map(() => ''); // Empty string for each file if no captions array

            const items: UseMediaItem[] = mediaPaths.map((mp, index) => {
                const fileName = mp.split(/[/\\]/).pop() || 'archivo';
                const previewUrl = mp.startsWith('http')
                    ? mp
                    : `${getApiUrl()}/uploads/${mp.replace(/^.*[\\/]/, '')}`;

                return {
                    preview: previewUrl,
                    caption: captionsArray[index] || '', // Use specific caption or empty
                    type: getMediaTypeFromPath(mp),
                    mediaPath: mp,
                    fileName
                };
            });

            media.setMediaItems(items);
        } else if (rule.mediaPath) {
            // Compatibilidad: una sola mediaPath antigua
            const mp = rule.mediaPath;
            const fileName = mp.split(/[/\\]/).pop() || 'archivo';
            const previewUrl = mp.startsWith('http')
                ? mp
                : `${getApiUrl()}/uploads/${mp.replace(/^.*[\\/]/, '')}`;

            const mediaItem: UseMediaItem = {
                preview: previewUrl,
                caption: rule.caption || '',
                type: getMediaTypeFromPath(mp),
                mediaPath: mp,
                fileName
            };

            media.setMediaItems([mediaItem]);
        } else {
            media.setMediaItems([]);
        }
    };

    const handleSave = async () => {
        const errors: { [key: string]: string } = {};

        if (!formData.name) {
            errors.name = 'Nombre es requerido';
        }

        // Validate based on type
        if (formData.type === 'menu') {
            // Menu type requires menuId
            if (!formData.menuId) {
                errors.menuId = 'Debes seleccionar un menú';
            }
        } else {
            // Simple type requires response or media
            if (!formData.response && media.mediaItems.length === 0) {
                errors.response = 'Respuesta o archivo multimedia es requerido';
            }
        }

        const processedKeywords = keywordInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (processedKeywords.length === 0) {
            errors.keywords = 'Debes agregar al menos una palabra clave';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setFormErrors({});

        setIsLoading(true);
        try {
            // Construir arrays de archivos y captions desde todos los mediaItems
            const files = media.mediaItems
                .map(item => item.file)
                .filter((f): f is File => !!f);
            const captions = media.mediaItems.map(item => item.caption || '');

            // Si estamos editando y no hay nuevos archivos, preservamos las rutas existentes (pueden ser varias)
            const existingMediaPaths = editingId && files.length === 0 && media.mediaItems.length > 0
                ? media.mediaItems
                    .map(item => item.mediaPath)
                    .filter((p): p is string => !!p)
                : undefined;

            console.log('[AutoReplyManager] handleSave - files:', files, 'captions:', captions, 'existingMediaPaths:', existingMediaPaths);

            const ruleData = {
                name: formData.name!,
                keywords: processedKeywords,
                response: formData.response || '',
                matchType: formData.matchType as 'exact' | 'contains',
                delay: formData.delay || 0,
                isActive: formData.isActive ?? true,
                caption: captions[0] || '',
                captions,
                type: formData.type || 'simple',
                menuId: formData.menuId
            };

            if (editingId) {
                // Si editamos y no hay nuevos archivos, pasamos existingMediaPaths para preservar los actuales
                console.log('[AutoReplyManager] updateAutoReplyRule payload:', { id: editingId, ruleData, files, existingMediaPaths });
                const response = await updateAutoReplyRule(editingId, ruleData, files, existingMediaPaths);
                if (response.success) {
                    setRules(rules.map(r => r.id === editingId ? response.rule : r));
                    resetForm();
                }
            } else {
                console.log('[AutoReplyManager] createAutoReplyRule payload:', { ruleData, files, captions });
                const response = await createAutoReplyRule(ruleData, files, captions);
                if (response.success) {
                    setRules([...rules, response.rule]);
                    resetForm();
                }
            }
        } catch (error: any) {
            console.error('Error saving rule:', error);
            if (toast) {
                toast.error('Error al guardar la regla: ' + error.message);
            } else {
                setFormErrors({ general: 'Error al guardar la regla: ' + error.message });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = (id: string) => {
        setRuleToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!ruleToDelete) return;

        const rule = rules.find(r => r.id === ruleToDelete);
        const ruleName = rule?.name || 'esta regla';

        try {
            setIsLoading(true);
            await deleteAutoReplyRule(ruleToDelete);
            setRules(rules.filter(r => r.id !== ruleToDelete));
            if (toast) {
                toast.success(`Regla "${ruleName}" eliminada exitosamente`);
            }
        } catch (error: any) {
            console.error('Error deleting rule:', error);
            if (toast) {
                toast.error('Error al eliminar la regla: ' + error.message);
            }
        } finally {
            setIsLoading(false);
            setShowDeleteModal(false);
            setRuleToDelete(null);
        }
    };

    const toggleStatus = async (id: string) => {
        const rule = rules.find(r => r.id === id);
        if (!rule) return;

        try {
            setIsLoading(true);
            const updatedRule = { ...rule, isActive: !rule.isActive };
            const response = await updateAutoReplyRule(id, updatedRule);
            if (response.success) {
                setRules(rules.map(r => r.id === id ? response.rule : r));
                if (toast) {
                    const newStatus = response.rule.isActive;
                    toast.success(`Regla "${rule.name}" ${newStatus ? 'activada' : 'desactivada'} exitosamente`);
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

    // Export rules to JSON or ZIP (with media files)
    const handleExportRules = async () => {
        setIsExporting(true);
        try {
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/auto-reply/export`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Error al exportar reglas');
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/zip')) {
                // Download ZIP file
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `auto-reply-rules-${new Date().toISOString().split('T')[0]}.zip`;
                link.click();
                URL.revokeObjectURL(url);

                if (toast) {
                    toast.success('Reglas exportadas exitosamente');
                }
            } else {
                // Download JSON file (legacy, no media files)
                const data = await response.json();
                const dataStr = JSON.stringify(data.rules, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `auto-reply-rules-${new Date().toISOString().split('T')[0]}.json`;
                link.click();
                URL.revokeObjectURL(url);

                if (toast) {
                    toast.success(`Se exportaron ${data.count} regla(s) exitosamente`);
                }
            }
        } catch (error: any) {
            console.error('Error exporting rules:', error);
            if (toast) {
                toast.error('Error al exportar reglas: ' + error.message);
            }
        } finally {
            setIsExporting(false);
        }
    };

    // Import rules from JSON file
    const handleImportRules = async (file: File) => {
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const text = event.target?.result as string;
                    const importedRules = JSON.parse(text);

                    if (!Array.isArray(importedRules)) {
                        if (toast) {
                            toast.error('El archivo debe contener un array de reglas');
                        }
                        return;
                    }

                    // Use the import endpoint which handles media files automatically
                    try {
                        const response = await importAutoReplyRules(importedRules);

                        if (response.success && response.imported > 0) {
                            // Reload rules to get the imported ones
                            const rulesResponse = await getAutoReplyRules();
                            if (rulesResponse.success) {
                                setRules(rulesResponse.rules);
                            }

                            let message = `Se importaron ${response.imported} regla(s) exitosamente`;
                            if (response.failed > 0) {
                                message += `. ${response.failed} regla(s) no pudieron importarse.`;
                            }
                            if (response.errors && response.errors.length > 0) {
                                const errorPreview = response.errors.slice(0, 3).join('; ');
                                message += ` Errores: ${errorPreview}${response.errors.length > 3 ? '...' : ''}`;
                            }

                            if (toast) {
                                toast.success(message);
                            }
                        } else {
                            if (toast) {
                                const errorMsg = response.errors && response.errors.length > 0
                                    ? response.errors.slice(0, 3).join('; ')
                                    : 'No se pudieron importar las reglas';
                                toast.error(errorMsg);
                            }
                        }
                    } catch (error: any) {
                        console.error('Error importing rules:', error);
                        if (toast) {
                            toast.error('Error al importar reglas: ' + (error.response?.data?.error || error.message));
                        }
                    }
                } catch (error: any) {
                    console.error('Error parsing imported file:', error);
                    if (toast) {
                        toast.error('Error al procesar el archivo: ' + error.message);
                    }
                }
            };
            reader.readAsText(file);
        } catch (error: any) {
            console.error('Error importing rules:', error);
            if (toast) {
                toast.error('Error al importar reglas: ' + error.message);
            }
        }
    };

    const handleImportFromModal = async (file: File, applyToAllSessions: boolean) => {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'json' && ext !== 'zip') {
            if (toast) {
                toast.error('Por favor selecciona un archivo JSON o ZIP válido');
            }
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('applyToAllSessions', String(applyToAllSessions));

            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/auto-reply/rules/import`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al importar');
            }

            const result = await response.json();

            if (result.success && result.success > 0) {
                // Reload rules
                const rulesResponse = await getAutoReplyRules();
                if (rulesResponse.success) {
                    setRules(rulesResponse.rules);
                }

                const parts = [];
                if (result.success > 0) parts.push(`${result.success} nueva(s)`);
                if (result.replaced > 0) parts.push(`${result.replaced} reemplazada(s)`);
                if (result.failed > 0) parts.push(`${result.failed} fallida(s)`);

                const sessionScope = applyToAllSessions ? ' (todas las sesiones)' : ' (sesión activa)';
                const message = parts.length > 0
                    ? `Reglas importadas: ${parts.join(', ')}${sessionScope}`
                    : `Importación completada${sessionScope}`;

                if (toast) {
                    toast.success(message);
                }

                if (result.errors && result.errors.length > 0) {
                    console.warn('Import errors:', result.errors);
                }
            } else {
                if (toast) {
                    toast.error('No se pudieron importar las reglas');
                }
            }
        } catch (error: any) {
            console.error('Error importing rules:', error);
            if (toast) {
                toast.error('Error al importar reglas: ' + error.message);
            }
        }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'json' && ext !== 'zip') {
            if (toast) {
                toast.error('Por favor selecciona un archivo JSON o ZIP válido');
            }
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', file);

            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/auto-reply/rules/import`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al importar');
            }

            const result = await response.json();

            if (result.success && result.success > 0) {
                // Reload rules
                const rulesResponse = await getAutoReplyRules();
                if (rulesResponse.success) {
                    setRules(rulesResponse.rules);
                }

                const parts = [];
                if (result.success > 0) parts.push(`${result.success} nueva(s)`);
                if (result.replaced > 0) parts.push(`${result.replaced} reemplazada(s)`);
                if (result.failed > 0) parts.push(`${result.failed} fallida(s)`);

                const message = parts.length > 0
                    ? `Reglas importadas: ${parts.join(', ')}`
                    : 'Importación completada';

                if (toast) {
                    toast.success(message);
                }

                if (result.errors && result.errors.length > 0) {
                    console.warn('Import errors:', result.errors);
                }
            } else {
                if (toast) {
                    toast.error('No se pudieron importar las reglas');
                }
            }
        } catch (error: any) {
            console.error('Error importing rules:', error);
            if (toast) {
                toast.error('Error al importar reglas: ' + error.message);
            }
        } finally {
            // Reset input
            if (importInputRef.current) {
                importInputRef.current.value = '';
            }
        }
    };

    return (
        <>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">

                {/* Left Column: Rules List */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                    <Bot size={20} className="text-green-600" /> Reglas Activas
                                </h3>
                                <GlobalSessionIndicator enabled={globalSessionsEnabled} />
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                El bot responderá automáticamente cuando detecte estas palabras clave.
                            </p>
                        </div>

                        {/* Export/Import buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleExportRules}
                                disabled={rules.length === 0 || isExporting}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                title="Exportar reglas a archivo JSON"
                            >
                                {isExporting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Exportando...
                                    </>
                                ) : (
                                    <>
                                        <Download size={16} />
                                        Exportar
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => setShowImportModal(true)}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                title="Importar reglas desde archivo JSON"
                            >
                                <Upload size={16} />
                                Importar
                            </button>
                            <input
                                ref={importInputRef}
                                type="file"
                                accept=".json,.zip"
                                onChange={handleImportFile}
                                className="hidden"
                            />
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <span className="font-medium text-slate-700 text-sm">Lista de Reglas</span>
                            <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs">{rules.length}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {rules.length === 0 ? (
                                <div className="text-center p-8 text-slate-400 italic text-sm">
                                    No hay reglas creadas.
                                </div>
                            ) : (
                                rules.map(rule => (
                                    <div key={rule.id} className={`p-4 rounded-lg border transition-all ${editingId === rule.id ? 'border-green-500 bg-green-50' : rule.isActive ? 'border-slate-100 hover:border-green-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-slate-800 text-sm">{rule.name}</h4>
                                                {rule.type === 'menu' && (
                                                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                                                        <MenuIcon size={12} /> Menú
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => toggleStatus(rule.id)}
                                                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${rule.isActive
                                                        ? "text-green-600 hover:bg-green-50 bg-green-50"
                                                        : "text-slate-400 hover:bg-slate-100 bg-slate-50"
                                                        }`}
                                                    title={rule.isActive ? "Desactivar regla" : "Activar regla"}
                                                >
                                                    {rule.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                    <span className="text-xs font-medium">
                                                        {rule.isActive ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(rule)}
                                                    className="p-1.5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                                    title="Editar regla"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(rule.id)}
                                                    className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    title="Eliminar regla"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {(() => {
                                                // Normalize keywords to array (handle string or array)
                                                let keywordsArray: string[] = [];
                                                if (Array.isArray(rule.keywords)) {
                                                    keywordsArray = rule.keywords;
                                                } else if (typeof rule.keywords === 'string') {
                                                    try {
                                                        // Try to parse as JSON string
                                                        keywordsArray = JSON.parse(rule.keywords);
                                                    } catch {
                                                        // If not JSON, split by comma
                                                        keywordsArray = rule.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
                                                    }
                                                }
                                                return keywordsArray.map((k, i) => (
                                                    <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                        {k}
                                                    </span>
                                                ));
                                            })()}
                                        </div>

                                        {/* Media Thumbnail */}
                                        {rule.mediaPath && (() => {
                                            return (
                                                <div className="mb-2">
                                                    <MediaThumbnail
                                                        src={getMediaPreviewUrl(rule.mediaPath)}
                                                        mediaPath={rule.mediaPath}
                                                        type={getMediaTypeFromPath(rule.mediaPath)}
                                                        caption={rule.caption}
                                                        className="h-20"
                                                    />
                                                </div>
                                            );
                                        })()}

                                        <p className="text-xs text-slate-500 line-clamp-2 italic border-l-2 border-slate-200 pl-2">
                                            "{rule.response}"
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Editor */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                {editingId ? <><Edit2 size={18} /> Editar Regla</> : <><Plus size={18} /> Nueva Regla</>}
                            </h3>
                            {editingId && (
                                <button onClick={resetForm} className="text-xs text-slate-500 flex items-center gap-1 hover:text-red-500">
                                    <X size={14} /> Cancelar Edición
                                </button>
                            )}
                        </div>

                        {formErrors.general && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                                <p className="text-sm text-red-600">{formErrors.general}</p>
                            </div>
                        )}

                        <div className="space-y-4 flex-1">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Regla</label>
                                <input
                                    type="text"
                                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 ${formErrors.name ? 'border-red-300' : 'border-slate-300'
                                        }`}
                                    placeholder="Ej: Respuesta Saludo"
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

                            {/* Type Selector */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Respuesta</label>
                                <select
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                                    value={formData.type || 'simple'}
                                    onChange={e => {
                                        const newType = e.target.value as 'simple' | 'menu';
                                        setFormData({ ...formData, type: newType, menuId: newType === 'simple' ? undefined : formData.menuId });
                                    }}
                                >
                                    <option value="simple">💬 Respuesta Simple</option>
                                    <option value="menu">🎯 Menú Interactivo</option>
                                </select>
                                <p className="text-xs text-slate-400 mt-1">
                                    {formData.type === 'menu'
                                        ? 'Inicia una conversación guiada con opciones'
                                        : 'Envía un mensaje de respuesta directa'}
                                </p>
                            </div>

                            {/* Menu Selector (only if type is 'menu') */}
                            {formData.type === 'menu' && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                        <MenuIcon size={16} className="text-blue-600" />
                                        Seleccionar Menú
                                    </label>
                                    {menus.length === 0 ? (
                                        <div className="text-sm text-slate-600 bg-white rounded-lg p-4 border border-slate-200">
                                            <p className="mb-2">⚠️ No hay menús activos disponibles.</p>
                                            <p className="text-xs text-slate-500">
                                                Ve a <strong>Menús Interactivos</strong> para crear un menú primero.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <select
                                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white ${formErrors.menuId ? 'border-red-300' : 'border-slate-300'
                                                    }`}
                                                value={formData.menuId || ''}
                                                onChange={e => {
                                                    setFormData({ ...formData, menuId: e.target.value });
                                                    if (formErrors.menuId) setFormErrors({ ...formErrors, menuId: '' });
                                                }}
                                            >
                                                <option value="">-- Selecciona un menú --</option>
                                                {menus.map(menu => (
                                                    <option key={menu.id} value={menu.id}>
                                                        {menu.name} ({menu.options.length} opciones)
                                                    </option>
                                                ))}
                                            </select>
                                            {formErrors.menuId && (
                                                <p className="mt-1 text-sm text-red-600">{formErrors.menuId}</p>
                                            )}
                                            {formData.menuId && (
                                                <div className="mt-3 text-xs text-slate-600 bg-white rounded p-3 border border-slate-200">
                                                    <p className="font-medium mb-1">📋 Preview del menú:</p>
                                                    <p className="whitespace-pre-wrap">
                                                        {menus.find(m => m.id === formData.menuId)?.message}
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Palabras Clave (Triggers)</label>
                                <input
                                    type="text"
                                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 ${formErrors.keywords ? 'border-red-300' : 'border-slate-300'
                                        }`}
                                    placeholder="hola, buenos dias, info, precio (separadas por coma)"
                                    value={keywordInput}
                                    onChange={e => {
                                        setKeywordInput(e.target.value);
                                        if (formErrors.keywords) setFormErrors({ ...formErrors, keywords: '' });
                                    }}
                                />
                                {formErrors.keywords ? (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.keywords}</p>
                                ) : (
                                    <p className="text-xs text-slate-400 mt-1">El bot responderá si el mensaje recibido contiene alguna de estas palabras.</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Coincidencia</label>
                                    <select
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                                        value={formData.matchType}
                                        onChange={e => setFormData({ ...formData, matchType: e.target.value as any })}
                                    >
                                        <option value="contains">Contiene (Flexible)</option>
                                        <option value="exact">Exacta (Estricta)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                        <Clock size={14} /> Retraso de Respuesta (seg)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
                                        value={formData.delay}
                                        onChange={e => setFormData({ ...formData, delay: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {/* Response and Media (only for simple type) */}
                            {formData.type !== 'menu' && (
                                <>
                                    <div className="flex-1 flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje de Respuesta</label>
                                        {/* Message Editor Toolbar */}
                                        <MessageEditorToolbar
                                            textareaRef={messageTextareaRef}
                                            value={formData.response || ''}
                                            onChange={(value) => {
                                                setFormData({ ...formData, response: value });
                                                if (formErrors.response) setFormErrors({ ...formErrors, response: '' });
                                            }}
                                            showVariables={false}
                                        />
                                        <textarea
                                            ref={messageTextareaRef}
                                            className={`flex-1 w-full p-4 border rounded-lg resize-none mt-2 focus:ring-2 focus:ring-green-500 focus:border-transparent font-sans ${formErrors.response ? 'border-red-300' : 'border-slate-300'
                                                }`}
                                            placeholder="Escribe la respuesta automática aquí... (opcional si adjuntas multimedia)"
                                            value={formData.response}
                                            onChange={e => {
                                                setFormData({ ...formData, response: e.target.value });
                                                if (formErrors.response) setFormErrors({ ...formErrors, response: '' });
                                            }}
                                        ></textarea>
                                        {formErrors.response && (
                                            <p className="mt-1 text-sm text-red-600">{formErrors.response}</p>
                                        )}

                                        {/* Inline Preview */}
                                        {formData.response && (
                                            <div className="mt-4">
                                                <MessagePreview
                                                    message={formData.response}
                                                    contactName="Usuario"
                                                    inline={true}
                                                    showContactInfo={false}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Media Upload */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Archivo Multimedia (opcional)
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
                                        />
                                        <p className="text-xs text-slate-400 mt-2">
                                            Si adjuntas un archivo, el mensaje de texto se enviará por separado después del archivo.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="pt-6 mt-4 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={handleSave}
                                className="bg-slate-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 flex items-center gap-2 shadow-lg"
                            >
                                <Save size={18} /> {editingId ? 'Actualizar Regla' : 'Guardar Regla'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setRuleToDelete(null);
                }}
                onConfirm={confirmDelete}
                title="Eliminar Regla"
                message={ruleToDelete ? `¿Estás seguro de que deseas eliminar la regla "${rules.find(r => r.id === ruleToDelete)?.name || 'esta regla'}"? Esta acción no se puede deshacer.` : ''}
                confirmText="Eliminar"
                cancelText="Cancelar"
                type="danger"
            />

            <ImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImport={handleImportFromModal}
                title="Importar Reglas de Auto-Respuesta"
                description="Selecciona un archivo ZIP o JSON con reglas"
                acceptedFormats=".json,.zip"
            />
        </>
    );
};