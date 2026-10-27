// Builds the fictional "Keluarga Wiryo" tree in the demo account used for App Review and store screenshots.
//   node apps/native/store/demo-tree.mjs <account-file> [api-url]
// <account-file> has "email: …" and "password: …" lines (sakdulur-demo-account.txt in iCloud Credentials).
// Every person is made up. Re-running adds a second tree, so delete the old one first.
import { readFileSync } from "node:fs";

const [accountFile, api = "https://api.sakdulur.com"] = process.argv.slice(2);
if (!accountFile) throw new Error("Usage: node demo-tree.mjs <account-file> [api-url]");
const text = readFileSync(accountFile, "utf8");
const email = /^email:\s*(\S+)/m.exec(text)?.[1];
const password = /^password:\s*(\S+)/m.exec(text)?.[1];

// key: [name, gender, birth, death, birthPlace, religion, nickname]
const people = {
  wiryo: ["Wiryo Atmojo", "male", "1928", "1999-03-14", "Yogyakarta", "islam", "Mbah Wiryo"],
  sumirah: ["Sumirah", "female", "1932", "2008-11-02", "Klaten", "islam", "Mbah Mirah"],
  bambang: ["Bambang Wiryawan", "male", "1955-06-12", null, "Yogyakarta"],
  endang: ["Endang Lestari", "female", "1958-02-20", null, "Solo"],
  sri: ["Sri Wahyuni", "female", "1958-09-01", null, "Yogyakarta"],
  hadi: ["Hadi Prasetyo", "male", "1955", "2019-07-21", "Magelang", "islam"],
  joko: ["Joko Santoso", "male", "1962-04-17", null, "Yogyakarta"],
  ratna: ["Ratna Dewi", "female", "1965-12-05", null, "Semarang"],
  ayu: ["Ayu Kartika", "female", "1984-08-09", null, "Yogyakarta"],
  dimas: ["Dimas Pratama", "male", "1982-03-30", null, "Bandung"],
  rizky: ["Rizky Wiryawan", "male", "1987-10-11", null, "Yogyakarta"],
  anisa: ["Anisa Putri", "female", "1990-05-25", null, "Malang"],
  fajar: ["Fajar Nugroho", "male", "1983-01-15", null, "Magelang"],
  wulan: ["Wulan Sari", "female", "1986-07-07", null, "Magelang"],
  arif: ["Arif Hidayat", "male", "1984-09-19", null, "Surabaya"],
  bayu: ["Bayu Saputra", "male", "1990-02-02", null, "Semarang"],
  dinda: ["Dinda Maharani", "female", "1994-11-28", null, "Semarang"],
  rani: ["Rani Pratiwi", "female", "2012-04-03", null, "Jakarta"],
  raka: ["Raka Pratama", "male", "2015-09-14", null, "Jakarta"],
  kirana: ["Kirana Wiryawan", "female", "2019-06-30", null, "Yogyakarta"],
  nayla: ["Nayla Hidayat", "female", "2014-03-21", null, "Surabaya"],
  fikri: ["Fikri Hidayat", "male", "2017-12-08", null, "Surabaya"],
};
// [partner, partner, children]
const couples = [
  ["wiryo", "sumirah", ["bambang", "sri", "joko"]],
  ["bambang", "endang", ["ayu", "rizky"]],
  ["sri", "hadi", ["fajar", "wulan"]],
  ["joko", "ratna", ["bayu", "dinda"]],
  ["ayu", "dimas", ["rani", "raka"]],
  ["rizky", "anisa", ["kirana"]],
  ["wulan", "arif", ["nayla", "fikri"]],
];

async function call(method, path, token, body, form) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${api}/api${path}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.message ?? ""}`);
  return json.data;
}

const { accessToken: token } = await call("POST", "/auth/login", null, { email, password });
const tree = await call("POST", "/trees", token, { name: "Keluarga Wiryo" });
await call("PATCH", `/trees/${tree._id}`, token, { assistantEnabled: true });

const ids = {};
for (const [key, [name, gender, birth, death, birthPlace, religion, nickname]] of Object.entries(people)) {
  const form = new FormData();
  form.set("name", name);
  form.set("gender", gender);
  form.set("status", death ? "deceased" : "alive");
  form.set("birthDate", birth);
  if (death) form.set("deathDate", death);
  form.set("birthPlace", birthPlace);
  if (religion) form.set("religion", religion);
  if (nickname) form.set("nickname", nickname);
  ids[key] = (await call("POST", `/trees/${tree._id}/people`, token, undefined, form))._id;
}

// Each person's full set of relationships (the endpoint replaces it), so parents, partner and children together.
const rels = Object.fromEntries(Object.keys(people).map((k) => [k, []]));
for (const [a, b, children] of couples) {
  rels[a].push({ to: ids[b], type: "spouse" });
  rels[b].push({ to: ids[a], type: "spouse" });
  children.forEach((child, order) => {
    for (const parent of [a, b]) {
      rels[parent].push({ to: ids[child], type: "child", order });
      rels[child].push({ to: ids[parent], type: "parent" });
    }
  });
}
for (const [key, list] of Object.entries(rels)) {
  await call("POST", `/trees/${tree._id}/people/${ids[key]}/relationships`, token, list);
}

console.log(`Created "${tree.name}" (${tree._id}) with ${Object.keys(ids).length} people.`);
