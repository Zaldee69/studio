import { KasirPage } from "@/features/counter/pages";

export const metadata = { title: "Kasir" };
export default function Page({ searchParams }: PageProps<"/manajer/kasir">) {
  return <KasirPage role="manager" searchParams={searchParams} />;
}
