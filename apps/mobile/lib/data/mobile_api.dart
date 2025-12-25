import 'api_client.dart';

class MobileApi {
  MobileApi(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> listPatrolReports({
    int page = 1,
    int pageSize = 20,
    String? stationId,
    String? reporterId,
    String? status,
    String? startTime,
    String? endTime,
  }) async {
    final response = await _client.dio.get(
      '/patrol/reports',
      queryParameters: {
        'page': page,
        'pageSize': pageSize,
        if (stationId != null) 'stationId': stationId,
        if (reporterId != null) 'reporterId': reporterId,
        if (status != null) 'status': status,
        if (startTime != null) 'startTime': startTime,
        if (endTime != null) 'endTime': endTime,
      },
    );
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> getPatrolReport(String reportId) async {
    final response = await _client.dio.get('/patrol/reports/$reportId');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> createPatrolReport({
    String? stationId,
    String? taskId,
    String? notes,
    List<Map<String, dynamic>>? attachments,
    double? latitude,
    double? longitude,
    Map<String, dynamic>? metadata,
  }) async {
    final response = await _client.dio.post(
      '/patrol/reports',
      data: {
        if (stationId != null) 'stationId': stationId,
        if (taskId != null) 'taskId': taskId,
        if (notes != null) 'notes': notes,
        if (attachments != null) 'attachments': attachments,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (metadata != null) 'metadata': metadata,
      },
    );
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> createSos({
    required double latitude,
    required double longitude,
    String? description,
    String? address,
    String? contactName,
    String? contactPhone,
    String? priority,
    List<Map<String, dynamic>>? attachments,
    Map<String, dynamic>? metadata,
  }) async {
    final response = await _client.dio.post(
      '/sos',
      data: {
        'latitude': latitude,
        'longitude': longitude,
        if (description != null) 'description': description,
        if (address != null) 'address': address,
        if (contactName != null) 'contactName': contactName,
        if (contactPhone != null) 'contactPhone': contactPhone,
        if (priority != null) 'priority': priority,
        if (attachments != null) 'attachments': attachments,
        if (metadata != null) 'metadata': metadata,
      },
    );
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> getSos(String sosId) async {
    final response = await _client.dio.get('/sos/$sosId');
    return Map<String, dynamic>.from(response.data as Map);
  }
}
