-- =============================================================================
-- 0009_pricing.sql — live pricing.
--   Monthly:  Coach £3.99, Player £2.99.
--   Annual:   pay for the year, save 25% (monthly x 12 x 0.75).
--             Coach £35.91, Player £26.91.
-- The old *_season plans become the annual option (a full 12 months), so the
-- revenue view learns a 'year' term (÷12) alongside month and season.
-- =============================================================================

-- Monthly prices (pence).
update public.plans
  set price_pence = 399, description = 'One coach, unlimited teams'
  where id = 'coach_monthly';

update public.plans
  set price_pence = 299, description = 'One player, all their teams'
  where id = 'player_monthly';

-- Annual = monthly x 12 x 0.75 (25% off).
update public.plans
  set name = 'Coach Annual', description = 'One coach, paid yearly (save 25%)',
      price_pence = 3591, interval = 'year'
  where id = 'coach_season';

update public.plans
  set name = 'Player Annual', description = 'One player, paid yearly (save 25%)',
      price_pence = 2691, interval = 'year'
  where id = 'player_season';

-- Teach the MRR view the yearly term (÷12). Same columns as before.
create or replace view public.analytics_mrr as
  select
    round(sum(
      case p.interval
        when 'month'  then p.price_pence
        when 'season' then p.price_pence / 9.0    -- legacy 9-month season, if any
        when 'year'   then p.price_pence / 12.0   -- annual, normalised to a month
        else 0
      end
    ) / 100.0, 2) as mrr_gbp,
    count(*)       as active_subscriptions
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.status = 'active' and public.is_admin();
