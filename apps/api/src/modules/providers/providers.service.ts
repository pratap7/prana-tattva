import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, ApprovalStatus, UserRole } from '@project-nirvana/db';

@Injectable()
export class ProvidersService {
  /**
   * Returns list of all active taxonomy categories for discovery & onboarding selection
   */
  async getCategories() {
    return prisma.category.findMany({
      where: { isActive: true },
      include: {
        subcategories: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Fetches public provider profile by unique slug.
   * CRITICAL SECURITY RULE: Public profile is ONLY visible when approvalStatus = APPROVED.
   * If not APPROVED, only the owning provider or an ADMIN can view it in preview mode.
   */
  async getPublicProfile(slug: string, viewerUserId?: string, viewerRole?: string) {
    const provider = await prisma.providerProfile.findUnique({
      where: { slug },
      include: {
        user: { select: { id: true, createdAt: true } },
        categories: {
          include: { category: true },
        },
        services: {
          where: { isActive: true },
          include: { category: true },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException(`Practitioner profile "${slug}" not found.`);
    }

    // Enforce approvalStatus = APPROVED rule
    const isOwner = viewerUserId && provider.userId === viewerUserId;
    const isAdmin = viewerRole === UserRole.ADMIN;

    if (provider.approvalStatus !== ApprovalStatus.APPROVED) {
      if (!isOwner && !isAdmin) {
        // Forbidden to public seekers / anonymous users
        throw new NotFoundException(
          `Practitioner profile "${slug}" is currently undergoing sanctuary verification and is not yet publicly visible.`,
        );
      }
    }

    // Build SEO metadata
    const seoTitle = `${provider.displayName} — ${provider.headline} | Project Nirvana`;
    const seoDescription = provider.bio.slice(0, 160).replace(/\n/g, ' ');

    // Build Schema.org JSON-LD
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Person',
          '@id': `https://nirvana.internal/providers/${provider.slug}#person`,
          name: provider.displayName,
          jobTitle: provider.headline,
          description: provider.bio,
          image: provider.avatarUrl || 'https://nirvana.internal/images/default-avatar.png',
          address: {
            '@type': 'PostalAddress',
            addressLocality: provider.city,
            addressCountry: provider.country,
          },
          knowsAbout: provider.categories.map((c) => c.category.name),
          knowsLanguage: provider.languages,
        },
        {
          '@type': 'Service',
          '@id': `https://nirvana.internal/providers/${provider.slug}#services`,
          provider: {
            '@id': `https://nirvana.internal/providers/${provider.slug}#person`,
          },
          serviceType: 'Holistic Wellness & Live Healing Sessions',
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: `${provider.displayName}'s Healing Offerings`,
            itemListElement: provider.services.map((svc, idx) => ({
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: svc.title,
                description: svc.description,
              },
              price: (svc.priceAmount / 100).toFixed(2),
              priceCurrency: svc.currency,
              position: idx + 1,
            })),
          },
        },
      ],
    };

    return {
      profile: {
        id: provider.id,
        displayName: provider.displayName,
        slug: provider.slug,
        headline: provider.headline,
        bio: provider.bio,
        avatarUrl: provider.avatarUrl,
        introVideoUrl: provider.introVideoUrl,
        languages: provider.languages,
        yearsExperience: provider.yearsExperience,
        city: provider.city,
        country: provider.country,
        verificationTier: provider.verificationTier,
        approvalStatus: provider.approvalStatus,
        ratingAvg: Number(provider.ratingAvg),
        ratingCount: provider.ratingCount,
        isPreview: provider.approvalStatus !== ApprovalStatus.APPROVED,
      },
      categories: provider.categories.map((c) => ({
        id: c.category.id,
        name: c.category.name,
        slug: c.category.slug,
        isPrimary: c.isPrimary,
        requiresLicense: c.category.requiresLicense,
      })),
      services: provider.services.map((svc) => ({
        id: svc.id,
        title: svc.title,
        description: svc.description,
        durationMin: svc.durationMin,
        priceAmount: svc.priceAmount,
        currency: svc.currency,
        mode: svc.mode,
        categoryId: svc.categoryId,
        categoryName: svc.category.name,
      })),
      seo: {
        title: seoTitle,
        description: seoDescription,
      },
      jsonLd,
    };
  }
}
