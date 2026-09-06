import BankingClient from './BankingClient';
import BankingLiveSync from './BankingLiveSync';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <>
      <BankingLiveSync />
      <BankingClient params={params} searchParams={searchParams} />
    </>
  );
}
