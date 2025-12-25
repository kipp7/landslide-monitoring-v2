class AMapConfig {
  static const String androidKey = String.fromEnvironment(
    'AMAP_ANDROID_KEY',
    defaultValue: '',
  );

  static const List<String> subdomains = ['1', '2', '3', '4'];

  static String get tileUrlTemplate =>
      'https://webrd0{s}.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}&lang=zh_cn&size=1&scale=1&key=$androidKey';

  static bool get hasKey => androidKey.isNotEmpty;
}
