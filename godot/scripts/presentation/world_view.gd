class_name WorldView
extends Node2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01 World View Presentation Controller
#
# Checkpoint: DEMO-01-C / C-02 Spatial Grid Presentation & C-08 Integrated Shell
# Coordinates Camera2D viewport framing, active Z-layer selection,
# and delegates rendering to WorldGridCanvas and StaticZonesOverlay.
#
# C-08 INTEGRATION EXCEPTION:
# - C-08-A: Startup connection orchestration to IpcClient
# - C-08-A: Exactly-once initial getSnapshot dispatch per connection generation
# - C-08-A: Passive transport auto-reconnect orchestration when DISCONNECTED (3.0s cadence)
# - C-08-C: Live playback presentation polling (Option A in _process) with 100ms
#           interval and single-request-in-flight lock during PLAYING status
#
# ZERO SIMULATION AUTHORITY:
# - Does not step ticks
# - Does not mutate simulation, biological, or spatial state
# - Camera manipulation is purely local visual transformation
# - Does not accept snapshots (SnapshotSynchronizer is sole authority)
# - Does not record or generate observations (ObservationLog is sole authority)
# - Does not trigger automatic reset or stepping upon bridge_failed
# ==============================================================================

signal z_layer_changed(new_layer: int)

const Config = preload("res://scripts/presentation/demo_world_config.gd")
const Protocol = preload("res://scripts/ipc/protocol_constants.gd")

const RECONNECT_INTERVAL: float = 3.0
const POLL_INTERVAL: float = 0.1 # 100ms (10 Hz) live presentation sampling

@export var ipc_client_path: NodePath = NodePath("IpcClient")
@export var snapshot_synchronizer_path: NodePath = NodePath("SnapshotSynchronizer")

@onready var camera: Camera2D = $Camera2D
@onready var grid_canvas: WorldGridCanvas = $WorldGridCanvas
@onready var zones_overlay: StaticZonesOverlay = $StaticZonesOverlay
@onready var ipc_client: IpcClient = get_node_or_null(ipc_client_path) as IpcClient
@onready var snapshot_synchronizer: SnapshotSynchronizer = get_node_or_null(snapshot_synchronizer_path) as SnapshotSynchronizer

# Presentation State
var active_z_layer: int = 0
var default_camera_zoom: float = 0.8

# Presentation Connection Orchestration State (C-08-A)
var _connection_generation: int = 0
var _initial_snapshot_requested_gen: int = -1
var _reconnect_accumulator: float = 0.0
var _auto_reconnect_enabled: bool = true

# Live Playback Presentation Polling State (C-08-C)
var _snapshot_poll_in_flight: bool = false
var _poll_accumulator: float = 0.0
var _current_playback_status: String = "PAUSED"
var _bridge_failed_active: bool = false

func _ready() -> void:
	# Centered at (400, 400)
	setup_camera()
	set_active_z_layer(0)
	var vp: Viewport = get_viewport()
	if vp != null:
		vp.size_changed.connect(_on_viewport_size_changed)
	
	# C-08 Integration Orchestration
	_setup_ipc_client()
	_setup_snapshot_synchronizer()
	set_process(true)

func _setup_ipc_client() -> void:
	if ipc_client == null:
		ipc_client = get_node_or_null(ipc_client_path) as IpcClient
	
	if ipc_client != null:
		if ipc_client.has_signal("connected") and not ipc_client.connected.is_connected(_on_ipc_connected):
			ipc_client.connected.connect(_on_ipc_connected)
		if ipc_client.has_signal("disconnected") and not ipc_client.disconnected.is_connected(_on_ipc_disconnected):
			ipc_client.disconnected.connect(_on_ipc_disconnected)
		if ipc_client.has_signal("bridge_failed") and not ipc_client.bridge_failed.is_connected(_on_ipc_bridge_failed):
			ipc_client.bridge_failed.connect(_on_ipc_bridge_failed)
		if ipc_client.has_signal("response_received") and not ipc_client.response_received.is_connected(_on_ipc_response_received):
			ipc_client.response_received.connect(_on_ipc_response_received)
		
		# Initial startup connection attempt
		ipc_client.connect_to_server()

func _setup_snapshot_synchronizer() -> void:
	if snapshot_synchronizer == null:
		snapshot_synchronizer = get_node_or_null(snapshot_synchronizer_path) as SnapshotSynchronizer
	
	if snapshot_synchronizer != null:
		if snapshot_synchronizer.has_signal("playback_status_changed") and not snapshot_synchronizer.playback_status_changed.is_connected(_on_playback_status_changed):
			snapshot_synchronizer.playback_status_changed.connect(_on_playback_status_changed)

func _process(delta: float) -> void:
	# Concern 1: C-08-A Transport Auto-Reconnect Timer
	# Operates ONLY when transport is strictly DISCONNECTED.
	# Strictly inhibited during CONNECTING or CONNECTED.
	if _auto_reconnect_enabled and ipc_client != null:
		if ipc_client.get_connection_state() == IpcClient.ConnectionState.DISCONNECTED:
			_reconnect_accumulator += delta
			if _reconnect_accumulator >= RECONNECT_INTERVAL:
				_reconnect_accumulator = 0.0
				ipc_client.connect_to_server()
		else:
			_reconnect_accumulator = 0.0

	# Concern 2: C-08-C Live Playback Presentation Polling (Option A)
	# Operates ONLY when playback status is PLAYING, transport is CONNECTED,
	# and no bridge failure is active.
	if _current_playback_status == "PLAYING" and ipc_client != null and not _bridge_failed_active:
		if ipc_client.get_connection_state() == IpcClient.ConnectionState.CONNECTED:
			_poll_accumulator += delta
			if _poll_accumulator >= POLL_INTERVAL and not _snapshot_poll_in_flight:
				_poll_accumulator = 0.0
				_snapshot_poll_in_flight = true
				ipc_client.get_snapshot()
		else:
			_poll_accumulator = 0.0
	else:
		_poll_accumulator = 0.0

func _on_ipc_connected() -> void:
	_reconnect_accumulator = 0.0
	_connection_generation += 1
	_bridge_failed_active = false
	
	# Exactly-once initial getSnapshot per connection generation (C-08-A, not counted as C-08-C poll)
	if _initial_snapshot_requested_gen != _connection_generation:
		_initial_snapshot_requested_gen = _connection_generation
		if ipc_client != null:
			ipc_client.get_snapshot()

func _on_ipc_disconnected() -> void:
	# Reset reconnect accumulator to ensure clean 3.0s delay before next attempt
	_reconnect_accumulator = 0.0
	_poll_accumulator = 0.0
	_snapshot_poll_in_flight = false

func _on_ipc_bridge_failed(_error_message: String) -> void:
	# Invariant: bridge_failed is a session error, NOT a transport disconnect.
	# WorldView does not trigger transport reconnection or automatic reset here.
	_bridge_failed_active = true
	_poll_accumulator = 0.0
	_snapshot_poll_in_flight = false

func _on_ipc_response_received(response: Dictionary) -> void:
	var command: String = String(response.get("command", ""))
	
	# C08-C09: Only getSnapshot responses release the polling in-flight lock
	if command == "getSnapshot":
		_snapshot_poll_in_flight = false
	elif command == "reset":
		_poll_accumulator = 0.0
		_snapshot_poll_in_flight = false
		if bool(response.get("success", false)):
			_bridge_failed_active = false

func _on_playback_status_changed(status: String) -> void:
	_current_playback_status = status
	if _current_playback_status != "PLAYING":
		_poll_accumulator = 0.0

# --- Inspection & Testing API ---
func get_connection_generation() -> int:
	return _connection_generation

func get_initial_snapshot_requested_gen() -> int:
	return _initial_snapshot_requested_gen

func get_reconnect_accumulator() -> float:
	return _reconnect_accumulator

func is_auto_reconnect_enabled() -> bool:
	return _auto_reconnect_enabled

func set_auto_reconnect_enabled(enabled: bool) -> void:
	_auto_reconnect_enabled = enabled

func is_snapshot_poll_in_flight() -> bool:
	return _snapshot_poll_in_flight

func get_poll_accumulator() -> float:
	return _poll_accumulator

func get_current_playback_status() -> String:
	return _current_playback_status

func is_bridge_failed_active() -> bool:
	return _bridge_failed_active

# --- Viewport & Camera Setup ---

func setup_camera() -> void:
	if camera == null:
		return
	
	# Center camera at logical world center (400, 400)
	camera.position = Config.WORLD_CENTER_PIXEL
	update_camera_zoom()

func update_camera_zoom() -> void:
	if camera == null:
		return

	var vp_size: Vector2 = get_viewport_rect().size
	if vp_size.x > 0.0 and vp_size.y > 0.0:
		# Viewport-adaptive framing: fit 800x800 world with safety margin
		var margin: float = 48.0
		var fit_x: float = (vp_size.x - margin) / float(Config.WORLD_PIXEL_WIDTH)
		var fit_y: float = (vp_size.y - margin) / float(Config.WORLD_PIXEL_HEIGHT)
		var adaptive_zoom: float = minf(fit_x, fit_y)
		# Clamp to prevent extreme zoom in tiny/huge viewports, defaulting around 0.8
		var target_zoom: float = clampf(adaptive_zoom, 0.4, 1.2)
		camera.zoom = Vector2(target_zoom, target_zoom)
	else:
		camera.zoom = Vector2(default_camera_zoom, default_camera_zoom)

func _on_viewport_size_changed() -> void:
	update_camera_zoom()

func set_active_z_layer(z: int) -> void:
	if z < Config.Z_MIN or z > Config.Z_MAX:
		push_warning("[WorldView] Requested Z-layer %d out of bounds [%d, %d]" % [z, Config.Z_MIN, Config.Z_MAX])
		return
	
	active_z_layer = z
	if grid_canvas != null:
		grid_canvas.set_active_z_layer(z)
	if zones_overlay != null:
		zones_overlay.set_active_z_layer(z)
	z_layer_changed.emit(z)

func next_z_layer() -> void:
	if active_z_layer < Config.Z_MAX:
		set_active_z_layer(active_z_layer + 1)

func prev_z_layer() -> void:
	if active_z_layer > Config.Z_MIN:
		set_active_z_layer(active_z_layer - 1)

func get_active_z_layer() -> int:
	return active_z_layer
