import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import 'reactflow/dist/style.css';
import ChunkRecoveryToast from '@/components/ChunkRecoveryToast';

export const metadata: Metadata = {
  title: 'Heuriskein IA',
  description: 'Multi-Agentic Web System',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="m-0 p-0 bg-dark text-white">
        <Script
          id="chunk-load-recovery"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var reloadKey = 'chunk-reload-attempted';

                function dispatchFailure(src) {
                  try {
                    window.dispatchEvent(new CustomEvent('app:chunk-load-failed', { detail: { src: src || '' } }));
                  } catch (e) {}
                }

                function forceReloadOnce() {
                  try {
                    if (sessionStorage.getItem(reloadKey) === '1') return false;
                    sessionStorage.setItem(reloadKey, '1');
                    var nextUrl = new URL(window.location.href);
                    nextUrl.searchParams.set('reload', String(Date.now()));
                    window.location.replace(nextUrl.toString());
                    return true;
                  } catch (e) {
                    return false;
                  }
                }

                window.addEventListener('error', function (event) {
                  var target = event && event.target;
                  if (!target) return;

                  var src = '';
                  if (target.tagName === 'SCRIPT') {
                    src = target.src || '';
                    if (src.indexOf('/_next/static/chunks/') === -1) return;
                  } else if (target.tagName === 'LINK') {
                    var rel = String(target.rel || '').toLowerCase();
                    src = target.href || '';
                    if (rel !== 'stylesheet' || src.indexOf('/_next/static/css/') === -1) return;
                  } else {
                    return;
                  }

                  if (!forceReloadOnce()) {
                    dispatchFailure(src);
                  }
                }, true);

                window.addEventListener('unhandledrejection', function (event) {
                  var reason = event && event.reason;
                  var message = String((reason && reason.message) || reason || '');
                  if (message.indexOf('ChunkLoadError') === -1 && message.indexOf('Loading chunk') === -1) return;

                  if (!forceReloadOnce()) {
                    dispatchFailure('chunk-runtime');
                  }
                });

                window.addEventListener('load', function () {
                  try {
                    sessionStorage.removeItem(reloadKey);
                  } catch (e) {}
                }, { once: true });
              })();
            `,
          }}
        />
        <ChunkRecoveryToast />
        {children}
      </body>
    </html>
  );
}
