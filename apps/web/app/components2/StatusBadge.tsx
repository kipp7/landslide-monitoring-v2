// components2/StatusBadge.tsx
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';

interface StatusBadgeProps {
    status: 'normal' | 'warning' | 'error';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
    const getStatusColor = () => {
    switch (status) {
        case 'normal':
        return 'bg-green-500';
        case 'warning':
        return 'bg-yellow-500';
        case 'error':
        return 'bg-red-500';
        default:
        return 'bg-gray-500';
    }
    };

    const getIcon = () => {
    switch (status) {
        case 'normal':
        return <CheckCircleOutlined className="text-white" />;
        case 'warning':
        return <WarningOutlined className="text-white" />;
        case 'error':
        return <CloseCircleOutlined className="text-white" />;
        default:
        return null;
    }
    };

    return (
    <div className={`flex items-center justify-center rounded-full w-6 h-6 ${getStatusColor()}`}>
        {getIcon()}
    </div>
    );
};

export default StatusBadge;