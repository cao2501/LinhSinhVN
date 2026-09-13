# ==============================================================================
# LinhSinhVN — DEMO-01-C / C-05: Presentation Controls
# File: godot/scripts/presentation/presentation_controls.gd
# Base: e0706ef (Patch-01)
#
# PRESENTATION-ONLY USER INTERACTION CONTROLLER.
# - Provides explicit user-facing controls (Play, Pause, Step +1, Reset, Sync)
#   and local display controls (Z-layer navigation).
# - Dispatches locked IPC v1.0 commands through IpcClient.
# - Zero simulation authority: does NOT advance simulation loops, does NOT
#   calculate biology, lifecycle, movement, or RNG.
# - Authoritative playback state and ticks are received reactively via
#   SnapshotSynchronizer signals.
# - Canonical Z-layer bounds [-1, 2] are authoritative from DemoWorldConfig
#   (Config.Z_MIN and Config.Z_MAX); PresentationControls possesses zero
#   independent Z state and delegates traversal directly to WorldView.
# - Event-driven command in-flight lock: unlocks strictly on response_received,
#   disconnected, bridge_failed, or immediate send failure (NO wall-clock timeouts).
# ==============================================================================

class_name PresentationControls
extends Control

const Config = preload("res://scripts/presentation/demo_world_config.gd")

@export var ipc_client_path: NodePath = NodePath("../../IpcClient")
@export var snapshot_synchronizer_path: NodePath = NodePath("../../SnapshotSynchronizer")
@export var world_view_path: NodePath = NodePath("../..")

# UI node references
@onready var bridge_status_label: Label = get_node_or_null("MarginContainer/HBoxContainer/StatusPanel/BridgeStatusLabel")
@onready var playback_status_label: Label = get_node_or_null("MarginContainer/HBoxContainer/StatusPanel/PlaybackStatusLabel")
@onready var tick_label: Label = get_node_or_null("MarginContainer/HBoxContainer/StatusPanel/TickLabel")
@onready var z_layer_label: Label = get_node_or_null("MarginContainer/HBoxContainer/StatusPanel/ZLayerLabel")

@onready var play_button: Button = get_node_or_null("MarginContainer/HBoxContainer/SimulationControls/PlayButton")
@onready var pause_button: Button = get_node_or_null("MarginContainer/HBoxContainer/SimulationControls/PauseButton")
@onready var step_button: Button = get_node_or_null("MarginContainer/HBoxContainer/SimulationControls/StepButton")
@onready var reset_button: Button = get_node_or_null("MarginContainer/HBoxContainer/SimulationControls/ResetButton")
@onready var sync_button: Button = get_node_or_null("MarginContainer/HBoxContainer/SimulationControls/SyncButton")

@onready var z_down_button: Button = get_node_or_null("MarginContainer/HBoxContainer/ZControls/ZDownButton")
@onready var z_up_button: Button = get_node_or_null("MarginContainer/HBoxContainer/ZControls/ZUpButton")

# Local presentation tracking state
var _command_in_flight: bool = false
var _current_bridge_state: String = "DISCONNECTED"
var _current_playback_status: String = "PAUSED"
var _current_tick: int = 0

func _ready() -> void:
	# 1. Connect IPC client signals
	var ipc: Node = get_node_or_null(ipc_client_path)
	if ipc != null:
		if ipc.has_signal("connected") and not ipc.connected.is_connected(_on_ipc_connected):
			ipc.connected.connect(_on_ipc_connected)
		if ipc.has_signal("disconnected") and not ipc.disconnected.is_connected(_on_ipc_disconnected):
			ipc.disconnected.connect(_on_ipc_disconnected)
		if ipc.has_signal("response_received") and not ipc.response_received.is_connected(_on_ipc_response_received):
			ipc.response_received.connect(_on_ipc_response_received)
		if ipc.has_signal("bridge_failed") and not ipc.bridge_failed.is_connected(_on_ipc_bridge_failed):
			ipc.bridge_failed.connect(_on_ipc_bridge_failed)

	# 2. Connect SnapshotSynchronizer signals
	var sync: Node = get_node_or_null(snapshot_synchronizer_path)
	if sync != null:
		if sync.has_signal("snapshot_applied") and not sync.snapshot_applied.is_connected(_on_snapshot_applied):
			sync.snapshot_applied.connect(_on_snapshot_applied)
		if sync.has_signal("playback_status_changed") and not sync.playback_status_changed.is_connected(_on_playback_status_changed):
			sync.playback_status_changed.connect(_on_playback_status_changed)
		if sync.has_signal("bridge_state_changed") and not sync.bridge_state_changed.is_connected(_on_bridge_state_changed):
			sync.bridge_state_changed.connect(_on_bridge_state_changed)

	# 3. Connect WorldView z_layer_changed signal
	var wv: Node = get_node_or_null(world_view_path)
	if wv != null:
		if wv.has_signal("z_layer_changed") and not wv.z_layer_changed.is_connected(_on_z_layer_changed):
			wv.z_layer_changed.connect(_on_z_layer_changed)

	# 4. Wire button pressed signals
	_wire_buttons()

	# 5. Initialize UI display
	_refresh_ui_state()

func is_command_in_flight() -> bool:
	return _command_in_flight

func get_current_bridge_state() -> String:
	return _current_bridge_state

func get_current_playback_status() -> String:
	return _current_playback_status

func get_current_tick() -> int:
	return _current_tick

func _wire_buttons() -> void:
	if play_button != null and not play_button.pressed.is_connected(_on_play_pressed):
		play_button.pressed.connect(_on_play_pressed)
	if pause_button != null and not pause_button.pressed.is_connected(_on_pause_pressed):
		pause_button.pressed.connect(_on_pause_pressed)
	if step_button != null and not step_button.pressed.is_connected(_on_step_pressed):
		step_button.pressed.connect(_on_step_pressed)
	if reset_button != null and not reset_button.pressed.is_connected(_on_reset_pressed):
		reset_button.pressed.connect(_on_reset_pressed)
	if sync_button != null and not sync_button.pressed.is_connected(_on_sync_pressed):
		sync_button.pressed.connect(_on_sync_pressed)
	if z_down_button != null and not z_down_button.pressed.is_connected(_on_z_down_pressed):
		z_down_button.pressed.connect(_on_z_down_pressed)
	if z_up_button != null and not z_up_button.pressed.is_connected(_on_z_up_pressed):
		z_up_button.pressed.connect(_on_z_up_pressed)

# --- Button Actions ---

func _on_play_pressed() -> void:
	if _command_in_flight or _current_bridge_state != "CONNECTED" or _current_playback_status == "PLAYING":
		return
	_dispatch_command("play")

func _on_pause_pressed() -> void:
	if _command_in_flight or _current_bridge_state != "CONNECTED" or _current_playback_status != "PLAYING":
		return
	_dispatch_command("pause")

func _on_step_pressed() -> void:
	if _command_in_flight or _current_bridge_state != "CONNECTED" or _current_playback_status == "PLAYING":
		return
	_dispatch_command("step", {"ticks": 1})

func _on_reset_pressed() -> void:
	if _command_in_flight or (_current_bridge_state != "CONNECTED" and _current_bridge_state != "BRIDGE_FAILED"):
		return
	_dispatch_command("reset")

func _on_sync_pressed() -> void:
	if _command_in_flight or _current_bridge_state != "CONNECTED":
		return
	_dispatch_command("getSnapshot")

func _on_z_up_pressed() -> void:
	var wv: Node = get_node_or_null(world_view_path)
	if wv != null and wv.has_method("next_z_layer"):
		wv.next_z_layer()

func _on_z_down_pressed() -> void:
	var wv: Node = get_node_or_null(world_view_path)
	if wv != null and wv.has_method("prev_z_layer"):
		wv.prev_z_layer()

# --- Dispatch & Signal Handlers ---

func _dispatch_command(command: String, params: Dictionary = {}) -> void:
	var ipc: Node = get_node_or_null(ipc_client_path)
	if ipc == null or not ipc.has_method("send_command"):
		return

	_command_in_flight = true
	_refresh_ui_state()

	var sent: bool = ipc.send_command(command, params)
	if not sent:
		# Immediate send failure: resolve in-flight lock safely
		_command_in_flight = false
		_refresh_ui_state()

func _on_ipc_connected() -> void:
	_current_bridge_state = "CONNECTED"
	_command_in_flight = false
	_refresh_ui_state()

func _on_ipc_disconnected() -> void:
	_current_bridge_state = "DISCONNECTED"
	_command_in_flight = false
	_refresh_ui_state()

func _on_ipc_bridge_failed(_error_message: String) -> void:
	_current_bridge_state = "BRIDGE_FAILED"
	_command_in_flight = false
	_refresh_ui_state()

func _on_ipc_response_received(response: Dictionary) -> void:
	_command_in_flight = false
	var is_success: bool = bool(response.get("success", false))
	var command: String = String(response.get("command", ""))
	if is_success and command == "reset":
		# Successful reset recovers from BRIDGE_FAILED
		if _current_bridge_state == "BRIDGE_FAILED":
			_current_bridge_state = "CONNECTED"
	_refresh_ui_state()

func _on_snapshot_applied(tick: int, _epoch: int) -> void:
	_current_tick = tick
	_refresh_ui_state()

func _on_playback_status_changed(status: String) -> void:
	_current_playback_status = status
	_refresh_ui_state()

func _on_bridge_state_changed(state: String) -> void:
	_current_bridge_state = state
	_refresh_ui_state()

func _on_z_layer_changed(_new_layer: int) -> void:
	_refresh_ui_state()

# --- Reactive UI View Update ---

func _refresh_ui_state() -> void:
	# 1. Update status labels
	if bridge_status_label != null:
		bridge_status_label.text = "Bridge: %s" % _current_bridge_state
	if playback_status_label != null:
		playback_status_label.text = "Status: %s" % _current_playback_status
	if tick_label != null:
		tick_label.text = "Tick: %d" % _current_tick

	# 2. Update Z-Layer display and boundary buttons (canonical bounds from DemoWorldConfig)
	var wv: Node = get_node_or_null(world_view_path)
	if wv != null and wv.has_method("get_active_z_layer"):
		var z: int = wv.get_active_z_layer()
		if z_layer_label != null:
			z_layer_label.text = "Z: %d" % z
		if z_down_button != null:
			z_down_button.disabled = (z <= Config.Z_MIN)
		if z_up_button != null:
			z_up_button.disabled = (z >= Config.Z_MAX)
	else:
		if z_down_button != null:
			z_down_button.disabled = false
		if z_up_button != null:
			z_up_button.disabled = false

	# 3. Update simulation control buttons
	if _command_in_flight:
		if play_button != null: play_button.disabled = true
		if pause_button != null: pause_button.disabled = true
		if step_button != null: step_button.disabled = true
		if reset_button != null: reset_button.disabled = true
		if sync_button != null: sync_button.disabled = true
		return

	match _current_bridge_state:
		"DISCONNECTED", "CONNECTING":
			if play_button != null: play_button.disabled = true
			if pause_button != null: pause_button.disabled = true
			if step_button != null: step_button.disabled = true
			if reset_button != null: reset_button.disabled = true
			if sync_button != null: sync_button.disabled = true

		"CONNECTED":
			if reset_button != null: reset_button.disabled = false
			if sync_button != null: sync_button.disabled = false

			if _current_playback_status == "PLAYING":
				if play_button != null: play_button.disabled = true
				if pause_button != null: pause_button.disabled = false
				if step_button != null: step_button.disabled = true # UI policy: disabled while playing
			else:
				if play_button != null: play_button.disabled = false
				if pause_button != null: pause_button.disabled = true
				if step_button != null: step_button.disabled = false

		"BRIDGE_FAILED":
			if play_button != null: play_button.disabled = true
			if pause_button != null: pause_button.disabled = true
			if step_button != null: step_button.disabled = true
			if reset_button != null: reset_button.disabled = false # Recovery command
			if sync_button != null: sync_button.disabled = true
