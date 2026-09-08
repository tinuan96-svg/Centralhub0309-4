'use client';

import CampaignManagerLiveClient from '../CampaignManagerLiveClient';

// Keep the legacy route useful by routing it to the maintained, Supabase-backed campaign creator.
export default function NewCampaignWizardClient() {
  return <CampaignManagerLiveClient />;
}
