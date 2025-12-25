import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/dto/patrol_report.dart';
import '../../data/repositories/patrol_repository.dart';
import 'patrol_reports_cubit.dart';

class PatrollerHomePage extends StatelessWidget {
  const PatrollerHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) =>
          PatrolReportsCubit(context.read<PatrolRepository>())..load(),
      child: const _PatrollerHomeView(),
    );
  }
}

class _PatrollerHomeView extends StatelessWidget {
  const _PatrollerHomeView();

  Future<void> _handleCreateReport(BuildContext context) async {
    final report = await context.read<PatrolReportsCubit>().createQuickReport();
    if (!context.mounted) return;
    if (report == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('上报失败，请稍后重试。')));
      return;
    }
    final reportId = report.reportId;
    final shortId = reportId.length > 8 ? reportId.substring(0, 8) : reportId;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('已提交上报：$shortId')));
  }

  void _notImplemented(BuildContext context, String label) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$label（暂未接入）')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            const SliverToBoxAdapter(child: _Header()),
            const SliverToBoxAdapter(
              child: _SectionTitle(title: '待办巡查点', action: '更多 >'),
            ),
            const SliverToBoxAdapter(child: _TaskCarousel()),
            const SliverToBoxAdapter(child: _SectionTitle(title: '功能入口')),
            SliverToBoxAdapter(
              child: BlocBuilder<PatrolReportsCubit, PatrolReportsState>(
                buildWhen: (previous, current) =>
                    previous.isSubmitting != current.isSubmitting,
                builder: (context, state) {
                  return _ActionGrid(
                    isSubmitting: state.isSubmitting,
                    onQuickReport: state.isSubmitting
                        ? null
                        : () => _handleCreateReport(context),
                    onForm: () => _notImplemented(context, '填写表单'),
                    onCheckIn: () => _notImplemented(context, '位置打卡'),
                    onVoice: () => _notImplemented(context, '语音记录'),
                  );
                },
              ),
            ),
            const SliverToBoxAdapter(child: _SectionTitle(title: '最近上报记录')),
            SliverToBoxAdapter(
              child: BlocBuilder<PatrolReportsCubit, PatrolReportsState>(
                builder: (context, state) {
                  return _RecentList(
                    reports: state.reports,
                    isLoading: state.isLoading,
                    errorMessage: state.errorMessage,
                  );
                },
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF006064),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: Colors.white,
                child: Icon(Icons.person, color: Color(0xFF006064)),
              ),
              SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '李巡查员',
                    style: TextStyle(color: Colors.white, fontSize: 16),
                  ),
                  SizedBox(height: 4),
                  Text(
                    '今日任务：3/8 已完成',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: const LinearProgressIndicator(
              value: 0.4,
              minHeight: 6,
              backgroundColor: Color(0xFF004C54),
              valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF69F0AE)),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.action});

  final String title;
  final String? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          if (action != null)
            Text(
              action!,
              style: const TextStyle(color: Colors.black54, fontSize: 12),
            ),
        ],
      ),
    );
  }
}

class _TaskCarousel extends StatelessWidget {
  const _TaskCarousel();

  @override
  Widget build(BuildContext context) {
    final tasks = const [
      _TaskCardData(title: '北坡监测点A', subtitle: '今日必巡'),
      _TaskCardData(title: '后山裂缝点B', subtitle: '高风险'),
      _TaskCardData(title: '河道位移点C', subtitle: '常规巡检'),
    ];

    return SizedBox(
      height: 180,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemBuilder: (context, index) => _TaskCard(data: tasks[index]),
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemCount: tasks.length,
      ),
    );
  }
}

class _TaskCardData {
  const _TaskCardData({required this.title, required this.subtitle});

  final String title;
  final String subtitle;
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.data});

  final _TaskCardData data;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x11000000),
            blurRadius: 10,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              child: Container(
                color: const Color(0xFFE0F2F1),
                child: const Center(
                  child: Icon(
                    Icons.terrain,
                    color: Color(0xFF006064),
                    size: 44,
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  data.title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  data.subtitle,
                  style: const TextStyle(color: Colors.black54, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({
    required this.isSubmitting,
    required this.onQuickReport,
    required this.onForm,
    required this.onCheckIn,
    required this.onVoice,
  });

  final bool isSubmitting;
  final VoidCallback? onQuickReport;
  final VoidCallback onForm;
  final VoidCallback onCheckIn;
  final VoidCallback onVoice;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.3,
        children: [
          _ActionTile(
            label: isSubmitting ? '提交中…' : '拍照上报',
            icon: Icons.photo_camera,
            background: const Color(0xFF006064),
            foreground: Colors.white,
            onTap: onQuickReport,
          ),
          _ActionTile(
            label: '填写表单',
            icon: Icons.assignment,
            background: Colors.white,
            foreground: const Color(0xFF006064),
            onTap: onForm,
          ),
          _ActionTile(
            label: '位置打卡',
            icon: Icons.location_on,
            background: Colors.white,
            foreground: const Color(0xFF006064),
            onTap: onCheckIn,
          ),
          _ActionTile(
            label: '语音记录',
            icon: Icons.mic,
            background: const Color(0xFF006064),
            foreground: Colors.white,
            onTap: onVoice,
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.label,
    required this.icon,
    required this.background,
    required this.foreground,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color background;
  final Color foreground;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [
            BoxShadow(
              color: Color(0x11000000),
              blurRadius: 10,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: foreground, size: 32),
              const SizedBox(height: 10),
              Text(label, style: TextStyle(color: foreground, fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentList extends StatelessWidget {
  const _RecentList({
    required this.reports,
    required this.isLoading,
    required this.errorMessage,
  });

  final List<PatrolReport> reports;
  final bool isLoading;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    if (isLoading && reports.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (errorMessage != null && reports.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: _HintCard(
          icon: Icons.error_outline,
          color: Colors.redAccent,
          message: errorMessage!,
        ),
      );
    }

    if (reports.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16),
        child: _HintCard(
          icon: Icons.info_outline,
          color: Colors.teal,
          message: '暂无上报记录',
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemBuilder: (context, index) {
        final report = reports[index];
        return _ReportRow(report: report);
      },
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemCount: reports.length,
    );
  }
}

class _ReportRow extends StatelessWidget {
  const _ReportRow({required this.report});

  final PatrolReport report;

  Color _statusColor(String status) {
    switch (status) {
      case 'reviewed':
        return Colors.green;
      case 'archived':
        return Colors.grey;
      case 'submitted':
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            color: Color(0x11000000),
            blurRadius: 8,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  report.displayTitle,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                if (report.notes.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    report.notes,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: _statusColor(report.status),
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}

class _HintCard extends StatelessWidget {
  const _HintCard({
    required this.icon,
    required this.color,
    required this.message,
  });

  final IconData icon;
  final Color color;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            color: Color(0x11000000),
            blurRadius: 8,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: TextStyle(color: color, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
