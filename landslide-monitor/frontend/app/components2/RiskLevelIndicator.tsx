// 风险等级指示器组件
const RiskLevelIndicator = ({ risk }: { risk: number }) => {
let colorClass = 'text-green-500';
if (risk > 50) {
    colorClass = 'text-red-500';
} else if (risk > 25) {
    colorClass = 'text-yellow-500';
}

return (
    <span className={`font-bold ${colorClass}`}>
    {risk >= 75 ? '高风险' : risk >= 25 ? '中风险' : '低风险'}
    </span>
);
};
export default RiskLevelIndicator;