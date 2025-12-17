# Bloc 模式说明

## Bloc 架构

```
┌─────────────┐     Event     ┌─────────────┐     State     ┌─────────────┐
│     UI      │ ───────────▶  │    Bloc     │ ───────────▶  │     UI      │
│   (Widget)  │               │  (Business) │               │   (Rebuild) │
└─────────────┘               └─────────────┘               └─────────────┘
                                    │
                                    ▼
                              ┌─────────────┐
                              │ Repository  │
                              └─────────────┘
```

## 示例：设备列表模块

### 1. Event（事件）

```dart
// device_event.dart
abstract class DeviceEvent {}

class LoadDevices extends DeviceEvent {
  final int page;
  final String? keyword;
  final String? status;
  
  LoadDevices({this.page = 1, this.keyword, this.status});
}

class RefreshDevices extends DeviceEvent {}

class DeleteDevice extends DeviceEvent {
  final int deviceId;
  DeleteDevice(this.deviceId);
}
```

### 2. State（状态）

```dart
// device_state.dart
abstract class DeviceState {}

class DeviceInitial extends DeviceState {}

class DeviceLoading extends DeviceState {}

class DeviceLoaded extends DeviceState {
  final List<Device> devices;
  final Pagination pagination;
  
  DeviceLoaded({required this.devices, required this.pagination});
}

class DeviceError extends DeviceState {
  final String message;
  DeviceError(this.message);
}
```

### 3. Bloc（业务逻辑）

```dart
// device_bloc.dart
class DeviceBloc extends Bloc<DeviceEvent, DeviceState> {
  final DeviceRepository repository;
  
  DeviceBloc({required this.repository}) : super(DeviceInitial()) {
    on<LoadDevices>(_onLoadDevices);
    on<RefreshDevices>(_onRefreshDevices);
    on<DeleteDevice>(_onDeleteDevice);
  }
  
  Future<void> _onLoadDevices(
    LoadDevices event,
    Emitter<DeviceState> emit,
  ) async {
    emit(DeviceLoading());
    try {
      final result = await repository.getDevices(
        page: event.page,
        keyword: event.keyword,
        status: event.status,
      );
      emit(DeviceLoaded(
        devices: result.list,
        pagination: result.pagination,
      ));
    } catch (e) {
      emit(DeviceError(e.toString()));
    }
  }
}
```

### 4. UI（界面）

```dart
// device_list_page.dart
class DeviceListPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => DeviceBloc(
        repository: context.read<DeviceRepository>(),
      )..add(LoadDevices()),
      child: BlocBuilder<DeviceBloc, DeviceState>(
        builder: (context, state) {
          if (state is DeviceLoading) {
            return LoadingWidget();
          }
          if (state is DeviceError) {
            return ErrorWidget(message: state.message);
          }
          if (state is DeviceLoaded) {
            return DeviceListView(devices: state.devices);
          }
          return SizedBox.shrink();
        },
      ),
    );
  }
}
```

## 优点

1. **单向数据流** - 数据流向清晰，易于追踪
2. **可测试性** - 每个组件可独立测试
3. **可维护性** - 业务逻辑与 UI 分离
4. **可扩展性** - 新功能易于添加
