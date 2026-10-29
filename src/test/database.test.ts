// @vitest-environment node
// Runs both database scripts on an in-memory Postgres and checks the order,
// stock, coupon, payment and privacy rules they enforce.
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

describe("database scripts", () => {
  it("apply cleanly and enforce order, coupon, payment and privacy rules", async () => {
    const db = new PGlite();
    await db.exec(`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE PUBLICATION supabase_realtime;`);
    await db.exec(readFileSync(path.join(root, "database/001_hungry_core.sql"), "utf8"));
    await db.exec(readFileSync(path.join(root, "database/002_payments_coupons_refunds.sql"), "utf8"));

    const failures: string[] = [];
    const ok = (c: boolean | undefined, m: string) => { if (!c) failures.push(m); };
    const q = async (s: string, p?: unknown[]) => (await db.query<any>(s, p)).rows;
    const err = async (s: string, p?: unknown[]) => { try { await db.query(s, p); return null; } catch (e) { return (e as Error).message; } };

    const [a] = await q(`INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('a@x.com', '{"role":"student","full_name":"Asha K","registration_number":"R1"}') RETURNING id`);
    const [b] = await q(`INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('b@x.com', '{"role":"guest","full_name":"Bala"}') RETURNING id`);
    ok((await q(`SELECT count(*)::int n FROM profiles`))[0].n === 2, "signup trigger creates profiles");
    const [c] = await q(`INSERT INTO canteens (code, name, university_name, campus_location, contact_email) VALUES ('ABC1234','Main','Uni','Block A','o@x.com') RETURNING id`);
    const [m1] = await q(`INSERT INTO menu_items (canteen_id, name, price, stock) VALUES ($1,'Dosa',50,3) RETURNING id`, [c.id]);
    const [m2] = await q(`INSERT INTO menu_items (canteen_id, name, price) VALUES ($1,'Tea',20) RETURNING id`, [c.id]);

    const place = (user: string, lines: unknown, type: string, method: string, sub: number, coupon: string | null, disc: number, key: string, num: string) =>
      q(`SELECT * FROM hungry_place_order($1,$2,'X',$3::jsonb,$4,$5,$6,$7,$8,$9,$10,'1234')`,
        [user, c.id, JSON.stringify(lines), type, method, sub, coupon, disc, key, num]);

    const [o1] = await place(a.id, [{ id: m1.id, qty: 2 }, { id: m2.id, qty: 1 }], "dine_in", "counter", 120, null, 0, "key-aaaa-0001", "HG-A1");
    ok(!o1.already_existed, "counter order created");
    ok((await q(`SELECT stock FROM menu_items WHERE id=$1`, [m1.id]))[0].stock === 1, "stock reserved (3 -> 1)");
    const row1 = (await q(`SELECT * FROM orders WHERE id=$1`, [o1.order_id]))[0];
    ok(row1.status === "placed" && row1.payment_status === "unpaid" && row1.total === 120, "counter order placed/unpaid/total 120");
    const [o1b] = await place(a.id, [{ id: m1.id, qty: 2 }], "dine_in", "counter", 100, null, 0, "key-aaaa-0001", "HG-A2");
    ok(o1b.already_existed && o1b.order_id === o1.order_id, "same idempotency key returns same order");
    ok((await q(`SELECT stock FROM menu_items WHERE id=$1`, [m1.id]))[0].stock === 1, "duplicate submit does not touch stock");

    ok((await err(`SELECT * FROM hungry_place_order($1,$2,'X',$3::jsonb,'parcel','razorpay',20,null,0,'key-parcel-01','HG-P1','1')`, [a.id, c.id, JSON.stringify([{ id: m2.id, qty: 1 }])]))?.includes("parcel_counter_only"), "parcel + razorpay rejected");
    const [op] = await place(a.id, [{ id: m2.id, qty: 1 }], "parcel", "counter", 20, null, 0, "key-parcel-02", "HG-P2");
    ok(!!op.order_id, "parcel + counter allowed");
    ok((await err(`INSERT INTO orders (order_number, canteen_id, user_id, customer_name, lines, total, subtotal, payment, pickup_code, counter, prep_minutes, order_type, payment_method) VALUES ('HG-Z',$1,$2,'x','[]',0,0,'x','1','c',1,'parcel','razorpay')`, [c.id, a.id]))?.includes("orders_parcel_counter_only"), "table constraint blocks parcel online too");

    ok((await err(`SELECT * FROM hungry_place_order($1,$2,'X',$3::jsonb,'dine_in','counter',100,null,0,'key-stock-001','HG-S1','1')`, [b.id, c.id, JSON.stringify([{ id: m1.id, qty: 2 }])]))?.includes("out_of_stock"), "out of stock blocked");
    ok((await err(`SELECT * FROM hungry_place_order($1,$2,'X',$3::jsonb,'dine_in','counter',999,null,0,'key-price-001','HG-S2','1')`, [b.id, c.id, JSON.stringify([{ id: m2.id, qty: 1 }])]))?.includes("prices_changed"), "subtotal mismatch blocked");

    const [cp] = await q(`INSERT INTO coupons (code, discount_type, discount_value, usage_limit, min_order_value) VALUES ('WELCOME10','percent',10,1,30) RETURNING id`);
    ok((await err(`SELECT * FROM hungry_place_order($1,$2,'X',$3::jsonb,'dine_in','counter',20,$4,2,'key-cmin-0001','HG-C0','1')`, [b.id, c.id, JSON.stringify([{ id: m2.id, qty: 1 }]), cp.id]))?.includes("coupon_min_order"), "coupon min order enforced");
    const [oc] = await place(b.id, [{ id: m2.id, qty: 2 }], "dine_in", "razorpay", 40, cp.id, 4, "key-coup-0001", "HG-C1");
    const rowc = (await q(`SELECT * FROM orders WHERE id=$1`, [oc.order_id]))[0];
    ok(rowc.total === 36 && rowc.status === "pending_payment" && rowc.payment_status === "pending", "razorpay order pending, total 40-4=36");
    ok((await q(`SELECT status FROM coupon_redemptions WHERE order_id=$1`, [oc.order_id]))[0].status === "reserved", "coupon reserved while unpaid");
    ok((await err(`SELECT * FROM hungry_place_order($1,$2,'X',$3::jsonb,'dine_in','counter',40,$4,4,'key-coup-0002','HG-C2','1')`, [a.id, c.id, JSON.stringify([{ id: m2.id, qty: 2 }]), cp.id]))?.includes("coupon_exhausted"), "coupon usage limit enforced");

    ok((await q(`SELECT hungry_mark_order_paid($1) r`, [oc.order_id]))[0].r === "paid", "first payment confirmation -> paid");
    ok((await q(`SELECT hungry_mark_order_paid($1) r`, [oc.order_id]))[0].r === "already_paid", "duplicate confirmation is a no-op");
    ok((await q(`SELECT status FROM coupon_redemptions WHERE order_id=$1`, [oc.order_id]))[0].status === "used", "coupon used after payment");

    ok((await q(`SELECT hungry_release_order($1) r`, [o1.order_id]))[0].r === true, "release order");
    ok((await q(`SELECT stock FROM menu_items WHERE id=$1`, [m1.id]))[0].stock === 3, "stock restored on cancel");
    ok((await q(`SELECT hungry_release_order($1) r`, [o1.order_id]))[0].r === false, "release is idempotent");

    await q(`INSERT INTO refunds (order_id, user_id, amount, reason) VALUES ($1,$2,36,'changed mind')`, [oc.order_id, b.id]);
    ok((await err(`INSERT INTO refunds (order_id, user_id, amount, reason) VALUES ($1,$2,36,'again please')`, [oc.order_id, b.id]))?.includes("refunds_one_active_per_order"), "only one live refund per order");

    // expire stale
    const [os] = await place(a.id, [{ id: m1.id, qty: 1 }], "dine_in", "razorpay", 50, null, 0, "key-stale-001", "HG-ST");
    await q(`UPDATE orders SET created_at = now() - interval '45 minutes' WHERE id=$1`, [os.order_id]);
    ok((await q(`SELECT hungry_expire_stale_orders(30) n`))[0].n === 1, "stale unpaid order expired");
    ok((await q(`SELECT hungry_mark_order_paid($1) r`, [os.order_id]))[0].r === "order_cancelled", "late payment on expired order detected");

    // RLS / privileges as authenticated
    await db.exec(`SET ROLE authenticated`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [a.id]);
    ok((await q(`SELECT count(*)::int n FROM orders WHERE user_id=$1`, [b.id]))[0].n === 0, "user A cannot read user B's orders");
    ok((await q(`SELECT count(*)::int n FROM orders`))[0].n >= 1, "user A reads own orders");
    ok(!!(await err(`UPDATE orders SET total = 0`)), "customers cannot update orders");
    ok(!!(await err(`SELECT * FROM hungry_place_order($1,$2,'X','[]'::jsonb,'dine_in','counter',0,null,0,'key-x-000001','HG-X','1')`, [a.id, c.id])), "customers cannot call order function directly");
    ok(!!(await err(`SELECT hungry_mark_order_paid($1)`, [oc.order_id])), "customers cannot mark orders paid");
    ok((await q(`SELECT count(*)::int n FROM coupons`))[0].n === 0, "customers cannot list coupons");
    ok((await q(`SELECT count(*)::int n FROM email_logs`))[0].n === 0, "customers cannot read email logs");
    ok(!!(await err(`INSERT INTO payments (order_id,user_id,razorpay_order_id,razorpay_payment_id,amount_paise,status) VALUES ($1,$2,'o','p',1,'captured')`, [o1.order_id, a.id])), "customers cannot insert payments");
    await db.exec(`RESET ROLE`);


    expect(failures).toEqual([]);
  }, 60_000);
});
