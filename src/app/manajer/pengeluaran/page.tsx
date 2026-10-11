import { ExpenseScreen } from "@/features/pengeluaran/expense-screen";

export const metadata = { title: "Pengeluaran" };
export default function Page() {
  return <ExpenseScreen role="manager" />;
}
