class_name CameraController
extends Camera2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01-C / C-10-B Camera Controller
#
# PRESENTATION-ONLY INTERACTIVE CAMERA NAVIGATION:
# - Middle-mouse drag and right-mouse drag panning
# - WASD / Arrow keys keyboard panning with screen-space velocity
# - Mouse-wheel cursor-centered zoom clamped to [MIN_ZOOM, MAX_ZOOM]
# - Viewport-aware dynamic world boundary clamping
# - Default overview framing on initialization
# - ZERO simulation authority: never issues IPC commands, never mutates state
# - ZERO organism focus / follow logic (deferred to C-10-C)
# ==============================================================================

const Config = preload("res://scripts/presentation/demo_world_config.gd")

# Zoom constants
const MIN_ZOOM: float = 0.6
const MAX_ZOOM: float = 4.0
const ZOOM_STEP_FACTOR: float = 1.15
const PAN_SPEED_SCREEN: float = 400.0 # Screen-space pixels per second

# Pan state
var _is_dragging: bool = false
var _drag_start_mouse_pos: Vector2 = Vector2.ZERO

func _ready() -> void:
	# Centered on logical world center (400, 400)
	position = Config.WORLD_CENTER_PIXEL
	reset_to_default_framing()
	
	var vp: Viewport = get_viewport()
	if vp != null:
		vp.size_changed.connect(_on_viewport_size_changed)

func calculate_default_overview_zoom(vp_size: Vector2) -> float:
	var margin: float = 48.0
	if vp_size.x <= margin or vp_size.y <= margin:
		return MIN_ZOOM
	var fit_x: float = (vp_size.x - margin) / float(Config.WORLD_PIXEL_WIDTH)
	var fit_y: float = (vp_size.y - margin) / float(Config.WORLD_PIXEL_HEIGHT)
	var adaptive: float = minf(fit_x, fit_y)
	return clampf(adaptive, MIN_ZOOM, 1.2)

func clamp_camera_center(target_pos: Vector2, vp_size: Vector2, z: float) -> Vector2:
	var hw: float = vp_size.x / (2.0 * z)
	var hh: float = vp_size.y / (2.0 * z)
	var cx: float
	var cy: float

	if 2.0 * hw >= float(Config.WORLD_PIXEL_WIDTH):
		cx = float(Config.WORLD_PIXEL_WIDTH) * 0.5
	else:
		cx = clampf(target_pos.x, hw, float(Config.WORLD_PIXEL_WIDTH) - hw)

	if 2.0 * hh >= float(Config.WORLD_PIXEL_HEIGHT):
		cy = float(Config.WORLD_PIXEL_HEIGHT) * 0.5
	else:
		cy = clampf(target_pos.y, hh, float(Config.WORLD_PIXEL_HEIGHT) - hh)

	return Vector2(cx, cy)

func reset_to_default_framing() -> void:
	var vp_size: Vector2 = get_viewport_rect().size
	var def_z: float = calculate_default_overview_zoom(vp_size)
	zoom = Vector2(def_z, def_z)
	position = clamp_camera_center(Config.WORLD_CENTER_PIXEL, vp_size, def_z)

func _on_viewport_size_changed() -> void:
	var vp_size: Vector2 = get_viewport_rect().size
	position = clamp_camera_center(position, vp_size, zoom.x)

func _process(delta: float) -> void:
	# Keyboard pan
	var input_vec: Vector2 = Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		input_vec.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		input_vec.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		input_vec.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		input_vec.y += 1.0

	if input_vec != Vector2.ZERO:
		var dir: Vector2 = input_vec.normalized()
		var current_z: float = zoom.x
		var screen_delta: Vector2 = dir * (PAN_SPEED_SCREEN * delta)
		var world_delta: Vector2 = screen_delta / current_z
		var vp_size: Vector2 = get_viewport_rect().size
		position = clamp_camera_center(position + world_delta, vp_size, current_z)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event as InputEventMouseButton
		# Left-click is strictly reserved for selection / UI — NEVER camera drag
		if mb.button_index == MOUSE_BUTTON_LEFT:
			return

		# Middle or Right mouse button drag pan
		if mb.button_index == MOUSE_BUTTON_MIDDLE or mb.button_index == MOUSE_BUTTON_RIGHT:
			if mb.pressed:
				_is_dragging = true
				_drag_start_mouse_pos = mb.position
			else:
				_is_dragging = false
			get_viewport().set_input_as_handled()
			return

		# Mouse wheel cursor-centered zoom
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_zoom_at_cursor(mb.position, ZOOM_STEP_FACTOR)
			get_viewport().set_input_as_handled()
			return
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_zoom_at_cursor(mb.position, 1.0 / ZOOM_STEP_FACTOR)
			get_viewport().set_input_as_handled()
			return

	elif event is InputEventMouseMotion:
		var mm: InputEventMouseMotion = event as InputEventMouseMotion
		if _is_dragging:
			var mouse_delta: Vector2 = mm.relative
			var current_z: float = zoom.x
			var world_delta: Vector2 = -mouse_delta / current_z
			var vp_size: Vector2 = get_viewport_rect().size
			position = clamp_camera_center(position + world_delta, vp_size, current_z)
			get_viewport().set_input_as_handled()
			return

func _zoom_at_cursor(cursor_screen_pos: Vector2, factor: float) -> void:
	var old_z: float = zoom.x
	var new_z: float = clampf(old_z * factor, MIN_ZOOM, MAX_ZOOM)
	if is_equal_approx(old_z, new_z):
		return

	var vp_size: Vector2 = get_viewport_rect().size
	var vp_center: Vector2 = vp_size * 0.5
	var cursor_offset: Vector2 = cursor_screen_pos - vp_center

	var tentative_pos: Vector2 = position + cursor_offset * (1.0 / old_z - 1.0 / new_z)
	var final_pos: Vector2 = clamp_camera_center(tentative_pos, vp_size, new_z)

	zoom = Vector2(new_z, new_z)
	position = final_pos
