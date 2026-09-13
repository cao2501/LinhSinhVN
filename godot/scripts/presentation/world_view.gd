class_name WorldView
extends Node2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01 World View Presentation Controller
#
# Checkpoint: DEMO-01-C / C-02 Spatial Grid Presentation & C-08-A Integrated Shell
# Coordinates Camera2D viewport framing, active Z-layer selection,
# and delegates rendering to WorldGridCanvas and StaticZonesOverlay.
#
# C-08 INTEGRATION EXCEPTION:
# - Startup connection orchestration to IpcClient
# - Exactly-once initial getSnapshot dispatch per connection generation
# - Passive transport auto-reconnect orchestration when DISCONNECTED (3.0s cadence)
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

@export var ipc_client_path: NodePath = NodePath("IpcClient")

@onready var camera: Camera2D = $Camera2D
@onready var grid_canvas: WorldGridCanvas = $WorldGridCanvas
@onready var zones_overlay: StaticZonesOverlay = $StaticZonesOverlay
@onready var ipc_client: IpcClient = get_node_or_null(ipc_client_path) as IpcClient

# Presentation State
var active_z_layer: int = 0
var default_camera_zoom: float = 0.8

# Presentation Connection Orchestration State (C-08-A)
var _connection_generation: int = 0
var _initial_snapshot_requested_gen: int = -1
var _reconnect_accumulator: float = 0.0
var _auto_reconnect_enabled: bool = true

func _ready() -> void:
	# Centered at (400, 400)
	setup_camera()
	set_active_z_layer(0)
	var vp: Viewport = get_viewport()
	if vp != null:
		vp.size_changed.connect(_on_viewport_size_changed)
	
	# C-08-A Startup Connection Orchestration
	_setup_ipc_client()
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
		
		# Initial startup connection attempt
		ipc_client.connect_to_server()

func _process(delta: float) -> void:
	# C-08-A: Transport Auto-Reconnect Timer
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

func _on_ipc_connected() -> void:
	_reconnect_accumulator = 0.0
	_connection_generation += 1
	
	# Exactly-once initial getSnapshot per connection generation
	if _initial_snapshot_requested_gen != _connection_generation:
		_initial_snapshot_requested_gen = _connection_generation
		if ipc_client != null:
			ipc_client.get_snapshot()

func _on_ipc_disconnected() -> void:
	# Reset reconnect accumulator to ensure clean 3.0s delay before next attempt
	_reconnect_accumulator = 0.0

func _on_ipc_bridge_failed(_error_message: String) -> void:
	# Invariant: bridge_failed is a session error, NOT a transport disconnect.
	# WorldView does not trigger transport reconnection or automatic reset here.
	pass

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
