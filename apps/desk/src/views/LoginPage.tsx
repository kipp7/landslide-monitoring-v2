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
        <div className="desk-login-hero">
          <div className="desk-login-brand">
            <div className="desk-login-logo" aria-hidden="true">
              <EnvironmentOutlined />
            </div>
            <div>
              <div className="desk-login-brand-name">山体滑坡监测系统</div>
              <div className="desk-login-brand-sub">Landslide Monitoring Platform</div>
            </div>
          </div>

          <div className="desk-login-hero-title">面向预警与处置的实时监测桌面端</div>
          <div className="desk-login-hero-desc">
            以监测站为核心，连接 GNSS、雨量、倾角、温湿度与视频，提供实时异常、趋势分析与预测入口（Mock 优先）。
          </div>

          <div className="desk-login-features">
            <div className="desk-login-feature">
              <RadarChartOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">形变趋势与预测</div>
                <div className="d">多时间尺度曲线、阈值与预测卡片。</div>
              </div>
            </div>
            <div className="desk-login-feature">
              <DesktopOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">设备管理中心</div>
                <div className="d">状态监控、站点管理、基线管理与控制面板。</div>
              </div>
            </div>
            <div className="desk-login-feature">
              <ApiOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">接口封装可替换</div>
                <div className="d">Mock / HTTP 一键切换，为后端联调预留。</div>
              </div>
            </div>
            <div className="desk-login-feature">
              <SafetyCertificateOutlined className="desk-login-feature-ico" />
              <div className="desk-login-feature-txt">
                <div className="t">更稳的交互与兜底</div>
                <div className="d">统一暗色主题、错误兜底与提示一致性。</div>
              </div>
            </div>
          </div>

          <div className="desk-login-hero-foot">
            <Tag color={apiMode === "mock" ? "blue" : "geekblue"}>{apiMode.toUpperCase()}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前为 UI 原型（浏览器预览），后续封装为 Windows 11 桌面端。
            </Typography.Text>
          </div>
        </div>

        <div className="desk-login-panel">
          <div className="desk-login-panel-head">
            <div className="desk-login-panel-title">欢迎回来</div>
            <div className="desk-login-panel-desc">登录以进入系统</div>
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
                  message.success("已填充演示账号");
                }}
              >
                填充演示账号
              </Button>
              <span className="desk-login-sep" aria-hidden="true" />
              <Button
                type="link"
                onClick={() => {
                  message.info("请联系管理员处理（Mock）");
                }}
              >
                忘记密码
              </Button>
              <span className="desk-login-sep" aria-hidden="true" />
              <Button
                type="link"
                onClick={() => {
                  message.info("可在系统设置中切换 Mock / HTTP（Mock 推荐）");
                }}
              >
                账号帮助
              </Button>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：Mock 模式下无需真实验证码；仅用于 UI 演示。
            </Typography.Text>
          </div>
        </div>
      </div>
    </div>
  );
}
