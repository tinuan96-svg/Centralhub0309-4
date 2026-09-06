import NewCampaignWizardClient from "./NewCampaignWizardClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <NewCampaignWizardClient params={params} searchParams={searchParams} />;
}
