import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "회의녹음변환기",
  description: "OpenAI Whisper를 이용한 회의 녹음 음성-텍스트 변환 및 회의록 자동 생성",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "회의녹음변환기",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3b82f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const isDark = theme === 'dark' || (!theme && prefersDark);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {
                  console.error('Theme initialization error:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  // 개발 환경에서는 ServiceWorker 등록 비활성화
                  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.log('ServiceWorker: 개발 환경에서는 등록하지 않습니다.');
                    return;
                  }
                  
                  // 프로덕션 환경에서만 ServiceWorker 등록 (에러 처리 포함)
                  navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                      console.log('ServiceWorker 등록 성공:', registration.scope);
                    })
                    .catch((error) => {
                      console.warn('ServiceWorker 등록 실패 (앱은 정상 작동합니다):', error);
                    });
                });
              }
            `,
          }}
        />
        </ThemeProvider>
      </body>
    </html>
  );
}
