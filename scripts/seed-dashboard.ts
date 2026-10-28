// Generates a realistic, deterministic e-commerce dataset for the dashboard demo (12 months up to today).
// Planted on purpose, so the AI analyst has something to find:
//   - Electronics revenue collapses in the week of Monday 2026-08-24
//   - "Aurora Wireless Earbuds" has a much higher return rate than everything else
//   - November/December seasonality and a Black Friday spike
// Usage: npm run seed:dashboard            (writes to Supabase, replacing existing demo data)
//        npm run seed:dashboard -- --sql out.sql   (writes SQL instead, for local testing)
import "./load-env";
import { writeFileSync } from "node:fs";

const DAY = 86_400_000;
const SEED = 20261028;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOG: Record<string, { weight: number; price: [number, number]; names: string[] }> = {
  Electronics: { weight: 0.26, price: [29, 349], names: ["Aurora Wireless Earbuds", "Pulse Smartwatch", "Nimbus Bluetooth Speaker", "Volt Power Bank 20k", "Lumen Desk Lamp", "Orbit Webcam HD", "Echo Noise-Cancel Headphones", "Flux USB-C Hub", "Glide Wireless Mouse", "Keystone Mechanical Keyboard"] },
  "Home & Kitchen": { weight: 0.2, price: [15, 189], names: ["Brew Pour-Over Kit", "Cast Iron Skillet 28cm", "Linen Bed Set", "Aroma Diffuser", "Chef Knife 20cm", "Glass Food Containers", "Bamboo Cutting Board", "Cold Brew Bottle", "Weighted Blanket", "Ceramic Mug Set"] },
  Fashion: { weight: 0.18, price: [19, 159], names: ["Merino Crew Sweater", "Everyday Chino", "Canvas Sneakers", "Rain Shell Jacket", "Leather Belt", "Organic Cotton Tee", "Wool Beanie", "Denim Jacket", "Running Socks 3-pack", "Weekender Bag"] },
  Beauty: { weight: 0.14, price: [9, 79], names: ["Hydra Face Serum", "Mineral Sunscreen SPF50", "Clay Face Mask", "Argan Hair Oil", "Lip Balm Trio", "Vitamin C Cream", "Bamboo Toothbrush 4-pack", "Body Scrub", "Night Repair Cream", "Hand Cream"] },
  "Sports & Outdoors": { weight: 0.14, price: [12, 229], names: ["Yoga Mat Pro", "Trail Water Bottle", "Resistance Bands Set", "Camping Hammock", "Running Belt", "Adjustable Dumbbells", "Headlamp 400lm", "Cycling Gloves", "Foam Roller", "Daypack 22L"] },
  Books: { weight: 0.08, price: [9, 39], names: ["The Calm Coder", "Atlas of Small Habits", "Cooking for One", "Pocket Guide to Birds", "Startup Field Notes", "The Long Run", "Design for Humans", "Plant Parenting", "City Walks Europe", "Money Basics"] },
};
const COUNTRIES = ["US", "US", "US", "UK", "DE", "FR", "RO", "NL", "CA", "AU"];
const FIRST = ["Ana", "Mark", "Ioana", "James", "Elena", "David", "Maria", "Paul", "Sofia", "Lucas", "Emma", "Radu", "Laura", "Tom", "Irina"];
const LAST = ["Popescu", "Smith", "Ionescu", "Müller", "Martin", "Brown", "Dumitru", "Garcia", "Jansen", "Wilson", "Stan", "Novak"];

export function generate(today = new Date()) {
  const rand = rng(SEED);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const start = end - 365 * DAY;

  const products: { id: number; name: string; category: string; price: number }[] = [];
  for (const [category, c] of Object.entries(CATALOG)) {
    for (const name of c.names) {
      const price = Math.round((c.price[0] + rand() ** 1.6 * (c.price[1] - c.price[0])) * 100) / 100;
      products.push({ id: products.length + 1, name, category, price: Math.floor(price) + 0.99 });
    }
  }

  // Customers sign up over 18 months, faster recently.
  const customers = Array.from({ length: 2000 }, (_, i) => {
    const t = end - 540 * DAY * (1 - Math.sqrt(rand()));
    return { id: i + 1, name: `${pick(FIRST)} ${pick(LAST)}`, country: pick(COUNTRIES), segment: rand() < 0.18 ? "business" : "consumer", created_at: t };
  }).sort((a, b) => a.created_at - b.created_at).map((c, i) => ({ ...c, id: i + 1 }));

  // Anomaly week: fixed, so the demo's suggested question ("the week of August 24") stays true.
  const anomalyStart = Date.UTC(2026, 7, 24);
  const anomalyEnd = anomalyStart + 7 * DAY;

  const categories = Object.keys(CATALOG);
  const orders: { id: number; customer_id: number; created_at: number; status: string }[] = [];
  const items: { order_id: number; product_id: number; quantity: number; unit_price: number }[] = [];

  for (let day = start; day < end; day += DAY) {
    const date = new Date(day);
    const month = date.getUTCMonth();
    const weekday = date.getUTCDay();
    const trend = 1 + 0.25 * ((day - start) / (365 * DAY));
    const season = month === 10 ? 1.35 : month === 11 ? 1.6 : month === 0 ? 0.85 : 1;
    const blackFriday = month === 10 && date.getUTCDate() >= 24 && date.getUTCDate() <= 30 ? 2.2 : 1;
    const weekend = weekday === 0 || weekday === 6 ? 1.15 : 1;
    const n = Math.round(17 * trend * season * blackFriday * weekend * (0.8 + rand() * 0.4));

    const eligible = customers.filter((c) => c.created_at <= day + DAY);
    for (let k = 0; k < n && eligible.length > 0; k++) {
      const orderId = orders.length + 1;
      const createdAt = day + Math.floor(rand() * DAY);
      const lines = 1 + (rand() < 0.35 ? 1 : 0) + (rand() < 0.1 ? 1 : 0);
      const chosen = new Map<number, number>();
      for (let l = 0; l < lines; l++) {
        let r = rand();
        let category = categories[0];
        for (const c of categories) {
          r -= CATALOG[c].weight;
          if (r <= 0) { category = c; break; }
        }
        // Planted anomaly: most Electronics orders disappear that week (e.g. a broken checkout for that category).
        if (category === "Electronics" && createdAt >= anomalyStart && createdAt < anomalyEnd && rand() < 0.7) continue;
        const product = pick(products.filter((p) => p.category === category));
        chosen.set(product.id, (chosen.get(product.id) ?? 0) + (rand() < 0.12 ? 2 : 1));
      }
      if (chosen.size === 0) continue;
      const returnProb = [...chosen.keys()].some((id) => products[id - 1].name === "Aurora Wireless Earbuds") ? 0.24 : 0.04;
      orders.push({ id: orderId, customer_id: pick(eligible).id, created_at: createdAt, status: rand() < returnProb ? "returned" : "completed" });
      for (const [productId, quantity] of chosen) {
        items.push({ order_id: orderId, product_id: productId, quantity, unit_price: products[productId - 1].price });
      }
    }
  }

  const iso = (t: number) => new Date(t).toISOString();
  return {
    products,
    customers: customers.map((c) => ({ ...c, created_at: iso(c.created_at) })),
    orders: orders.map((o) => ({ ...o, created_at: iso(o.created_at) })),
    items,
    anomalyWeek: iso(anomalyStart).slice(0, 10),
  };
}

const sqlValue = (v: unknown) => (typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
function toSql(table: string, rows: Record<string, unknown>[]): string {
  const cols = Object.keys(rows[0]);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 1000) {
    const values = rows.slice(i, i + 1000).map((r) => `(${cols.map((c) => sqlValue(r[c])).join(",")})`).join(",\n");
    out.push(`insert into ${table} (${cols.join(",")}) values\n${values};`);
  }
  return out.join("\n");
}

async function main() {
  const data = generate();
  console.log(`${data.products.length} products, ${data.customers.length} customers, ${data.orders.length} orders, ${data.items.length} order lines; anomaly week starts ${data.anomalyWeek}`);

  const sqlIdx = process.argv.indexOf("--sql");
  if (sqlIdx >= 0) {
    const sql = [
      "truncate shop_order_items, shop_orders, shop_customers, shop_products, dash_ai_summaries cascade;",
      toSql("shop_products", data.products),
      toSql("shop_customers", data.customers),
      toSql("shop_orders", data.orders),
      toSql("shop_order_items", data.items),
    ].join("\n");
    writeFileSync(process.argv[sqlIdx + 1], sql);
    console.log(`SQL written to ${process.argv[sqlIdx + 1]}`);
    return;
  }

  const { db } = await import("../lib/supabase");
  for (const table of ["dash_ai_summaries", "shop_order_items", "shop_orders", "shop_customers", "shop_products"]) {
    const col = table === "shop_order_items" ? "order_id" : table === "dash_ai_summaries" ? "week_start" : "id";
    const { error } = await db().from(table).delete().not(col, "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const batches: [string, Record<string, unknown>[]][] = [
    ["shop_products", data.products],
    ["shop_customers", data.customers],
    ["shop_orders", data.orders],
    ["shop_order_items", data.items],
  ];
  for (const [table, rows] of batches) {
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await db().from(table).insert(rows.slice(i, i + 1000));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    console.log(`  ${table}: ${rows.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
