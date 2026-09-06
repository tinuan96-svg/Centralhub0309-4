import CategoriesClient from "./CategoriesClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <CategoriesClient params={params} searchParams={searchParams} />;
}
