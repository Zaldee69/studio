import { notFound } from "next/navigation";
import { Segera } from "@/components/shells";
import { MANAGER_MENU, placeholders } from "@/lib/menus";

const MODULES = placeholders(MANAGER_MENU, "/manajer");

export default async function Modul({ params }: PageProps<"/manajer/[modul]">) {
  const title = MODULES[(await params).modul];
  if (!title) notFound();
  return <Segera title={title} />;
}
