class_name WorldView
extends Node2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01 World View Presentation Controller
#
# Checkpoint: DEMO-01-C / C-02 Spatial Grid Presentation
# Coordinates Camera2D viewport framing, active Z-layer selection,
# and delegates rendering to WorldGridCanvas and StaticZonesOverlay.
#
# ZERO SIMULATION AUTHORITY:
# - Does not step ticks
# - Does not mutate simulation or spatial state
# - Camera manipulation is purely local visual transformation
# ==============================================================================

signal z_layer_changed(new_layer: int)

const Config = preload("res://scripts/presentation/demo_world_config.gd")

@onready var camera: Camera2D = $Camera2D
@onready var grid_canvas: WorldGridCanvas = $WorldGridCanvas
@onready var zones_overlay: StaticZonesOverlay = $StaticZonesOverlay

# Presentation State
var active_z_layer: int = 0
var default_camera_zoom: float = 0.8

func _ready() -> void:
	# Centered at (400, 400)
	setup_camera()
	set_active_z_layer(0)
	get_viewport().size_changed.connect(_on_viewport_size_changed)

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
