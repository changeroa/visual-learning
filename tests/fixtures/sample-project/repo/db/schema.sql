create table orders (
  id text primary key,
  status text not null,
  payment_reference text not null
);
