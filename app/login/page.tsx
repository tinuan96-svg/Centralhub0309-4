import LoginClient from "./LoginClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <LoginClient params={params} searchParams={searchParams} />;
}
