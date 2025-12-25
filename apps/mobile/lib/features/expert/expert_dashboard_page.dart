import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class ExpertDashboardPage extends StatefulWidget {
  const ExpertDashboardPage({super.key});

  @override
  State<ExpertDashboardPage> createState() => _ExpertDashboardPageState();
}

class _ExpertDashboardPageState extends State<ExpertDashboardPage> {
  double levelOne = 10;
  double levelTwo = 20;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: ThemeData.dark(),
      child: Scaffold(
        backgroundColor: const Color(0xFF121212),
        appBar: AppBar(
          title: const Text('监测总台'),
          actions: [
            IconButton(onPressed: () {}, icon: const Icon(Icons.settings)),
          ],
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StatusBanner(),
              const SizedBox(height: 12),
              _MetricRow(),
              const SizedBox(height: 16),
              _ChartCard(),
              const SizedBox(height: 16),
              _ThresholdCard(
                title: '一级预警阈值设置',
                value: levelOne,
                onChanged: (next) => setState(() => levelOne = next),
              ),
              const SizedBox(height: 12),
              _ThresholdCard(
                title: '二级预警阈值设置',
                value: levelTwo,
                onChanged: (next) => setState(() => levelTwo = next),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, color: Color(0xFF69F0AE)),
          const SizedBox(width: 8),
          Text(
            '设备在线率: 98%',
            style: GoogleFonts.robotoMono(
              color: const Color(0xFF69F0AE),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: const [
        Expanded(
          child: _MetricCard(
            title: '深层累积位移',
            value: '+45.2mm',
            color: Color(0xFFFF5252),
          ),
        ),
        SizedBox(width: 12),
        Expanded(
          child: _MetricCard(
            title: '土壤饱和度',
            value: '85%',
            color: Color(0xFFFFAB40),
          ),
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.title,
    required this.value,
    required this.color,
  });

  final String title;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 8),
          Text(
            value,
            style: GoogleFonts.robotoMono(
              color: color,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('雨量-位移趋势', style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 12),
          SizedBox(
            height: 220,
            child: Stack(
              children: [BarChart(_barData()), LineChart(_lineData())],
            ),
          ),
        ],
      ),
    );
  }

  BarChartData _barData() {
    return BarChartData(
      gridData: const FlGridData(show: true, drawVerticalLine: false),
      titlesData: const FlTitlesData(show: false),
      borderData: FlBorderData(show: false),
      barGroups: List.generate(8, (index) {
        final value = (index * 30 + 40).toDouble();
        return BarChartGroupData(
          x: index,
          barRods: [
            BarChartRodData(
              toY: value,
              color: const Color(0xFF448AFF),
              width: 10,
              borderRadius: BorderRadius.circular(2),
            ),
          ],
        );
      }),
    );
  }

  LineChartData _lineData() {
    return LineChartData(
      gridData: const FlGridData(show: false),
      titlesData: const FlTitlesData(show: false),
      borderData: FlBorderData(show: false),
      minX: 0,
      maxX: 7,
      minY: 0,
      maxY: 200,
      lineBarsData: [
        LineChartBarData(
          spots: const [
            FlSpot(0, 20),
            FlSpot(1, 40),
            FlSpot(2, 60),
            FlSpot(3, 90),
            FlSpot(4, 120),
            FlSpot(5, 150),
            FlSpot(6, 170),
            FlSpot(7, 190),
          ],
          isCurved: true,
          color: const Color(0xFFFF5252),
          barWidth: 3,
          dotData: const FlDotData(show: false),
        ),
      ],
    );
  }
}

class _ThresholdCard extends StatelessWidget {
  const _ThresholdCard({
    required this.title,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Slider(
                  value: value,
                  min: 0,
                  max: 50,
                  activeColor: const Color(0xFF448AFF),
                  onChanged: onChanged,
                ),
              ),
              Container(
                width: 48,
                alignment: Alignment.center,
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFF2A2A2A),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  value.toStringAsFixed(0),
                  style: GoogleFonts.robotoMono(color: Colors.white),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
