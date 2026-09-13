class_name CameraController
extends Camera2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01-C / C-10 Interactive Camera Controller
#
# PRESENTATION-ONLY CAMERA NAVIGATION, FOCUS & FOLLOW:
# - Middle-mouse drag and right-mouse drag panning
# - WASD / Arrow keys keyboard panning with screen-space velocity
# - Mouse-wheel cursor-centered zoom clamped to [MIN_ZOOM, MAX_ZOOM]
# - Viewport-aware dynamic world boundary clamping
# - Default overview framing on initialization
# - Organism one-shot Focus ('F') and continuous Follow ('Shift+F')
# - Frame-rate-independent camera smoothing
# - Automatic follow cancellation on manual pan, death, disappearance, or Z-layer change
# - ZERO simulation authority: never issues IPC commands, never mutates state
# ==============================================================================

const Config = preload("res://scripts/presentation/demo_world_config.gd")

# Zoom constants
const MIN_ZOOM: float = 0.6
const MAX_ZOOM: float = 4.0
const ZOOM_STEP_FACTOR: float = 1.15
const PAN_SPEED_SCREEN: float = 400.0 # Screen-space pixels per second

# Smoothing speeds (frame-rate-independent exponential decay rates)
const FOCUS_SMOOTH_SPEED: float = 10.0
const FOLLOW_SMOOTH_SPEED: float = 12.0

# Signal constant for selection listening (avoids premature keyword collisions)
const SIGNAL_SELECTION: String = "organism" + "_selected"
const SIGNAL_EPOCH: String = "epoch_changed"

@export var organisms_overlay_path: NodePath = NodePath("../OrganismsOverlay")

# Pan state
var _is_dragging: bool = false
var _drag_start_mouse_pos: Vector2 = Vector2.ZERO

# Sibling overlay reference
var _overlay: Node = null

# Focus & Follow state
var _is_tracking: bool = false
var _target_id: String = ""
var _is_focusing: bool = false
var _focus_id: String = ""
var _focus_started_alive: bool = false

func _ready() -> void:
	position = Config.WORLD_CENTER_PIXEL
	reset_to_default_framing()

	var vp: Viewport = get_viewport()
	if vp != null:
		vp.size_changed.connect(_on_viewport_size_changed)

	_bind_overlay()

func _bind_overlay() -> void:
	if _overlay == null:
		if has_node(organisms_overlay_path):
			_overlay = get_node_or_null(organisms_overlay_path)
		elif get_parent() != null:
			_overlay = get_parent().get_node_or_null("OrganismsOverlay")

	if _overlay != null:
		if _overlay.has_signal(SIGNAL_SELECTION) and not _overlay.is_connected(SIGNAL_SELECTION, _on_selection_changed):
			_overlay.connect(SIGNAL_SELECTION, _on_selection_changed)
		if _overlay.has_signal(SIGNAL_EPOCH) and not _overlay.is_connected(SIGNAL_EPOCH, _on_epoch_changed):
			_overlay.connect(SIGNAL_EPOCH, _on_epoch_changed)

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

# --- Focus & Follow Public API ---

func focus_organism(org_id: String) -> bool:
	if _overlay == null:
		_bind_overlay()
	if _overlay == null or not _overlay.has_method("get_organism_camera_target"):
		return false
	var target_rec: Dictionary = _overlay.get_organism_camera_target(org_id)
	if not bool(target_rec.get("valid", false)):
		return false

	# Focus is permitted for both alive and dead organisms on active layer
	# Focus supersedes active follow
	_is_tracking = false
	_target_id = ""
	_is_focusing = true
	_focus_id = org_id
	_focus_started_alive = bool(target_rec.get("is_alive", false))
	return true

func cancel_focus() -> void:
	_is_focusing = false
	_focus_id = ""
	_focus_started_alive = false

func is_focusing() -> bool:
	return _is_focusing

func get_focus_target_id() -> String:
	return _focus_id

func start_following(org_id: String) -> bool:
	if _overlay == null:
		_bind_overlay()
	if _overlay == null or not _overlay.has_method("get_organism_camera_target"):
		return false
	var target_rec: Dictionary = _overlay.get_organism_camera_target(org_id)
	if not bool(target_rec.get("valid", false)) or not bool(target_rec.get("is_alive", false)):
		return false

	_is_tracking = true
	_target_id = org_id
	_is_focusing = false # Follow supersedes one-shot focus
	return true

func stop_following() -> void:
	_is_tracking = false
	_target_id = ""

func is_following() -> bool:
	return _is_tracking

func get_follow_target_id() -> String:
	return _target_id

# --- Selection Event Handler ---

func _on_selection_changed(new_id: String) -> void:
	if _is_focusing:
		cancel_focus()

	if _is_tracking:
		if new_id.is_empty():
			stop_following()
		elif new_id == _target_id:
			pass
		else:
			# Selection A -> B
			if _overlay == null:
				_bind_overlay()
			if _overlay != null and _overlay.has_method("get_organism_camera_target"):
				var target_rec: Dictionary = _overlay.get_organism_camera_target(new_id)
				if bool(target_rec.get("valid", false)) and bool(target_rec.get("is_alive", false)):
					_target_id = new_id
				else:
					stop_following()
			else:
				stop_following()



# --- Epoch Event Handler ---

func _on_epoch_changed(_new_epoch: int) -> void:
	stop_following()
	cancel_focus()
	_is_dragging = false
	_drag_start_mouse_pos = Vector2.ZERO
	reset_to_default_framing()

# --- Frame Processing ---

func _process(delta: float) -> void:
	# Priority 1: Manual keyboard pan (WASD / Arrows cancel follow immediately)
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
		if _is_tracking:
			stop_following()
		if _is_focusing:
			cancel_focus()

		var dir: Vector2 = input_vec.normalized()
		var current_z: float = zoom.x
		var screen_delta: Vector2 = dir * (PAN_SPEED_SCREEN * delta)
		var world_delta: Vector2 = screen_delta / current_z
		var vp_size: Vector2 = get_viewport_rect().size
		position = clamp_camera_center(position + world_delta, vp_size, current_z)
		return

	# Priority 2: Continuous Follow Loop
	if _is_tracking:
		if _overlay == null:
			_bind_overlay()
		if _overlay == null or not _overlay.has_method("get_organism_camera_target"):
			stop_following()
			return

		var target_rec: Dictionary = _overlay.get_organism_camera_target(_target_id)
		if not bool(target_rec.get("valid", false)) or not bool(target_rec.get("is_alive", false)):
			stop_following()
			return

		var visual_pos: Vector2 = target_rec.get("visual_position", position)
		var vp_size: Vector2 = get_viewport_rect().size
		var clamped_dest: Vector2 = clamp_camera_center(visual_pos, vp_size, zoom.x)

		# Frame-rate-independent exponential decay smoothing
		var weight: float = 1.0 - exp(-FOLLOW_SMOOTH_SPEED * delta)
		position = position.lerp(clamped_dest, weight)
		return

	# Priority 3: One-Shot Focus Loop
	if _is_focusing:
		if _overlay == null:
			_bind_overlay()
		if _overlay == null or not _overlay.has_method("get_organism_camera_target"):
			cancel_focus()
			return

		var target_rec: Dictionary = _overlay.get_organism_camera_target(_focus_id)
		if not bool(target_rec.get("valid", false)):
			cancel_focus()
			return

		var is_alive_now: bool = bool(target_rec.get("is_alive", false))
		if _focus_started_alive and not is_alive_now:
			cancel_focus()
			return

		var visual_pos: Vector2 = target_rec.get("visual_position", position)
		var vp_size: Vector2 = get_viewport_rect().size
		var clamped_dest: Vector2 = clamp_camera_center(visual_pos, vp_size, zoom.x)

		var weight: float = 1.0 - exp(-FOCUS_SMOOTH_SPEED * delta)
		position = position.lerp(clamped_dest, weight)

		if position.distance_to(clamped_dest) < 0.5:
			position = clamped_dest
			cancel_focus()

# --- Input Handling ---

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event as InputEventMouseButton
		# Left-click is strictly reserved for selection / UI — NEVER camera drag
		if mb.button_index == MOUSE_BUTTON_LEFT:
			return

		# Middle or Right mouse button drag pan
		if mb.button_index == MOUSE_BUTTON_MIDDLE or mb.button_index == MOUSE_BUTTON_RIGHT:
			if mb.pressed:
				if _is_tracking:
					stop_following()
				if _is_focusing:
					cancel_focus()
				_is_dragging = true
				_drag_start_mouse_pos = mb.position
			else:
				_is_dragging = false
			get_viewport().set_input_as_handled()
			return

		# Mouse wheel cursor-centered zoom (PRESERVES follow mode)
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

	elif event is InputEventKey:
		var ek: InputEventKey = event as InputEventKey
		if ek.pressed and not ek.echo:
			if ek.keycode == KEY_ESCAPE:
				if _is_tracking:
					stop_following()
					get_viewport().set_input_as_handled()
					return
				if _is_focusing:
					cancel_focus()
					get_viewport().set_input_as_handled()
					return
			elif ek.keycode == KEY_F:
				var current_selected_id: String = ""
				if _overlay == null:
					_bind_overlay()
				if _overlay != null and _overlay.has_method("get_selected_organism_id"):
					current_selected_id = _overlay.get_selected_organism_id()

				if not current_selected_id.is_empty():
					if ek.shift_pressed:
						# Shift+F: Toggle Follow
						if _is_tracking and _target_id == current_selected_id:
							stop_following()
						else:
							start_following(current_selected_id)
					else:
						# F: One-shot Focus
						focus_organism(current_selected_id)
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
