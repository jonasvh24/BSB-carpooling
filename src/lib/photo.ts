// Profile photos arrive as a JPEG data URL. The browser re-encodes them through
// a canvas, which already drops EXIF, but the server cannot trust the browser:
// a crafted request could post a camera original with GPS coordinates in it.
// So the metadata segments are removed here, without an image library.
//
// A JPEG is a list of segments. Metadata lives in APP1–APP13, APP15 (EXIF, XMP,
// ICC, IPTC, maker notes) and COM (comments). APP0 (JFIF header) and APP14
// (Adobe colour transform flag) carry no personal data and are kept.
export function stripJpegBytes(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new Error("not a JPEG");
  const out: Buffer[] = [input.subarray(0, 2)];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new Error("bad JPEG segment");
    const marker = input[i + 1];
    // Start of scan: the rest is image data up to the end marker.
    if (marker === 0xda) {
      out.push(input.subarray(i));
      return Buffer.concat(out);
    }
    if (i + 4 > input.length) throw new Error("truncated JPEG");
    const length = input.readUInt16BE(i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > input.length) throw new Error("truncated JPEG");
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !(marker === 0xfe || (isApp && marker !== 0xe0 && marker !== 0xee));
    if (keep) out.push(input.subarray(i, end));
    i = end;
  }
  throw new Error("JPEG has no image data");
}

const PREFIX = "data:image/jpeg;base64,";

export function stripJpegMetadata(dataUrl: string): string {
  if (!dataUrl.startsWith(PREFIX)) throw new Error("not a JPEG data URL");
  return PREFIX + stripJpegBytes(Buffer.from(dataUrl.slice(PREFIX.length), "base64")).toString("base64");
}
