# AI Video Factory Orchestrator

GitHub Actions claims `queued_gpu` projects from Supabase, injects the job payload into a private Kaggle kernel, launches a free Tesla T4 run, downloads only the final outputs, uploads them to Supabase Storage, and marks the project `ready_for_review`.

The production dashboard no longer depends on the local placeholder worker.
