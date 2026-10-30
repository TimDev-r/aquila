// Tiny PNG candlestick renderer with no dependencies, used by selftest.ts to give
// analyze-chart a real chart image. Not used by the deployed functions.
import type { Candle } from "./contracts.ts";


const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
/** Renders candles as a base64 PNG (white background, green/red candles). */
export async function chartPng(candles: Candle[], w = 640, h = 360): Promise<string> {
  const px = new Uint8Array(w * h * 3).fill(255);
  const set = (x: number, y: number, [r, g, b]: number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    px.set([r, g, b], (y * w + x) * 3);
  };
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const y = (p: number) => Math.round(20 + ((hi - p) / (hi - lo)) * (h - 40));
  for (let gy = 20; gy < h - 20; gy += 40) for (let x = 0; x < w; x++) set(x, gy, [235, 235, 235]);
  const step = (w - 40) / candles.length;
  candles.forEach((c, i) => {
    const cx = Math.round(20 + i * step + step / 2);
    const color = c.close >= c.open ? [22, 163, 74] : [220, 38, 38];
    for (let yy = y(c.high); yy <= y(c.low); yy++) set(cx, yy, color);
    const top = Math.min(y(c.open), y(c.close));
    const bottom = Math.max(y(c.open), y(c.close), top + 1);
    for (let yy = top; yy <= bottom; yy++) for (let dx = -3; dx <= 3; dx++) set(cx + dx, yy, color);
  });
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let row = 0; row < h; row++) raw.set(px.subarray(row * w * 3, (row + 1) * w * 3), row * (w * 3 + 1) + 1);
  const zlib = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts: Uint8Array<ArrayBuffer>[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib), chunk("IEND", new Uint8Array())];
  const png = new Uint8Array(await new Blob(parts).arrayBuffer());
  let bin = "";
  for (const b of png) bin += String.fromCharCode(b);
  return btoa(bin);
}
