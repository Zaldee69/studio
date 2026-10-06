"use client";

// Printer struk Bluetooth (BLE) langsung dari Chrome lewat Web Bluetooth — tanpa dialog print & tanpa aplikasi
// tambahan. Didukung Chrome Android & desktop (macOS/Windows), butuh HTTPS (atau localhost). Printer yang hanya
// Bluetooth klasik (SPP) tanpa BLE tidak terlihat oleh browser.
import { useSyncExternalStore } from "react";
import type { Paper } from "./domain/escpos";

// Layanan GATT umum printer thermal BLE (Xprinter, Panda, Goojprt, MTP, ISSC/Microchip, "cat printer").
const SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb", "0000ae30-0000-1000-8000-00805f9b34fb", "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
];
// ponytail: potongan 100 byte + jeda 20 ms aman untuk printer murah; naikkan bila cetak terasa lambat
const CHUNK = 100, GAP_MS = 20;

export type PrinterSettings = { paper: Paper; autoPrint: boolean; drawer: boolean };
export type PrinterState = { status: "unsupported" | "off" | "connecting" | "on"; name: string | null; error: string | null; settings: PrinterSettings };

const KEY = "gb-printer";
const DEFAULTS: PrinterSettings = { paper: 58, autoPrint: true, drawer: false };
const loadSettings = (): PrinterSettings => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULTS; }
};

let device: BluetoothDevice | null = null;
let char: BluetoothRemoteGATTCharacteristic | null = null;
let state: PrinterState = { status: "off", name: null, error: null, settings: DEFAULTS };
let inited = false;
const subs = new Set<() => void>();
const set = (p: Partial<PrinterState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

const supported = () => typeof navigator !== "undefined" && !!navigator.bluetooth;

function init() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  state = { ...state, settings: loadSettings(), status: supported() ? "off" : "unsupported" };
  // Printer yang pernah diizinkan: sambung ulang tanpa memilih lagi (bila Chrome mendukung getDevices)
  if (supported() && navigator.bluetooth.getDevices) {
    navigator.bluetooth.getDevices().then((ds) => {
      const saved = localStorage.getItem(`${KEY}-id`);
      const d = ds.find((x) => x.id === saved);
      if (d) void attach(d).catch(() => {});
    }).catch(() => {});
  }
}

async function attach(d: BluetoothDevice) {
  set({ status: "connecting", error: null, name: d.name ?? "Printer" });
  device = d;
  d.addEventListener("gattserverdisconnected", () => { char = null; set({ status: "off" }); });
  const server = await d.gatt!.connect();
  char = null;
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) { char = c; break; }
    }
    if (char) break;
  }
  if (!char) { d.gatt!.disconnect(); throw new Error("Printer tidak punya jalur tulis yang dikenali"); }
  try { localStorage.setItem(`${KEY}-id`, d.id); } catch {}
  set({ status: "on" });
}

/** Pilih & sambungkan printer — harus dipanggil dari klik pengguna (aturan Web Bluetooth). */
export async function connectPrinter() {
  init();
  try {
    const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    await attach(d);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // batal memilih di dialog Chrome bukan error
    set({ status: char ? "on" : "off", error: /cancel|User cancelled/i.test(msg) ? null : msg });
  }
}

export function disconnectPrinter() {
  try { localStorage.removeItem(`${KEY}-id`); } catch {}
  device?.gatt?.disconnect();
  device = null; char = null;
  set({ status: supported() ? "off" : "unsupported", name: null });
}

export function setPrinterSettings(p: Partial<PrinterSettings>) {
  const settings = { ...state.settings, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  set({ settings });
}

/** Kirim byte ESC/POS. Sambung ulang otomatis bila koneksi sempat putus (printer dimatikan/di luar jangkauan). */
export async function printBytes(bytes: Uint8Array) {
  if (!char && device) await attach(device);
  if (!char) throw new Error("Printer belum tersambung");
  const noResp = char.properties.writeWithoutResponse;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK);
    if (noResp) { await char.writeValueWithoutResponse(part); await new Promise((r) => setTimeout(r, GAP_MS)); }
    else await char.writeValueWithResponse(part);
  }
}

export const printerSettings = () => { init(); return state.settings; };
export const printerReady = () => state.status === "on" || (!!device && state.status === "off");

const subscribe = (f: () => void) => { init(); subs.add(f); return () => { subs.delete(f); }; };
const SERVER: PrinterState = { status: "off", name: null, error: null, settings: DEFAULTS };
export const usePrinter = () => useSyncExternalStore(subscribe, () => state, () => SERVER);
