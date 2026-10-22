-- =============================================================================
-- WallDash migration 0002 — validate lab hours on the server.
--
-- Lab hours inside signage_state.state.labs.<id>.hours.{monThu,fri,weekend}
-- must be either 'Closed' or 'h:mm AM – h:mm PM' (hours 1–12, minutes 00–59,
-- en dash with spaces, opening and closing times different).
-- Only fields that change are checked, so existing data never blocks a save.
--
-- Run after 0001_init.sql in Supabase → SQL Editor. Safe to re-run.
-- =============================================================================

create or replace function public.is_valid_lab_hours(h text)
returns boolean
language sql
immutable
as $$
  select h is not null and (
    h = 'Closed'
    or (
      h ~ '^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM) – (1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$'
      and split_part(h, ' – ', 1) <> split_part(h, ' – ', 2)
    )
  );
$$;

create or replace function public.validate_signage_lab_hours()
returns trigger
language plpgsql
as $$
declare
  lab_id text;
  field text;
  new_value text;
  old_value text;
begin
  if jsonb_typeof(new.state -> 'labs') <> 'object' then
    return new;
  end if;

  for lab_id in select jsonb_object_keys(new.state -> 'labs') loop
    foreach field in array array['monThu', 'fri', 'weekend'] loop
      new_value := new.state -> 'labs' -> lab_id -> 'hours' ->> field;
      old_value := case
        when tg_op = 'UPDATE' then old.state -> 'labs' -> lab_id -> 'hours' ->> field
        else null
      end;

      if new_value is distinct from old_value
         and not public.is_valid_lab_hours(new_value) then
        raise exception 'Invalid hours for lab % (%): "%". Use "Closed" or "h:mm AM – h:mm PM".',
          lab_id, field, coalesce(new_value, 'empty')
          using errcode = 'check_violation';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists signage_state_validate_lab_hours on public.signage_state;
create trigger signage_state_validate_lab_hours
  before insert or update on public.signage_state
  for each row execute function public.validate_signage_lab_hours();
