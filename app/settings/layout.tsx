import SettingsLayoutClient from './SettingsLayoutClient';

export default function SettingsLayout({
  children,
  params,
  searchParams,
}: {
  children: React.ReactNode;
  params: any;
  searchParams: any;
}) {
  return <SettingsLayoutClient params={params} searchParams={searchParams}>{children}</SettingsLayoutClient>;
}
