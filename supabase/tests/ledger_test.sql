-- =============================================================================
-- Folio SQL test-suite. Runs as `authenticated` with RLS active.
-- Each failed expectation raises an exception (psql ON_ERROR_STOP aborts).
-- =============================================================================
create schema tests;
grant usage on schema tests to authenticated;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.cat(p_name text) returns uuid language sql stable as $$ select id from public.categories where name = p_name $$;
create function tests.acc(p_name text) returns uuid language sql stable as $$ select id from public.accounts where name = p_name $$;
create function tests.person(p_name text) returns uuid language sql stable as $$ select id from public.people where name = p_name $$;
create function tests.bal(p_name text) returns bigint language sql stable as $$
  select b.balance from public.account_balances b join public.accounts a on a.id = b.account_id where a.name = p_name $$;
create function tests.legs(variadic p jsonb[]) returns jsonb language sql immutable as $$ select to_jsonb(p) $$;
create function tests.entry(p_type text, p_amount bigint, p_key text, p_desc text default null, p_extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('type', p_type, 'occurred_on', '2026-11-10', 'amount', p_amount, 'description', coalesce(p_desc, p_type), 'idempotency_key', p_key) || p_extra $$;
create function tests.expect_error(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_pattern then
      raise notice 'ok - % (rejected: %)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'FAILED: % — wrong error: %', p_msg, sqlerrm;
  end;
  raise exception 'FAILED: % — expected an error matching %', p_msg, p_pattern;
end $$;
grant execute on all functions in schema tests to authenticated;

-- Two independent people.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

select tests.ok((select count(*) from public.profiles) = 2, 'profiles created on sign-up');
select tests.ok((select count(*) from public.categories where owner_id = '11111111-1111-1111-1111-111111111111') = 26, 'starter categories seeded');
select tests.ok((select count(*) from public.accounts) = 0, 'no financial accounts are pre-created');

-- -----------------------------------------------------------------------------
-- Accounts with opening balances, created atomically through save_account.
-- -----------------------------------------------------------------------------
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.save_account('{"name":"IDFC First","type":"savings","last4":"4321"}', null, null, '{"balance":2000000,"on":"2026-11-01"}');
select public.save_account('{"name":"Kotak 811","type":"savings"}', null, null, '{"balance":100000,"on":"2026-11-01"}');
select public.save_account('{"name":"SBI ELITE","type":"credit_card","last4":"9001"}',
  '{"network":"visa","variant":"Elite","credit_limit":20000000,"statement_day":5,"due_day":25,"annual_fee":499900}', null,
  '{"balance":300000,"on":"2026-11-01"}');
select public.save_account('{"name":"Bike loan","type":"vehicle_loan"}', null,
  '{"loan_kind":"two_wheeler","lender":"HDFC","principal_amount":12000000,"interest_rate_bps":1200,"emi_amount":564882,"tenure_months":24,"emi_day":5}',
  '{"balance":12000000,"on":"2026-01-05"}');
select public.save_account(jsonb_build_object('name', 'IDFC Debit', 'type', 'debit_card', 'linked_account_id', tests.acc('IDFC First')), null, null, null);
insert into public.people (name, relation) values ('Parents', 'parent'), ('Rahul', 'friend'), ('Aisha', 'roommate');
commit;

begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.ok(tests.bal('IDFC First') = 2000000, 'bank opening balance ₹20,000');
select tests.ok(tests.bal('SBI ELITE') = 300000, 'card opening outstanding ₹3,000 is a liability');
select tests.ok((select class from public.accounts where name = 'SBI ELITE') = 'liability', 'card class derived from type');
select tests.ok(tests.bal('Bike loan') = 12000000, 'loan opening principal');
select tests.ok((select credit_limit from public.card_details) = 20000000, 'card details saved');
select tests.ok((select emi_amount from public.loan_details) = 564882, 'loan details saved');
select tests.ok((select is_liquid from public.accounts where name = 'IDFC First'), 'savings is liquid');

-- Transfer ₹5,000 IDFC → Kotak.
select public.post_entry(tests.entry('transfer', 500000, 'k-transfer-0001'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -500000),
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Kotak 811'), 'amount', 500000)));
select tests.ok(tests.bal('IDFC First') = 1500000, 'IDFC decreased by ₹5,000');
select tests.ok(tests.bal('Kotak 811') = 600000, 'Kotak increased by ₹5,000');
select tests.ok((select coalesce(sum(income + personal_expense), 0) from public.monthly_summary) = 0, 'a transfer creates no income and no expense');

-- Idempotency: the same submission replayed returns the original.
select tests.ok((public.post_entry(tests.entry('transfer', 500000, 'k-transfer-0001'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -500000),
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Kotak 811'), 'amount', 500000))) ->> 'created')::boolean = false, 'replayed submission is not created again');
select tests.ok(tests.bal('IDFC First') = 1500000, 'retry did not double-count');

-- Reimbursable purchase: ₹10,000 groceries on SBI ELITE, parents owe ₹7,000.
select public.post_entry(tests.entry('card_purchase', 1000000, 'k-groceries-01', 'Household groceries',
    jsonb_build_object('category_id', tests.cat('Groceries'), 'primary_account_id', tests.acc('SBI ELITE'))), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('SBI ELITE'), 'amount', -1000000),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Groceries'), 'amount', 300000),
  jsonb_build_object('target', 'person', 'person_id', tests.person('Parents'), 'amount', 700000)));
select tests.ok(tests.bal('SBI ELITE') = 1300000, 'card liability +₹10,000');
select tests.ok((select outstanding from public.person_balances where person_id = tests.person('Parents')) = 700000, 'parents owe ₹7,000');
select tests.ok((select personal_expense from public.monthly_summary where month = '2026-11') = 300000, 'personal expense ₹3,000');
select tests.ok((select reimbursable from public.monthly_summary where month = '2026-11') = 700000, 'reimbursable ₹7,000');

-- Parents pay back ₹7,000 into IDFC.
select public.post_entry(tests.entry('reimbursement_received', 700000, 'k-parents-back'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', 700000),
  jsonb_build_object('target', 'person', 'person_id', tests.person('Parents'), 'amount', -700000)));
select tests.ok(tests.bal('IDFC First') = 2200000, 'bank balance increased by ₹7,000');
select tests.ok((select outstanding from public.person_balances where person_id = tests.person('Parents')) = 0, 'receivable cleared');
select tests.ok((select income from public.monthly_summary where month = '2026-11') = 0, 'reimbursement is not income');
select tests.ok((select personal_expense from public.monthly_summary where month = '2026-11') = 300000, 'personal expense still ₹3,000');

-- Card repayment ₹5,000 from IDFC.
select public.post_entry(tests.entry('card_repayment', 500000, 'k-card-pay-01'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -500000),
  jsonb_build_object('target', 'account', 'account_id', tests.acc('SBI ELITE'), 'amount', 500000)));
select tests.ok(tests.bal('IDFC First') = 1700000, 'savings −₹5,000 on card payment');
select tests.ok(tests.bal('SBI ELITE') = 800000, 'card outstanding −₹5,000');
select tests.ok((select personal_expense from public.monthly_summary where month = '2026-11') = 300000, 'card payment creates no new expense');

-- Loan EMI split into principal + interest.
select public.post_entry(tests.entry('loan_repayment', 564882, 'k-emi-0001'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -564882),
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Bike loan'), 'amount', 444882),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Interest paid'), 'amount', 120000)));
select tests.ok(tests.bal('Bike loan') = 12000000 - 444882, 'principal reduced by principal portion only');

-- Refund to card.
select public.post_entry(tests.entry('refund', 100000, 'k-refund-0001'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('SBI ELITE'), 'amount', 100000),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Groceries'), 'amount', -100000)));
select tests.ok(tests.bal('SBI ELITE') = 700000, 'refund reduces card outstanding');
commit;

-- -----------------------------------------------------------------------------
-- Invariants the server must refuse.
-- -----------------------------------------------------------------------------
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_error($q$ select public.post_entry(tests.entry('expense', 100, 'k-unbalanced'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -100),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Groceries'), 'amount', 99))) $q$, '%does not balance%', 'unbalanced entry');
select tests.expect_error($q$ select public.post_entry(tests.entry('transfer', 100, 'k-xfer-income'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -100),
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Kotak 811'), 'amount', 200),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Salary'), 'amount', -100))) $q$, '%Transfers may only%', 'transfer disguised as income');
select tests.expect_error($q$ select public.post_entry(tests.entry('reimbursement_received', 100, 'k-reimb-income'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', 100),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Salary'), 'amount', -100))) $q$, '%never income or expense%', 'reimbursement booked as income');
select tests.expect_error($q$ select public.post_entry(tests.entry('expense', 100, 'k-debit-card'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC Debit'), 'amount', -100),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Groceries'), 'amount', 100))) $q$, '%Debit cards have no balance%', 'posting to a debit card');
select tests.expect_error($q$ select public.post_entry(tests.entry('expense', 100, 'k-equity-misuse'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', 100),
  jsonb_build_object('target', 'equity', 'amount', -100))) $q$, '%equity%', 'equity outside opening/adjustment');
select tests.expect_error($q$ select public.post_entry(tests.entry('expense', 100, 'k-income-on-expense'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', 100),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Salary'), 'amount', -100))) $q$, '%never be income%', 'expense entry with income category');
select tests.expect_error($q$ select public.post_entry(tests.entry('expense', 100, 'k-pan-0001', 'card 4111 1111 1111 1111'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -100),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Groceries'), 'amount', 100))) $q$, '%entries_no_pan%', 'full card number in description');
select tests.expect_error($q$ insert into public.entries (owner_id, type, occurred_on, description, amount, idempotency_key)
  values (auth.uid(), 'income', '2026-11-10', 'sneaky', 100, 'k-direct-insert') $q$, '%permission denied%', 'direct ledger insert bypassing RPCs');
select tests.expect_error($q$ update public.accounts set notes = 'pan 5500 0000 0000 0004' where name = 'Kotak 811' $q$, '%accounts_no_pan%', 'full card number in account notes');
select tests.expect_error($q$ update public.accounts set last4 = '12345' where name = 'Kotak 811' $q$, '%last4%', 'more than last 4 digits');
commit;

-- -----------------------------------------------------------------------------
-- Row Level Security: the second user sees nothing and can't use my ids.
-- -----------------------------------------------------------------------------
create temp table ids as select id, name from public.accounts;
grant select on ids to authenticated;
begin;
select tests.as_user('22222222-2222-2222-2222-222222222222');
select tests.ok((select count(*) from public.accounts) = 0, 'other user sees none of my accounts');
select tests.ok((select count(*) from public.entries) = 0, 'other user sees none of my entries');
select tests.ok((select count(*) from public.account_balances) = 0, 'balances view respects RLS');
select tests.ok((select count(*) from public.categories) = 26, 'other user sees only their own categories');
select tests.expect_error($q$ select public.post_entry(tests.entry('transfer', 100, 'k-steal-0001'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', (select id from ids where name = 'IDFC First'), 'amount', -100),
  jsonb_build_object('target', 'account', 'account_id', (select id from ids where name = 'Kotak 811'), 'amount', 100))) $q$, '%Unknown account%', 'cannot post against another user''s accounts');
select tests.expect_error($q$ select public.void_entry((select id from public.entries limit 1)) $q$, '%', 'cannot void without access');
update public.accounts set name = 'hacked' where id = (select id from ids where name = 'IDFC First');
commit;
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.ok(exists (select 1 from public.accounts where name = 'IDFC First'), 'other user''s update touched nothing');
commit;

-- -----------------------------------------------------------------------------
-- Recurring: confirm exactly once; void re-opens; skip.
-- -----------------------------------------------------------------------------
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into public.recurring_rules (name, kind, amount, frequency, start_on, source_account_id, category_id)
values ('Netflix', 'subscription', 64900, 'monthly', '2026-11-15', tests.acc('IDFC First'), tests.cat('Subscriptions'));
select public.confirm_occurrence((select id from public.recurring_rules where name = 'Netflix'), '2026-11-15',
  tests.entry('expense', 64900, 'k-netflix-nov-a'), tests.legs(
    jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -64900),
    jsonb_build_object('target', 'category', 'category_id', tests.cat('Subscriptions'), 'amount', 64900)));
-- Confirming again (different device, new key) returns the first entry.
select tests.ok((public.confirm_occurrence((select id from public.recurring_rules where name = 'Netflix'), '2026-11-15',
  tests.entry('expense', 64900, 'k-netflix-nov-b'), tests.legs(
    jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -64900),
    jsonb_build_object('target', 'category', 'category_id', tests.cat('Subscriptions'), 'amount', 64900))) ->> 'created')::boolean = false,
  'second confirmation of the same due date is a no-op');
select tests.ok((select count(*) from public.entries where recurring_rule_id is not null and status = 'posted') = 1, 'exactly one payment recorded');
select public.void_entry((select id from public.entries where idempotency_key = 'k-netflix-nov-a'), 'Charged twice by mistake');
select tests.ok((select count(*) from public.recurring_occurrences) = 0, 'voiding the payment re-opens the occurrence');
select tests.ok((select count(*) from public.entry_revisions where action = 'void') = 1, 'void kept a revision snapshot');
select public.skip_occurrence((select id from public.recurring_rules where name = 'Netflix'), '2026-12-15');
select tests.ok((select status from public.recurring_occurrences where due_on = '2026-12-15') = 'skipped', 'skip recorded');
commit;

-- -----------------------------------------------------------------------------
-- Corrections: optimistic concurrency + revision history; opening corrections.
-- -----------------------------------------------------------------------------
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.post_entry(tests.entry('expense', 25000, 'k-lunch-0001', 'Lunch', jsonb_build_object('category_id', tests.cat('Food & dining'))), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Kotak 811'), 'amount', -25000),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Food & dining'), 'amount', 25000)));
select public.update_entry((select id from public.entries where idempotency_key = 'k-lunch-0001'), 1,
  tests.entry('expense', 27500, 'ignored', 'Lunch + tip', jsonb_build_object('category_id', tests.cat('Food & dining'))), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Kotak 811'), 'amount', -27500),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Food & dining'), 'amount', 27500)), 'Forgot the tip');
select tests.ok((select version from public.entries where idempotency_key = 'k-lunch-0001') = 2, 'version bumped');
select tests.ok((select (snapshot->>'amount')::bigint from public.entry_revisions r join public.entries e on e.id = r.entry_id where e.idempotency_key = 'k-lunch-0001') = 25000, 'previous amount kept in history');
select tests.ok(tests.bal('Kotak 811') = 600000 - 27500, 'balance reflects corrected amount');
select tests.expect_error($q$ select public.update_entry((select id from public.entries where idempotency_key = 'k-lunch-0001'), 1,
  tests.entry('expense', 1, 'x'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('Kotak 811'), 'amount', -1),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Food & dining'), 'amount', 1))) $q$, '%changed on another device%', 'stale edit rejected');

select public.save_account(jsonb_build_object('id', tests.acc('Kotak 811'), 'name', 'Kotak 811', 'type', 'savings'), null, null, '{"balance":150000,"on":"2026-11-01"}');
select tests.ok(tests.bal('Kotak 811') = 650000 - 27500, 'opening balance corrected in place');
select tests.ok((select count(*) from public.entries where type = 'opening_balance' and primary_account_id = tests.acc('Kotak 811')) = 1, 'still exactly one opening entry');
select tests.ok(exists (select 1 from public.entry_revisions where reason = 'Opening balance corrected'), 'opening correction recorded');
select tests.ok((select count(*) from public.audit_log where table_name = 'accounts') >= 5, 'account changes are audited');
commit;

-- -----------------------------------------------------------------------------
-- Settlement allocations.
-- -----------------------------------------------------------------------------
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.post_entry(tests.entry('expense', 300000, 'k-dinner-0001', 'Dinner'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', -300000),
  jsonb_build_object('target', 'category', 'category_id', tests.cat('Food & dining'), 'amount', 100000),
  jsonb_build_object('target', 'person', 'person_id', tests.person('Rahul'), 'amount', 100000),
  jsonb_build_object('target', 'person', 'person_id', tests.person('Aisha'), 'amount', 100000)));
select public.post_entry(tests.entry('reimbursement_received', 40000, 'k-rahul-part1'), tests.legs(
  jsonb_build_object('target', 'account', 'account_id', tests.acc('IDFC First'), 'amount', 40000),
  jsonb_build_object('target', 'person', 'person_id', tests.person('Rahul'), 'amount', -40000)));
select public.set_settlement_allocations((select id from public.entries where idempotency_key = 'k-rahul-part1'),
  jsonb_build_array(jsonb_build_object('claim_entry_id', (select id from public.entries where idempotency_key = 'k-dinner-0001'), 'person_id', tests.person('Rahul'), 'amount', 40000)));
select tests.ok((select count(*) from public.settlement_allocations) = 1, 'allocation stored');
select tests.ok((select outstanding from public.person_balances where person_id = tests.person('Rahul')) = 60000, 'partial reimbursement leaves ₹600');
select tests.ok((select outstanding from public.person_balances where person_id = tests.person('Aisha')) = 100000, 'other split untouched');
select tests.expect_error($q$ select public.set_settlement_allocations((select id from public.entries where idempotency_key = 'k-rahul-part1'),
  jsonb_build_array(jsonb_build_object('claim_entry_id', (select id from public.entries where idempotency_key = 'k-dinner-0001'), 'person_id', tests.person('Rahul'), 'amount', 50000))) $q$,
  '%exceed%', 'allocation larger than the payment');
commit;

-- Deferred backstop: even a privileged direct write must balance at commit.
do $$
begin
  begin
    insert into public.entries (owner_id, type, occurred_on, description, amount, idempotency_key)
    values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-10', 'one-legged', 100, 'k-backstop-01');
    set constraints all immediate;
    raise exception 'FAILED: one-legged entry accepted';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
    raise notice 'ok - deferred balance check rejects one-legged entries (%)', sqlerrm;
  end;
end $$;

-- Files stored in Postgres (migration 0005): private per user, size-capped.
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into public.files (folder, name, mime, size_bytes, data) values ('logos', 'hdfc.png', 'image/png', 4, 'iVBORw==');
select tests.ok((select count(*) from public.files) = 1, 'owner sees their uploaded file');
select tests.expect_error($q$ insert into public.files (folder, name, mime, size_bytes, data) values ('logos', 'x.exe', 'application/x-msdownload', 4, 'AAAA') $q$, '%files_mime_check%', 'unsupported file type refused');
select tests.expect_error($q$ insert into public.files (folder, name, mime, size_bytes, data) values ('statements', 'big.pdf', 'application/pdf', 7000000, 'AAAA') $q$, '%size_bytes%', 'oversized file refused');
commit;
begin;
select tests.as_user('22222222-2222-2222-2222-222222222222');
select tests.ok((select count(*) from public.files) = 0, 'other user cannot see the file');
commit;

-- -----------------------------------------------------------------------------
-- Grow details (FD / RD / stocks / mutual funds): principal, rate, tenure,
-- invested amount, SIP plan — private per user, saved through save_account.
-- -----------------------------------------------------------------------------
begin;
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.save_account('{"name":"HDFC FD","type":"fixed_deposit"}', null, null, '{"balance":10000000,"on":"2026-11-01"}',
  '{"principal_amount":10000000,"interest_rate_bps":700,"start_date":"2026-11-01","tenure_months":12,"compounding_per_year":4}');
select tests.ok((select g.interest_rate_bps from public.grow_details g join public.accounts a on a.id = g.account_id where a.name = 'HDFC FD') = 700, 'FD stores its deposit, rate and tenure');
select tests.ok((select g.tenure_months from public.grow_details g join public.accounts a on a.id = g.account_id where a.name = 'HDFC FD') = 12, 'FD tenure saved');
select public.save_account('{"name":"Index Fund","type":"mutual_funds"}', null, null, '{"balance":124700,"on":"2026-11-01"}',
  '{"invested_amount":10000000,"sip_amount":200000,"sip_frequency":"monthly"}');
select tests.ok((select g.invested_amount from public.grow_details g join public.accounts a on a.id = g.account_id where a.name = 'Index Fund') = 10000000, 'fund stores invested amount');
select tests.ok((select g.sip_frequency from public.grow_details g join public.accounts a on a.id = g.account_id where a.name = 'Index Fund') = 'monthly', 'fund stores its SIP plan');
-- An edit without grow details (e.g. an older client) must not clobber them.
select public.save_account((select jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type::text, 'include_in_net_worth', true) from public.accounts a where a.name = 'HDFC FD'), null, null, null);
select tests.ok((select g.principal_amount from public.grow_details g join public.accounts a on a.id = g.account_id where a.name = 'HDFC FD') = 10000000, 'saving without grow details keeps them');
-- Grow details on a non-grow account are ignored, not stored.
select public.save_account('{"name":"Fake grow","type":"savings"}', null, null, null, '{"invested_amount":5}');
select tests.ok((select count(*) from public.grow_details g join public.accounts a on a.id = g.account_id where a.name = 'Fake grow') = 0, 'grow details are ignored for non-grow accounts');
commit;
create temp table grow_ids as select a.id, a.name from public.accounts a where a.name in ('HDFC FD', 'Index Fund');
grant select on grow_ids to authenticated;
begin;
select tests.as_user('22222222-2222-2222-2222-222222222222');
select tests.ok((select count(*) from public.grow_details) = 0, 'grow details are private to the owner');
select tests.expect_error($q$ insert into public.grow_details (account_id, owner_id) values ((select id from grow_ids where name = 'HDFC FD'), '22222222-2222-2222-2222-222222222222'::uuid) $q$, '%Unknown account%', 'cannot touch another user''s grow details');
commit;

-- Single-owner lock (used by the self-hosted deploy).
insert into private.instance_settings (key, value) values ('single_owner', 'on');
do $$
begin
  begin
    insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'intruder@example.com');
    raise exception 'FAILED: a second sign-up was accepted with single_owner on';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
    raise notice 'ok - single-owner lock refuses further sign-ups (%)', sqlerrm;
  end;
end $$;
delete from private.instance_settings where key = 'single_owner';

-- Passphrase lockout hook.
do $$
declare r jsonb;
begin
  for i in 1..7 loop
    r := private.hook_password_verification_attempt('{"user_id":"11111111-1111-1111-1111-111111111111","valid":false}');
  end loop;
  if r->>'decision' <> 'continue' then raise exception 'FAILED: locked too early'; end if;
  r := private.hook_password_verification_attempt('{"user_id":"11111111-1111-1111-1111-111111111111","valid":false}');
  if r->>'decision' <> 'reject' then raise exception 'FAILED: 8th wrong attempt not locked'; end if;
  r := private.hook_password_verification_attempt('{"user_id":"11111111-1111-1111-1111-111111111111","valid":true}');
  if r->>'decision' <> 'reject' then raise exception 'FAILED: correct passphrase accepted during lockout'; end if;
  raise notice 'ok - passphrase lockout after 8 failures, even for the right passphrase';
  delete from private.auth_attempts;
end $$;

-- Whole-user deletion cascades through the ledger.
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if exists (select 1 from public.entries) or exists (select 1 from public.accounts) then
    raise exception 'FAILED: user deletion left ledger rows';
  end if;
  raise notice 'ok - deleting a user removes all their ledger data';
end $$;
