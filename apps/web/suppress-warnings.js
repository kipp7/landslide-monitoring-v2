// 抑制 Ant Design React 版本兼容性警告
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = function(...args) {
    // 过滤掉 Ant Design 兼容性警告
    if (args[0] && typeof args[0] === 'string' && 
        args[0].includes('antd: compatible') && 
        args[0].includes('React is 16 ~ 18')) {
      return; // 忽略这个警告
    }
    // 其他警告正常显示
    originalWarn.apply(console, args);
  };
}
