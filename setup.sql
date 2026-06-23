-- CMBS Daily Market Offers Table
-- Run this in Supabase SQL editor

create table if not exists cmbs_offers (
  id bigserial primary key,
  date date not null,
  dealer text,
  agency text,
  name text,
  collateral text,
  structure text,
  coupon text,
  maturity text,
  size text,
  price text,
  spread text,
  rating text,
  rate_type text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists cmbs_offers_date_idx on cmbs_offers(date);
create index if not exists cmbs_offers_name_idx on cmbs_offers(name);
create index if not exists cmbs_offers_dealer_idx on cmbs_offers(dealer);
