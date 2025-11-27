import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    
    // athena-ai 디렉토리를 모듈로 인식하도록 설정
    if (isServer) {
      // athena-ai를 절대 경로로 매핑
      config.resolve.alias = {
        ...config.resolve.alias,
        'athena-ai': path.resolve(__dirname, 'athena-ai'),
      };
      
      // 서버 사이드에서만 athena-ai 디렉토리 포함
      config.resolve.modules = [
        ...(config.resolve.modules || []),
        path.resolve(__dirname),
      ];
      
      // .js 확장자로 import 허용
      config.resolve.extensions = [
        ...(config.resolve.extensions || []),
        '.js',
      ];
    }
    
    // 서버 사이드에서만 네이티브 모듈 사용
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3');
    }
    
    return config;
  },
  // ES modules 지원
  serverExternalPackages: ['better-sqlite3'],
  // FFmpeg.wasm을 위한 헤더 설정
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
