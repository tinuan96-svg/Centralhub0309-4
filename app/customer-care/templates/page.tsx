import TemplatesClient from './TemplatesClient';

export default function TemplatesPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <TemplatesClient params={params} searchParams={searchParams} />;
}
