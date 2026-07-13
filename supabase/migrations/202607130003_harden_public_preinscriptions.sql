drop policy preinscriptions_public_insert on boutique_asc.preinscriptions;

create policy preinscriptions_public_insert
on boutique_asc.preinscriptions
for insert
to anon
with check (
  char_length(id) between 1 and 100
  and jsonb_typeof(data) = 'object'
  and char_length(btrim(data ->> 'nom')) between 1 and 100
  and coalesce(data ->> 'annee', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and jsonb_typeof(data -> 'articles') = 'array'
  and jsonb_array_length(data -> 'articles') <= 30
);
