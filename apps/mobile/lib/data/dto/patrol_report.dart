class PatrolReport {
  PatrolReport({
    required this.reportId,
    required this.status,
    required this.notes,
    this.stationName,
    this.stationCode,
    this.createdAt,
  });

  final String reportId;
  final String status;
  final String notes;
  final String? stationName;
  final String? stationCode;
  final String? createdAt;

  factory PatrolReport.fromJson(Map<String, dynamic> json) {
    return PatrolReport(
      reportId: json['reportId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'submitted',
      notes: json['notes']?.toString() ?? '',
      stationName: json['stationName']?.toString(),
      stationCode: json['stationCode']?.toString(),
      createdAt: json['createdAt']?.toString(),
    );
  }

  String get displayTitle {
    if (stationName != null && stationName!.isNotEmpty) {
      return stationName!;
    }
    if (stationCode != null && stationCode!.isNotEmpty) {
      return stationCode!;
    }
    return '未知站点';
  }
}
