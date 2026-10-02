import type { Metadata } from 'next';
import { ServicesManager } from '@/components/provider/services-manager';

export const metadata: Metadata = {
  title: 'Service Offerings & Sessions | Project Nirvana',
  description: 'Manage your practitioner sessions, durations, pricing, and cancellation policies.',
};

export default function ProviderServicesPage() {
  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-6xl">
      <ServicesManager />
    </div>
  );
}
