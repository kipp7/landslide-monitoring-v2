import 'package:dio/dio.dart';

import '../config/api_config.dart';

class ApiClient {
  ApiClient({String? baseUrl})
    : _dio = Dio(BaseOptions(baseUrl: baseUrl ?? ApiConfig.baseUrl));

  final Dio _dio;

  Dio get dio => _dio;

  void setToken(String? token) {
    if (token == null || token.isEmpty) {
      _dio.options.headers.remove('Authorization');
      return;
    }
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }
}
