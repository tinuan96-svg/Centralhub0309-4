import ExpenseDetailClient from './ExpenseDetailClient';

export async function generateStaticParams() {
  return [{ id: 'new' }, { id: '__placeholder' }];
}

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ExpenseDetailClient params={params} searchParams={searchParams} />;
}
