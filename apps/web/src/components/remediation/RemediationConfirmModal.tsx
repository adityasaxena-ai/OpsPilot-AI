import React from 'react';
import { AlertTriangle, ShieldAlert, X, Check } from 'lucide-react';
import type { ActionPreviewData } from './RemediationActionCard';

interface Props {
  isOpen: boolean;
  preview: ActionPreviewData | null;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
}

export const RemediationConfirmModal: React.FC<Props> = ({
  isOpen,
  preview,
  onClose,
  onConfirm,
  isConfirming = false,
}) => {
  if (!isOpen || !preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Confirm Production Remediation</h3>
              <p className="text-xs text-slate-400">Explicit Authorization Required</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="bg-rose-500/10 border-y border-rose-500/20 px-5 py-2.5 flex items-center gap-2.5 text-rose-300 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>This action changes production state. Human confirmation required.</span>
        </div>

        {/* Body Details */}
        <div className="p-5 space-y-4 text-xs text-slate-300 max-h-[60vh] overflow-y-auto">
          {/* Action & Target */}
          <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div>
              <span className="text-slate-400 uppercase font-semibold text-[10px] block">Action</span>
              <span className="font-bold text-slate-100 text-sm">{preview.actionName}</span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-semibold text-[10px] block">Target Service</span>
              <span className="font-bold text-amber-400 text-sm">{preview.serviceName} ({preview.environment})</span>
            </div>
          </div>

          {/* Why */}
          <div>
            <span className="text-slate-400 uppercase font-semibold text-[10px] block mb-1">
              Why OpsPilot Recommends This
            </span>
            <p className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-slate-300 leading-relaxed">
              {preview.why}
            </p>
          </div>

          {/* What will happen */}
          <div>
            <span className="text-slate-400 uppercase font-semibold text-[10px] block mb-1.5">
              What Will Happen
            </span>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1.5">
              {preview.whatWillHappen.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">{i + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk & Expected Impact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 uppercase font-semibold text-[10px] block">Expected Risk</span>
              <span className="font-bold text-emerald-400">{preview.riskLevel} ({preview.riskScore}/100)</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 uppercase font-semibold text-[10px] block">Expected Impact</span>
              <span className="text-slate-300 text-[11px] leading-tight block">{preview.expectedImpact}</span>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white shadow-lg shadow-rose-950/50 transition-all flex items-center gap-1.5"
          >
            {isConfirming ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirm & Execute
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
