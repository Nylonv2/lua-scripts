package com.nylonv2.riascompanion;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Unpacks a .tar.bz2 (how the Kokoro voice model is published). Android has no bzip2 built in. */
final class TarBz2 {
    private TarBz2() {
    }

    /** Extracts everything into `dest` (paths that would escape it are skipped). */
    static void extract(InputStream raw, File dest) throws IOException {
        InputStream in = new Bz2(new BufferedInputStream(raw, 1 << 16));
        byte[] h = new byte[512], buf = new byte[1 << 16];
        String longName = null;
        String root = dest.getCanonicalPath() + File.separator;
        while (true) {
            if (!full(in, h)) break;
            boolean empty = true;
            for (byte b : h) if (b != 0) { empty = false; break; }
            if (empty) break;
            String name = str(h, 0, 100);
            String prefix = str(h, 345, 155);
            if (!prefix.isEmpty() && h[257] == 'u') name = prefix + "/" + name; // ustar
            long size = Long.parseLong(("0" + str(h, 124, 12).trim()), 8);
            char type = (char) h[156];
            if (longName != null) { name = longName; longName = null; }
            if (type == 'L' || type == 'x' || type == 'g') {
                byte[] data = new byte[(int) size];
                if (!full(in, data)) throw new IOException("truncated");
                skip(in, pad(size));
                if (type == 'L') longName = str(data, 0, data.length);
                else if (type == 'x') {
                    for (String line : new String(data, "UTF-8").split("\n")) {
                        int sp = line.indexOf(' '), eq = line.indexOf('=');
                        if (sp > 0 && eq > sp && line.substring(sp + 1, eq).equals("path")) longName = line.substring(eq + 1);
                    }
                }
                continue;
            }
            File f = new File(dest, name);
            boolean inside = (f.getCanonicalPath() + (type == '5' ? File.separator : "")).startsWith(root);
            if (type == '5') {
                if (inside) f.mkdirs();
            } else if (type == '0' || type == 0) {
                OutputStream out = null;
                if (inside) {
                    f.getParentFile().mkdirs();
                    out = new FileOutputStream(f);
                }
                long left = size;
                try {
                    while (left > 0) {
                        int n = in.read(buf, 0, (int) Math.min(buf.length, left));
                        if (n < 0) throw new IOException("truncated");
                        if (out != null) out.write(buf, 0, n);
                        left -= n;
                    }
                } finally {
                    if (out != null) out.close();
                }
                skip(in, pad(size));
                continue;
            } else {
                skip(in, size); // links and other entries: not needed
            }
            skip(in, pad(size));
        }
        in.close();
    }

    private static long pad(long size) {
        return (512 - size % 512) % 512;
    }

    private static boolean full(InputStream in, byte[] b) throws IOException {
        int got = 0;
        while (got < b.length) {
            int n = in.read(b, got, b.length - got);
            if (n < 0) return false;
            got += n;
        }
        return true;
    }

    private static void skip(InputStream in, long n) throws IOException {
        byte[] b = new byte[4096];
        while (n > 0) {
            int r = in.read(b, 0, (int) Math.min(b.length, n));
            if (r < 0) throw new IOException("truncated");
            n -= r;
        }
    }

    private static String str(byte[] b, int off, int len) {
        int end = off;
        while (end < off + len && end < b.length && b[end] != 0) end++;
        try {
            return new String(b, off, end - off, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    /** A plain bzip2 decoder (no CRC checks; the download is over HTTPS). */
    static final class Bz2 extends InputStream {
        private final InputStream in;
        private long bits;
        private int nbits;
        private int blockMax;
        private int[] tt;
        private byte[] out = new byte[0];
        private int outLen, outPos;
        private boolean done;

        Bz2(InputStream in) throws IOException {
            this.in = in;
            if (!header()) throw new IOException("not bzip2");
        }

        private boolean header() throws IOException {
            int b = in.read();
            if (b < 0) return false;
            if (b != 'B' || in.read() != 'Z' || in.read() != 'h') throw new IOException("not bzip2");
            int lvl = in.read() - '0';
            if (lvl < 1 || lvl > 9) throw new IOException("bad bzip2 level");
            blockMax = lvl * 100000;
            if (tt == null || tt.length < blockMax) tt = new int[blockMax];
            bits = 0;
            nbits = 0;
            return true;
        }

        private int get(int n) throws IOException {
            while (nbits < n) {
                int b = in.read();
                if (b < 0) throw new IOException("truncated bzip2");
                bits = (bits << 8) | b;
                nbits += 8;
            }
            nbits -= n;
            return (int) ((bits >>> nbits) & ((1L << n) - 1));
        }

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            int n = read(one, 0, 1);
            return n < 0 ? -1 : one[0] & 0xff;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            while (outPos >= outLen) {
                if (done || !block()) return -1;
            }
            int n = Math.min(len, outLen - outPos);
            System.arraycopy(out, outPos, b, off, n);
            outPos += n;
            return n;
        }

        @Override
        public void close() throws IOException {
            in.close();
        }

        /** Decodes the next block into `out`; false at the end of the data. */
        private boolean block() throws IOException {
            long magic = ((long) get(24) << 24) | get(24);
            get(32); // CRC
            if (magic == 0x177245385090L) {
                // End of this stream; another may follow (parallel compressors write several).
                if (!header()) { done = true; return false; }
                return block();
            }
            if (magic != 0x314159265359L) throw new IOException("bad bzip2 block");
            if (get(1) != 0) throw new IOException("randomised bzip2 blocks aren't supported");
            int origPtr = get(24);

            // Which byte values occur
            int used16 = get(16);
            int[] seqToUnseq = new int[256];
            int nInUse = 0;
            for (int i = 0; i < 16; i++) {
                if ((used16 & (0x8000 >>> i)) != 0) {
                    int u = get(16);
                    for (int j = 0; j < 16; j++) if ((u & (0x8000 >>> j)) != 0) seqToUnseq[nInUse++] = i * 16 + j;
                }
            }
            if (nInUse == 0) throw new IOException("bad bzip2 block");
            int alphaSize = nInUse + 2;
            int nGroups = get(3);
            int nSelectors = get(15);
            if (nGroups < 2 || nGroups > 6 || nSelectors < 1) throw new IOException("bad bzip2 tables");
            byte[] selectorMtf = new byte[nSelectors];
            for (int i = 0; i < nSelectors; i++) {
                int j = 0;
                while (get(1) == 1) { j++; if (j >= nGroups) throw new IOException("bad selector"); }
                selectorMtf[i] = (byte) j;
            }
            byte[] pos = new byte[nGroups];
            for (int i = 0; i < nGroups; i++) pos[i] = (byte) i;
            byte[] selectors = new byte[nSelectors];
            for (int i = 0; i < nSelectors; i++) {
                int v = selectorMtf[i];
                byte tmp = pos[v];
                while (v > 0) { pos[v] = pos[v - 1]; v--; }
                pos[0] = tmp;
                selectors[i] = tmp;
            }
            // Huffman code lengths, then canonical decode tables
            int[][] limit = new int[nGroups][22], base = new int[nGroups][22], perm = new int[nGroups][258];
            int[] minLens = new int[nGroups];
            int[] len = new int[alphaSize];
            for (int t = 0; t < nGroups; t++) {
                int curr = get(5);
                for (int i = 0; i < alphaSize; i++) {
                    while (true) {
                        if (curr < 1 || curr > 20) throw new IOException("bad code length");
                        if (get(1) == 0) break;
                        curr += get(1) == 0 ? 1 : -1;
                    }
                    len[i] = curr;
                }
                int minLen = 32, maxLen = 0;
                for (int i = 0; i < alphaSize; i++) { minLen = Math.min(minLen, len[i]); maxLen = Math.max(maxLen, len[i]); }
                tables(limit[t], base[t], perm[t], len, minLen, maxLen, alphaSize);
                minLens[t] = minLen;
            }

            // Symbols → move-to-front → bytes (with RUNA/RUNB run lengths)
            int eob = nInUse + 1;
            int[] unzftab = new int[256];
            int[] mtf = new int[256];
            for (int i = 0; i < 256; i++) mtf[i] = i;
            int nblock = 0, groupNo = -1, groupPos = 0;
            int[] gLimit = null, gBase = null, gPerm = null;
            int gMin = 0;
            int es = 0, n = 1;
            boolean inRun = false;
            while (true) {
                if (groupPos == 0) {
                    groupNo++;
                    if (groupNo >= nSelectors) throw new IOException("bad selectors");
                    groupPos = 50;
                    int g = selectors[groupNo];
                    gLimit = limit[g]; gBase = base[g]; gPerm = perm[g]; gMin = minLens[g];
                }
                groupPos--;
                int zn = gMin, zvec = get(zn);
                while (zn <= 20 && zvec > gLimit[zn]) { zn++; zvec = (zvec << 1) | get(1); }
                if (zn > 20) throw new IOException("bad huffman code");
                int sym = gPerm[zvec - gBase[zn]];
                if (sym == 0 || sym == 1) { // RUNA / RUNB
                    if (!inRun) { inRun = true; es = 0; n = 1; }
                    es += (sym == 0 ? 1 : 2) * n;
                    n <<= 1;
                    if (es > blockMax) throw new IOException("bad run");
                    continue;
                }
                if (inRun) {
                    inRun = false;
                    int uc = seqToUnseq[mtf[0]];
                    if (nblock + es > blockMax) throw new IOException("block too big");
                    unzftab[uc] += es;
                    while (es-- > 0) tt[nblock++] = uc;
                }
                if (sym == eob) break;
                int nn = sym - 1;
                int v = mtf[nn];
                System.arraycopy(mtf, 0, mtf, 1, nn);
                mtf[0] = v;
                int uc = seqToUnseq[v];
                if (nblock >= blockMax) throw new IOException("block too big");
                unzftab[uc]++;
                tt[nblock++] = uc;
            }
            if (origPtr < 0 || origPtr >= nblock) throw new IOException("bad origin");

            // Undo the Burrows–Wheeler transform
            int[] cftab = new int[257];
            for (int i = 1; i <= 256; i++) cftab[i] = cftab[i - 1] + unzftab[i - 1];
            for (int i = 0; i < nblock; i++) {
                int uc = tt[i] & 0xff;
                tt[cftab[uc]++] |= i << 8;
            }
            // ...and the initial run-length encoding (4 equal bytes + a count)
            if (out.length < nblock * 2) out = new byte[Math.max(nblock * 2, 1024)];
            outLen = 0;
            outPos = 0;
            int tPos = tt[origPtr] >>> 8;
            int last = -1, same = 0;
            for (int k = 0; k < nblock; k++) {
                tPos = tt[tPos];
                int ch = tPos & 0xff;
                tPos >>>= 8;
                if (same == 4) {
                    ensure(ch);
                    for (int r = 0; r < ch; r++) out[outLen++] = (byte) last;
                    same = 0;
                    last = -1;
                    continue;
                }
                if (ch == last) same++;
                else { last = ch; same = 1; }
                ensure(1);
                out[outLen++] = (byte) ch;
            }
            return true;
        }

        private void ensure(int more) {
            if (outLen + more <= out.length) return;
            byte[] b = new byte[Math.max(out.length * 2, outLen + more)];
            System.arraycopy(out, 0, b, 0, outLen);
            out = b;
        }

        private static void tables(int[] limit, int[] base, int[] perm, int[] len, int minLen, int maxLen, int alphaSize) {
            int pp = 0;
            for (int i = minLen; i <= maxLen; i++)
                for (int j = 0; j < alphaSize; j++) if (len[j] == i) perm[pp++] = j;
            for (int i = 0; i < 22; i++) { base[i] = 0; limit[i] = 0; }
            for (int i = 0; i < alphaSize; i++) base[len[i] + 1]++;
            for (int i = 1; i < 22; i++) base[i] += base[i - 1];
            int vec = 0;
            for (int i = minLen; i <= maxLen; i++) {
                vec += base[i + 1] - base[i];
                limit[i] = vec - 1;
                vec <<= 1;
            }
            for (int i = minLen + 1; i <= maxLen; i++) base[i] = ((limit[i - 1] + 1) << 1) - base[i];
            for (int i = maxLen + 1; i < 22; i++) limit[i] = Integer.MAX_VALUE; // never longer than maxLen
        }
    }
}
