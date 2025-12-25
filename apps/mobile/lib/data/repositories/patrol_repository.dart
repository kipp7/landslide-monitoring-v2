import '../dto/patrol_report.dart';
import '../mobile_api.dart';

class PatrolRepository {
  PatrolRepository(this._api);

  final MobileApi _api;

  Future<List<PatrolReport>> fetchRecentReports({int pageSize = 3}) async {
    final response = await _api.listPatrolReports(page: 1, pageSize: pageSize);
    final data = _unwrapData(response);
    final list = data['list'];
    if (list is List) {
      return list
          .whereType<Map>()
          .map((item) => PatrolReport.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    return [];
  }

  Future<PatrolReport> createQuickReport({String? notes}) async {
    final response = await _api.createPatrolReport(
      notes: notes ?? 'Quick report from mobile.',
      metadata: const {'source': 'mobile'},
    );
    final data = _unwrapData(response);
    return PatrolReport.fromJson(data);
  }

  Map<String, dynamic> _unwrapData(Map<String, dynamic> response) {
    if (response['success'] == true) {
      final data = response['data'];
      if (data is Map) {
        return Map<String, dynamic>.from(data);
      }
      throw Exception('Invalid response data');
    }
    final message = response['message']?.toString();
    throw Exception(message ?? 'Request failed');
  }
}
