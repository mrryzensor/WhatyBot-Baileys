import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, Bot, Clock, ToggleLeft, ToggleRight, X, Download, Upload, Image, Video, FileText, Paperclip, Menu as MenuIcon, Globe, ChevronDown, ChevronUp, Copy, CheckSquare, Square, Zap, Loader } from 'lucide-react';
import { AutoReplyRule, InteractiveMenu } from '../types';
import { countries as countryList } from '../utils/countries';
import { createAutoReplyRule, updateAutoReplyRule, deleteAutoReplyRule, importAutoReplyRules, getAutoReplyRules, getInteractiveMenus, getApiUrl, uploadOptionMedia } from '../services/api';
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
import { BulkRuleCreator } from './BulkRuleCreator';

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
    const [showBulkCreator, setShowBulkCreator] = useState(false);
    const [showCountrySelector, setShowCountrySelector] = useState(false);
    const [countrySearch, setCountrySearch] = useState('');
    const [countryTab, setCountryTab] = useState<'include' | 'exclude'>('include');
    const [showMobileEditor, setShowMobileEditor] = useState(false);
    const { globalSessionsEnabled } = useGlobalSessions();
    const [isLoadingCountryMedia, setIsLoadingCountryMedia] = useState<Record<string, boolean>>({});
    const [isCountryResponsesExpanded, setIsCountryResponsesExpanded] = useState(true);
    const [countryResponsesLayout, setCountryResponsesLayout] = useState<'1col' | '2col'>('1col');

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
        type: 'simple',
        countries: [],
        excludeCountries: [],
        allowUnknownCountries: false,
        isMessageCaption: false,
        countryResponses: {}
    });

    const [keywordInput, setKeywordInput] = useState('');
    const media = useMedia({ maxFiles: 50 });
    const importInputRef = useRef<HTMLInputElement>(null);
    const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
    const countryResponseRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
    const countryCaptionRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

    // Auto-resize response message textarea
    React.useEffect(() => {
        const textarea = messageTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [formData.response]);

    // Auto-resize country response and caption textareas
    React.useEffect(() => {
        if (!formData.countryResponses) return;
        
        Object.keys(formData.countryResponses).forEach(code => {
            // Resize response textareas
            const el = countryResponseRefs.current[code];
            if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
            }
            
            // Resize caption textareas for each media path
            const override = formData.countryResponses?.[code];
            if (override && override.mediaPaths) {
                override.mediaPaths.forEach((_, idx) => {
                    const key = `${code}-${idx}`;
                    const elCap = countryCaptionRefs.current[key];
                    if (elCap) {
                        elCap.style.height = 'auto';
                        elCap.style.height = `${elCap.scrollHeight}px`;
                    }
                });
            }
        });
    }, [formData.countryResponses]);

    const resetForm = () => {
        setFormData({
            name: '',
            keywords: [],
            response: '',
            matchType: 'contains',
            delay: 2,
            isActive: true,
            type: 'simple',
            countries: [],
            excludeCountries: [],
            allowUnknownCountries: false,
            isMessageCaption: false,
            countryResponses: {}
        });
        setKeywordInput('');
        media.setMediaItems([]);
        setEditingId(null);
        setShowMobileEditor(false);
    };

    const handleCountryMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>, code: string) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const filesArray = Array.from(fileList) as File[];
        
        try {
            setIsLoadingCountryMedia(prev => ({ ...prev, [code]: true }));
            const res = await uploadOptionMedia(filesArray);
            if (res.success && res.files) {
                const newPaths = res.files.map((f: any) => `uploads/${f.filename}`);
                
                const prevOverride = formData.countryResponses?.[code] || { response: '', mediaPaths: [], captions: [] };
                const currentPaths = prevOverride.mediaPaths || [];
                const currentCaptions = prevOverride.captions || [];
                
                const updatedPaths = [...currentPaths, ...newPaths];
                const updatedCaptions = [...currentCaptions, ...newPaths.map(() => '')];
                
                setFormData(prev => ({
                    ...prev,
                    countryResponses: {
                        ...(prev.countryResponses || {}),
                        [code]: {
                            ...prevOverride,
                            mediaPaths: updatedPaths,
                            captions: updatedCaptions
                        }
                    }
                }));
                
                if (toast) {
                    const message = filesArray.length > 1 
                        ? `${filesArray.length} archivos subidos exitosamente` 
                        : "Archivo subido exitosamente";
                    toast.success(message);
                }
            }
        } catch (err: any) {
            console.error("Error uploading country media:", err);
            if (toast) {
                toast.error("Error al subir archivos: " + err.message);
            }
        } finally {
            setIsLoadingCountryMedia(prev => ({ ...prev, [code]: false }));
            e.target.value = ''; // Reset input to allow selecting the same files again
        }
    };

    const handleEdit = (rule: AutoReplyRule) => {
        setEditingId(rule.id);
        setShowMobileEditor(true);
        setFormData({
            ...rule,
            countries: rule.countries || [],
            excludeCountries: rule.excludeCountries || [],
            countryResponses: rule.countryResponses || {}
        });
        const hasCountries = (rule.countries && rule.countries.length > 0) || (rule.excludeCountries && rule.excludeCountries.length > 0);
        setShowCountrySelector(hasCountries);

        // Auto-switch to exclude tab if only excluded countries are present
        if (rule.excludeCountries && rule.excludeCountries.length > 0 && (!rule.countries || rule.countries.length === 0)) {
            setCountryTab('exclude');
        } else {
            setCountryTab('include');
        }

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

            // Collect existing media paths that are already on the server
            const existingMediaPaths = media.mediaItems
                .map(item => item.mediaPath)
                .filter((p): p is string => !!p);

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
                menuId: formData.menuId,
                countries: formData.countries || [],
                excludeCountries: formData.excludeCountries || [],
                allowUnknownCountries: formData.allowUnknownCountries ?? false,
                isMessageCaption: formData.isMessageCaption ?? false,
                countryResponses: formData.countryResponses || {}
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
                    setTimeout(() => {
                        const element = document.getElementById(`rule-container-${response.rule.id}`);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 100);
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

    const handleDuplicate = async (rule: AutoReplyRule) => {
        try {
            setIsLoading(true);
            const { id, ...rest } = rule;
            const duplicateName = `${rule.name} (copia)`;

            // For simple rules with media, we might need the server to support existingMediaPaths in POST
            // Current createAutoReplyRule in api.ts doesn't send existingMediaPaths
            // But we can try to send it in the rule object if the server doesn't overwrite it
            // Or better, we modify api.ts and the server later.

            const ruleData = {
                ...rest,
                name: duplicateName,
                isActive: true
            };

            // We pass [] for files and try to preserve captions
            const response = await createAutoReplyRule(ruleData, [], rule.captions);
            if (response.success) {
                setRules([...rules, response.rule]);
                if (toast) {
                    toast.success(`Regla "${rule.name}" duplicada como "${duplicateName}"`);
                }
                setTimeout(() => {
                    const element = document.getElementById(`rule-container-${response.rule.id}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        } catch (error: any) {
            console.error('Error duplicating rule:', error);
            if (toast) {
                toast.error('Error al duplicar la regla: ' + error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const toggleStatus = async (id: string) => {
        const rule = rules.find(r => r.id === id);
        if (!rule) return;

        try {
            setIsLoading(true);
            const updatedRule = { ...rule, isActive: !rule.isActive };
            const existingMediaPaths = (rule as any).mediaPaths ? (rule as any).mediaPaths.filter((p: string) => !!p) : (rule.mediaPath ? [rule.mediaPath] : []);
            const response = await updateAutoReplyRule(id, updatedRule, [], existingMediaPaths);
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
                <div className={`${showMobileEditor ? 'hidden lg:flex' : 'flex'} lg:col-span-1 flex-col gap-4 h-full overflow-hidden`}>
                    <div className="bg-theme-card p-6 rounded-xl shadow-sm border border-theme">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-theme-main flex items-center gap-2">
                                <Bot size={20} className="text-primary-600" /> Reglas Activas
                            </h3>
                            <button
                                onClick={() => setShowMobileEditor(true)}
                                className="lg:hidden bg-primary-600 text-white p-2 rounded-lg"
                                title="Nueva Regla"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                        <div className="mb-4">
                            <GlobalSessionIndicator enabled={globalSessionsEnabled} />
                            <p className="text-xs text-theme-muted mt-2">
                                El bot responderá automáticamente cuando detecte estas palabras clave.
                            </p>
                        </div>

                        {/* Export/Import/Bulk buttons */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setShowBulkCreator(true)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-primary-600 to-blue-600 text-white rounded-lg hover:from-primary-700 hover:to-blue-700 transition-all text-sm font-semibold shadow-sm"
                                title="Crear reglas para múltiples países a la vez"
                            >
                                <Zap size={16} />
                                Creación Masiva por País
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExportRules}
                                    disabled={rules.length === 0 || isExporting}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                    </div>

                    <div className="flex-1 bg-theme-card rounded-xl shadow-sm border border-theme overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-theme bg-theme-base flex justify-between items-center">
                            <span className="font-medium text-theme-main text-sm">Lista de Reglas</span>
                            <span className="bg-slate-200 text-theme-muted px-2 py-0.5 rounded text-xs">{rules.length}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {rules.length === 0 ? (
                                <div className="text-center p-8 text-slate-400 italic text-sm">
                                    No hay reglas creadas.
                                </div>
                            ) : (
                                rules.map(rule => (
                                    <div id={`rule-container-${rule.id}`} key={rule.id} className={`p-4 rounded-lg border transition-all ${editingId === rule.id ? 'border-primary-500 bg-primary-50' : rule.isActive ? 'border-theme hover:border-primary-200 bg-theme-card' : 'border-theme bg-theme-base opacity-75'}`}>
                                        <div className="flex justify-between items-start gap-3 mb-2">
                                            <div className="flex items-center gap-2 flex-wrap pt-1">
                                                <h4 className="font-bold text-theme-main text-sm break-all">{rule.name}</h4>
                                                {rule.type === 'menu' && (
                                                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full flex items-center gap-1 whitespace-nowrap">
                                                        <MenuIcon size={12} /> Menú
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                {/* Primera fila: Toggle Activar/Desactivar */}
                                                <button
                                                    onClick={() => toggleStatus(rule.id)}
                                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${rule.isActive
                                                        ? "text-primary-600 hover:bg-primary-50 bg-primary-50"
                                                        : "text-slate-400 hover:bg-slate-100 bg-theme-base"
                                                        }`}
                                                    title={rule.isActive ? "Desactivar regla" : "Activar regla"}
                                                >
                                                    <span className="text-[11px] font-medium hidden min-[400px]:inline">
                                                        {rule.isActive ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                    {rule.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                </button>
                                                {/* Segunda fila: Botonera Editar, Duplicar, Eliminar */}
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleEdit(rule)}
                                                        className="p-1.5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 shadow-sm border border-transparent hover:border-blue-100 transition-all bg-theme-base"
                                                        title="Editar regla"
                                                    >
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDuplicate(rule)}
                                                        className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-sm border border-transparent hover:border-slate-200 transition-all bg-theme-base"
                                                        title="Duplicar regla"
                                                    >
                                                        <Copy size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(rule.id)}
                                                        className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 shadow-sm border border-transparent hover:border-red-100 transition-all bg-theme-base"
                                                        title="Eliminar regla"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Country Filter Badge */}
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {/* Included Countries */}
                                            {rule.countries && rule.countries.length > 0 && (
                                                Array.from(new Set(rule.countries)).map(code => {
                                                    const country = countryList.find(c => c.code === code);
                                                    return (
                                                        <span key={`inc-${code}`} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1 border border-blue-100" title={`Incluido: ${country?.name}`}>
                                                            {country?.iso ? (
                                                                <img src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`} width="16" alt={country.name} className="rounded-sm" />
                                                            ) : <Globe size={10} />}
                                                            {country?.name || code}
                                                        </span>
                                                    );
                                                })
                                            )}

                                            {/* Excluded Countries */}
                                            {rule.excludeCountries && rule.excludeCountries.length > 0 && (
                                                Array.from(new Set(rule.excludeCountries)).map(code => {
                                                    const country = countryList.find(c => c.code === code);
                                                    return (
                                                        <span key={`exc-${code}`} className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded flex items-center gap-1 border border-red-100" title={`Excluido: ${country?.name}`}>
                                                            <X size={10} className="text-red-400" />
                                                            {country?.iso ? (
                                                                <img src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`} width="16" alt={country.name} className="rounded-sm" />
                                                            ) : <Globe size={10} />}
                                                            {country?.name || code}
                                                        </span>
                                                    );
                                                })
                                            )}

                                            {(!rule.countries || rule.countries.length === 0) && (!rule.excludeCountries || rule.excludeCountries.length === 0) && (
                                                <span className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded flex items-center gap-1 border border-theme">
                                                    <Globe size={10} /> Todos los países
                                                </span>
                                            )}
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
                                                    <span key={i} className="text-[10px] bg-slate-100 text-theme-muted px-1.5 py-0.5 rounded border border-theme">
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

                                        <p className="text-xs text-theme-muted line-clamp-2 italic border-l-2 border-theme pl-2">
                                            "{rule.response}"
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Editor */}
                <div className={`${showMobileEditor ? 'block' : 'hidden lg:block'} lg:col-span-2`}>
                    <div className="bg-theme-card p-6 rounded-xl shadow-sm border border-theme h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowMobileEditor(false)}
                                    className="lg:hidden p-1 hover:bg-theme rounded-lg"
                                >
                                    <X size={20} />
                                </button>
                                <h3 className="font-semibold text-theme-main flex items-center gap-2">
                                    {editingId ? <><Edit2 size={18} /> Editar Regla</> : <><Plus size={18} /> Nueva Regla</>}
                                </h3>
                            </div>
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

                        <div className="space-y-4 flex-1">
                            <div>
                                <label className="block text-sm font-medium text-theme-main mb-1">Nombre de la Regla</label>
                                <input
                                    type="text"
                                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 ${formErrors.name ? 'border-red-300' : 'border-theme'
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
                                <label className="block text-sm font-medium text-theme-main mb-1">Tipo de Respuesta</label>
                                <select
                                    className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 bg-theme-card"
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
                                    <label className="block text-sm font-medium text-theme-main mb-2 flex items-center gap-2">
                                        <MenuIcon size={16} className="text-blue-600" />
                                        Seleccionar Menú
                                    </label>
                                    {menus.length === 0 ? (
                                        <div className="text-sm text-theme-muted bg-theme-card rounded-lg p-4 border border-theme">
                                            <p className="mb-2">⚠️ No hay menús activos disponibles.</p>
                                            <p className="text-xs text-theme-muted">
                                                Ve a <strong>Menús Interactivos</strong> para crear un menú primero.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <select
                                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-theme-card ${formErrors.menuId ? 'border-red-300' : 'border-theme'
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
                                                <div className="mt-3 text-xs text-theme-muted bg-theme-card rounded p-3 border border-theme">
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

                            {/* Country Selector */}
                            <div className="bg-theme-base border border-theme rounded-lg p-3">
                                <button
                                    onClick={() => setShowCountrySelector(!showCountrySelector)}
                                    className="flex items-center justify-between w-full text-sm font-medium text-theme-main"
                                >
                                    <span className="flex items-center gap-2">
                                        <Globe size={16} className="text-primary-600" />
                                        Filtros Geográficos (opcional)
                                    </span>
                                    {showCountrySelector ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>

                                {showCountrySelector && (
                                    <div className="mt-3 space-y-4">
                                        {/* Tabs */}
                                        <div className="flex bg-theme-card p-1 rounded-lg border border-theme">
                                            <button
                                                type="button"
                                                onClick={() => setCountryTab('include')}
                                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${countryTab === 'include'
                                                    ? 'bg-primary-600 text-white shadow-sm'
                                                    : 'text-theme-muted hover:text-theme-main'
                                                    }`}
                                            >
                                                Incluir
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCountryTab('exclude')}
                                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${countryTab === 'exclude'
                                                    ? 'bg-red-600 text-white shadow-sm'
                                                    : 'text-theme-muted hover:text-theme-main'
                                                    }`}
                                            >
                                                Excluir
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Buscar país o prefijo..."
                                                className={`w-full bg-theme-card border border-theme rounded-md py-2 px-3 pl-9 text-sm focus:outline-none focus:ring-1 transition-all ${countryTab === 'include' ? 'focus:ring-primary-500' : 'focus:ring-red-500'
                                                    }`}
                                                value={countrySearch}
                                                onChange={(e) => setCountrySearch(e.target.value)}
                                            />
                                            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between px-1 mb-2">
                                                <p className="text-[10px] text-theme-muted">
                                                    {countryTab === 'include'
                                                        ? 'Selecciona los países para los cuales esta regla DEBE activarse.'
                                                        : 'Selecciona los países a los que NO se les debe responder.'}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const field = countryTab === 'include' ? 'countries' : 'excludeCountries';
                                                        const filteredList = countryList.filter(country =>
                                                            country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                                                            country.code.includes(countrySearch.replace('+', ''))
                                                        );
                                                        const filteredCodes = filteredList.map(c => c.code);
                                                        const currentValues = formData[field] || [];
                                                        const allSelected = filteredCodes.every(code => currentValues.includes(code));

                                                        if (allSelected) {
                                                            setFormData({ ...formData, [field]: currentValues.filter(code => !filteredCodes.includes(code)) });
                                                        } else {
                                                            setFormData({ ...formData, [field]: Array.from(new Set([...currentValues, ...filteredCodes])) });
                                                        }
                                                    }}
                                                    className={`text-[10px] font-medium hover:underline ${countryTab === 'include' ? 'text-primary-600' : 'text-red-600'
                                                        }`}
                                                >
                                                    {(() => {
                                                        const field = countryTab === 'include' ? 'countries' : 'excludeCountries';
                                                        const filteredCodes = countryList.filter(country =>
                                                            country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                                                            country.code.includes(countrySearch.replace('+', ''))
                                                        ).map(c => c.code);
                                                        const currentValues = formData[field] || [];
                                                        return filteredCodes.every(code => currentValues.includes(code)) ? 'Desmarcar todo' : 'Marcar todo';
                                                    })()}
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 border border-theme rounded-md bg-theme-card/30">
                                                {countryTab === 'include' && ('otros paises'.includes(countrySearch.toLowerCase()) || 'other'.includes(countrySearch.toLowerCase())) && (() => {
                                                    const isChecked = (formData.countries || []).includes('other');
                                                    return (
                                                        <label
                                                            key="country-tab-virtual-other"
                                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer border border-transparent transition-colors ${isChecked
                                                                ? 'bg-primary-50/50 border-primary-200'
                                                                : 'hover:bg-theme-card'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="rounded text-primary-600"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    const currentValues = formData.countries || [];
                                                                    if (e.target.checked) {
                                                                        setFormData({ ...formData, countries: [...currentValues, 'other'] });
                                                                    } else {
                                                                        setFormData({ ...formData, countries: currentValues.filter(c => c !== 'other') });
                                                                    }
                                                                }}
                                                            />
                                                            <span className="text-[10px] flex items-center gap-2">
                                                                <Globe size={14} className="text-primary-600 shrink-0" />
                                                                <span className="truncate font-semibold text-primary-700 dark:text-primary-400">Otros países (Resto)</span>
                                                            </span>
                                                        </label>
                                                    );
                                                })()}
                                                {countryList
                                                    .filter(country =>
                                                        country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                                                        country.code.includes(countrySearch.replace('+', ''))
                                                    )
                                                    .map(country => {
                                                        const field = countryTab === 'include' ? 'countries' : 'excludeCountries';
                                                        const isChecked = (formData[field] || []).includes(country.code);
                                                        return (
                                                            <label
                                                                key={`${countryTab}-${country.iso}-${country.code}`}
                                                                className={`flex items-center gap-2 p-2 rounded cursor-pointer border border-transparent transition-colors ${isChecked
                                                                    ? (countryTab === 'include' ? 'bg-primary-50/50 border-primary-200' : 'bg-red-50/50 border-red-200')
                                                                    : 'hover:bg-theme-card'
                                                                    }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className={`rounded ${countryTab === 'include' ? 'text-primary-600' : 'text-red-600'}`}
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const currentValues = formData[field] || [];
                                                                        if (e.target.checked) {
                                                                            setFormData({ ...formData, [field]: [...currentValues, country.code] });
                                                                        } else {
                                                                            setFormData({ ...formData, [field]: currentValues.filter(c => c !== country.code) });
                                                                        }
                                                                    }}
                                                                />
                                                                <span className="text-[10px] flex items-center gap-2">
                                                                    {country.iso && (
                                                                        <img
                                                                            src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`}
                                                                            width="16"
                                                                            alt={country.name}
                                                                            className="rounded-sm shadow-sm"
                                                                        />
                                                                    )}
                                                                    <span className="truncate">{country.name} (+{country.code})</span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                            </div>
                                        </div>

                                        {/* Selected summary for both tabs */}
                                        <div className="space-y-2 pt-2 border-t border-theme">
                                            {/* Included summary */}
                                            {formData.countries && formData.countries.length > 0 && (
                                                <div className="flex flex-wrap gap-1 items-center">
                                                    <span className="text-[10px] font-semibold text-primary-600 mr-1">Incluidos:</span>
                                                    {formData.countries.map(code => {
                                                        if (code === 'other') {
                                                            return (
                                                                <span key="inc-other" className="bg-primary-50 text-primary-700 text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-primary-100">
                                                                    <Globe size={10} className="text-primary-600" />
                                                                    <span>Otros países</span>
                                                                    <button onClick={(e) => { e.preventDefault(); setFormData({ ...formData, countries: formData.countries?.filter(c => c !== 'other') }); }} className="hover:text-primary-900"><X size={8} /></button>
                                                                </span>
                                                            );
                                                        }
                                                        const country = countryList.find(c => c.code === code);
                                                        return (
                                                            <span key={`inc-${code}`} className="bg-primary-50 text-primary-700 text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-primary-100">
                                                                {country?.iso && <img src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`} width="12" alt="" className="rounded-xs" />}
                                                                {country?.name || code}
                                                                <button onClick={(e) => { e.preventDefault(); setFormData({ ...formData, countries: formData.countries?.filter(c => c !== code) }); }} className="hover:text-primary-900"><X size={8} /></button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {/* Excluded summary */}
                                            {formData.excludeCountries && formData.excludeCountries.length > 0 && (
                                                <div className="flex flex-wrap gap-1 items-center">
                                                    <span className="text-[10px] font-semibold text-red-600 mr-1">Excluidos:</span>
                                                    {formData.excludeCountries.map(code => {
                                                        const country = countryList.find(c => c.code === code);
                                                        return (
                                                            <span key={`exc-${code}`} className="bg-red-50 text-red-700 text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-red-100">
                                                                {country?.iso && <img src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`} width="12" alt="" className="rounded-xs" />}
                                                                {country?.name || code}
                                                                <button onClick={(e) => { e.preventDefault(); setFormData({ ...formData, excludeCountries: formData.excludeCountries?.filter(c => c !== code) }); }} className="hover:text-red-900"><X size={8} /></button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2"> {/* Removed extra border-t as previous block has it */}
                                            <label className="flex items-center gap-2 cursor-pointer text-xs group">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.allowUnknownCountries || false}
                                                    onChange={(e) => setFormData({ ...formData, allowUnknownCountries: e.target.checked })}
                                                    className="h-3 w-3 text-primary-600 rounded border-theme focus:ring-primary-500"
                                                />
                                                <span className="text-theme-muted group-hover:text-theme-main transition-colors">
                                                    Permitir si el país no es detectable (LID desconocido)
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* RESPUESTAS ESPECÍFICAS POR PAÍS */}
                            {formData.type !== 'menu' && formData.countries && formData.countries.length > 0 && (
                                <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-theme rounded-lg p-4 transition-all duration-300">
                                    <div className="flex items-center justify-between border-b border-theme/50 pb-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsCountryResponsesExpanded(!isCountryResponsesExpanded)}
                                            className="flex items-center gap-2 text-sm font-bold text-theme-main hover:text-primary-600 transition-colors focus:outline-none"
                                        >
                                            <Bot size={16} className="text-primary-600 shrink-0" />
                                            <span>Respuestas Personalizadas por País</span>
                                            <span className="text-xs font-normal text-theme-muted bg-theme-base border border-theme px-2 py-0.5 rounded-full shrink-0">
                                                {formData.countries.length} {formData.countries.length === 1 ? 'país' : 'países'}
                                            </span>
                                            {isCountryResponsesExpanded ? <ChevronUp size={16} className="text-theme-muted shrink-0" /> : <ChevronDown size={16} className="text-theme-muted shrink-0" />}
                                        </button>
                                        
                                        {isCountryResponsesExpanded && (
                                            <div className="flex items-center bg-theme-base border border-theme rounded-lg p-0.5 shrink-0 shadow-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => setCountryResponsesLayout('1col')}
                                                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                                                        countryResponsesLayout === '1col'
                                                            ? 'bg-primary-600 text-white shadow-sm'
                                                            : 'text-theme-muted hover:text-theme-main hover:bg-slate-100 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    1 Columna
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCountryResponsesLayout('2col')}
                                                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                                                        countryResponsesLayout === '2col'
                                                            ? 'bg-primary-600 text-white shadow-sm'
                                                            : 'text-theme-muted hover:text-theme-main hover:bg-slate-100 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    2 Columnas
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {isCountryResponsesExpanded && (
                                        <div className="space-y-4 pt-3">
                                            <p className="text-xs text-theme-muted leading-relaxed">
                                                Configura archivos multimedia y captions específicos para cada uno de los países seleccionados. Si no los personalizas, recibirán el comportamiento por defecto configurado abajo.
                                            </p>

                                            <div className={`grid gap-4 ${countryResponsesLayout === '2col' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                                {formData.countries.map(code => {
                                                    const isOther = code === 'other';
                                                    const country = isOther ? null : countryList.find(c => c.code === code);
                                                    const hasOverride = !!formData.countryResponses?.[code];
                                                    const overrideData = formData.countryResponses?.[code] || { response: '', mediaPaths: [], captions: [] };

                                                    return (
                                                        <div key={`override-${code}`} className="border border-theme rounded-lg bg-theme-card overflow-hidden transition-all duration-200 hover:shadow-sm">
                                                            <div className="p-3 bg-theme-base flex items-center justify-between">
                                                                <div className="flex items-center gap-2 text-xs font-semibold text-theme-main">
                                                                    {isOther ? (
                                                                        <Globe size={16} className="text-primary-600 shrink-0" />
                                                                    ) : (
                                                                        country?.iso && (
                                                                            <img
                                                                                src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`}
                                                                                width="18"
                                                                                alt=""
                                                                                className="rounded-sm shadow-sm"
                                                                            />
                                                                        )
                                                                    )}
                                                                    <span>{isOther ? 'Otros países (Resto)' : (country?.name || `Prefijo +${code}`)}</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updatedResponses = { ...(formData.countryResponses || {}) };
                                                                        if (hasOverride) {
                                                                            delete updatedResponses[code];
                                                                        } else {
                                                                            updatedResponses[code] = { response: '', mediaPaths: [], captions: [] };
                                                                        }
                                                                        setFormData({ ...formData, countryResponses: updatedResponses });
                                                                    }}
                                                                    className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                                                                        hasOverride
                                                                            ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/60'
                                                                            : 'bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-400 dark:hover:bg-primary-950/60'
                                                                    }`}
                                                                >
                                                                    {hasOverride ? 'Quitar Personalización' : 'Personalizar'}
                                                                </button>
                                                            </div>

                                                            {hasOverride && (
                                                                <div className="p-3 space-y-3 border-t border-theme">
                                                                    {/* Country Media Specific */}
                                                                    <div className="space-y-2">
                                                                        <label className="block text-[11px] font-medium text-theme-main">Archivos Multimedia Exclusivos (Opcional)</label>
                                                                        
                                                                        {/* Files Preview */}
                                                                        {overrideData.mediaPaths && overrideData.mediaPaths.length > 0 && (
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                                                                {overrideData.mediaPaths.map((mp, index) => {
                                                                                    const fileName = mp.split(/[/\\]/).pop() || 'archivo';
                                                                                    const type = getMediaTypeFromPath(mp);
                                                                                    const previewUrl = getMediaPreviewUrl(mp);

                                                                                    return (
                                                                                        <div key={index} className="border border-theme rounded p-2 bg-theme-base relative group space-y-2">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <MediaThumbnail
                                                                                                    src={previewUrl}
                                                                                                    mediaPath={mp}
                                                                                                    type={type}
                                                                                                    className="h-12 w-12 shrink-0 rounded-lg border border-theme"
                                                                                                />
                                                                                            </div>
                                                                                            <div className="w-full">
                                                                                                <textarea
                                                                                                    ref={el => { countryCaptionRefs.current[`${code}-${index}`] = el; }}
                                                                                                    placeholder="Caption (subtítulo)..."
                                                                                                    className="w-full border border-theme rounded-lg px-2.5 py-1.5 text-sm bg-theme-card focus:ring-1 focus:ring-primary-500 min-h-[36px] max-h-[120px] resize-none overflow-y-auto font-sans"
                                                                                                    rows={1}
                                                                                                    value={overrideData.captions?.[index] || ''}
                                                                                                    onChange={e => {
                                                                                                        const updatedResponses = { ...(formData.countryResponses || {}) };
                                                                                                        const nextCaptions = [...(overrideData.captions || [])];
                                                                                                        nextCaptions[index] = e.target.value;
                                                                                                        updatedResponses[code] = {
                                                                                                            ...overrideData,
                                                                                                            captions: nextCaptions
                                                                                                        };
                                                                                                        setFormData({ ...formData, countryResponses: updatedResponses });
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    const updatedResponses = { ...(formData.countryResponses || {}) };
                                                                                                    const nextPaths = overrideData.mediaPaths?.filter((_, idx) => idx !== index) || [];
                                                                                                    const nextCaptions = overrideData.captions?.filter((_, idx) => idx !== index) || [];
                                                                                                    updatedResponses[code] = {
                                                                                                        ...overrideData,
                                                                                                        mediaPaths: nextPaths,
                                                                                                        captions: nextCaptions
                                                                                                    };
                                                                                                    setFormData({ ...formData, countryResponses: updatedResponses });
                                                                                                }}
                                                                                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                                                                            >
                                                                                                <X size={10} />
                                                                                            </button>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}

                                                                        {/* Country file upload button */}
                                                                        <div>
                                                                            <label className="flex items-center justify-center gap-1.5 border border-dashed border-theme hover:border-primary-500 rounded-lg p-3 bg-theme-base cursor-pointer hover:bg-primary-50/20 transition-all text-xs font-semibold text-theme-muted hover:text-primary-600">
                                                                                {isLoadingCountryMedia[code] ? (
                                                                                    <>
                                                                                        <Loader size={14} className="animate-spin text-primary-600" />
                                                                                        <span>Subiendo archivos...</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Paperclip size={14} />
                                                                                        <span>Adjuntar multimedia para {isOther ? 'Otros países' : (country?.name || code)}</span>
                                                                                    </>
                                                                                )}
                                                                                <input
                                                                                    type="file"
                                                                                    multiple
                                                                                    accept="image/*,video/*,application/*"
                                                                                    className="hidden"
                                                                                    disabled={isLoadingCountryMedia[code]}
                                                                                    onChange={e => handleCountryMediaSelect(e, code)}
                                                                                />
                                                                            </label>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-theme-main mb-1">Palabras Clave (Triggers)</label>
                                <input
                                    type="text"
                                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 ${formErrors.keywords ? 'border-red-300' : 'border-theme'
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
                                    <label className="block text-sm font-medium text-theme-main mb-1">Tipo de Coincidencia</label>
                                    <select
                                        className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 bg-theme-card"
                                        value={formData.matchType}
                                        onChange={e => setFormData({ ...formData, matchType: e.target.value as any })}
                                    >
                                        <option value="contains">Contiene (Flexible)</option>
                                        <option value="exact">Exacta (Estricta)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-theme-main mb-1 flex items-center gap-2">
                                        <Clock size={14} /> Retraso de Respuesta (seg)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        className="w-full border border-theme rounded-lg px-4 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                                        value={formData.delay}
                                        onChange={e => setFormData({ ...formData, delay: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {/* Response and Media (only for simple type) */}
                            {formData.type !== 'menu' && (
                                <>
                                    <div className="flex-1 flex flex-col">
                                        <label className="block text-sm font-medium text-theme-main mb-1">Mensaje de Respuesta</label>
                                        {/* Message Editor Toolbar */}
                                        <MessageEditorToolbar
                                            textareaRef={messageTextareaRef}
                                            value={formData.response || ''}
                                            onChange={(value) => {
                                                setFormData({ ...formData, response: value });
                                                if (formErrors.response) setFormErrors({ ...formErrors, response: '' });
                                            }}
                                            variables={['nombre', 'pais']}
                                            showVariables={true}
                                            showEmojiPickerBelow={true}
                                        />
                                        <textarea
                                            ref={messageTextareaRef}
                                            className={`w-full min-h-[100px] max-h-[450px] p-4 border rounded-lg resize-none overflow-y-auto mt-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent font-sans ${formErrors.response ? 'border-red-300' : 'border-theme'
                                                }`}
                                            placeholder="Escribe la respuesta automática aquí... (opcional si adjuntas multimedia)"
                                            value={formData.response}
                                            onChange={e => {
                                                setFormData({ ...formData, response: e.target.value });
                                                if (formErrors.response) setFormErrors({ ...formErrors, response: '' });
                                            }}
                                        ></textarea>
                                        <div className="mt-3">
                                            <label className="block text-xs font-semibold text-theme-main mb-1.5 text-primary-700">
                                                Destino del Mensaje Principal (Texto)
                                            </label>
                                            <select
                                                className="w-full border border-theme rounded-lg px-3 py-2 text-sm bg-theme-card focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium text-theme-main"
                                                value={formData.isMessageCaption ? 'caption' : 'text'}
                                                onChange={e => setFormData({ ...formData, isMessageCaption: e.target.value === 'caption' })}
                                            >
                                                <option value="text">Enviar como Mensaje de Texto Independiente</option>
                                                <option value="caption">Enviar como Caption (Subtítulo) de Imagen/Video</option>
                                            </select>
                                        </div>
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
                                        <label className="block text-sm font-medium text-theme-main mb-2">
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
                                            uploadProgress={media.uploadProgress}
                                        />
                                        <p className="text-xs text-slate-400 mt-2">
                                            Si adjuntas un archivo, el mensaje de texto se enviará por separado después del archivo.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="pt-6 mt-4 border-t border-theme flex justify-end">
                            <button
                                onClick={handleSave}
                                className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-8 py-3 rounded-lg font-medium hover:bg-black dark:hover:bg-white flex items-center gap-2 shadow-lg transition-all duration-200"
                            >
                                <Save size={18} /> {editingId ? 'Actualizar Regla' : 'Guardar Regla'}
                            </button>
                        </div>
                    </div>
                </div>
            </div >

            {/* Delete Confirmation Modal */}
            < ConfirmModal
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

            <BulkRuleCreator
                                isOpen={showBulkCreator}
                                onClose={() => setShowBulkCreator(false)}
                                onRulesCreated={(newRules) => {
                                    setRules([...rules, ...newRules]);
                                    if (newRules.length > 0) {
                                        setTimeout(() => {
                                            const firstNewRule = newRules[0];
                                            const element = document.getElementById(`rule-container-${firstNewRule.id}`);
                                            if (element) {
                                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }
                                        }, 100);
                                    }
                                }}
                                toast={toast}
                            />
        </>
    );
};