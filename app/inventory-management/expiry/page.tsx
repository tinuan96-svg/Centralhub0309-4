import ExpiryClient from "./ExpiryClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ExpiryClient params={params} searchParams={searchParams} />;
}
