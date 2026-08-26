import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BYPASS_KEY = 'opspilot_maintenance_bypass';
const BYPASS_VALUE = 'opspilot2026';

export function MaintenanceModal() {
  const location = useLocation();
  const [isBlocked, setIsBlocked] = useState<boolean>(false);

  // Check if maintenance mode is enabled via build-time env var
  const isMaintenanceEnv = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  // Check if bypass token is present in URL query string or sessionStorage
  const [isBypassed, setIsBypassed] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('maintenanceBypass') === BYPASS_VALUE) {
        sessionStorage.setItem(BYPASS_KEY, BYPASS_VALUE);
        return true;
      }
      return sessionStorage.getItem(BYPASS_KEY) === BYPASS_VALUE;
    } catch {
      return false;
    }
  });

  // Check URL params on location change as well
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('maintenanceBypass') === BYPASS_VALUE) {
        sessionStorage.setItem(BYPASS_KEY, BYPASS_VALUE);
        setIsBypassed(true);
      }
    } catch {
      // ignore storage error
    }
  }, [location]);

  // Trigger modal on first click or keyboard interaction if maintenance mode is active and not bypassed
  useEffect(() => {
    if (!isMaintenanceEnv || isBypassed) return;

    const handleGlobalClick = (e: MouseEvent) => {
      if (e.target) {
        setIsBlocked(true);
      }
    };

    const handleGlobalKey = (e: KeyboardEvent) => {
      if (['Enter', 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        setIsBlocked(true);
      }
    };

    window.addEventListener('click', handleGlobalClick, { capture: true });
    window.addEventListener('keydown', handleGlobalKey, { capture: true });

    return () => {
      window.removeEventListener('click', handleGlobalClick, { capture: true });
      window.removeEventListener('keydown', handleGlobalKey, { capture: true });
    };
  }, [isMaintenanceEnv, isBypassed]);

  // Trigger on route change
  const [initialPath] = useState(location.pathname);
  useEffect(() => {
    if (!isMaintenanceEnv || isBypassed) return;
    if (location.pathname !== initialPath) {
      setIsBlocked(true);
    }
  }, [location.pathname, initialPath, isMaintenanceEnv, isBypassed]);

  // Trap all keyboard events when blocked (prevent Tab, Escape, Enter from interacting with underlying page)
  useEffect(() => {
    if (!isBlocked) return;

    const blockKeyboard = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };

    window.addEventListener('keydown', blockKeyboard, { capture: true });
    window.addEventListener('keyup', blockKeyboard, { capture: true });
    window.addEventListener('keypress', blockKeyboard, { capture: true });

    return () => {
      window.removeEventListener('keydown', blockKeyboard, { capture: true });
      window.removeEventListener('keyup', blockKeyboard, { capture: true });
      window.removeEventListener('keypress', blockKeyboard, { capture: true });
    };
  }, [isBlocked]);

  if (!isMaintenanceEnv || isBypassed || !isBlocked) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 select-none"
      style={{
        backgroundColor: 'rgba(9, 14, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="w-full max-w-md p-6 sm:p-8 rounded-2xl border shadow-2xl text-center space-y-4 fade-in"
        style={{
          backgroundColor: 'hsl(222, 47%, 11%)',
          borderColor: 'hsl(217, 33%, 22%)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl shadow-inner"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'hsl(220, 90%, 70%)' }}
        >
          🔧
        </div>

        <h2 className="text-xl font-bold tracking-tight" style={{ color: 'hsl(210, 40%, 98%)' }}>
          System Maintenance in Progress
        </h2>

        <p className="text-sm leading-relaxed" style={{ color: 'hsl(215, 20%, 65%)' }}>
          This demo environment is currently undergoing scheduled maintenance and system upgrades. Please check back shortly.
        </p>

        <div className="pt-2 flex items-center justify-center gap-2 text-xs font-mono" style={{ color: 'hsl(215, 15%, 50%)' }}>
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>OpsPilot Platform Upgrade · v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
