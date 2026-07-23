// Minimal ESC/POS command builder for 80mm thermal receipt printers.
// Reference: https://reference.epson-biz.com/modules/ref_escpos/

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscposBuilder {
  private chunks: Buffer[] = [];

  push(buf: Buffer | number[]): this {
    this.chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    return this;
  }

  init(): this {
    // ESC @ — reset printer state.
    return this.push([ESC, 0x40]);
  }

  align(mode: 'left' | 'center' | 'right'): this {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    return this.push([ESC, 0x61, n]);
  }

  bold(on: boolean): this {
    return this.push([ESC, 0x45, on ? 1 : 0]);
  }

  size(mode: 'normal' | 'double-h' | 'double-w' | 'double' | 'huge'): this {
    // GS ! n — width bits 4-7, height bits 0-3. Combine both for "double".
    const n =
      mode === 'normal'
        ? 0x00
        : mode === 'double-h'
          ? 0x01
          : mode === 'double-w'
            ? 0x10
            : mode === 'double'
              ? 0x11
              : /* huge */ 0x33;
    return this.push([GS, 0x21, n]);
  }

  feed(n = 1): this {
    return this.push(Array(n).fill(LF));
  }

  cut(partial = false): this {
    // GS V m — 0 full cut, 1 partial cut.
    return this.push([GS, 0x56, partial ? 1 : 0]);
  }

  drawer(pin: 0 | 1 = 0): this {
    // ESC p m t1 t2 — kick cash drawer connected to pin.
    return this.push([ESC, 0x70, pin, 0x19, 0xfa]);
  }

  // ISO-8859-1 (Latin-1) covers French accents. Non-Latin characters (Arabic
  // etc.) don't survive this encoding — printer needs its own code-page
  // setup, which varies by vendor. Kitchen + customer tickets are hardcoded
  // French so this is fine for now.
  codepage(): this {
    // ESC t n — select character code table 16 (WPC1252).
    return this.push([ESC, 0x74, 16]);
  }

  text(str: string): this {
    // Normalise line endings and encode as latin1.
    const normalized = str.replace(/\r/g, '');
    return this.push(Buffer.from(normalized, 'latin1'));
  }

  line(str = ''): this {
    return this.text(str).feed();
  }

  divider(char = '-', width = 42): this {
    return this.line(char.repeat(width));
  }

  // Two-column row: left text + right text, padded with spaces to `width`.
  row(left: string, right: string, width = 42): this {
    const l = left.length > width - 3 ? left.slice(0, width - 3 - right.length) + '…' : left;
    const gap = Math.max(1, width - l.length - right.length);
    return this.line(l + ' '.repeat(gap) + right);
  }

  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
