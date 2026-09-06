import ExpensesClient from './ExpensesClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ExpensesClient params={params} searchParams={searchParams} />;
}
