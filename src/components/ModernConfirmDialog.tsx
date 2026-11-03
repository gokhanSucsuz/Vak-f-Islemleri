"use client";

import React, { useEffect } from "react";
import {
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Info,
  CheckCircle2,
  X,
} from "lucide-react";

export type DialogType = "warning" | "danger" | "info" | "question" | "success";

export interface ModernConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  details?: React.ReactNode;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  secondaryAction?: {
    text: string;
    onClick: () => void;
    className?: string;
  };
  isLoading?: boolean;
}

export default function ModernConfirmDialog({
  isOpen,
  onClose,
  title,
  message,
  details,
  type = "question",
  confirmText = "Onayla",
  cancelText = "Vazgeç",
  onConfirm,
  secondaryAction,
  isLoading = false,
}: ModernConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const iconConfig = {
    warning: {
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-100",
      btn: "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20",
    },
    danger: {
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-100",
      btn: "bg-red-600 hover:bg-red-700 text-white shadow-red-600/20",
    },
    info: {
      icon: Info,
      color: "text-blue-600",
      bg: "bg-blue-100",
      btn: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20",
    },
    question: {
      icon: HelpCircle,
      color: "text-indigo-600",
      bg: "bg-indigo-100",
      btn: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20",
    },
    success: {
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
      btn: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20",
    },
  }[type];

  const IconComponent = iconConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Arka plan karartması */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isLoading) onClose();
        }}
      />

      {/* Modal Kutusu */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-2xl ${iconConfig.bg} ${iconConfig.color} flex items-center justify-center flex-shrink-0 shadow-inner`}
          >
            <IconComponent className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-lg font-bold text-slate-800 leading-snug">{title}</h3>
            <div className="mt-2 text-sm text-slate-600 leading-relaxed space-y-2">
              {message}
            </div>
          </div>
        </div>

        {details && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700">
            {details}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5">
          {cancelText && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              disabled={isLoading}
              onClick={secondaryAction.onClick}
              className={
                secondaryAction.className ||
                "px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold shadow-md transition-all disabled:opacity-50"
              }
            >
              {secondaryAction.text}
            </button>
          )}

          {onConfirm && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onConfirm}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2 ${iconConfig.btn} disabled:opacity-50`}
            >
              {isLoading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

