import { App as AntApp, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Skeleton, Space, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Baseline, BaselineStatus, Device } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";

type EditState =
  | { open: false }
  | { open: true; mode: "create" | "edit"; deviceId?: string; baseline?: Baseline };

function baselineStatusTag(status: BaselineStatus) {
  if (status === "active") return <Tag color="green">已建立</Tag>;
  if (status === "draft") return <Tag color="blue">草稿</Tag>;
  return <Tag color="red">缺失</Tag>;
}

export function BaselinesPanel(props: { className?: string; style?: React.CSSProperties }) {
  const api = useApi();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [edit, setEdit] = useState<EditState>({ open: false });
  const [keyword, setKeyword] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<BaselineStatus | "all">("all");
  const [autoingDeviceId, setAutoingDeviceId] = useState<string>("");
  const [form] = Form.useForm<{
    deviceId: string;
    baselineLat: number;
    baselineLng: number;
    baselineAlt?: number;
    notes?: string;
    status: BaselineStatus;
  }>();

  const refresh = async () => {
    setLoading(true);
    try {
      const [devicesList, baselineList] = await Promise.all([api.devices.list(), api.baselines.list()]);
      setDevices(devicesList.filter((x) => x.type === "gnss"));
      setBaselines(baselineList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [api]);

  const baselineByDeviceId = useMemo(() => new Map(baselines.map((b) => [b.deviceId, b] as const)), [baselines]);

  const rows = useMemo(() => {
    const normalize = (v: string) => v.trim().toLowerCase();
    const q = normalize(keyword);
    const statusRank = (s: BaselineStatus | "missing") => (s === "missing" ? 0 : s === "draft" ? 1 : 2);

    const base = devices.map((d) => ({
      deviceId: d.id,
      deviceName: d.name,
      stationName: d.stationName,
      baseline: baselineByDeviceId.get(d.id)
    }));

    let filtered = base;
    if (statusFilter !== "all") filtered = filtered.filter((r) => (r.baseline?.status ?? "missing") === statusFilter);
    if (q) {
      filtered = filtered.filter((r) => normalize(`${r.deviceName} ${r.stationName} ${r.deviceId}`).includes(q));
    }

    return [...filtered].sort((a, b) => {
      const as = a.baseline?.status ?? "missing";
      const bs = b.baseline?.status ?? "missing";
      const sr = statusRank(as) - statusRank(bs);
      if (sr !== 0) return sr;
      return a.stationName.localeCompare(b.stationName, "zh-Hans-CN");
    });
  }, [baselineByDeviceId, devices, keyword, statusFilter]);

  const openCreate = (deviceId?: string) => {
    setEdit(deviceId ? { open: true, mode: "create", deviceId } : { open: true, mode: "create" });
    form.resetFields();
    form.setFieldsValue({ deviceId: deviceId ?? "", status: "active" });
  };

  const openEdit = (baseline: Baseline) => {
    setEdit({ open: true, mode: "edit", baseline, deviceId: baseline.deviceId });
    const values: Parameters<typeof form.setFieldsValue>[0] = {
      deviceId: baseline.deviceId,
      baselineLat: baseline.baselineLat,
      baselineLng: baseline.baselineLng,
      status: baseline.status
    };
    if (baseline.baselineAlt !== undefined) values.baselineAlt = baseline.baselineAlt;
    if (baseline.notes !== undefined) values.notes = baseline.notes;
    form.setFieldsValue(values);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      const saved = await api.baselines.upsert({
        deviceId: values.deviceId,
        baselineLat: values.baselineLat,
        baselineLng: values.baselineLng,
        establishedBy: "manual(mock)",
        status: values.status,
        ...(values.baselineAlt !== undefined ? { baselineAlt: values.baselineAlt } : {}),
        ...(values.notes !== undefined ? { notes: values.notes } : {})
      });
      setBaselines((prev) => {
        const idx = prev.findIndex((x) => x.deviceId === saved.deviceId);
        if (idx >= 0) return prev.map((x) => (x.deviceId === saved.deviceId ? saved : x));
        return [...prev, saved];
      });
      message.success("已保存基线");
      setEdit({ open: false });
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <BaseCard
      title="GNSS 基线"
      className={props.className}
      style={props.style}
      extra={
        <Space>
          <Button
            onClick={() => {
              void refresh();
            }}
          >
            刷新
          </Button>
          <Select
            size="small"
            value={statusFilter}
            style={{ width: 120 }}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { label: "全部状态", value: "all" },
              { label: "缺失", value: "missing" },
              { label: "草稿", value: "draft" },
              { label: "已建立", value: "active" }
            ]}
          />
          <Button
            type="primary"
            onClick={() => {
              openCreate();
            }}
          >
            新建基线
          </Button>
        </Space>
      }
    >
      {loading ? (
        <Skeleton active />
      ) : (
        <div className="desk-dark-table">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Input
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索设备/站点/ID"
            />
            <Button
              onClick={() => {
                setKeyword("");
                setStatusFilter("all");
              }}
            >
              重置
            </Button>
          </div>
          <Table<(typeof rows)[number]>
            rowKey="deviceId"
            dataSource={rows}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: "设备",
                dataIndex: "deviceName",
                render: (_: unknown, row) => (
                  <div>
                    <div style={{ fontWeight: 700, color: "rgba(226,232,240,0.96)" }}>{row.deviceName}</div>
                    <div style={{ fontSize: 12, color: "rgba(148,163,184,0.9)" }}>{row.stationName}</div>
                  </div>
                )
              },
              {
                title: "状态",
                dataIndex: "baseline",
                render: (baseline?: Baseline) => baselineStatusTag(baseline?.status ?? "missing")
              },
              {
                title: "基线坐标",
                dataIndex: "baseline",
                render: (baseline?: Baseline) =>
                  baseline ? (
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {baseline.baselineLat.toFixed(6)}, {baseline.baselineLng.toFixed(6)}
                    </span>
                  ) : (
                    <span style={{ color: "rgba(148,163,184,0.9)" }}>-</span>
                  )
              },
              {
                title: "高程",
                dataIndex: "baseline",
                width: 100,
                render: (baseline?: Baseline) =>
                  baseline?.baselineAlt !== undefined ? (
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {baseline.baselineAlt.toFixed(2)} m
                    </span>
                  ) : (
                    <span style={{ color: "rgba(148,163,184,0.9)" }}>-</span>
                  )
              },
              {
                title: "建立时间",
                dataIndex: "baseline",
                render: (baseline?: Baseline) =>
                  baseline ? dayjs(baseline.establishedTime).format("YYYY-MM-DD HH:mm") : <span style={{ color: "rgba(148,163,184,0.9)" }}>-</span>
              },
              {
                title: "备注",
                dataIndex: "baseline",
                ellipsis: true,
                render: (baseline?: Baseline) =>
                  baseline?.notes ? <span title={baseline.notes}>{baseline.notes}</span> : <span style={{ color: "rgba(148,163,184,0.9)" }}>-</span>
              },
              {
                title: "操作",
                key: "actions",
                render: (_: unknown, row) => {
                  const has = !!row.baseline;
                  return (
                    <Space>
                      <Button
                        size="small"
                        onClick={() => {
                          navigate(`/app/device-management?tab=status&deviceId=${encodeURIComponent(row.deviceId)}`);
                        }}
                      >
                        设备
                      </Button>
                      <Button
                        size="small"
                        onClick={() => {
                          navigate(`/app/gps-monitoring?deviceId=${encodeURIComponent(row.deviceId)}`);
                        }}
                      >
                        GPS
                      </Button>
                      <Button
                        size="small"
                        onClick={() => {
                          if (row.baseline) openEdit(row.baseline);
                          else openCreate(row.deviceId);
                        }}
                      >
                        {has ? "编辑" : "设置"}
                      </Button>
                      <Button
                        size="small"
                        loading={autoingDeviceId === row.deviceId}
                        onClick={() => {
                          Modal.confirm({
                            title: "自动建立基线",
                            content: `将对设备「${row.deviceName}」执行自动基线建立（演示版）。`,
                            okText: "开始",
                            cancelText: "取消",
                            onOk: () => {
                              setAutoingDeviceId(row.deviceId);
                              return api.baselines
                                .autoEstablish({ deviceId: row.deviceId })
                                .then((b) => {
                                  setBaselines((prev) => {
                                    const idx = prev.findIndex((x) => x.deviceId === b.deviceId);
                                    if (idx >= 0) return prev.map((x) => (x.deviceId === b.deviceId ? b : x));
                                    return [...prev, b];
                                  });
                                  message.success("已自动建立基线");
                                })
                                .catch((err: unknown) => {
                                  message.error((err as Error).message);
                                })
                                .finally(() => {
                                  setAutoingDeviceId("");
                                });
                            }
                          });
                        }}
                      >
                        自动
                      </Button>
                      <Popconfirm
                        title="确认删除该基线？"
                        okText="删除"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => {
                          void api.baselines
                            .remove({ deviceId: row.deviceId })
                            .then(() => {
                              setBaselines((prev) => prev.filter((x) => x.deviceId !== row.deviceId));
                              message.success("已删除");
                            })
                            .catch((err: unknown) => {
                              message.error((err as Error).message);
                            });
                        }}
                      >
                        <Button size="small" danger disabled={!has}>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  );
                }
              }
            ]}
          />
        </div>
      )}

      <Modal
        title={edit.open && edit.mode === "edit" ? "编辑基线" : "新建基线"}
        open={edit.open}
        onCancel={() => {
          setEdit({ open: false });
        }}
        onOk={() => {
          void handleSave();
        }}
        okText="保存"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="deviceId" label="设备" rules={[{ required: true }]}>
            <Select
              disabled={edit.open && edit.mode === "edit"}
              placeholder="请选择 GNSS 设备"
              options={devices.map((d) => ({ label: `${d.name}（${d.stationName}）`, value: d.id }))}
            />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="baselineLat" label="纬度" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} precision={6} placeholder="例如 30.123456" />
            </Form.Item>
            <Form.Item name="baselineLng" label="经度" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} precision={6} placeholder="例如 104.123456" />
            </Form.Item>
          </div>
          <Form.Item name="baselineAlt" label="高程（m）">
            <InputNumber style={{ width: "100%" }} precision={2} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "已建立", value: "active" },
                { label: "草稿", value: "draft" }
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="可填写测量时长、精度等备注" />
          </Form.Item>
        </Form>
      </Modal>
    </BaseCard>
  );
}
