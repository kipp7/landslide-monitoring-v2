// 定义 InfoItem 组件
const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center py-1">
    <span className="text-sm font-medium">{label}</span>
    <span className="text-sm">{value}</span>
  </div>
);

export default InfoItem;