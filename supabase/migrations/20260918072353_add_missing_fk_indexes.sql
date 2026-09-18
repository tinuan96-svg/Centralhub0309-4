create index if not exists idx_ci_artifacts_app_release_id
  on public.ci_artifacts(app_release_id);

create index if not exists idx_ci_builds_requested_by
  on public.ci_builds(requested_by);

create index if not exists idx_ci_projects_created_by
  on public.ci_projects(created_by);

create index if not exists idx_shruthi_learning_insights_run_id
  on public.shruthi_learning_insights(run_id);
