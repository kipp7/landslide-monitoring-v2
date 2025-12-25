import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../config/amap_config.dart';

class StationMapPage extends StatelessWidget {
  const StationMapPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('站点地图')),
      body: Stack(
        children: [
          FlutterMap(
            options: const MapOptions(
              initialCenter: LatLng(30.274084, 120.15507),
              initialZoom: 10,
            ),
            children: [
              TileLayer(
                urlTemplate: AMapConfig.tileUrlTemplate,
                subdomains: AMapConfig.subdomains,
                userAgentPackageName: 'com.landslide.monitoring.mobile',
              ),
              const MarkerLayer(markers: []),
            ],
          ),
          if (!AMapConfig.hasKey)
            const Positioned(
              left: 16,
              right: 16,
              top: 16,
              child: Card(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    '缺少高德 Key：请用 --dart-define=AMAP_ANDROID_KEY=your_key 运行。',
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
