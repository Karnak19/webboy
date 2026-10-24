// Génère des icônes PNG sans dépendance : carré orange arrondi + petit "W".
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// W dessiné sur une grille 7x7, scaled à la taille de l'icône
const W = [
  "X.....X",
  "X.....X",
  "X.....X",
  "X.....X",
  "X..X..X",
  ".X.X.X.",
  "..XXX..",
];

function icon(size: number): Buffer {
  const radius = size * 0.22;
  const wStart = Math.floor(size * 0.18);
  const wSize = size - 2 * wStart;
  const cell = wSize / 7;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  return png(size, (x, y) => {
    // coins arrondis
    const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
    const dy = Math.max(Math.abs(y - cy) - (size / 2 - radius), 0);
    if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
    // W blanc
    const gx = Math.floor((x - wStart) / cell);
    const gy = Math.floor((y - wStart) / cell);
    if (gx >= 0 && gx < 7 && gy >= 0 && gy < 7 && W[gy][gx] === "X") {
      return [255, 255, 255, 255];
    }
    return [249, 115, 22, 255]; // orange webboy
  });
}

mkdirSync("public/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, icon(size));
  console.log(`✓ icon${size}.png`);
}
