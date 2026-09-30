/** Bunyi pendek untuk notifikasi (Web Audio). Diam saja bila tidak didukung / belum ada interaksi. */
export function beep(freq = 880) {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.25);
    o.onended = () => ac.close();
  } catch { /* bunyi tidak wajib */ }
}
