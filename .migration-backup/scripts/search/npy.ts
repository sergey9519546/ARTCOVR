/**
 * Minimal .npy reader for the float32 embedding artifacts produced by the
 * offline CLIP encoding pipeline (see E:/ART_COLLECTION/.artcovr-curation/
 * semantic-lab/*.py). Supports exactly the subset build-search-index.ts
 * needs: version 1 or 2 header, dtype '<f4' (float32 little-endian),
 * C-contiguous (fortran_order: False), 2-D shape. No numpy dependency.
 */
import { readFile } from "node:fs/promises";

export type NpyFloatMatrix = {
  rows: number;
  cols: number;
  data: Float64Array;
};

export async function readNpyFloat32Matrix(filePath: string): Promise<NpyFloatMatrix> {
  const buffer = await readFile(filePath);
  if (buffer.subarray(0, 6).toString("latin1") !== "\x93NUMPY") {
    throw new Error(`Not a valid .npy file: ${filePath}`);
  }
  const majorVersion = buffer[6];
  let headerLength: number;
  let headerStart: number;
  if (majorVersion === 1) {
    headerLength = buffer.readUInt16LE(8);
    headerStart = 10;
  } else if (majorVersion === 2 || majorVersion === 3) {
    headerLength = buffer.readUInt32LE(8);
    headerStart = 12;
  } else {
    throw new Error(`Unsupported .npy version ${majorVersion} in ${filePath}`);
  }

  const header = buffer.subarray(headerStart, headerStart + headerLength).toString("latin1");
  const descrMatch = header.match(/'descr'\s*:\s*'([^']+)'/);
  const fortranMatch = header.match(/'fortran_order'\s*:\s*(True|False)/);
  const shapeMatch = header.match(/'shape'\s*:\s*\(([^)]*)\)/);
  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`Malformed .npy header in ${filePath}: ${header}`);
  }
  if (descrMatch[1] !== "<f4") {
    throw new Error(`Unsupported dtype '${descrMatch[1]}' in ${filePath}; expected '<f4'.`);
  }
  if (fortranMatch[1] !== "False") {
    throw new Error(`Fortran-ordered .npy not supported: ${filePath}`);
  }
  const shape = shapeMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part));
  if (shape.length !== 2) {
    throw new Error(`Expected a 2-D array in ${filePath}, got shape (${shape.join(", ")}).`);
  }
  const [rows, cols] = shape;

  const dataStart = headerStart + headerLength;
  const dataBytes = buffer.subarray(dataStart);
  const expectedBytes = rows * cols * 4;
  if (dataBytes.length !== expectedBytes) {
    throw new Error(
      `Data length mismatch in ${filePath}: expected ${expectedBytes} bytes for shape (${rows}, ${cols}), got ${dataBytes.length}.`,
    );
  }

  // Copy into a fresh, 4-byte-aligned ArrayBuffer before viewing as Float32Array:
  // Buffer.subarray shares the parent's backing store and its byteOffset is
  // not guaranteed to be a multiple of 4.
  const aligned = new Uint8Array(dataBytes.length);
  aligned.set(dataBytes);
  const floats32 = new Float32Array(aligned.buffer);

  // Widen to float64 immediately: all downstream math (dot products, mean,
  // std) is done in float64 to match the numpy reference computation and
  // avoid re-introducing float32 rounding error mid-pipeline.
  const data = new Float64Array(floats32.length);
  for (let i = 0; i < floats32.length; i += 1) data[i] = floats32[i];

  return { rows, cols, data };
}
