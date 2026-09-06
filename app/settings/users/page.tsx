import SettingsUsersClient from './SettingsUsersClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SettingsUsersClient params={params} searchParams={searchParams} />;
}
