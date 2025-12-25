import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('首页')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('快捷入口'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => context.go('/stations/map'),
            child: const Text('站点地图'),
          ),
          const SizedBox(height: 24),
          const Text('UI 预览'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => context.go('/ui/public'),
            child: const Text('公众版：首页'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () => context.go('/ui/patroller'),
            child: const Text('巡查版：任务工作台'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () => context.go('/ui/expert'),
            child: const Text('专家版：监测总台'),
          ),
        ],
      ),
    );
  }
}
