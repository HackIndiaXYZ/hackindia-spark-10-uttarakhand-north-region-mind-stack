-- Run after 003_source_reuse.sql before using the re-test feature.
-- Existing quizzes remain ordinary quizzes; existing attempts are preserved.
begin;
alter table public.quizzes add column if not exists kind text not null default 'quiz'
  check (kind in ('quiz', 'retest'));
alter table public.quizzes add column if not exists baseline_attempt_id uuid
  references public.quiz_attempts(id) on delete set null;
alter table public.quizzes add column if not exists practice_topics jsonb not null default '[]';
create index if not exists quizzes_source_kind on public.quizzes(source_id,user_id,kind);
create index if not exists attempts_quiz_created on public.quiz_attempts(quiz_id,created_at desc);
commit;
