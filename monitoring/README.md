# Monitoring: Grafana & Prometheus

This folder contains a ready-made Grafana dashboard and suggested Prometheus alerting rules for the RAG job metrics.

Files:
- `grafana/foodie-rag-dashboard.json` — Grafana dashboard you can import (Prometheus datasource assumed).
- `prometheus/alerting-rules.yml` — Example Prometheus rule group with two alerts:
  - `RAGJobFailureRateHigh` (failure rate > 5% over 5 minutes for 10m)
  - `RAGJobHighLatency` (P95 latency > 5s over 10m)

How to use:
1. Import `grafana/foodie-rag-dashboard.json` into Grafana (Dashboard → Manage → Import).
2. Ensure your Grafana Prometheus datasource is configured and named `Prometheus` (or edit the JSON to point to your datasource UID).
3. Add `prometheus/alerting-rules.yml` to your Prometheus `rule_files` config, then reload Prometheus or restart it.

Tuning:
- Adjust the failure rate threshold (5%) and latency threshold (5s) to match your SLAs.
- The dashboard uses these Prometheus metrics exposed by the app:
  - `ragg_job_processed_total` (counter)
  - `ragg_job_failed_total` (counter)
  - `ragg_job_duration_seconds_bucket` (histogram buckets)

If you want, I can also:
- Create an opinionated Grafana JSON that includes panel links to job logs or the Bull Board UI.
- Add Grafana alerting rules (if you use Grafana Alerting) and example notification channels (Slack/Email).
