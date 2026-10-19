-- Eval Workshop only: mark the seeded grade_mismatch flag on TQ-E4K9D as reviewed.
-- The workshop agent never proposes a flag that is already open, so with this flag open the
-- canonical eval (spec 10) could not produce its fourth card (flag TQ-E4K9D). Demo data in
-- Taller Pillco (TQ-4K9D1 keeps its open flag) is not touched. Idempotent.
with f as (
  update public.hat_flags fl
     set reviewed_at = now(),
         review_reason = 'Reviewed for the eval set: the canonical note raises this flag again.'
    from public.hats h
   where h.id = fl.hat_id
     and h.code = 'TQ-E4K9D'
     and h.workshop_id = '33333333-3333-4333-8333-333333333333'
     and fl.kind = 'grade_mismatch'
     and fl.reviewed_at is null
  returning fl.hat_id
)
insert into public.hat_events (hat_id, type, actor_id, source, note)
select hat_id, 'flag_reviewed', null, 'manual', 'Reviewed for the eval set.' from f;
