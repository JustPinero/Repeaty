-- 0007_onboarding_rpc.sql
-- complete_onboarding(p_display_name, p_native_language_code, p_targets) RPC.
-- Atomic write across profiles + user_languages so the wizard can never leave
-- the user in a half-onboarded state. SECURITY INVOKER (default for plpgsql)
-- so RLS still applies — auth.uid() must match the profiles row being updated.
--
-- p_targets is a JSONB array of objects: [{"language_code": "es", "cefr_level": "A1"}, ...].
-- All inserts happen in a single transaction (Postgres functions are
-- transactional by default).

create or replace function public.complete_onboarding(
  p_display_name text,
  p_native_language_code text,
  p_targets jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target jsonb;
  v_lang text;
  v_level text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Validate inputs early; surface helpful Postgres error codes.
  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'display_name is required' using errcode = '22023';
  end if;
  if p_native_language_code is null or btrim(p_native_language_code) = '' then
    raise exception 'native_language_code is required' using errcode = '22023';
  end if;
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'at least one target language is required' using errcode = '22023';
  end if;

  -- Update the profile. RLS will block this if v_user_id <> auth.uid(),
  -- which can't happen given our auth.uid() assignment above.
  update public.profiles
     set display_name = btrim(p_display_name),
         native_language_code = p_native_language_code
   where id = v_user_id;

  -- Insert each target. Upsert on (user_id, language_code) so re-running
  -- onboarding is idempotent.
  for v_target in select * from jsonb_array_elements(p_targets)
  loop
    v_lang := v_target ->> 'language_code';
    v_level := v_target ->> 'cefr_level';

    if v_lang is null or v_lang = '' then
      raise exception 'each target must have a language_code' using errcode = '22023';
    end if;
    if v_level is null or v_level not in ('A1','A2','B1','B2','C1','C2') then
      raise exception 'each target must have a CEFR level (A1..C2)' using errcode = '22023';
    end if;

    insert into public.user_languages (user_id, language_code, cefr_level)
    values (v_user_id, v_lang, v_level)
    on conflict (user_id, language_code)
    do update set cefr_level = excluded.cefr_level,
                  updated_at = now();
  end loop;
end;
$$;

-- Authenticated users may call this RPC. Service-role bypass remains.
grant execute on function public.complete_onboarding(text, text, jsonb) to authenticated;
