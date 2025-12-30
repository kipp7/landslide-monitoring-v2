import { Card, Col, Progress, Row, Skeleton, Typography } from "antd";
import { useEffect, useState } from "react";

import type { SystemStatus } from "../api/client";
import { useApi } from "../api/ApiProvider";

export function SystemPage() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    const run = async () => {
      try {
        const s = await api.system.getStatus();
        if (abort.signal.aborted) return;
        setStatus(s);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => {
      abort.abort();
    };
  }, [api]);

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        系统监控
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card title="CPU">
            {loading ? <Skeleton active paragraph={false} /> : <Progress type="circle" percent={status?.cpuPercent ?? 0} />}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="内存">
            {loading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Progress type="circle" percent={status?.memPercent ?? 0} status="active" />
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="磁盘">
            {loading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Progress type="circle" percent={status?.diskPercent ?? 0} status="exception" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
