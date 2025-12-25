import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/repositories/sos_repository.dart';

enum SosStatus { idle, sending, success, failure }

class SosState {
  const SosState({this.status = SosStatus.idle, this.sosId, this.errorMessage});

  final SosStatus status;
  final String? sosId;
  final String? errorMessage;

  SosState copyWith({SosStatus? status, String? sosId, String? errorMessage}) {
    return SosState(
      status: status ?? this.status,
      sosId: sosId,
      errorMessage: errorMessage,
    );
  }
}

class SosCubit extends Cubit<SosState> {
  SosCubit(this._repository) : super(const SosState());

  final SosRepository _repository;

  static const double _fallbackLatitude = 30.274084;
  static const double _fallbackLongitude = 120.15507;

  Future<void> sendSos() async {
    emit(
      state.copyWith(
        status: SosStatus.sending,
        errorMessage: null,
        sosId: null,
      ),
    );
    try {
      final ticket = await _repository.createSos(
        latitude: _fallbackLatitude,
        longitude: _fallbackLongitude,
        description: '移动端一键求救（示例）。',
        priority: 'high',
        contactName: '匿名用户',
      );
      emit(state.copyWith(status: SosStatus.success, sosId: ticket.sosId));
    } catch (error) {
      emit(
        state.copyWith(
          status: SosStatus.failure,
          errorMessage: _errorMessage(error),
        ),
      );
    }
  }

  String _errorMessage(Object error) {
    if (error is DioException) {
      return error.message ?? 'Network error';
    }
    return error.toString();
  }
}
