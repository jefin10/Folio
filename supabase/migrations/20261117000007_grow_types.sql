-- Grow section: dedicated account types for market investments.
alter type public.account_type add value if not exists 'stocks' after 'recurring_deposit';
alter type public.account_type add value if not exists 'mutual_funds' after 'stocks';
