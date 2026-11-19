import { RouteTabs, RENCANA_TABS } from "@/components/route-tabs";

/** Kepala bersama empat tab Rencana & Target: judul halaman + tab. Judul tiap tab dipasang sebagai h2 di dalam isinya. */
export function RencanaHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-display text-[28px] font-medium tracking-tight">Rencana & Target</h1>
        {actions}
      </div>
      <RouteTabs tabs={RENCANA_TABS} label="Bagian rencana & target" />
    </header>
  );
}
