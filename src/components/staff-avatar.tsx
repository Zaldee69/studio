import Image from "next/image";
import { toneOf } from "@/lib/domain/category";
import { photoUrl } from "@/lib/storage";

/** Avatar staf: foto asli dari Pengaturan; tanpa foto → huruf pertama di lingkaran warna kategori. */
export function StaffAvatar({ name, category, photoPath, size = 36, className = "" }: {
  name: string; category: string; photoPath?: string | null; size?: number; className?: string;
}) {
  const t = toneOf(category), src = photoUrl(photoPath);
  return (
    <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4, background: t.bg, color: t.fg }}>
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" /> : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
