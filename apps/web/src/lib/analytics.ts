/**
 * Umami Analytics Client Integration
 * Lightweight, privacy-first analytics with role and outcome tracking only.
 */

declare global {
  interface Window {
    umami?: {
      track: (name: string, data?: Record<string, string>) => void;
    };
  }
}

/**
 * Injects the Umami script into the document head if VITE_UMAMI_WEBSITE_ID is configured.
 * Scoped strictly to production domains so dev/staging/preview never send analytics events.
 */
export function initAnalytics(): void {
  if (typeof document === 'undefined') return;

  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  if (typeof websiteId === 'string' && websiteId.trim() !== '') {
    // Prevent duplicate script injection
    if (document.querySelector('script[src*="cloud.umami.is"]')) {
      return;
    }

    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://cloud.umami.is/script.js';
    script.setAttribute('data-website-id', websiteId.trim());
    script.setAttribute('data-domains', 'opspilot-web-wf6g.onrender.com');
    document.head.appendChild(script);
  }
}

/**
 * Fires an analytics custom event if Umami is loaded and available on window.
 * Wrapped in try/catch to ensure analytics failures can never disrupt application flows.
 */
export function trackEvent(name: string, data: Record<string, string>): void {
  try {
    if (typeof window !== 'undefined' && window.umami?.track) {
      window.umami.track(name, data);
    }
  } catch {
    // Fail-safe: analytics must never throw or break UI logic
  }
}
