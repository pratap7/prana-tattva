import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://projectnirvana.internal';

const CATEGORIES = [
  'yoga',
  'reiki',
  'astrology',
  'psychotherapy',
  'sound-healing',
  'ayurveda',
  'pranic-healing',
  'meditation',
];

const CITIES = ['rishikesh', 'mumbai', 'bengaluru', 'delhi', 'goa', 'varanasi', 'pune'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // 1. Static Core Pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/how-it-works`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  // 2. Category Landing Pages (/c/[category])
  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((cat) => ({
    url: `${BASE_URL}/c/${cat}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  // 3. Category + City Combinations (/c/[category]/[city])
  const categoryCityRoutes: MetadataRoute.Sitemap = [];
  for (const cat of CATEGORIES) {
    for (const city of CITIES) {
      categoryCityRoutes.push({
        url: `${BASE_URL}/c/${cat}/${city}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.75,
      });
    }
  }

  return [...staticRoutes, ...categoryRoutes, ...categoryCityRoutes];
}
