/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // 선수/시즌 이미지는 넥슨 CDN에서 직접 내려받는다.
    remotePatterns: [
      { protocol: 'https', hostname: 'fco.dn.nexoncdn.co.kr' },
      { protocol: 'https', hostname: 'ssl.nexon.com' },
      { protocol: 'https', hostname: 'open.api.nexon.com' },
    ],
  },
};

export default nextConfig;
