-- Run after 002_feature_persistence.sql. No existing rows are deleted or archived.
-- Serialize submissions for the same user/video across backend instances.
begin;
create or replace function public.get_or_create_study_source(p_user uuid, p_url text, p_hash text, p_language text)
returns jsonb language plpgsql set search_path=public as $$
declare chosen public.study_sources;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_url, 0));
  select * into chosen from public.study_sources
    where user_id=p_user and (url=p_url or url_hash=p_hash)
      and status in ('ready','processing','queued')
    order by (status='ready') desc, created_at desc, id desc limit 1;
  if found then
    return jsonb_build_object('source',to_jsonb(chosen),'created',false);
  end if;
  insert into public.study_sources(user_id,url,url_hash,language,status)
    values(p_user,p_url,p_hash,p_language,'queued') returning * into chosen;
  return jsonb_build_object('source',to_jsonb(chosen),'created',true);
end $$;
revoke all on function public.get_or_create_study_source(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_or_create_study_source(uuid,text,text,text) to service_role;
commit;
