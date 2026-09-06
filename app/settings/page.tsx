import SettingsClient from './SettingsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SettingsClient params={params} searchParams={searchParams} />;
}
