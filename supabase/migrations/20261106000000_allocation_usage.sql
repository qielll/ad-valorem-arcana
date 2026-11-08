-- How much of each allocation was used (planned + completed), like Master Sheet R:T.

create view allocation_usage with (security_invoker = true) as
select x.id as allocation_id, coalesce(sum(t.amount), 0) as used
from allocation x
left join transaction t on t.periode_id = x.periode_id and t.account_id = x.account_id
group by x.id;
