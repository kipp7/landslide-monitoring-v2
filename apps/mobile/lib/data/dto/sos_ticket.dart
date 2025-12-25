class SosTicket {
  SosTicket({
    required this.sosId,
    required this.status,
    required this.priority,
    this.createdAt,
  });

  final String sosId;
  final String status;
  final String priority;
  final String? createdAt;

  factory SosTicket.fromJson(Map<String, dynamic> json) {
    return SosTicket(
      sosId: json['sosId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'open',
      priority: json['priority']?.toString() ?? 'normal',
      createdAt: json['createdAt']?.toString(),
    );
  }
}
