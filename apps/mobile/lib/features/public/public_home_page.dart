import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/repositories/sos_repository.dart';
import 'sos_cubit.dart';

class PublicHomePage extends StatelessWidget {
  const PublicHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => SosCubit(context.read<SosRepository>()),
      child: const _PublicHomeView(),
    );
  }
}

class _PublicHomeView extends StatelessWidget {
  const _PublicHomeView();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<SosCubit, SosState>(
      listenWhen: (previous, current) => previous.status != current.status,
      listener: (context, state) {
        if (state.status == SosStatus.success && state.sosId != null) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('求救已发送：${state.sosId}')));
        }
        if (state.status == SosStatus.failure && state.errorMessage != null) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(state.errorMessage!)));
        }
      },
      builder: (context, state) {
        return Scaffold(
          backgroundColor: const Color(0xFFFFFFFF),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  const _StatusCard(),
                  const SizedBox(height: 16),
                  const Expanded(child: _MapPlaceholder()),
                  const SizedBox(height: 16),
                  _SosButton(
                    isSending: state.status == SosStatus.sending,
                    onTap: () => context.read<SosCubit>().sendSos(),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 160,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFA5D6A7), Color(0xFF4CAF50)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.verified_user, color: Colors.white, size: 48),
            SizedBox(height: 12),
            Text(
              '当前区域安全',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 6),
            Text(
              '如遇险情请立即一键求救',
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapPlaceholder extends StatelessWidget {
  const _MapPlaceholder();

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(color: Color(0xFFF5F5F5)),
            child: CustomPaint(painter: _GridPainter(), size: Size.infinite),
          ),
          Align(
            alignment: const Alignment(-0.1, -0.1),
            child: Container(
              width: 200,
              height: 200,
              decoration: const BoxDecoration(
                color: Color(0x664CAF50),
                shape: BoxShape.circle,
              ),
            ),
          ),
          CustomPaint(painter: _RoutePainter(), size: Size.infinite),
          const Positioned(
            left: 120,
            top: 110,
            child: _Marker(
              color: Color(0xFF2196F3),
              icon: Icons.person_pin_circle,
            ),
          ),
          const Positioned(
            right: 80,
            top: 90,
            child: _Marker(color: Color(0xFF4CAF50), icon: Icons.home),
          ),
        ],
      ),
    );
  }
}

class _Marker extends StatelessWidget {
  const _Marker({required this.color, required this.icon});

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 18,
      backgroundColor: color,
      child: Icon(icon, size: 20, color: Colors.white),
    );
  }
}

class _SosButton extends StatefulWidget {
  const _SosButton({required this.isSending, required this.onTap});

  final bool isSending;
  final VoidCallback onTap;

  @override
  State<_SosButton> createState() => _SosButtonState();
}

class _SosButtonState extends State<_SosButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
    _pulse = Tween<double>(
      begin: 0.9,
      end: 1.05,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        return Transform.scale(scale: _pulse.value, child: child);
      },
      child: GestureDetector(
        onTap: widget.isSending ? null : widget.onTap,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              height: 120,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFE53935), Color(0xFFFF5252)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x59E53935),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.phone_in_talk, color: Colors.white, size: 28),
                  SizedBox(width: 12),
                  Text(
                    '一键 SOS 求救',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            if (widget.isSending)
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    color: Color(0x33000000),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: const Center(
                    child: SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 3,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x1A000000)
      ..strokeWidth = 1;
    const gap = 40.0;
    for (double x = 0; x <= size.width; x += gap) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y <= size.height; y += gap) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RoutePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final start = const Offset(140, 130);
    final end = Offset(size.width - 95, 110);
    final path = Path()
      ..moveTo(start.dx, start.dy)
      ..quadraticBezierTo(
        (start.dx + end.dx) / 2,
        start.dy - 40,
        end.dx,
        end.dy,
      );
    final paint = Paint()
      ..color = const Color(0xFF2E7D32)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawPath(path, paint);

    final arrow = Paint()
      ..color = const Color(0xFF2E7D32)
      ..style = PaintingStyle.fill;
    final angle = math.atan2(
      end.dy - (start.dy - 40),
      end.dx - ((start.dx + end.dx) / 2),
    );
    const arrowSize = 6.0;
    final arrowPath = Path()
      ..moveTo(end.dx, end.dy)
      ..lineTo(
        end.dx - arrowSize * math.cos(angle - 0.6),
        end.dy - arrowSize * math.sin(angle - 0.6),
      )
      ..lineTo(
        end.dx - arrowSize * math.cos(angle + 0.6),
        end.dy - arrowSize * math.sin(angle + 0.6),
      )
      ..close();
    canvas.drawPath(arrowPath, arrow);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
