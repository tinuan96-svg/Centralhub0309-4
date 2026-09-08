'use client';

import CampaignManagerLiveClient from '../CampaignManagerLiveClient';

// Keep the legacy route useful by routing it to the maintained, Supabase-backed campaign creator.
export default function NewCampaignWizardClient(_props?: { params?: any; searchParams?: any }) {
  return <CampaignManagerLiveClient />;
}
