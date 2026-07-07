#!/usr/bin/env node
// ============================================================================
// Strip Mach-O code signature from a binary.
//
// Bun's internal Mach-O signing (src/macho.zig) produces a truncated code
// signature for x86_64 targets. The LC_CODE_SIGNATURE load command declares
// a SuperBlob size larger than the actual allocated space in __LINKEDIT.
// This causes rcodesign to panic when it tries to parse the binary:
//
//   thread 'main' panicked at apple-codesign/src/macho.rs:117:31:
//   range end index 809392 out of range for slice of length 721584
//
// This script removes the code signature by:
// 1. Finding the LC_CODE_SIGNATURE load command in the Mach-O header
// 2. Truncating the file at the code signature data offset
// 3. Zeroing out the LC_CODE_SIGNATURE load command
// 4. Decrementing ncmds and adjusting sizeofcmds in the Mach-O header
// 5. Shrinking the __LINKEDIT segment's filesize and vmsize to exclude
//    the removed code signature data
//
// The resulting binary is a valid unsigned Mach-O that rcodesign can then
// sign from scratch.
//
// References:
//   - https://github.com/oven-sh/bun/issues/29120
//   - https://github.com/oven-sh/bun/issues/29361
// ============================================================================

const fs = require('fs');

const MH_MAGIC_64 = 0xfeedfacf;
const LC_SEGMENT_64 = 0x19;
const LC_CODE_SIGNATURE = 0x1d;
const HEADER_SIZE_64 = 32;
const PAGE_SIZE = 16384; // macOS uses 16KB pages on arm64, 4KB on x64; 16KB is safe for both

function readUInt64LE(buf, offset) {
  // Read as two 32-bit values (sufficient for file sizes < 4GB)
  const lo = buf.readUInt32LE(offset);
  const hi = buf.readUInt32LE(offset + 4);
  return hi * 0x100000000 + lo;
}

function writeUInt64LE(buf, value, offset) {
  buf.writeUInt32LE(value & 0xffffffff, offset);
  buf.writeUInt32LE(Math.floor(value / 0x100000000) & 0xffffffff, offset + 4);
}

function alignUp(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function stripCodeSignature(filePath) {
  const fd = fs.openSync(filePath, 'r+');
  const headerBuf = Buffer.alloc(HEADER_SIZE_64);

  // Read Mach-O 64-bit header
  fs.readSync(fd, headerBuf, 0, HEADER_SIZE_64, 0);
  const magic = headerBuf.readUInt32LE(0);

  if (magic !== MH_MAGIC_64) {
    console.error(`${filePath}: not a 64-bit Mach-O (magic: 0x${magic.toString(16)})`);
    fs.closeSync(fd);
    process.exit(1);
  }

  const ncmds = headerBuf.readUInt32LE(16);
  const sizeofcmds = headerBuf.readUInt32LE(20);

  // Walk load commands to find LC_CODE_SIGNATURE and __LINKEDIT
  let offset = HEADER_SIZE_64;
  let codesigOffset = -1;
  let codesigCmdSize = 0;
  let codesigDataOff = 0;
  let linkeditOffset = -1;
  let linkeditFileOff = 0;

  // LC_SEGMENT_64 is 72 bytes, but we read up to that for any command
  const cmdBuf = Buffer.alloc(72);
  for (let i = 0; i < ncmds; i++) {
    fs.readSync(fd, cmdBuf, 0, Math.min(72, sizeofcmds), offset);
    const cmd = cmdBuf.readUInt32LE(0);
    const cmdsize = cmdBuf.readUInt32LE(4);

    if (cmd === LC_CODE_SIGNATURE) {
      codesigOffset = offset;
      codesigCmdSize = cmdsize;
      codesigDataOff = cmdBuf.readUInt32LE(8);
    }

    if (cmd === LC_SEGMENT_64) {
      // segname is at offset 8, 16 bytes
      const segname = cmdBuf.toString('ascii', 8, 24).replace(/\0+$/, '');
      if (segname === '__LINKEDIT') {
        linkeditOffset = offset;
        linkeditFileOff = readUInt64LE(cmdBuf, 40); // fileoff at byte 40
      }
    }

    offset += cmdsize;
  }

  if (codesigOffset === -1) {
    console.log(`${filePath}: no LC_CODE_SIGNATURE found, nothing to strip`);
    fs.closeSync(fd);
    return;
  }

  console.log(
    `${filePath}: found LC_CODE_SIGNATURE at header offset ${codesigOffset}, ` +
      `data at file offset ${codesigDataOff}`,
  );

  // 1. Truncate file at the code signature data offset
  fs.ftruncateSync(fd, codesigDataOff);

  // 2. Zero out the LC_CODE_SIGNATURE load command
  const zeroes = Buffer.alloc(codesigCmdSize, 0);
  fs.writeSync(fd, zeroes, 0, codesigCmdSize, codesigOffset);

  // 3. Update the Mach-O header: decrement ncmds and reduce sizeofcmds
  const headerPatch = Buffer.alloc(8);
  headerPatch.writeUInt32LE(ncmds - 1, 0);
  headerPatch.writeUInt32LE(sizeofcmds - codesigCmdSize, 4);
  fs.writeSync(fd, headerPatch, 0, 8, 16);

  // 4. Update __LINKEDIT segment: shrink filesize and vmsize to exclude
  //    the removed code signature data
  if (linkeditOffset !== -1) {
    const newFileSize = codesigDataOff - linkeditFileOff;
    const newVmSize = alignUp(newFileSize, PAGE_SIZE);

    console.log(
      `${filePath}: shrinking __LINKEDIT filesize to ${newFileSize}, ` + `vmsize to ${newVmSize}`,
    );

    // vmsize is at offset 32 within LC_SEGMENT_64 (after cmd+cmdsize+segname+vmaddr)
    // filesize is at offset 48 within LC_SEGMENT_64
    const segPatch = Buffer.alloc(8);

    writeUInt64LE(segPatch, newVmSize, 0);
    fs.writeSync(fd, segPatch, 0, 8, linkeditOffset + 32);

    writeUInt64LE(segPatch, newFileSize, 0);
    fs.writeSync(fd, segPatch, 0, 8, linkeditOffset + 48);
  }

  fs.closeSync(fd);
  console.log(`${filePath}: code signature stripped successfully`);
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: strip_macho_codesign.js <binary> [binary...]');
  process.exit(2);
}

for (const file of args) {
  stripCodeSignature(file);
}
