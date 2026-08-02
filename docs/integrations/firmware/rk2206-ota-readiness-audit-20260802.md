---
title: rk2206-ota-readiness-audit-20260802
type: note
---

# RK2206 OTA readiness audit - 2026-08-02

## Executive decision

当前 A/B/C 节点不具备可用或可恢复的 OTA 能力，禁止向现有现场板发送固件写入或启动切换命令。现状只是构建系统包含通用 OpenHarmony HOTA 静态库和 RK2206 板级适配文件，不等于应用已接入 OTA，更不等于引导链支持安全回滚。

允许继续做离线设计、打包和可恢复样板验证。生产方向是先对一块可有线救援的样板完成 A/B 引导链，再通过一次有线迁移把正式板切换到 A/B 分区；迁移完成以后，正常 OTA 才可采用写入非活动槽、校验、设置 pending、软件重启、健康确认和自动回滚，全程不需要人工下电。

## Audited snapshot

- SDK: `F:\2\openharmony\txsmartropenharmony`
- Application source: `vendor/isoftstone/rk2206/samples/xl01_landslide_monitor_v1.1`
- Current `liteos.bin`: 457776 bytes, SHA-256 `d2ec96d82d0993282b71c288aa5f7770c411a307701c7a8862f88732ff4a1501`
- Current loader: 15280 bytes, SHA-256 `5c3639446066ba9a5d41c6b656562136b281267322da8724015bafdc22002985`
- RK2206 HOTA HAL: SHA-256 `089a14e62ad0e4730158deadd2d251d01e7758af7d415ee5a05bf172014d0a55`
- Generated `setting.ini`: SHA-256 `649673e29d8d81562529f242efe0c2cfc5efefd53f4a918eb92e6ba31f6fb3d1`
- Generic `libhota.a`: 22026 bytes; board adapter `libhal_update_static.a`: 5878 bytes
- The current application source has no exact `Hota*` call or HOTA header include. The final link map contains no `HotaInit`, `HotaWrite` or `HotaHalWrite` symbol even though both archives are listed by the build.

## Blocking findings

### 1. Board HOTA HAL reports success without performing the operation

`device/rockchip/rk2206/adapter/hals/update/hal_hota_board.c` is a placeholder:

- `HotaHalWrite` returns success without erasing or writing flash.
- `HotaHalRead` always fails.
- `HotaHalGetUpdateIndex` returns success without assigning the output index.
- `HotaHalSetBootSettings`, `HotaHalRestart` and `HotaHalRollback` return success without changing boot state, rebooting or rolling back.
- `HotaHalGetPartitionInfo` and `HotaHalGetPubKey` return `NULL`.
- Metadata getters/setters do not persist state.
- `HotaHalCheckVersionValid` accepts every version, including downgrade or replay.
- `HotaHalIsDevelopMode` is declared and called by the generic framework but has no RK2206 implementation.

This is fail-open behavior. A caller could receive success while no firmware was written and no reboot occurred. It must be replaced with fail-closed, tested board code before any OTA command is exposed.

### 2. Both generic package paths are unsafe with the current HAL

- Default-package mode stores the `NULL` partition table during `HotaInit`; later component lookup iterates `g_otaComponents[i]` and can dereference it.
- Custom-package mode directly forwards `HotaWrite` to the fake board write function. The framework documentation explicitly leaves integrity verification to the caller in this mode, but the current application has no such implementation.
- The public key is `NULL`, so the default signature verifier has no board trust anchor.

Changing only the application command parser cannot make this safe.

### 3. Current production image is single-slot

The generated packer configuration has an empty `Backup_Partition_Enable` and only one `liteos` partition. The current 8 MiB flash layout is:

| Partition | Range | Size |
| --- | ---: | ---: |
| system | `0x000000-0x010000` | 64 KiB |
| loader | `0x010000-0x020000` | 64 KiB |
| liteos | `0x020000-0x200000` | 1.875 MiB |
| rootfs | `0x200000-0x600000` | 4 MiB |
| userfs | `0x600000-0x800000` | 2 MiB |

Writing the only running image has no known power-loss recovery path. Existing A/B/C release images therefore remain non-OTA images.

### 4. Loader strings show a possibility, not an accepted feature

`rk2206_loader.bin` contains `Boot FW1`, `Boot FW2` and `No AB Boot`. A non-flashing packer experiment also accepted two 1.875 MiB firmware entries at block offsets `0x100` and `0x1000`, kept `userfs` at `0x3000`, and emitted a 4067328-byte image.

This proves only that the binary packer can describe two slots and that the loader contains A/B-related branches. It does not prove slot selection metadata, XIP remapping, boot-attempt accounting, confirmation, power-loss atomicity or rollback. The local Rockchip developer-tool manual documents importing, exporting and writing partitions, but does not define these RK2206 A/B semantics.

### 5. No RK3568-to-RK2206 OTA data plane is accepted

The current RK2206 application contains no Wi-Fi/WLAN, socket, HTTP or HTTPS implementation. The only deployed node link is XLS1, whose measured sustainable RTCM profile is about 450-702 B/s. Transferring the current 457776-byte application at that net rate has a theoretical lower bound of about 11-17 minutes before framing, acknowledgements, retries, flash stalls or contention.

Therefore local Wi-Fi is only a candidate pending board capability, firmware and field-coverage proof. XLS1 remains technically possible only as a separate resumable maintenance mode that updates one node at a time and suspends competing RTCM traffic. Neither data plane is currently production-ready.

## Target architecture

### Control and artifact flow

1. The server publishes a signed manifest and immutable firmware artifact over HTTPS.
2. RK3568 downloads the artifact once, verifies size, SHA-256 and signature, and stages it locally.
3. RK3568 offers the manifest to one RK2206 node at a time and receives explicit accept/reject/status responses over the existing XLS1 control path.
4. In parallel with A/B loader work, prove whether the actual RK2206 board, firmware and field installation can provide a local Wi-Fi path to RK3568. Only after connection recovery, throughput, memory and coverage gates pass may Wi-Fi become the preferred artifact data plane.
5. If local Wi-Fi cannot be proved, implement a resumable, maintenance-window XLS1 bulk-transfer mode. It must update one node at a time, suspend competing RTCM traffic, use bounded chunks and checkpoints, and resume after interruption rather than restarting the image.
6. RK2206 streams fixed-size chunks, nominally 4 KiB, directly into the inactive slot. The full image is never buffered in RAM.
7. RK2206 reads back and verifies the inactive slot, records pending metadata atomically, and performs a software reboot.
8. The loader boots the pending slot with a bounded attempt count. The application confirms health only after identity, scheduler, watchdog, flash metadata and field-link self-checks pass. Missing confirmation triggers automatic rollback.

### Signed manifest requirements

- Hardware and carrier-board revision allowlist
- Node identity/install role and firmware profile
- Partition schema and minimum bootloader version
- Image size, SHA-256 and signature algorithm/key ID
- Monotonic firmware version or anti-rollback counter
- Build source commit and release manifest hash
- Required battery/external-power policy
- Expiry and rollout ID

TLS protects transport to RK3568, but the node must still verify an offline signature anchored in loader or read-only system storage. A leaked server credential must not be enough to install arbitrary firmware.

### Boot metadata requirements

- Two redundant metadata records with sequence number and CRC
- Confirmed slot, pending slot and image digest
- Pending boot-attempt counter, normally 2 or 3
- Confirmed monotonic version/counter
- Atomic commit rule that always leaves one valid record after power loss
- Rollback reason and last update status for diagnostics

User data and calibration must remain outside both application slots. Rollback changes only the active firmware slot and does not roll back sensor history, credentials or calibration.

### Candidate flash layout

The following is only a capacity candidate until the loader behavior and filesystem usage are proved:

| Partition | Range | Size |
| --- | ---: | ---: |
| system | `0x000000-0x010000` | 64 KiB |
| loader | `0x010000-0x020000` | 64 KiB |
| FW1 | `0x020000-0x200000` | 1.875 MiB |
| FW2 | `0x200000-0x3E0000` | 1.875 MiB |
| OTA metadata/reserved | `0x3E0000-0x400000` | 128 KiB |
| rootfs candidate | `0x400000-0x600000` | 2 MiB |
| userfs | `0x600000-0x800000` | 2 MiB |

The current 457776-byte application occupies about 23.3% of one 1.875 MiB slot, so firmware-slot capacity is sufficient. The overall layout is not accepted until reducing rootfs from 4 MiB to 2 MiB and preserving userfs are both verified.

## Resource and operational policy

- Use one 4 KiB transfer/write buffer plus streaming hash state; do not allocate an image-sized RAM buffer.
- Update only one node at a time. The other two nodes continue monitoring and provide system redundancy.
- Run OTA as a low-priority state machine with bounded erase/write steps and watchdog supervision. Do not globally disable the watchdog.
- First A/B migration and all destructive tests use a recoverable spare board, regulated power and accessible serial/flash pads.
- Field rollout requires a calibrated voltage and voltage-sag gate or confirmed external power. The final threshold must come from the 3S pack/BMS specification, not from the displayed percentage alone.
- Production UI exposes version, active/pending slot, stage, progress, validation result, reboot result and rollback reason. It must never show a successful update before post-boot confirmation.

## Mandatory acceptance sequence

1. Implement fail-closed RK2206 flash HAL, partition table, trust anchor, metadata and real reboot/rollback primitives with host/unit tests.
2. Build a dual-slot loader/package and prove manual boot of both FW1 and FW2 on one recoverable board.
3. Prove good-image update, signed-manifest rejection, wrong-node/profile rejection, downgrade rejection, corrupt-chunk rejection and readback mismatch rejection.
4. Cut power repeatedly during erase, every write region, final verification, metadata commit and first pending boot. The board must always boot a confirmed image or enter a recoverable loader state.
5. Prove watchdog reset and application crash before confirmation cause rollback; prove a healthy image confirms exactly once.
6. Run at least 100 alternating A/B updates on the pilot and check flash/metadata wear behavior.
7. Perform one wired migration on a single production-equivalent node, observe it for at least 24 hours, then migrate A/B/C sequentially with an observation window between nodes.
8. Only after all gates pass may the remote `ota_prepare/apply` command be enabled. Until then it must return an explicit `unsupported` result.

## Current operator rule

- Do not OTA current A, B or C.
- Do not flash the dual-slot packer experiment.
- Do not expose an OTA button that calls the placeholder HOTA API.
- Preserve the serial/pogo rescue path even after OTA is accepted.
