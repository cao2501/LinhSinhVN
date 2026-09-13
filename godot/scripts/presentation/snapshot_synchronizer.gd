# ==============================================================================
# LinhSinhVN — DEMO-01-C / C-04: Live Snapshot Synchronizer
# File: godot/scripts/presentation/snapshot_synchronizer.gd
# Base: 3c3b3bf (Patch-01)
#
# PRESENTATION-ONLY SYNCHRONIZATION CONTROLLER.
# - Connects IpcClient responses to OrganismsOverlay presentation.
# - Enforces strict simulation_tick monotonicity and tri-state resolution:
#     1. tick > last_accepted_tick: ACCEPT_AND_APPLY
#     2. tick == last_accepted_tick: IGNORE_DUPLICATE (no redraw)
#     3. tick < last_accepted_tick: REJECT_STALE (warning, no redraw)
# - Enforces strict non-negative integer simulation_tick validation:
#     Strict TYPE_INT only. TYPE_FLOAT (even integral floats like 1.0 or fractional 5.5),
#     strings, negative numbers, and nulls are rejected with a warning.
# - Enforces explicit reset correlation:
#     Reset correlation is command-level correlation on the ordered authoritative
#     TCP response stream (command == "reset" increments epoch). Full application-level
#     request_id correlation is not exposed by frozen C-01 API.
# - ZERO simulation authority: no autonomous step calls, no delta calculation.
# - ZERO biological calculation, zero position interpolation, zero RNG.
# - Preserves last valid presentation snapshot upon bridge failure / disconnect.
# ==============================================================================

class_name SnapshotSynchronizer
extends Node

signal snapshot_applied(tick: int, epoch: int)
signal playback_status_changed(status: String)
signal bridge_state_changed(state: String)

enum SnapshotResolution {
	ACCEPT_AND_APPLY,
	IGNORE_DUPLICATE,
	REJECT_STALE
}

@export var ipc_client_path: NodePath = NodePath("../IpcClient")
@export var organisms_overlay_path: NodePath = NodePath("../OrganismsOverlay")

# Read-only synchronization state
var _last_accepted_tick: int = -1
var _session_epoch: int = 0
var _playback_status: String = "PAUSED"
var _bridge_state: String = "DISCONNECTED"

func _ready() -> void:
	var ipc: Node = get_node_or_null(ipc_client_path)
	if ipc != null:
		if ipc.has_signal("connected") and not ipc.connected.is_connected(_on_connected):
			ipc.connected.connect(_on_connected)
		if ipc.has_signal("disconnected") and not ipc.disconnected.is_connected(_on_disconnected):
			ipc.disconnected.connect(_on_disconnected)
		if ipc.has_signal("response_received") and not ipc.response_received.is_connected(_on_response_received):
			ipc.response_received.connect(_on_response_received)
		if ipc.has_signal("bridge_failed") and not ipc.bridge_failed.is_connected(_on_bridge_failed):
			ipc.bridge_failed.connect(_on_bridge_failed)

func get_last_accepted_tick() -> int:
	return _last_accepted_tick

func get_session_epoch() -> int:
	return _session_epoch

func get_playback_status() -> String:
	return _playback_status

func get_bridge_state() -> String:
	return _bridge_state

func _on_connected() -> void:
	_bridge_state = "CONNECTED"
	bridge_state_changed.emit(_bridge_state)

func _on_disconnected() -> void:
	_bridge_state = "DISCONNECTED"
	bridge_state_changed.emit(_bridge_state)

func _on_bridge_failed(_error_message: String) -> void:
	_bridge_state = "BRIDGE_FAILED"
	bridge_state_changed.emit(_bridge_state)

func _on_response_received(response: Dictionary) -> void:
	# 1. Error envelopes never enter snapshot synchronization path
	var is_success: bool = bool(response.get("success", false))
	if not is_success:
		var err_dict: Variant = response.get("error", {})
		if typeof(err_dict) == TYPE_DICTIONARY:
			var code: String = String(err_dict.get("code", ""))
			if code == "SESSION_ERROR":
				_on_bridge_failed(String(err_dict.get("message", "Session error")))
		return

	# 2. Extract command and result envelope
	var command: String = String(response.get("command", ""))
	var result_var: Variant = response.get("result", null)
	if typeof(result_var) != TYPE_DICTIONARY:
		return
	var result: Dictionary = result_var

	# 3. Handle playback state responses (play / pause do not contain snapshots)
	if command == "play" or command == "pause":
		var pb_status_var: Variant = result.get("playback_status", null)
		if typeof(pb_status_var) == TYPE_STRING:
			var pb_status: String = String(pb_status_var)
			if not pb_status.is_empty():
				_playback_status = pb_status
				playback_status_changed.emit(_playback_status)
		return

	# 4. Handle snapshot payloads (step, getSnapshot, reset)
	var snapshot_var: Variant = result.get("snapshot", null)
	if typeof(snapshot_var) != TYPE_DICTIONARY:
		return
	var snapshot: Dictionary = snapshot_var

	# Strict non-negative integer validation: TYPE_INT only.
	# Reject TYPE_FLOAT (even integral floats like 1.0 or fractional 5.5) to prevent
	# silent truncation or contract violation.
	var tick_var: Variant = snapshot.get("simulation_tick", null)
	if typeof(tick_var) != TYPE_INT:
		push_warning("[SnapshotSynchronizer] Malformed snapshot: missing or non-integer simulation_tick")
		return

	var tick: int = tick_var
	if tick < 0:
		push_warning("[SnapshotSynchronizer] Malformed snapshot: negative simulation_tick %d" % tick)
		return

	# Reset correlation is command-level correlation on the ordered authoritative TCP
	# response stream. Full application-level request_id correlation is not exposed by frozen C-01 API.
	var is_reset: bool = (command == "reset")

	# 5. Tri-state resolution contract
	var resolution: SnapshotResolution = _resolve_snapshot(tick, is_reset)
	match resolution:
		SnapshotResolution.ACCEPT_AND_APPLY:
			_last_accepted_tick = tick
			if snapshot.has("playback_status"):
				_playback_status = String(snapshot.get("playback_status", _playback_status))
				playback_status_changed.emit(_playback_status)
			_apply_to_overlay(snapshot.get("organisms", []))
			snapshot_applied.emit(_last_accepted_tick, _session_epoch)
		SnapshotResolution.IGNORE_DUPLICATE:
			# Duplicate recognized: dropped silently, zero redraw
			pass
		SnapshotResolution.REJECT_STALE:
			push_warning("[SnapshotSynchronizer] Stale snapshot dropped: tick %d < last %d (epoch %d)" % [tick, _last_accepted_tick, _session_epoch])

func _resolve_snapshot(tick: int, is_reset: bool) -> SnapshotResolution:
	if is_reset:
		_session_epoch += 1
		return SnapshotResolution.ACCEPT_AND_APPLY

	if tick > _last_accepted_tick:
		return SnapshotResolution.ACCEPT_AND_APPLY
	elif tick == _last_accepted_tick:
		return SnapshotResolution.IGNORE_DUPLICATE
	else:
		return SnapshotResolution.REJECT_STALE

func _apply_to_overlay(organisms_var: Variant) -> void:
	if typeof(organisms_var) != TYPE_ARRAY:
		push_warning("[SnapshotSynchronizer] Snapshot missing organisms array")
		return
	var overlay: Node = get_node_or_null(organisms_overlay_path)
	if overlay != null and overlay.has_method("apply_snapshot_organisms"):
		overlay.apply_snapshot_organisms(organisms_var)
