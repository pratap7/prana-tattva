import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://projectnirvana.internal';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/provider/onboarding'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
