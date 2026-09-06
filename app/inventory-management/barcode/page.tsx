import BarcodeScannerClient from './BarcodeScannerClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <BarcodeScannerClient params={params} searchParams={searchParams} />;
}
