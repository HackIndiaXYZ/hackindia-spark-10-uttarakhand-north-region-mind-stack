-- Run after schema.sql for existing and fresh installations. Stop the old backend first.
begin;
alter table public.generated_content add column if not exists feature_type text;
alter table public.generated_content add column if not exists updated_at timestamptz not null default now();
alter table public.study_sources add column if not exists language text not null default 'en' check (language in ('en','hi','hinglish'));
update public.generated_content set feature_type = type where feature_type is null;
-- Keep historical duplicates in a private archive before enforcing uniqueness.
create table if not exists public.generated_content_archive (like public.generated_content including defaults);
alter table public.generated_content_archive enable row level security;
revoke all on public.generated_content_archive from anon, authenticated;
grant all on public.generated_content_archive to service_role;
with ranked as (
 select id, row_number() over (partition by source_id,feature_type order by created_at desc,id desc) as n from public.generated_content
), moved as (
 delete from public.generated_content where id in (select id from ranked where n > 1) returning *
) insert into public.generated_content_archive select * from moved;
alter table public.generated_content alter column feature_type set not null;
create unique index if not exists generated_content_source_feature on public.generated_content(source_id,feature_type);
-- Keep old quizzes/attempts intact and point each source to its latest quiz.
insert into public.generated_content(source_id,user_id,type,feature_type,title,content_json)
select distinct on (source_id) source_id,user_id,'quiz','quiz',title,jsonb_build_object('quizId',id)
from public.quizzes order by source_id,created_at desc,id desc
on conflict (source_id,feature_type) do nothing;
create table if not exists public.chat_turns (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.study_sources(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 question text not null,
 answer text not null,
 excerpts jsonb not null default '[]',
 created_at timestamptz not null default now(),
 unique(source_id,user_id,request_id)
);
create index if not exists chat_turns_source on public.chat_turns(source_id,user_id,created_at);
alter table public.chat_turns enable row level security;
do $$ begin
 create policy "chat self read" on public.chat_turns for select to authenticated using(auth.uid()=user_id);
exception when duplicate_object then null; end $$;
grant select on public.chat_turns to authenticated;
grant all on public.chat_turns to service_role;
create table if not exists public.generation_locks (
 source_id uuid not null references public.study_sources(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 feature_type text not null,
 owner uuid not null,
 expires_at timestamptz not null,
 primary key(source_id,feature_type)
);
alter table public.generation_locks enable row level security;
revoke all on public.generation_locks from anon,authenticated;
grant all on public.generation_locks to service_role;
create or replace function public.claim_generation(p_source uuid,p_user uuid,p_feature text,p_owner uuid)
returns boolean language plpgsql set search_path=public as $$
declare n integer;
begin
 if not exists(select 1 from study_sources where id=p_source and user_id=p_user) then return false; end if;
 insert into generation_locks values(p_source,p_user,p_feature,p_owner,now()+interval '10 minutes')
 on conflict(source_id,feature_type) do update set owner=excluded.owner,user_id=excluded.user_id,expires_at=excluded.expires_at
 where generation_locks.expires_at < now();
 get diagnostics n = row_count;
 return n=1;
end $$;
create or replace function public.renew_generation(p_source uuid,p_user uuid,p_feature text,p_owner uuid)
returns boolean language plpgsql set search_path=public as $$
declare n integer;
begin
 update generation_locks set expires_at=now()+interval '10 minutes' where source_id=p_source and user_id=p_user and feature_type=p_feature and owner=p_owner;
 get diagnostics n = row_count; return n=1;
end $$;
create or replace function public.release_generation(p_source uuid,p_user uuid,p_feature text,p_owner uuid)
returns void language sql set search_path=public as $$
 delete from generation_locks where source_id=p_source and user_id=p_user and feature_type=p_feature and owner=p_owner;
$$;
revoke all on function public.claim_generation(uuid,uuid,text,uuid),public.renew_generation(uuid,uuid,text,uuid),public.release_generation(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_generation(uuid,uuid,text,uuid),public.renew_generation(uuid,uuid,text,uuid),public.release_generation(uuid,uuid,text,uuid) to service_role;
commit;
