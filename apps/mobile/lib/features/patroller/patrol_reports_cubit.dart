import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/dto/patrol_report.dart';
import '../../data/repositories/patrol_repository.dart';

class PatrolReportsState {
  const PatrolReportsState({
    this.isLoading = false,
    this.isSubmitting = false,
    this.reports = const [],
    this.errorMessage,
  });

  final bool isLoading;
  final bool isSubmitting;
  final List<PatrolReport> reports;
  final String? errorMessage;

  PatrolReportsState copyWith({
    bool? isLoading,
    bool? isSubmitting,
    List<PatrolReport>? reports,
    String? errorMessage,
  }) {
    return PatrolReportsState(
      isLoading: isLoading ?? this.isLoading,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      reports: reports ?? this.reports,
      errorMessage: errorMessage,
    );
  }
}

class PatrolReportsCubit extends Cubit<PatrolReportsState> {
  PatrolReportsCubit(this._repository) : super(const PatrolReportsState());

  final PatrolRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(isLoading: true, errorMessage: null));
    try {
      final reports = await _repository.fetchRecentReports();
      emit(state.copyWith(isLoading: false, reports: reports));
    } catch (error) {
      emit(
        state.copyWith(isLoading: false, errorMessage: _errorMessage(error)),
      );
    }
  }

  Future<PatrolReport?> createQuickReport() async {
    emit(state.copyWith(isSubmitting: true, errorMessage: null));
    try {
      final report = await _repository.createQuickReport();
      final updated = [report, ...state.reports];
      final trimmed = updated.length > 3 ? updated.sublist(0, 3) : updated;
      emit(state.copyWith(isSubmitting: false, reports: trimmed));
      return report;
    } catch (error) {
      emit(
        state.copyWith(isSubmitting: false, errorMessage: _errorMessage(error)),
      );
      return null;
    }
  }

  String _errorMessage(Object error) {
    if (error is DioException) {
      return error.message ?? 'Network error';
    }
    return error.toString();
  }
}
