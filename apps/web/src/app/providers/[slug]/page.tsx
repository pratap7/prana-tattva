import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { PublicProfileView, PublicProfileData } from '@/components/provider/public-profile-view';

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function fetchProviderProfile(slug: string): Promise<PublicProfileData | null> {
  try {
    const headersList = headers();
    const cookieStore = cookies();

    // Check for authorization header or session cookie
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const cookieHeader = cookieStore.toString();
    if (cookieHeader) {
      forwardHeaders['Cookie'] = cookieHeader;
    }

    const authHeader = headersList.get('authorization');
    if (authHeader) {
      forwardHeaders['Authorization'] = authHeader;
    }

    const res = await fetch(`${API_BASE_URL}/providers/public/${encodeURIComponent(slug)}`, {
      headers: forwardHeaders,
      cache: 'no-store', // Always fetch fresh to reflect verification updates
    });

    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      return null;
    }

    const data: PublicProfileData = await res.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch public provider profile:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await fetchProviderProfile(params.slug);

  if (!data) {
    return {
      title: 'Practitioner Not Found | Project Nirvana',
      description:
        'The requested practitioner profile is not available or undergoing verification.',
    };
  }

  return {
    title: data.seo.title,
    description: data.seo.description,
    openGraph: {
      title: data.seo.title,
      description: data.seo.description,
      type: 'profile',
      images: data.profile.avatarUrl ? [{ url: data.profile.avatarUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: data.seo.title,
      description: data.seo.description,
      images: data.profile.avatarUrl ? [data.profile.avatarUrl] : undefined,
    },
  };
}

export default async function ProviderPublicProfilePage({ params }: { params: { slug: string } }) {
  const data = await fetchProviderProfile(params.slug);

  if (!data) {
    notFound();
  }

  return (
    <>
      {/* Schema.org JSON-LD structured data for rich snippets */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data.jsonLd) }}
      />
      <PublicProfileView data={data} />
    </>
  );
}
