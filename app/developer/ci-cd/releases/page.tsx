import { redirect } from 'next/navigation';

export default function DeveloperReleasesPage() {
  // Reuse the existing release engine and UI. Do not create a second release manager.
  redirect('/marketing/apps/releases');
}
