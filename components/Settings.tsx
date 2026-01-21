import React, { useState } from 'react';
import { Save, Clock, Users, Timer, Download, Upload, Database, Trash2 } from 'lucide-react';
import { AppConfig } from '../types';
import { updateConfig as updateConfigApi, exportCompleteConfig, importCompleteConfig, cleanupOrphanedFiles } from '../services/api';
import { changePassword, getCurrentUser } from '../services/authApi';
import { GlobalSessionToggle } from './GlobalSessionToggle';
import { useGlobalSessions } from '../hooks/useGlobalSessions';
import { useSession } from '../context/SessionContext';
import { ConfirmModal } from './ConfirmModal';
import pkg from '../package.json';

interface SettingsProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  toast?: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

export const Settings: React.FC<SettingsProps> = ({ config, setConfig, toast }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const currentUser = getCurrentUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const { globalSessionsEnabled, setGlobalSessionsEnabled } = useGlobalSessions();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const { selectedSessionId } = useSession();
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleanupAllSessions, setCleanupAllSessions] = useState(false);

  const handleExportComplete = async () => {
    try {
      setIsExporting(true);
      await exportCompleteConfig();
      toast.success('Configuración completa exportada (menús, reglas y archivos multimedia)');
    } catch (error) {
      console.error('Error exporting complete config:', error);
      toast.error('Error al exportar configuración completa');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportComplete = async () => {
    if (!importFile) {
      toast.warning('Por favor selecciona un archivo ZIP');
      return;
    }

    try {
      setIsImporting(true);
      const result = await importCompleteConfig(importFile, globalSessionsEnabled);

      const scope = globalSessionsEnabled ? 'todas las sesiones' : 'sesión actual';
      const menusMsg = result.menus.imported > 0 ? `${result.menus.imported} menús importados` : '';
      const menusReplacedMsg = result.menus.replaced > 0 ? `${result.menus.replaced} menús actualizados` : '';
      const rulesMsg = result.rules.imported > 0 ? `${result.rules.imported} reglas importadas` : '';
      const rulesReplacedMsg = result.rules.replaced > 0 ? `${result.rules.replaced} reglas actualizadas` : '';
      const mediaMsg = result.media > 0 ? `${result.media} archivos multimedia` : '';

      const parts = [menusMsg, menusReplacedMsg, rulesMsg, rulesReplacedMsg, mediaMsg].filter(Boolean);
      const message = `Importación completa exitosa (${scope}): ${parts.join(', ')}`;

      toast.success(message);
      setImportFile(null);

      // Reload page to refresh data
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      console.error('Error importing complete config:', error);
      toast.error(error.message || 'Error al importar configuración completa');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCleanupOrphanedFiles = async (allSessions: boolean = false) => {
    try {
      setIsCleaning(true);
      const result = await cleanupOrphanedFiles(
        allSessions ? undefined : selectedSessionId || undefined,
        allSessions
      );

      const scope = allSessions ? 'todas las sesiones' : 'sesión actual';
      if (result.deletedCount > 0) {
        toast?.success(`${result.deletedCount} archivo(s) huérfano(s) eliminado(s) de ${scope}`);
      } else {
        toast?.info(`No se encontraron archivos huérfanos en ${scope}`);
      }
    } catch (error: any) {
      console.error('Error cleaning orphaned files:', error);
      toast?.error(error?.message || 'Error al limpiar archivos huérfanos');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCleanupClick = (allSessions: boolean) => {
    setCleanupAllSessions(allSessions);
    setShowCleanupConfirm(true);
  };

  const confirmCleanup = () => {
    handleCleanupOrphanedFiles(cleanupAllSessions);
  };

  const handleCheckUpdates = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.updates?.checkForUpdates) {
        toast?.error('La comprobación de actualizaciones no está disponible en este entorno.');
        return;
      }
      await electronAPI.updates.checkForUpdates();
      toast?.info('Buscando actualizaciones...');
    } catch (error: any) {
      console.error('Error checking for updates:', error);
      toast?.error(error?.message || 'No se pudo comprobar si hay actualizaciones');
    }
  };

  const handleSave = async () => {
    const { messageDelay, maxContactsPerBatch, waitTimeBetweenBatches, defaultCountryCode, autoReplyInGroups } = localConfig;

    if (!messageDelay || messageDelay <= 0) {
      toast?.error('El retraso entre mensajes debe ser un número mayor a 0.');
      setSaveStatus('error');
      return;
    }

    if (!maxContactsPerBatch || maxContactsPerBatch <= 0) {
      toast?.error('El máximo de contactos por lote debe ser un número mayor a 0.');
      setSaveStatus('error');
      return;
    }

    if (waitTimeBetweenBatches === undefined || waitTimeBetweenBatches < 0) {
      toast?.error('El tiempo de espera entre lotes debe ser un número igual o mayor a 0.');
      setSaveStatus('error');
      return;
    }

    const normalizedConfig: AppConfig = {
      messageDelay,
      maxContactsPerBatch,
      waitTimeBetweenBatches,
      defaultCountryCode: (defaultCountryCode || '').trim(),
      autoReplyInGroups: autoReplyInGroups || false
    };

    try {
      const response = await updateConfigApi(normalizedConfig);
      if (!response?.success) {
        throw new Error('No se pudo guardar la configuración');
      }
      const savedConfig = response.config || normalizedConfig;
      setConfig(savedConfig);
      setLocalConfig(savedConfig);
      setSaveStatus('success');
      toast?.success('¡Configuración guardada exitosamente!');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      console.error('Error saving config:', err);
      setSaveStatus('error');
      toast?.error(err?.message || 'No se pudo guardar la configuración');
    }
  };

  const handleChangePassword = async () => {
    if (!currentUser?.email) {
      toast?.error('No se pudo obtener el usuario actual. Inicia sesión nuevamente.');
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast?.error('Completa todos los campos de contraseña.');
      return;
    }

    if (newPassword.length < 6) {
      toast?.error('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast?.error('La nueva contraseña y la confirmación no coinciden.');
      return;
    }

    try {
      setChangingPassword(true);
      const response = await changePassword(currentUser.email, currentPassword, newPassword);
      if (!response?.success) {
        throw new Error(response?.message || 'No se pudo cambiar la contraseña');
      }

      toast?.success(response.message || 'Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Error changing password:', err);
      // Intentar mostrar mensaje de error del backend si existe
      const backendMessage = err?.response?.data?.error || err?.message;
      toast?.error(backendMessage || 'No se pudo cambiar la contraseña');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {saveStatus === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-600">¡Configuración guardada exitosamente!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Auto-Reply Configuration */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={20} className="text-blue-500" /> Configuración de Auto-Respuestas
          </h3>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3">
                <Users size={20} className="text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Auto Responder en Grupos</p>
                  <p className="text-xs text-slate-500">Permitir respuestas automáticas en chats grupales</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.autoReplyInGroups || false}
                  onChange={(e) => setLocalConfig({ ...localConfig, autoReplyInGroups: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Global Sessions Toggle */}
            <GlobalSessionToggle
              enabled={globalSessionsEnabled}
              onChange={setGlobalSessionsEnabled}
              label="Menús y Auto-Respuestas Globales"
              description="Cuando está activado, los menús interactivos y auto-respuestas funcionarán en todas las sesiones de WhatsApp conectadas. Cuando está desactivado, solo funcionarán en la sesión actualmente seleccionada."
            />
          </div>
        </div>

        {/* Envío individual */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={20} className="text-green-500" /> Envío Individual
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Código de país por defecto (envío individual)
            </label>
            <input
              type="text"
              placeholder="Ej: +51, +54, +1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
              value={localConfig.defaultCountryCode || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, defaultCountryCode: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-2">
              Este código se usará solo en el formulario de envío individual como valor por defecto para el país.
            </p>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Clock size={16} className="text-slate-500" />
              Retraso entre Mensajes (segundos)
            </label>
            <input
              type="number"
              value={localConfig.messageDelay ?? ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : Number(e.target.value);
                setLocalConfig({ ...localConfig, messageDelay: value });
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
            />
            <p className="text-xs text-slate-500 mt-2">
              Tiempo aleatorio entre mensajes (entre 1 y este valor en segundos) para evitar baneos de WhatsApp. Recomendado: 2-5 segundos.
            </p>
          </div>
        </div>

        {/* Respaldo y Restauración */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Database size={20} className="text-purple-500" /> Respaldo y Restauración
          </h3>

          <div className="space-y-4">
            <p className="text-sm text-slate-600 mb-4">
              Exporta o importa tu configuración completa incluyendo menús interactivos, reglas de auto-respuesta y todos los archivos multimedia en un solo archivo ZIP.
            </p>

            {/* Export Button */}
            <div>
              <button
                onClick={handleExportComplete}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} />
                {isExporting ? 'Exportando...' : 'Exportar Configuración Completa'}
              </button>
              <p className="text-xs text-slate-500 mt-2">
                Descarga un archivo ZIP con todos tus menús, reglas y archivos multimedia
              </p>
            </div>

            {/* Import Section */}
            <div className="border-t border-slate-200 pt-4">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Importar Configuración Completa
              </label>

              <div className="space-y-3">
                <div className="relative">
                  <input
                    id="config-import-file"
                    type="file"
                    accept=".zip"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="config-import-file"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white border-2 border-dashed border-purple-300 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all"
                  >
                    <Upload size={20} className="text-purple-600" />
                    <span className="text-sm font-medium text-slate-700">
                      {importFile ? importFile.name : 'Seleccionar archivo ZIP'}
                    </span>
                  </label>
                </div>

                {importFile && (
                  <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    <span>Archivo listo para importar</span>
                  </div>
                )}

                <button
                  onClick={handleImportComplete}
                  disabled={!importFile || isImporting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Upload size={18} />
                  {isImporting ? 'Importando configuración...' : 'Importar Configuración'}
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-3">
                Sube un archivo ZIP exportado previamente. Se importarán menús, reglas y archivos multimedia automáticamente en el orden correcto.
              </p>

              {/* Global Sessions Indicator */}
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 flex items-center gap-2">
                  <strong>Ámbito de importación:</strong>
                  {globalSessionsEnabled ? (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
                        <path d="M2 12h20"></path>
                      </svg>
                      Todas las sesiones
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                        <rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect>
                        <path d="M12 18h.01"></path>
                      </svg>
                      Solo sesión actual
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {globalSessionsEnabled
                    ? 'La configuración se aplicará a todas las sesiones de WhatsApp conectadas'
                    : 'La configuración se aplicará solo a la sesión actualmente seleccionada'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Limpieza de Archivos Multimedia */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Trash2 size={20} className="text-orange-500" /> Limpieza de Archivos Multimedia
          </h3>

          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Elimina archivos multimedia que ya no están siendo utilizados por ningún menú o regla de auto-respuesta.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleCleanupClick(false)}
                disabled={isCleaning}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <Trash2 size={18} />
                {isCleaning ? 'Limpiando...' : 'Limpiar Archivos de la Sesión Actual'}
              </button>

              <button
                onClick={() => handleCleanupClick(true)}
                disabled={isCleaning}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <Trash2 size={18} />
                {isCleaning ? 'Limpiando...' : 'Limpiar Archivos de Todas las Sesiones'}
              </button>

              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 flex-shrink-0 mt-0.5">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                  <path d="M12 9v4"></path>
                  <path d="M12 17h.01"></path>
                </svg>
                <p className="text-xs text-amber-700">
                  Esta acción eliminará permanentemente los archivos que no estén referenciados. Se recomienda exportar una copia de seguridad antes de limpiar.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Límites de envío masivo */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={20} className="text-purple-500" /> Límites de Envío Masivo
          </h3>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Máximo de Contactos por Lote
              </label>
              <input
                type="number"
                value={localConfig.maxContactsPerBatch ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  setLocalConfig({ ...localConfig, maxContactsPerBatch: value });
                }}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                Número máximo de contactos que se enviarán en cada lote antes de esperar.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Timer size={16} className="text-slate-500" />
                Tiempo de Espera entre Lotes (minutos)
              </label>
              <input
                type="number"
                value={localConfig.waitTimeBetweenBatches ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  setLocalConfig({ ...localConfig, waitTimeBetweenBatches: value });
                }}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                Tiempo de espera en minutos entre cada lote de envíos. Ejemplo: Si tienes 1000 contactos, máximo 50 por lote y 15 minutos de espera, enviará 50, esperará 15 minutos, enviará otros 50, y así sucesivamente.
              </p>
            </div>
          </div>
        </div>

        {/* Cuenta y seguridad */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={20} className="text-red-500" /> Cuenta y Seguridad
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Correo</label>
              <input
                type="email"
                value={currentUser?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña actual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nueva contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {changingPassword ? 'Cambiando contraseña...' : 'Cambiar contraseña'}
            </button>
          </div>
        </div>

        {/* Actualizaciones */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-blue-500" /> Actualizaciones
          </h3>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-sm font-medium text-slate-700">Versión actual</span>
              <span className="text-sm font-semibold text-slate-900">v{pkg.version}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-blue-700">Última versión disponible</span>
              <span className="text-sm font-semibold text-blue-900">Verificar...</span>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            Comprueba manualmente si hay una nueva versión disponible de WhatyBot.
          </p>
          <button
            type="button"
            onClick={handleCheckUpdates}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800"
          >
            Buscar actualizaciones
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="bg-slate-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 flex items-center gap-2 shadow-lg"
        >
          <Save size={18} /> Guardar Configuración
        </button>
      </div>

      {/* Modal de Confirmación de Limpieza */}
      <ConfirmModal
        isOpen={showCleanupConfirm}
        onClose={() => setShowCleanupConfirm(false)}
        onConfirm={confirmCleanup}
        title="Confirmar Limpieza de Archivos"
        message={
          cleanupAllSessions
            ? '¿Estás seguro de que deseas eliminar todos los archivos multimedia huérfanos de TODAS las sesiones? Esta acción no se puede deshacer.'
            : '¿Estás seguro de que deseas eliminar todos los archivos multimedia huérfanos de la sesión actual? Esta acción no se puede deshacer.'
        }
        confirmText="Sí, Eliminar"
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  );
}
  ;