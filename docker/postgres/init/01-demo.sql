-- Demo data for a fresh local database (see docker-compose.yml).
--
-- Small enough to read, varied enough to exercise the app: foreign keys for
-- the table editor's FK cells and lookups, a uuid primary key, jsonb, a text
-- array, timestamptz, numeric, an enum, and a view. Everything lives in the
-- `demo` schema so it never collides with tables you create yourself.

create schema if not exists demo;
set search_path to demo, public;

create type demo.order_status as enum ('pending', 'paid', 'shipped', 'cancelled');

create table demo.customers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  full_name   text not null,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table demo.products (
  id          serial primary key,
  sku         text not null unique,
  name        text not null,
  price       numeric(10, 2) not null check (price >= 0),
  attributes  jsonb not null default '{}'::jsonb,
  active      boolean not null default true
);

create table demo.orders (
  id           bigserial primary key,
  customer_id  uuid not null references demo.customers (id) on delete cascade,
  status       demo.order_status not null default 'pending',
  placed_at    timestamptz not null default now(),
  note         text
);

create table demo.order_items (
  order_id    bigint not null references demo.orders (id) on delete cascade,
  product_id  integer not null references demo.products (id),
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(10, 2) not null,
  primary key (order_id, product_id)
);

create index order_items_product_id_idx on demo.order_items (product_id);
create index orders_customer_id_idx on demo.orders (customer_id);

insert into demo.customers (id, email, full_name, tags) values
  ('11111111-1111-4111-8111-111111111111', 'ada@example.com',   'Ada Lovelace',    '{vip,early-adopter}'),
  ('22222222-2222-4222-8222-222222222222', 'grace@example.com', 'Grace Hopper',    '{}'),
  ('33333333-3333-4333-8333-333333333333', 'linus@example.com', 'Linus Torvalds',  '{newsletter}');

insert into demo.products (sku, name, price, attributes, active) values
  ('KB-001', 'Mechanical keyboard', 129.00, '{"layout": "ANSI", "switches": "tactile"}', true),
  ('MS-002', 'Trackball mouse',      79.50, '{"buttons": 5, "wireless": true}',           true),
  ('MN-003', '27" monitor',         349.99, '{"resolution": "2560x1440", "hz": 144}',     true),
  ('CB-004', 'USB-C cable, 2 m',      9.99, '{"length_m": 2}',                            false);

insert into demo.orders (id, customer_id, status, placed_at, note) values
  (1, '11111111-1111-4111-8111-111111111111', 'shipped',   now() - interval '10 days', null),
  (2, '11111111-1111-4111-8111-111111111111', 'paid',      now() - interval '2 days',  'Gift wrap, please'),
  (3, '22222222-2222-4222-8222-222222222222', 'pending',   now() - interval '3 hours', null),
  (4, '33333333-3333-4333-8333-333333333333', 'cancelled', now() - interval '30 days', 'Changed mind');

select setval('demo.orders_id_seq', (select max(id) from demo.orders));

insert into demo.order_items (order_id, product_id, quantity, unit_price) values
  (1, 1, 1, 129.00),
  (1, 4, 2,   9.99),
  (2, 3, 1, 349.99),
  (3, 2, 1,  79.50),
  (3, 4, 1,   9.99),
  (4, 1, 1, 129.00);

create view demo.order_totals as
select
  o.id as order_id,
  c.full_name as customer,
  o.status,
  o.placed_at,
  sum(oi.quantity * oi.unit_price) as total
from demo.orders o
join demo.customers c on c.id = o.customer_id
join demo.order_items oi on oi.order_id = o.id
group by o.id, c.full_name, o.status, o.placed_at;

reset search_path;
