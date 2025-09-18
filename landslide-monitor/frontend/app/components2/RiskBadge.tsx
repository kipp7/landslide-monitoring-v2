// RiskBadge.tsx
interface RiskBadgeProps {
    risk: number; // 滑坡风险值
}

const RiskBadge: React.FC<RiskBadgeProps> = ({ risk }) => {
    let colorClass = 'bg-green-500'; // 默认颜色

    if (risk > 50) {
    colorClass = 'bg-red-500'; // 高风险
    } else if (risk > 20) {
    colorClass = 'bg-yellow-500'; // 中风险
    }

    return (
    <span className={`text-white px-2 py-1 rounded-full text-sm ${colorClass}`}>
        {risk}%
    </span>
    );
};

export default RiskBadge;