import 'package:go_router/go_router.dart';

import '../features/auth/login_page.dart';
import '../features/expert/expert_dashboard_page.dart';
import '../features/home/home_page.dart';
import '../features/patroller/patroller_home_page.dart';
import '../features/public/public_home_page.dart';
import '../features/stations/station_map_page.dart';

class AppRouter {
  static final GoRouter router = GoRouter(
    initialLocation: '/login',
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      GoRoute(path: '/', builder: (context, state) => const HomePage()),
      GoRoute(
        path: '/ui/public',
        builder: (context, state) => const PublicHomePage(),
      ),
      GoRoute(
        path: '/ui/patroller',
        builder: (context, state) => const PatrollerHomePage(),
      ),
      GoRoute(
        path: '/ui/expert',
        builder: (context, state) => const ExpertDashboardPage(),
      ),
      GoRoute(
        path: '/stations/map',
        builder: (context, state) => const StationMapPage(),
      ),
    ],
  );
}
