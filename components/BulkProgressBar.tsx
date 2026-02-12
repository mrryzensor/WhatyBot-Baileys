import React from 'react';
import { Send, CheckCircle, XCircle, Zap, Clock } from 'lucide-react';

interface BulkProgressBarProps {
  current: number;
  total: number;
  isActive: boolean;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  status?: 'processing' | 'waiting' | 'completed';
  batch?: number;
  totalBatches?: number;
  waitSecondsRemaining?: number;
  waitTotalSeconds?: number;
  queueStatus?: 'idle' | 'running' | 'waiting' | 'paused' | 'cancelled' | 'completed';
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  successCount?: number;
  failedCount?: number;
}

export const BulkProgressBar: React.FC<BulkProgressBarProps> = ({
  current,
  total,
  isActive,
  onClose,
  title,
  subtitle,
  status,
  batch,
  totalBatches,
  waitSecondsRemaining,
  waitTotalSeconds,
  queueStatus,
  onPause,
  onResume,
  onCancel,
  successCount = 0,
  failedCount = 0
}) => {
  if (!isActive) return null;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isWaiting = status === 'waiting';
  const isComplete = status === 'completed' || (!isWaiting && current >= total && total > 0);

  const effectiveWaitTotalSeconds = isWaiting
    ? (typeof waitTotalSeconds === 'number' && waitTotalSeconds > 0
      ? waitTotalSeconds
      : (typeof waitSecondsRemaining === 'number' ? waitSecondsRemaining : 0))
    : 0;

  const waitRemainingSeconds = isWaiting
    ? Math.max(0, Math.floor(waitSecondsRemaining ?? 0))
    : 0;

  const waitInversePercentage = isWaiting && effectiveWaitTotalSeconds > 0
    ? Math.min(100, Math.max(0, Math.round((waitRemainingSeconds / effectiveWaitTotalSeconds) * 100)))
    : 0;

  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  const canPause = !!onPause && !!onResume && !isComplete && queueStatus !== 'paused' && queueStatus !== 'cancelled';
  const canResume = !!onPause && !!onResume && !isComplete && queueStatus === 'paused';
  const canCancel = !!onCancel && !isComplete && queueStatus !== 'cancelled';

  let autoTitle: string;
  if (isWaiting) {
    autoTitle = 'Esperando siguiente lote...';
  } else if (isComplete) {
    autoTitle = '¡Envío Completado!';
  } else {
    autoTitle = 'Procesando envíos';
  }

  let autoSubtitle: string;
  if (isWaiting) {
    const seconds = waitRemainingSeconds;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeLabel = minutes > 0
      ? `${minutes} min ${secs.toString().padStart(2, '0')} s`
      : `${secs} s`;

    const batchLabel = batch && totalBatches
      ? `Lote ${batch}/${totalBatches}. `
      : '';

    autoSubtitle = `${batchLabel}Esperando ${timeLabel} antes del siguiente lote...`;
  } else if (isComplete) {
    autoSubtitle = `${total} mensaje(s) procesado(s)`;
  } else {
    autoSubtitle = `Mensaje ${current} de ${total}`;
  }

  const displayTitle = title || autoTitle;
  const displaySubtitle = subtitle || autoSubtitle;
  const queueBadge = isWaiting ? 'En espera' : isComplete ? 'Cola finalizada' : 'Cola en ejecución';

  return (
    <div className="fixed top-4 right-4 z-[9999] w-full max-w-sm px-2">
      <div className="bg-theme-card/95 backdrop-blur rounded-xl shadow-lg border border-theme overflow-hidden animate-slide-up">
        <div className="px-4 py-3 border-b border-theme bg-theme-base flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isComplete ? 'bg-primary-100 text-primary-600' : 'bg-blue-100 text-blue-600'}`}>
            {isComplete ? (
              <CheckCircle size={18} />
            ) : isWaiting ? (
              <Clock size={18} className="animate-spin text-blue-600" />
            ) : (
              <Zap size={18} className="animate-pulse" />
            )}
          </div>
          <div className="flex-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">Cola de procesos</p>
              <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isComplete ? 'bg-primary-50 text-primary-700' : 'bg-blue-50 text-blue-700'}`}>
                {queueBadge}
              </div>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-theme-main">{displayTitle}</p>
                <p className="text-xs text-theme-muted">{displaySubtitle}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-theme-main">{percentage}%</p>
                <p className="text-[11px] text-theme-muted">{current}/{total}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {canPause && (
              <button
                onClick={onPause}
                className="text-xs px-2 py-1 rounded-full bg-slate-100 text-theme-main hover:bg-slate-200 transition-colors"
              >
                Pausar
              </button>
            )}
            {canResume && (
              <button
                onClick={onResume}
                className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
              >
                Reanudar
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              >
                Cancelar
              </button>
            )}
            {onClose && isComplete && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-theme-muted transition-colors"
                aria-label="Cerrar progreso"
              >
                <XCircle size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-xs text-theme-muted mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-primary-500" />
                <span className="text-theme-main font-medium">{successCount}</span>
                <span className="text-[10px] text-slate-400">Éxito</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle size={14} className="text-red-500" />
                <span className="text-theme-main font-medium">{failedCount}</span>
                <span className="text-[10px] text-slate-400">Fallidos</span>
              </div>
            </div>
            {!isComplete && (
              <span className="text-slate-400">
                {isWaiting ? 'Esperando...' : 'En progreso...'}
              </span>
            )}
          </div>
          {canCancel && confirmingCancel && (
            <div className="flex items-center justify-end gap-2 mb-2 text-[11px] text-theme-muted">
              <span>¿Cancelar envío masivo?</span>
              <button
                onClick={() => {
                  if (onCancel) {
                    onCancel();
                  }
                  setConfirmingCancel(false);
                }}
                className="px-2 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 text-[11px]"
              >
                Sí, cancelar
              </button>
              <button
                onClick={() => setConfirmingCancel(false)}
                className="px-2 py-1 rounded-full bg-slate-100 text-theme-main hover:bg-slate-200 text-[11px]"
              >
                No
              </button>
            </div>
          )}
          {isWaiting ? (
            <div className="relative w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-300 transition-all duration-500 ease-out"
                style={{ width: `${waitInversePercentage}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600 transition-all duration-500 ease-out ${isComplete ? 'animate-pulse' : ''
                  }`}
                style={{ width: `${percentage}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        @keyframes slideUpSoft {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slideUpSoft 0.25s ease-out;
        }
      `}</style>
    </div >
  );
};

