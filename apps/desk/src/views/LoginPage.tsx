import { Button, Card, ConfigProvider, Form, Input, Tabs, message, theme } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/ApiProvider";
import { useAuthStore } from "../stores/authStore";
import "./login.css";

export function LoginPage() {
  const api = useApi();
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

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

      <div className="desk-login-wrap">
        <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: "#1677ff" } }}>
          <Card
            className="desk-login-card"
            title={
              <div className="desk-login-title">
                <span>山体滑坡监测系统</span>
              </div>
            }
            variant="borderless"
            styles={{
              header: { borderBottom: "none", padding: "16px 24px" },
              body: { padding: 24 }
            }}
          >
            <Tabs
              centered
              defaultActiveKey="account"
              items={[
                {
                  key: "account",
                  label: "账号密码登录",
                  children: (
                    <Form
                      layout="vertical"
                      onFinish={(values: { username: string; password: string }) => {
                        void loginAccount(values);
                      }}
                    >
                      <Form.Item label="账号" name="username" rules={[{ required: true }]}>
                        <Input size="large" placeholder="请输入账号" />
                      </Form.Item>
                      <Form.Item label="密码" name="password" rules={[{ required: true }]}>
                        <Input.Password size="large" placeholder="请输入密码" />
                      </Form.Item>
                      <Form.Item style={{ marginBottom: 12 }}>
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
                      layout="vertical"
                      onFinish={(values: { mobile: string; code: string }) => {
                        void loginMobile(values);
                      }}
                    >
                      <Form.Item label="手机号" name="mobile" rules={[{ required: true }]}>
                        <Input size="large" placeholder="请输入手机号" />
                      </Form.Item>
                      <Form.Item label="验证码" name="code" rules={[{ required: true }]}>
                        <Input size="large" placeholder="请输入验证码" />
                      </Form.Item>
                      <Form.Item style={{ marginBottom: 12 }}>
                        <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
                          登录
                        </Button>
                      </Form.Item>
                    </Form>
                  )
                }
              ]}
            />

            <div className="desk-login-footer">
              <div className="desk-login-other">
                <span>其他登录方式：</span>
                <span className="desk-login-ico">卫星</span>
                <span className="desk-login-ico">手机</span>
                <span className="desk-login-ico">消息</span>
              </div>
              <a className="desk-login-link" href="#">
                注册账号
              </a>
            </div>
          </Card>
        </ConfigProvider>
      </div>
    </div>
  );
}
