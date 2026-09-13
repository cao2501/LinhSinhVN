class_name OrganismsOverlay
extends Node2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01-C / C-09-E Organisms Overlay
#
# Checkpoint: DEMO-01-C / C-09-E Organism Selection & Inspection
# Base: 74666fb (C-09-D Closed)
#
# PRESENTATION-ONLY ORGANISM VISUAL OVERLAY:
# - Renders procedural insect morphology (C-09-B) driven by authoritative snapshot state.
# - Interpolates visual X/Y pixel center between accepted snapshots (C-09-D).
# - Handles presentation mouse hover and selection hit-testing (C-09-E).
# - Emits identity-based selection signals for inspection UI (C-09-E).
# - ZERO simulation authority: never moves simulation coordinates, never steps ticks.
# - ZERO duplicate acceptance: only receives snapshots already accepted by SnapshotSynchronizer.
# - ZERO cross-epoch leakage: purges selection and interpolation on epoch advancement.
# - ZERO RNG, zero pathfinding, zero collision, zero biological inference.
# ==============================================================================

signal organism_selected(organism_id: String)
signal organism_hovered(organism_id: String)

const Config = preload("res://scripts/presentation/demo_world_config.gd")
const Morphology = preload("res://scripts/presentation/organism_morphology.gd")
const Interpolator = preload("res://scripts/presentation/organism_interpolator.gd")

const INTERPOLATION_DURATION: float = 0.1 # 100ms baseline presentation interval
const HIT_RADIUS: float = 12.0            # Pixel hit-test radius

# Canonical Stage Colors (Fallback / Baseline Palettes)
const STAGE_COLORS: Dictionary = {
	"STAGE_EGG": {
		"fill": Color(0.961, 0.941, 0.863, 1.0),   # #F5F0DC
		"outline": Color(0.741, 0.706, 0.627, 1.0) # #BDB4A0
	},
	"STAGE_LARVA": {
		"fill": Color(0.784, 0.902, 0.788, 1.0),   # #C8E6C9
		"outline": Color(0.298, 0.686, 0.314, 1.0) # #4CAF50
	},
	"STAGE_PUPA": {
		"fill": Color(0.843, 0.800, 0.784, 1.0),   # #D7CCC8
		"outline": Color(0.553, 0.431, 0.388, 1.0) # #8D6E63
	},
	"STAGE_ADULT": {
		"fill": Color(0.553, 0.431, 0.388, 1.0),   # #8D6E63
		"outline": Color(0.306, 0.204, 0.180, 1.0) # #4E342E
	}
}

const SEX_ACCENT_COLORS: Dictionary = {
	"MALE": Color(0.161, 0.714, 0.965, 1.0),          # #29B6F6
	"FEMALE": Color(0.925, 0.251, 0.478, 1.0),        # #EC407A
	"ASEXUAL": Color(0.741, 0.741, 0.741, 1.0),       # #BDBDBD
	"HERMAPHRODITE": Color(0.741, 0.741, 0.741, 1.0)  # #BDBDBD
}

const ACTION_COLORS: Dictionary = {
	"FORAGE": Color(0.263, 0.627, 0.278, 1.0),       # #43A047
	"REST": Color(0.471, 0.565, 0.612, 1.0),         # #78909C
	"SEEK_SHELTER": Color(1.0, 0.627, 0.0, 1.0),     # #FFA000
	"FLEE": Color(0.898, 0.224, 0.208, 1.0),         # #E53935
	"SEEK_MATE": Color(0.671, 0.278, 0.737, 1.0),    # #AB47BC
	"EXPLORE": Color(0.118, 0.533, 0.898, 1.0),      # #1E88E5
	"NONE": Color(0.741, 0.741, 0.741, 1.0),         # #BDBDBD
	"IDLE": Color(0.741, 0.741, 0.741, 1.0)          # #BDBDBD
}

const DEAD_COLOR: Color = Color(0.459, 0.459, 0.459, 0.55) # #757575 (55% alpha)
const SELECTION_COLOR: Color = Color(1.0, 0.88, 0.2, 0.95) # Vibrant Gold
const HOVER_COLOR: Color = Color(1.0, 1.0, 1.0, 0.55)      # Soft White

@export var snapshot_synchronizer_path: NodePath = NodePath("../SnapshotSynchronizer")

# Presentation Cache & State
var active_z_layer: int = 0
var _cached_organisms: Array = []
var _interpolation_states: Dictionary = {}
var _last_seen_epoch: int = -1
var _has_received_first_snapshot: bool = false
var _synchronizer: Node = null

# Selection & Hover Presentation State (C-09-E)
var _hovered_organism_id: String = ""
var _selected_organism_id: String = ""

func _ready() -> void:
	z_index = 20
	if _synchronizer == null and has_node(snapshot_synchronizer_path):
		_synchronizer = get_node_or_null(snapshot_synchronizer_path)
	queue_redraw()

func set_active_z_layer(new_layer: int) -> void:
	if active_z_layer != new_layer:
		active_z_layer = new_layer
		# Deselect / dehover if active z-layer hides the organism
		if not _selected_organism_id.is_empty():
			var org: Dictionary = get_organism_by_id(_selected_organism_id)
			var pos: Dictionary = org.get("position", {})
			if int(pos.get("z", 0)) != active_z_layer:
				_selected_organism_id = ""
				organism_selected.emit("")
		_hovered_organism_id = ""
		organism_hovered.emit("")
		queue_redraw()

func set_synchronizer(sync_node: Node) -> void:
	_synchronizer = sync_node

func get_selected_organism_id() -> String:
	return _selected_organism_id

func get_hovered_organism_id() -> String:
	return _hovered_organism_id

func select_organism(org_id: String) -> void:
	if _selected_organism_id != org_id:
		_selected_organism_id = org_id
		organism_selected.emit(_selected_organism_id)
		queue_redraw()

func get_selected_organism_data() -> Dictionary:
	if _selected_organism_id.is_empty():
		return {}
	return get_organism_by_id(_selected_organism_id)

func get_organism_by_id(org_id: String) -> Dictionary:
	for org in _cached_organisms:
		if typeof(org) == TYPE_DICTIONARY and String(org.get("organism_id", "")) == org_id:
			return org.duplicate(true)
	return {}

func get_interpolation_state(org_id: Variant) -> Dictionary:
	return _interpolation_states.get(org_id, {}).duplicate()

func get_last_seen_epoch() -> int:
	return _last_seen_epoch

func get_cached_organisms() -> Array:
	return _cached_organisms.duplicate()

func apply_snapshot_organisms(organisms: Array) -> void:
	# 1. Authoritative epoch resolution from SnapshotSynchronizer
	var current_epoch: int = _last_seen_epoch
	if _synchronizer != null and _synchronizer.has_method("get_session_epoch"):
		current_epoch = int(_synchronizer.get_session_epoch())
	elif _last_seen_epoch < 0:
		current_epoch = 0

	# 2. First snapshot or Epoch change barrier (Strict Reset Isolation)
	var is_epoch_reset: bool = false
	if not _has_received_first_snapshot:
		_has_received_first_snapshot = true
		_last_seen_epoch = current_epoch
		_interpolation_states.clear()
		_selected_organism_id = ""
		_hovered_organism_id = ""
		is_epoch_reset = true
	elif current_epoch != _last_seen_epoch:
		_last_seen_epoch = current_epoch
		_interpolation_states.clear()
		_selected_organism_id = ""
		_hovered_organism_id = ""
		organism_selected.emit("")
		organism_hovered.emit("")
		is_epoch_reset = true

	# 3. Process accepted snapshot organisms
	var active_ids: Dictionary = {}
	_cached_organisms.clear()

	for org in organisms:
		if typeof(org) != TYPE_DICTIONARY:
			continue
		_cached_organisms.append(org)

		var org_id: String = String(org.get("organism_id", ""))
		active_ids[org_id] = true

		var pos_variant: Variant = org.get("position", null)
		if typeof(pos_variant) != TYPE_DICTIONARY:
			continue
		var pos_dict: Dictionary = pos_variant
		var x: int = int(pos_dict.get("x", 0))
		var y: int = int(pos_dict.get("y", 0))
		var target_pos: Vector2 = Interpolator.calculate_pixel_center(x, y)

		if is_epoch_reset:
			# CASE D: Epoch Changed / Reset Barrier -> immediate snap, zero cross-epoch lerp
			_interpolation_states[org_id] = {
				"source_px": target_pos,
				"target_px": target_pos,
				"alpha": 1.0,
				"last_seen_epoch": current_epoch
			}
		elif not _interpolation_states.has(org_id):
			# CASE A: New Organism -> appear immediately at authoritative target
			_interpolation_states[org_id] = {
				"source_px": target_pos,
				"target_px": target_pos,
				"alpha": 1.0,
				"last_seen_epoch": current_epoch
			}
		else:
			# Existing organism in same epoch
			var st: Dictionary = _interpolation_states[org_id]
			var prev_target: Vector2 = st.get("target_px", target_pos)

			if prev_target == target_pos:
				# CASE B: Same Position -> keep target, alpha = 1.0, DO NOT restart interpolation
				st["target_px"] = target_pos
				st["alpha"] = 1.0
				st["last_seen_epoch"] = current_epoch
			else:
				# CASE C: Position Changed -> source is CURRENT VISUAL POSITION
				var current_visual: Vector2 = Interpolator.interpolate_position(
					st.get("source_px", target_pos),
					prev_target,
					float(st.get("alpha", 1.0))
				)
				st["source_px"] = current_visual
				st["target_px"] = target_pos
				st["alpha"] = 0.0
				st["last_seen_epoch"] = current_epoch

	# 4. CASE E: Organism Disappearance / Pruning
	var known_ids: Array = _interpolation_states.keys()
	for kid in known_ids:
		if not active_ids.has(kid):
			_interpolation_states.erase(kid)

	# 5. Refresh or Clear Selection Lifecycle
	if not _selected_organism_id.is_empty():
		if not active_ids.has(_selected_organism_id):
			# Selected organism completely missing from snapshot -> clear selection
			_selected_organism_id = ""
			organism_selected.emit("")
		else:
			# Selected organism exists (alive or dead) -> refresh selection signal
			organism_selected.emit(_selected_organism_id)

	queue_redraw()

func _process(delta: float) -> void:
	var any_changed: bool = false
	for org_id in _interpolation_states.keys():
		var st: Dictionary = _interpolation_states[org_id]
		var alpha: float = float(st.get("alpha", 1.0))
		if alpha < 1.0:
			st["alpha"] = Interpolator.advance_alpha(alpha, delta, INTERPOLATION_DURATION)
			any_changed = true
	if any_changed:
		queue_redraw()

func _get_organism_visual_position(org: Dictionary, fallback_center: Vector2) -> Vector2:
	var org_id: Variant = org.get("organism_id", "")
	if _interpolation_states.has(org_id):
		var st: Dictionary = _interpolation_states[org_id]
		var source_px: Vector2 = st.get("source_px", fallback_center)
		var target_px: Vector2 = st.get("target_px", fallback_center)
		var alpha: float = float(st.get("alpha", 1.0))
		var base_interp: Vector2 = Interpolator.interpolate_position(source_px, target_px, alpha)
		var slot_offset: Vector2 = fallback_center - target_px
		return base_interp + slot_offset
	return fallback_center

func _calculate_slot_center(origin: Vector2, count: int, slot_index: int) -> Vector2:
	if count == 1:
		return origin + Vector2(8.0, 8.0)
	elif count == 2:
		return origin + (Vector2(5.0, 8.0) if slot_index == 0 else Vector2(11.0, 8.0))
	elif count == 3:
		return origin + (Vector2(5.0, 5.0) if slot_index == 0 else (Vector2(11.0, 5.0) if slot_index == 1 else Vector2(8.0, 11.0)))
	elif count == 4:
		return origin + (Vector2(5.0, 5.0) if slot_index == 0 else (Vector2(11.0, 5.0) if slot_index == 1 else (Vector2(5.0, 11.0) if slot_index == 2 else Vector2(11.0, 11.0))))
	else:
		return origin + Vector2(8.0, 8.0)

func get_organism_camera_target(org_id: String) -> Dictionary:
	if org_id.is_empty():
		return {"valid": false, "is_alive": false, "visual_position": Vector2.ZERO}

	var org: Dictionary = get_organism_by_id(org_id)
	if org.is_empty():
		return {"valid": false, "is_alive": false, "visual_position": Vector2.ZERO}

	var pos: Variant = org.get("position", null)
	if typeof(pos) != TYPE_DICTIONARY:
		return {"valid": false, "is_alive": false, "visual_position": Vector2.ZERO}

	var z: int = int(pos.get("z", 0))
	if z != active_z_layer:
		return {"valid": false, "is_alive": false, "visual_position": Vector2.ZERO}

	var cell_x: int = int(pos.get("x", 0))
	var cell_y: int = int(pos.get("y", 0))

	# Group organisms in this cell on active_z_layer (matching _draw and _hit_test)
	var group: Array = []
	for candidate in _cached_organisms:
		var cpos: Variant = candidate.get("position", null)
		if typeof(cpos) == TYPE_DICTIONARY:
			if int(cpos.get("z", 0)) == active_z_layer and int(cpos.get("x", 0)) == cell_x and int(cpos.get("y", 0)) == cell_y:
				group.append(candidate)

	group.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return String(a.get("organism_id", "")) < String(b.get("organism_id", ""))
	)

	var count: int = group.size()
	var slot_index: int = 0
	for i in range(count):
		if String(group[i].get("organism_id", "")) == org_id:
			slot_index = i
			break

	if count > 4 and slot_index > 0:
		slot_index = 0

	var origin: Vector2 = Config.world_to_pixel(Vector2i(cell_x, cell_y))
	var slot_center: Vector2 = _calculate_slot_center(origin, count, slot_index)
	var visual_pos: Vector2 = _get_organism_visual_position(org, slot_center)
	var is_alive: bool = bool(org.get("is_alive", true))

	return {
		"valid": true,
		"is_alive": is_alive,
		"visual_position": visual_pos
	}

func _hit_test_organism(pixel_pos: Vector2) -> Dictionary:
	if _cached_organisms.is_empty():
		return {}

	# Group organisms by cell key to get exact slot offsets identical to _draw()
	var cell_groups: Dictionary = {}
	for org in _cached_organisms:
		var pos: Variant = org.get("position", null)
		if typeof(pos) != TYPE_DICTIONARY:
			continue
		var z: int = int(pos.get("z", 0))
		if z != active_z_layer:
			continue
		var x: int = int(pos.get("x", 0))
		var y: int = int(pos.get("y", 0))
		var key: String = "%d_%d_%d" % [x, y, z]
		if not cell_groups.has(key):
			cell_groups[key] = []
		cell_groups[key].append(org)

	var best_org: Dictionary = {}
	var min_dist: float = HIT_RADIUS

	for key in cell_groups.keys():
		var group: Array = cell_groups[key]
		group.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return String(a.get("organism_id", "")) < String(b.get("organism_id", ""))
		)
		var count: int = group.size()
		var first_pos: Dictionary = group[0].get("position", {})
		var cell_x: int = int(first_pos.get("x", 0))
		var cell_y: int = int(first_pos.get("y", 0))
		var origin: Vector2 = Config.world_to_pixel(Vector2i(cell_x, cell_y))

		for i in range(count):
			var org: Dictionary = group[i]
			if count > 4 and i > 0:
				continue
			var fallback_center: Vector2 = _calculate_slot_center(origin, count, i)

			var visual_pos: Vector2 = _get_organism_visual_position(org, fallback_center)
			var d: float = pixel_pos.distance_to(visual_pos)
			if d <= min_dist:
				if is_equal_approx(d, min_dist) and not best_org.is_empty():
					# Deterministic tie-break: organism_id ASC
					if String(org.get("organism_id", "")) < String(best_org.get("organism_id", "")):
						best_org = org
						min_dist = d
				else:
					best_org = org
					min_dist = d

	return best_org

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var mouse_pos: Vector2 = get_global_mouse_position()
		var candidate: Dictionary = _hit_test_organism(mouse_pos)
		var new_hover_id: String = String(candidate.get("organism_id", ""))
		if new_hover_id != _hovered_organism_id:
			_hovered_organism_id = new_hover_id
			organism_hovered.emit(_hovered_organism_id)
			queue_redraw()
	elif event is InputEventMouseButton:
		var mb: InputEventMouseButton = event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			var mouse_pos: Vector2 = get_global_mouse_position()
			var candidate: Dictionary = _hit_test_organism(mouse_pos)
			var new_selected_id: String = String(candidate.get("organism_id", ""))
			if new_selected_id != _selected_organism_id:
				_selected_organism_id = new_selected_id
				organism_selected.emit(_selected_organism_id)
				queue_redraw()

func _draw() -> void:
	if _cached_organisms.is_empty():
		return

	# 1. Group organisms by coordinate string key "x_y_z"
	var cell_groups: Dictionary = {}
	for org in _cached_organisms:
		var pos: Variant = org.get("position", null)
		if typeof(pos) != TYPE_DICTIONARY:
			continue
		var x: int = int(pos.get("x", 0))
		var y: int = int(pos.get("y", 0))
		var z: int = int(pos.get("z", 0))

		# Z-layer presentation filtering: only render organisms on active layer
		if z != active_z_layer:
			continue

		var key: String = "%d_%d_%d" % [x, y, z]
		if not cell_groups.has(key):
			cell_groups[key] = []
		cell_groups[key].append(org)

	# 2. Render each cell group with deterministic stacking (pure position offsets)
	for key in cell_groups.keys():
		var group: Array = cell_groups[key]
		# Deterministic sort by organism_id ASC (code-point lexical)
		group.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return String(a.get("organism_id", "")) < String(b.get("organism_id", ""))
		)

		var count: int = group.size()
		var first_pos: Dictionary = group[0].get("position", {})
		var cell_x: int = int(first_pos.get("x", 0))
		var cell_y: int = int(first_pos.get("y", 0))
		var origin: Vector2 = Config.world_to_pixel(Vector2i(cell_x, cell_y))

		if count > 4:
			var slot_center: Vector2 = _calculate_slot_center(origin, count, 0)
			var draw_pos: Vector2 = _get_organism_visual_position(group[0], slot_center)
			_draw_organism_with_highlight(group[0], draw_pos)
			_draw_stack_badge(origin, count - 1)
		else:
			for i in range(count):
				var slot_center: Vector2 = _calculate_slot_center(origin, count, i)
				var draw_pos: Vector2 = _get_organism_visual_position(group[i], slot_center)
				_draw_organism_with_highlight(group[i], draw_pos)

func _draw_organism_with_highlight(org: Dictionary, center: Vector2) -> void:
	var org_id: String = String(org.get("organism_id", ""))

	# 1. Render selection highlight ring (if selected)
	if not _selected_organism_id.is_empty() and org_id == _selected_organism_id:
		var sel_r: float = 10.5
		draw_arc(center, sel_r, 0.0, TAU, 24, SELECTION_COLOR, 2.0)
		# 4 subtle corner tick accents
		draw_line(center + Vector2(-sel_r - 2.0, 0.0), center + Vector2(-sel_r + 2.0, 0.0), SELECTION_COLOR, 1.5)
		draw_line(center + Vector2(sel_r - 2.0, 0.0), center + Vector2(sel_r + 2.0, 0.0), SELECTION_COLOR, 1.5)
		draw_line(center + Vector2(0.0, -sel_r - 2.0), center + Vector2(0.0, -sel_r + 2.0), SELECTION_COLOR, 1.5)
		draw_line(center + Vector2(0.0, sel_r - 2.0), center + Vector2(0.0, sel_r + 2.0), SELECTION_COLOR, 1.5)
	elif not _hovered_organism_id.is_empty() and org_id == _hovered_organism_id:
		# 2. Render hover highlight ring (if hovered)
		var hov_r: float = 9.5
		draw_arc(center, hov_r, 0.0, TAU, 16, HOVER_COLOR, 1.2)

	# 3. Render organism morphology
	_draw_organism(org, center)

func _draw_ellipse(pos: Vector2, rx: float, ry: float, color: Color) -> void:
	var points: PackedVector2Array = PackedVector2Array()
	const SEGMENTS: int = 16
	for i in range(SEGMENTS):
		var theta: float = float(i) * TAU / float(SEGMENTS)
		points.append(pos + Vector2(cos(theta) * rx, sin(theta) * ry))
	draw_colored_polygon(points, color)

func _draw_ellipse_outline(pos: Vector2, rx: float, ry: float, color: Color, width: float = 1.0) -> void:
	var points: PackedVector2Array = PackedVector2Array()
	const SEGMENTS: int = 16
	for i in range(SEGMENTS + 1):
		var theta: float = float(i) * TAU / float(SEGMENTS)
		points.append(pos + Vector2(cos(theta) * rx, sin(theta) * ry))
	draw_polyline(points, color, width)

func _draw_organism(org: Dictionary, center: Vector2) -> void:
	var is_alive: bool = bool(org.get("is_alive", true))
	var stage_id: String = String(org.get("current_stage_id", "STAGE_EGG"))
	var sex: String = String(org.get("sex", "ASEXUAL"))
	var action_intent: String = String(org.get("action_intent", "IDLE"))
	var progress_variant: Variant = org.get("developmental_progress", null)

	# Pure procedural morphology calculation
	var morph: Dictionary = Morphology.calculate_morphology(org)
	if not morph["is_valid"]:
		push_warning("[OrganismsOverlay] Invalid visual phenotype for organism %s; rendering safe baseline" % [str(org.get("organism_id", "unknown"))])

	var body_scale: float = float(morph["body_scale"])
	var sex_color: Color = SEX_ACCENT_COLORS.get(sex, Color(0.74, 0.74, 0.74, 1.0))
	var body_color: Color = morph["cuticle_color"]
	var outline_color: Color = body_color.darkened(0.4)

	if not is_alive:
		body_color = DEAD_COLOR
		outline_color = DEAD_COLOR
		sex_color = DEAD_COLOR

	# 1. Render Shadow (Local Ellipse)
	var shadow_rx: float = 5.0 * body_scale
	var shadow_ry: float = 3.0 * body_scale
	_draw_ellipse(center + Vector2(0.0, 2.0), shadow_rx, shadow_ry, Color(0.0, 0.0, 0.0, 0.20))

	# 2. Render Tarsal Legs / Claws (ADULT Stage Only)
	if stage_id == "STAGE_ADULT" and is_alive:
		var leg_len: float = float(morph["tarsal_leg_len"])
		var claw_spread: float = float(morph["tarsal_claw_spread"])
		var leg_color: Color = outline_color
		var leg_y_offsets: Array = [-2.0, 1.0, 4.0]
		for ly in leg_y_offsets:
			var y_pos: float = float(ly) * body_scale
			var left_joint: Vector2 = center + Vector2(-float(morph["adult_pronotum_w"]) * 0.4, y_pos)
			var left_tip: Vector2 = left_joint + Vector2(-leg_len, -claw_spread if float(ly) < 0.0 else claw_spread)
			draw_line(left_joint, left_tip, leg_color, 1.2)
			var right_joint: Vector2 = center + Vector2(float(morph["adult_pronotum_w"]) * 0.4, y_pos)
			var right_tip: Vector2 = right_joint + Vector2(leg_len, -claw_spread if float(ly) < 0.0 else claw_spread)
			draw_line(right_joint, right_tip, leg_color, 1.2)

	# 3..7. Render Stage-Specific Procedural Morphology
	match stage_id:
		"STAGE_EGG":
			var rx: float = float(morph["egg_rx"])
			var ry: float = float(morph["egg_ry"])
			_draw_ellipse(center, rx, ry, body_color)
			_draw_ellipse_outline(center, rx, ry, outline_color, 1.0)

		"STAGE_LARVA":
			var w: float = float(morph["larva_width"])
			var h: float = float(morph["larva_height"])
			var seg_w: float = w / 3.0
			for s in range(3):
				var seg_center: Vector2 = center + Vector2((float(s) - 1.0) * seg_w * 0.85, 0.0)
				var seg_radius: float = (h * 0.5) * (1.0 - abs(float(s) - 1.0) * 0.15)
				draw_circle(seg_center, seg_radius, body_color)
				draw_arc(seg_center, seg_radius, 0.0, TAU, 12, outline_color, 1.0)

		"STAGE_PUPA":
			var pw: float = float(morph["pupa_width"])
			var ph: float = float(morph["pupa_height"])
			var pupa_rect: Rect2 = Rect2(center - Vector2(pw * 0.5, ph * 0.5), Vector2(pw, ph))
			draw_rect(pupa_rect, body_color, true)
			draw_rect(pupa_rect, outline_color, false, 1.2)
			draw_line(Vector2(center.x - pw * 0.4, center.y), Vector2(center.x + pw * 0.4, center.y), outline_color, 1.0)

		"STAGE_ADULT":
			# Elytra / Abdomen
			var ew: float = float(morph["adult_elytra_w"])
			var eh: float = float(morph["adult_elytra_h"])
			var elytra_center: Vector2 = center + Vector2(0.0, 2.0 * body_scale)
			var elytra_rect: Rect2 = Rect2(elytra_center - Vector2(ew * 0.5, eh * 0.5), Vector2(ew, eh))
			draw_rect(elytra_rect, body_color, true)
			draw_rect(elytra_rect, outline_color, false, 1.2)
			draw_line(Vector2(elytra_center.x, elytra_rect.position.y), Vector2(elytra_center.x, elytra_rect.end.y), outline_color, 1.0)

			# Pronotum / Thorax
			var pw: float = float(morph["adult_pronotum_w"])
			var ph: float = float(morph["adult_pronotum_h"])
			var thorax_center: Vector2 = center + Vector2(0.0, -3.0 * body_scale)
			var thorax_rect: Rect2 = Rect2(thorax_center - Vector2(pw * 0.5, ph * 0.5), Vector2(pw, ph))
			draw_rect(thorax_rect, body_color.darkened(0.15), true)
			draw_rect(thorax_rect, outline_color, false, 1.2)

			# Thoracic Horn (projects anteriorly from thorax if scale > 0.0)
			var th_len: float = float(morph["thoracic_horn_len"])
			if th_len > 0.0 and is_alive:
				var th_base: Vector2 = thorax_center + Vector2(0.0, -ph * 0.4)
				var th_tip: Vector2 = th_base + Vector2(0.0, -th_len)
				draw_line(th_base, th_tip, outline_color, 2.0)

			# Head Plate
			var hw: float = float(morph["adult_head_w"])
			var hh: float = float(morph["adult_head_h"])
			var head_center: Vector2 = thorax_center + Vector2(0.0, -(ph * 0.5 + hh * 0.4))
			var head_rect: Rect2 = Rect2(head_center - Vector2(hw * 0.5, hh * 0.5), Vector2(hw, hh))
			draw_rect(head_rect, body_color.darkened(0.25), true)
			draw_rect(head_rect, outline_color, false, 1.0)

			# Cephalic Horn (projects anteriorly from head if scale > 0.0)
			var ch_len: float = float(morph["cephalic_horn_len"])
			if ch_len > 0.0 and is_alive:
				var ch_base: Vector2 = head_center + Vector2(0.0, -hh * 0.4)
				var ch_tip: Vector2 = ch_base + Vector2(0.0, -ch_len)
				draw_line(ch_base, ch_tip, outline_color, 2.0)
				var fork_span: float = 1.5 * body_scale
				draw_line(ch_tip, ch_tip + Vector2(-fork_span, -1.5), outline_color, 1.2)
				draw_line(ch_tip, ch_tip + Vector2(fork_span, -1.5), outline_color, 1.2)

		_:
			draw_circle(center, 3.0, body_color)

	# 8. Render Sex Accent Ring
	if is_alive:
		var accent_r: float = 6.0 * body_scale
		draw_arc(center, accent_r, 0.0, TAU, 16, sex_color, 1.0)

	# 9. Render Developmental Progress Arc
	if is_alive:
		var is_numeric: bool = (typeof(progress_variant) == TYPE_FLOAT or typeof(progress_variant) == TYPE_INT)
		var is_valid: bool = false
		var p: float = 0.0

		if is_numeric:
			p = float(progress_variant)
			if not is_nan(p) and not is_inf(p) and p >= 0.0 and p <= 1.0:
				is_valid = true

		if not is_valid:
			push_warning("[OrganismsOverlay] Invalid developmental_progress %s for organism %s; omitted arc" % [str(progress_variant), str(org.get("organism_id", "unknown"))])
		else:
			if p > 0.0:
				var arc_r: float = 7.5 * body_scale
				var end_angle: float = p * TAU
				draw_arc(center, arc_r, -PI * 0.5, -PI * 0.5 + end_angle, 20, Color(0.2, 0.8, 0.9, 0.8), 1.2)

	# 10. Render Action Intent Indicator Dot
	if is_alive:
		var action_color: Color = ACTION_COLORS.get(action_intent, Color(0.7, 0.7, 0.7, 1.0))
		var dot_pos: Vector2 = center + Vector2(5.5, -5.5) * body_scale
		draw_circle(dot_pos, 1.5, action_color)

	# 11. Render Dead Organism 'X' Cross Marker
	if not is_alive:
		var x_half: float = 4.5 * body_scale
		draw_line(center - Vector2(x_half, x_half), center + Vector2(x_half, x_half), Color(0.3, 0.3, 0.3, 0.9), 1.5)
		draw_line(center - Vector2(-x_half, x_half), center + Vector2(-x_half, x_half), Color(0.3, 0.3, 0.3, 0.9), 1.5)

func _draw_stack_badge(origin: Vector2, extra_count: int) -> void:
	var badge_pos: Vector2 = origin + Vector2(12.0, 4.0)
	var badge_text: String = "+%d" % extra_count
	draw_circle(badge_pos, 4.0, Color(0.15, 0.15, 0.15, 0.9))
	draw_arc(badge_pos, 4.0, 0.0, TAU, 12, Color(1.0, 1.0, 1.0, 0.95), 1.0)
	var font: Font = ThemeDB.fallback_font
	if font != null:
		draw_string(font, badge_pos + Vector2(-3.0, 3.0), badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 7, Color.WHITE)
