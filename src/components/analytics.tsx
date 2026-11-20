import { GoogleAnalytics } from "@next/third-parties/google";

// hanya halaman publik; halaman staf (/manajer, /kasir, …) tidak dihitung
export const Analytics = () => <GoogleAnalytics gaId="G-97VGD1PJE9" />;
