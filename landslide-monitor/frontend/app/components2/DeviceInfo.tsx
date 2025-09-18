// 在 DeviceInfo.tsx 中正确导入 DeviceInfo 类型
import { DeviceInfo } from '../components2/types'; // 假设 types.ts 定义了 DeviceInfo 类型
const DeviceDetail = ({ data }: { data: DeviceInfo }) => (
  <div>
    <p>Name: {data.name}</p>
    <p>Type: {data.type}</p>
    <p>Status: {data.status}</p>
  </div>
);

export default DeviceDetail;