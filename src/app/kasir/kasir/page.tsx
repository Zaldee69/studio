import { KasirPage } from "@/features/counter/pages";

export const metadata = { title: "Kasir" };
export default function Page({ searchParams }: PageProps<"/kasir/kasir">) {
  return <KasirPage role="cashier" searchParams={searchParams} />;
}
