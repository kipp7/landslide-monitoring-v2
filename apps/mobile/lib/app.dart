import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'data/api_client.dart';
import 'data/mobile_api.dart';
import 'data/repositories/patrol_repository.dart';
import 'data/repositories/sos_repository.dart';
import 'routes/app_router.dart';

class App extends StatelessWidget {
  const App({super.key});

  static final _router = AppRouter.router;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<ApiClient>(create: (_) => ApiClient()),
        RepositoryProvider<MobileApi>(
          create: (context) => MobileApi(context.read<ApiClient>()),
        ),
        RepositoryProvider<PatrolRepository>(
          create: (context) => PatrolRepository(context.read<MobileApi>()),
        ),
        RepositoryProvider<SosRepository>(
          create: (context) => SosRepository(context.read<MobileApi>()),
        ),
      ],
      child: MaterialApp.router(
        title: 'Landslide Monitoring',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1E5B7A)),
          useMaterial3: true,
        ),
        routerConfig: _router,
      ),
    );
  }
}
