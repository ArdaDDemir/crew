const p = "apps/web/public/app.js";
const CP1252_REV = {};
const cp1252 = [
  0x20ac, null, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, null, 0x017d, null,
  null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, null, 0x017e, 0x178,
];
cp1252.forEach((cp, i) => {
  if (cp !== null) CP1252_REV[String.fromCodePoint(cp)] = 0x80 + i;
});
for (let i = 0xa0; i <= 0xff; i++) CP1252_REV[String.fromCodePoint(i)] = i;
// mixed-decoding artifacts: raw C1 control chars decode back to their own byte
for (let i = 0x80; i <= 0x9f; i++) CP1252_REV[String.fromCodePoint(i)] = i;

function tryRepairRun(run) {
  const bytes = [];
  for (const ch of run) {
    const b = CP1252_REV[ch];
    if (b === undefined) return null;
    bytes.push(b);
  }
  const dec = Buffer.from(bytes).toString("utf8");
  if (dec.includes("\uFFFD")) return null;
  return dec;
}

function repairPass(t) {
  const out = [];
  let run = "";
  let repairs = 0;
  for (const ch of t) {
    const suspicious = ch.codePointAt(0) > 127 && CP1252_REV[ch] !== undefined;
    if (suspicious) {
      run += ch;
      continue;
    }
    if (run.length) {
      const fixed = tryRepairRun(run);
      if (fixed !== null) {
        out.push(fixed);
        repairs++;
      } else {
        out.push(run);
      }
      run = "";
    }
    out.push(ch);
  }
  if (run.length) {
    const fixed = tryRepairRun(run);
    out.push(fixed ?? run);
    if (fixed !== null) repairs++;
  }
  return { text: out.join(""), repairs };
}

let t = await Bun.file(p).text();
for (let pass = 1; pass <= 6; pass++) {
  const { text, repairs } = repairPass(t);
  t = text;
  console.log(`pass ${pass}: ${repairs} runs repaired`);
  if (repairs === 0) break;
}
await Bun.write(p, t);

const lines = t.split("\n");
let n = 0;
lines.forEach((line, idx) => {
  if (/[ÃÅÇ]/.test(line) && n < 10) {
    console.log(`left ${idx + 1}: ${line.trim().slice(0, 110)}`);
    n++;
  }
});
console.log("scan done");
