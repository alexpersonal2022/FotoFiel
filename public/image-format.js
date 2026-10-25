export function inspectImage(buffer) {
  const b = new Uint8Array(buffer), v = new DataView(buffer);
  const str = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  const fail = () => { throw new Error('Arquivo inválido, corrompido ou não suportado. Selecione JPEG, PNG ou WebP estático.'); };
  let width, height, type;
  if (b.length < 24) fail();
  if (str(0, 8) === '\x89PNG\r\n\x1a\n') {
    type = 'image/png';
    if (str(12, 4) !== 'IHDR') fail();
    width = v.getUint32(16); height = v.getUint32(20);
    for (let i = 8; i + 12 <= b.length;) {
      const len = v.getUint32(i); if (i + 12 + len > b.length) fail();
      if (str(i + 4, 4) === 'acTL') throw new Error('PNG animado não é suportado. Use uma fotografia estática.');
      i += len + 12;
    }
  } else if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
    type = 'image/webp';
    for (let i = 12; i + 8 <= b.length;) {
      const kind = str(i, 4), len = v.getUint32(i + 4, true), p = i + 8;
      if (p + len > b.length) fail();
      if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && (b[p] & 2))) throw new Error('WebP animado não é suportado. Use uma fotografia estática.');
      if (kind === 'VP8X' && len >= 10) { width = 1 + b[p+4] + (b[p+5]<<8) + (b[p+6]<<16); height = 1 + b[p+7] + (b[p+8]<<8) + (b[p+9]<<16); }
      if (kind === 'VP8 ' && len >= 10 && !width) { width = v.getUint16(p+6,true)&16383; height = v.getUint16(p+8,true)&16383; }
      if (kind === 'VP8L' && len >= 5 && !width) { const bits=v.getUint32(p+1,true); width=(bits&16383)+1; height=((bits>>>14)&16383)+1; }
      i = p + len + (len & 1);
    }
  } else if (b[0] === 255 && b[1] === 216) {
    type = 'image/jpeg'; let i=2;
    while (i + 3 < b.length) {
      if (b[i++] !== 255) fail(); while (b[i] === 255) i++;
      const marker=b[i++]; if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const len=v.getUint16(i); if (len < 2 || i + len > b.length) fail();
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) { if(len<7) fail(); height=v.getUint16(i+3);width=v.getUint16(i+5);break; }
      i += len;
    }
  } else fail();
  if (!width || !height) fail();
  if (width * height > 40_000_000) throw new Error(`A foto tem ${(width*height/1e6).toFixed(1)} megapixels. O limite é 40 megapixels.`);
  return { width, height, type };
}
