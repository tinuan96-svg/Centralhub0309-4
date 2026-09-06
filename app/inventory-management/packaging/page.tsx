import PackagingManagementClient from "./PackagingManagementClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <PackagingManagementClient params={params} searchParams={searchParams} />;
}
