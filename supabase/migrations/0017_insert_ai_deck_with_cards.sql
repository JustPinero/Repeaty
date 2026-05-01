-- 0017_insert_ai_deck_with_cards.sql
-- Atomic insert of an AI-generated deck + its cards for the
-- `generate-lesson` Edge Function (5.5). Single transaction so a partial
-- failure can't leave a deck row with no cards (or vice versa).
--
-- SECURITY DEFINER + the explicit owner check inside is the safety boundary
-- against a service-role caller accidentally creating a deck for the wrong
-- user — only `auth.uid()` can be the owner, and the function refuses if
-- auth.uid() differs from p_owner.

create or replace function public.insert_ai_deck_with_cards(
  p_owner       uuid,
  p_language    text,
  p_cefr        text,
  p_deck_name   text,
  p_cards       jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_deck_id  uuid;
  v_card     jsonb;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if v_actor is distinct from p_owner then
    raise exception 'OWNER_MISMATCH' using errcode = '42501';
  end if;
  if jsonb_array_length(p_cards) < 1 then
    raise exception 'EMPTY_DECK' using errcode = '22023';
  end if;

  insert into public.decks (name, language_code, cefr_level, source, owner_id)
    values (p_deck_name, p_language, p_cefr, 'ai_generated', p_owner)
  returning id into v_deck_id;

  for v_card in select * from jsonb_array_elements(p_cards) loop
    insert into public.cards (
      deck_id, target_text, native_text, ipa,
      example_sentence_target, example_sentence_native, language_code
    ) values (
      v_deck_id,
      v_card ->> 'target_text',
      v_card ->> 'native_text',
      v_card ->> 'ipa',
      v_card ->> 'example_sentence_target',
      v_card ->> 'example_sentence_native',
      p_language
    );
  end loop;

  return v_deck_id;
end;
$$;

revoke all on function public.insert_ai_deck_with_cards(uuid, text, text, text, jsonb) from public;
grant execute on function public.insert_ai_deck_with_cards(uuid, text, text, text, jsonb) to authenticated;
