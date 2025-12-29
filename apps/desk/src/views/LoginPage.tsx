import {
  ApiOutlined,
  DesktopOutlined,
  EnvironmentOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { App as AntApp, Button, Divider, Form, Input, Space, Tabs, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/ApiProvider";
import { TerrainBackdrop } from "../components/TerrainBackdrop";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import "./login.css";

export function LoginPage() {
  const api = useApi();
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const apiMode = useSettingsStore((s) => s.apiMode);
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [accountForm] = Form.useForm<{ username: string; password: string }>();
  const [mobileForm] = Form.useForm<{ mobile: string; code: string }>();

  const redirectTo = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from ?? "/app/home";
  }, [location.state]);

  useEffect(() => {
    if (token) navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo, token]);

  const loginAccount = async (input: { username: string; password: string }) => {
    setSubmitting(true);
    try {
      const res = await api.auth.login(input);
      setSession(res);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const loginMobile = async (input: { mobile: string; code: string }) => {
    setSubmitting(true);
    try {
      const res = await api.auth.login(input);
      setSession(res);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="desk-login">
      <img className="desk-login-bgimg" src="/images/landslide.png" alt="" />
      <div className="desk-login-orb orb-a" aria-hidden="true" />
      <div className="desk-login-orb orb-b" aria-hidden="true" />

      <div className="desk-login-shell">
        <div className="desk-login-terrain-card">
          <div className="desk-login-terrain-head">
            <div>
              <div className="desk-login-terrain-title">地形扫描</div>
              <div className="desk-login-terrain-sub">粒子点云 · 扫描中（演示）</div>
            </div>
            <Tag color="volcano">SCAN</Tag>
          </div>

          <div className="desk-login-terrain-view">
            <TerrainBackdrop className="desk-login-terrain-canvas" />
          </div>

          <div className="desk-login-terrain-foot">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：此区域为 UI 演示的地形扫描视图。
            </Typography.Text>
          </div>
        </div>

        <div className="desk-login-hero">
          <div className="desk-login-brand">
            <div className="desk-login-logo" aria-hidden="true">
              <EnvironmentOutlined />
            </div>
            <div>
              <div className="desk-login-brand-name">山体滑坡监测预警平台</div>
              <div className="desk-login-brand-sub">Landslide Monitoring & Early Warning</div>
            </div>
          </div>

          <div className="desk-login-hero-title">让风险可见，让预警更快</div>
          <div className="desk-login-hero-desc">
            汇聚 GNSS、雨量、倾角、温湿度与视频等多源数据，构建监测站态势总览、异常告警与趋势分析，支撑风险研判与处置决策。
          </div>

          <div className="desk-login-features">
            <div className="desk-login-feature">
              <RadarChartOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">趋势洞察</div>
                <div className="d">实时曲线、阈值分级与预测提示，快速发现变化。</div>
              </div>
            </div>
            <div className="desk-login-feature">
              <DesktopOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">运维管控</div>
                <div className="d">站点与设备统一管理，状态可追踪，问题可定位。</div>
              </div>
            </div>
            <div className="desk-login-feature">
              <ApiOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">可扩展对接</div>
                <div className="d">数据源可切换，接口封装统一，便于逐步联调上线。</div>
              </div>
            </div>
            <div className="desk-login-feature">
              <SafetyCertificateOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">稳定可信</div>
                <div className="d">统一交互规范与错误兜底，保障关键操作可控可用。</div>
              </div>
            </div>
          </div>

          <div className="desk-login-hero-foot">
            <Tag color={apiMode === "mock" ? "blue" : "geekblue"}>{apiMode === "mock" ? "演示环境" : "联调环境"}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前为预览版本；正式交付将提供 Windows 11 桌面端。
            </Typography.Text>
          </div>
        </div>

        <div className="desk-login-panel">
          <div className="desk-login-panel-head">
            <div className="desk-login-panel-title">登录控制台</div>
            <div className="desk-login-panel-desc">请输入账号信息以进入监测与预警控制台</div>
          </div>

          <Tabs
            centered
            defaultActiveKey="account"
            items={[
              {
                key: "account",
                label: "账号登录",
                children: (
                  <Form
                    form={accountForm}
                    layout="vertical"
                    onFinish={(values: { username: string; password: string }) => {
                      void loginAccount(values);
                    }}
                  >
                    <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
                      <Input size="large" placeholder="请输入账号" autoComplete="username" allowClear />
                    </Form.Item>
                    <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
                      <Input.Password size="large" placeholder="请输入密码" autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 8 }}>
                      <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                )
              },
              {
                key: "mobile",
                label: "手机号登录",
                children: (
                  <Form
                    form={mobileForm}
                    layout="vertical"
                    onFinish={(values: { mobile: string; code: string }) => {
                      void loginMobile(values);
                    }}
                  >
                    <Form.Item label="手机号" name="mobile" rules={[{ required: true, message: "请输入手机号" }]}>
                      <Input size="large" placeholder="请输入手机号" autoComplete="tel" allowClear />
                    </Form.Item>
                    <Form.Item label="验证码" name="code" rules={[{ required: true, message: "请输入验证码" }]}>
                      <Input size="large" placeholder="请输入验证码" autoComplete="one-time-code" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 8 }}>
                      <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                )
              }
            ]}
          />

          <Divider style={{ margin: "12px 0", borderColor: "rgba(148,163,184,0.18)" }} />

          <div className="desk-login-panel-foot">
            <Space size={10} wrap>
              <Button
                type="link"
                onClick={() => {
                  accountForm.setFieldsValue({ username: "admin", password: "admin" });
                  message.success("已填充体验账号");
                }}
              >
                快速体验
              </Button>
              <span className="desk-login-sep" aria-hidden="true" />
              <Button
                type="link"
                onClick={() => {
                  message.info("请联系管理员重置密码");
                }}
              >
                忘记密码
              </Button>
              <span className="desk-login-sep" aria-hidden="true" />
              <Button
                type="link"
                onClick={() => {
                  message.info("可在系统设置中切换演示/联调数据源");
                }}
              >
                登录帮助
              </Button>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：演示环境不校验真实验证码；正式环境以实际短信服务为准。
            </Typography.Text>
          </div>
        </div>
      </div>
    </div>
  );
}
