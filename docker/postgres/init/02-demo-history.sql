-- More demo data on top of 01-demo.sql: a dozen extra customers and about
-- three months of orders, so notebook charts and aggregate queries have
-- something to show. Generated with a fixed seed, so every fresh volume gets
-- the same rows.

set search_path to demo, public;

select setseed(0.42);

insert into demo.customers (email, full_name, tags, created_at)
select
  lower(replace(name, ' ', '.')) || '@example.com',
  name,
  case when i % 4 = 0 then '{vip}'::text[] when i % 3 = 0 then '{newsletter}' else '{}' end,
  now() - (i * interval '7 days')
from unnest(array[
  'Alan Turing', 'Barbara Liskov', 'Dennis Ritchie', 'Edsger Dijkstra',
  'Frances Allen', 'Hedy Lamarr', 'Ken Thompson', 'Margaret Hamilton',
  'Donald Knuth', 'Radia Perlman', 'John Backus', 'Katherine Johnson'
]) with ordinality as t(name, i);

insert into demo.products (sku, name, price, attributes, active) values
  ('HS-005', 'Noise-cancelling headset', 199.00, '{"wireless": true, "anc": true}',  true),
  ('DK-006', 'Thunderbolt dock',         229.00, '{"ports": 11}',                    true),
  ('WC-007', '4K webcam',                 99.00, '{"resolution": "3840x2160"}',      true),
  ('LS-008', 'Laptop stand',              45.00, '{"material": "aluminium"}',        true);

-- ~240 orders spread over the last 90 days.
insert into demo.orders (customer_id, status, placed_at)
select
  (select id from demo.customers order by email offset floor(random() * 15)::int + g * 0 limit 1),
  (array['paid', 'paid', 'shipped', 'shipped', 'shipped', 'pending', 'cancelled'])[1 + floor(random() * 7)::int]::demo.order_status,
  now() - (random() * interval '90 days')
from generate_series(1, 240) as g;

-- One to three line items per new order.
insert into demo.order_items (order_id, product_id, quantity, unit_price)
select distinct on (o.id, p.id)
  o.id, p.id, 1 + floor(random() * 3)::int, p.price
from demo.orders o
cross join lateral generate_series(1, 1 + floor(random() * 3)::int) as n
cross join lateral (
  select id, price from demo.products order by random() + n * 0 limit 1
) p
where o.id > 4
on conflict do nothing;

-- Refresh planner stats so row-count estimates in the table list are right.
analyze;

reset search_path;
