-- Create the table
CREATE TABLE IF NOT EXISTS service_logs (
    timestamp     TIMESTAMPTZ NOT NULL,
    hostname      TEXT NOT NULL,
    service       TEXT NOT NULL,
    level         TEXT NOT NULL,
    request_id    TEXT,
    resource_id   TEXT,
    message       TEXT,
    message_json  JSONB
);

-- Convert the table into a hypertable (partitioned by time)
-- 1 day is a good starting point for 'chunk_time_interval'
SELECT create_hypertable('service_logs', 'timestamp');

-- Create your specific indexes
CREATE INDEX idx_logs_level_time ON service_logs (level, timestamp DESC);
CREATE INDEX idx_logs_request_id ON service_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_logs_resource_id ON service_logs (resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX idx_logs_service_time ON service_logs (service, timestamp DESC);
-- Note: TimescaleDB creates the default timestamp index automatically, 
-- but we can explicitly define it if you need specific ordering.
CREATE INDEX IF NOT EXISTS service_logs_timestamp_idx ON service_logs (timestamp DESC);