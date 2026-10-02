import type { Metadata } from 'next';
import { AvailabilityEditor } from '@/components/provider/availability-editor';

export const metadata: Metadata = {
  title: 'Availability & Working Hours | Project Nirvana',
  description: 'Manage your weekly schedule, session buffers, and time-off exceptions.',
};

export default function ProviderAvailabilityPage() {
  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-6xl">
      <AvailabilityEditor />
    </div>
  );
}
