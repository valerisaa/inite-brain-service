-- 0031_job_run_traceparent — W3C trace context on enqueued rows.
--
-- Phase K3 instruments the queue handoff with OTel PRODUCER/CONSUMER
-- spans so a trace viewer can show time-in-queue vs time-in-execution
-- as a single waterfall. To link producer and consumer across the
-- async boundary, the enqueuer injects the active span's traceparent
-- into the row, and the dispatcher extracts it before starting the
-- consumer span.
--
-- W3C trace context format (single-line ASCII):
--   00-<32-hex traceId>-<16-hex spanId>-<2-hex flags>
-- ~55 bytes — option<string> is the right shape (most rows enqueued
-- outside an HTTP request — startup, cron — have NO active context
-- and skip the field entirely, defaulting to NONE).

DEFINE FIELD IF NOT EXISTS traceparent ON job_run TYPE option<string>;
