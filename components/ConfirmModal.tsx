import React from 'react';
import { AlertTriangle, X, Trash2, AlertCircle, Info } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'warning'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <Trash2 size={24} className="text-red-600" />;
      case 'warning':
        return <AlertTriangle size={24} className="text-yellow-600" />;
      case 'info':
        return <Info size={24} className="text-blue-600" />;
      default:
        return <AlertCircle size={24} className="text-yellow-600" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-50';
      case 'warning':
        return 'bg-yellow-50';
      case 'info':
        return 'bg-blue-50';
      default:
        return 'bg-yellow-50';
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500';
      case 'info':
        return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
      default:
        return 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500';
    }
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-theme-card rounded-xl shadow-2xl max-w-md w-full transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 ${getIconBg()} p-3 rounded-full`}>
              {getIcon()}
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-semibold text-theme-main mb-2">{title}</h3>
              <p className="text-theme-muted text-sm leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-theme-muted"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="px-6 pb-6 border-t border-theme">
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-theme-main hover:text-theme-main hover:bg-slate-100 rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${getButtonColor()}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
