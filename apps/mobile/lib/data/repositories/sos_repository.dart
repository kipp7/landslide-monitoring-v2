import '../dto/sos_ticket.dart';
import '../mobile_api.dart';

class SosRepository {
  SosRepository(this._api);

  final MobileApi _api;

  Future<SosTicket> createSos({
    required double latitude,
    required double longitude,
    String? description,
    String? address,
    String? contactName,
    String? contactPhone,
    String priority = 'normal',
  }) async {
    final response = await _api.createSos(
      latitude: latitude,
      longitude: longitude,
      description: description,
      address: address,
      contactName: contactName,
      contactPhone: contactPhone,
      priority: priority,
      metadata: const {'source': 'mobile'},
    );
    final data = _unwrapData(response);
    return SosTicket.fromJson(data);
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
