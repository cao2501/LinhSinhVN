class_name OrganismInspectionUI
extends Control

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01-C / C-09-E Organism Inspection UI
#
# PRESENTATION-ONLY ORGANISM INSPECTION PANEL:
# - OrganismInspectionUI receives selection from OrganismsOverlay and reads
#   the latest accepted organism presentation record exposed by that overlay.
# - Controlled strictly by OrganismsOverlay selection state (organism_selected signal).
# - ZERO synchronizer binding: pure UI discovery of OrganismsOverlay.
# - ZERO simulation authority: never issues IPC commands, never mutates state.
# - ZERO raw genetics exposure from UI rendering.
# - FAIL-CLOSED: NEVER manufactures biological defaults when fields are absent
#   or invalid. Missing/invalid values fail closed to "—".
# - Hidden by default; displayed when an organism is selected; hidden on deselect or reset.
# ==============================================================================

@export var organisms_overlay_path: NodePath = NodePath("../../OrganismsOverlay")

var _overlay: Node = null
var _current_organism_id: String = ""

# Internal UI nodes (constructed dynamically in _ready to avoid complex scene dependencies)
var _panel: PanelContainer
var _id_label: Label
var _species_label: Label
var _sex_gen_label: Label
var _status_label: Label
var _stage_action_label: Label
var _progress_label: Label
var _vitals_label: Label
var _spatial_label: Label
var _phenotype_label: Label
var _close_button: Button

func _ready() -> void:
	visible = false
	_build_ui()
	_bind_overlay()

func _bind_overlay() -> void:
	if _overlay == null:
		if has_node(organisms_overlay_path):
			_overlay = get_node_or_null(organisms_overlay_path)
		elif get_parent() != null and get_parent().get_parent() != null:
			_overlay = get_parent().get_parent().get_node_or_null("OrganismsOverlay")

	if _overlay != null:
		if _overlay.has_signal("organism_selected") and not _overlay.organism_selected.is_connected(_on_organism_selected):
			_overlay.organism_selected.connect(_on_organism_selected)

func _build_ui() -> void:
	# Fixed top-left positioning within UI CanvasLayer
	position = Vector2(10.0, 10.0)
	custom_minimum_size = Vector2(250.0, 310.0)
	size = Vector2(250.0, 310.0)

	_panel = PanelContainer.new()
	_panel.anchors_preset = Control.PRESET_FULL_RECT
	_panel.size = size
	add_child(_panel)

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_panel.add_child(margin)

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	margin.add_child(vbox)

	# 1. Header (Title + Close Button)
	var header: HBoxContainer = HBoxContainer.new()
	vbox.add_child(header)

	var title: Label = Label.new()
	title.text = "ORGANISM INSPECTOR"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 12)
	header.add_child(title)

	_close_button = Button.new()
	_close_button.text = "X"
	_close_button.custom_minimum_size = Vector2(24.0, 20.0)
	_close_button.pressed.connect(_on_close_pressed)
	header.add_child(_close_button)

	var sep1: HSeparator = HSeparator.new()
	vbox.add_child(sep1)

	# 2. Identity Section
	_id_label = Label.new()
	_id_label.text = "ID: —"
	vbox.add_child(_id_label)

	_species_label = Label.new()
	_species_label.text = "Species: —"
	vbox.add_child(_species_label)

	_sex_gen_label = Label.new()
	_sex_gen_label.text = "Sex: — | Gen: —"
	vbox.add_child(_sex_gen_label)

	_status_label = Label.new()
	_status_label.text = "Status: —"
	vbox.add_child(_status_label)

	var sep2: HSeparator = HSeparator.new()
	vbox.add_child(sep2)

	# 3. Biology Section
	_stage_action_label = Label.new()
	_stage_action_label.text = "Stage: — | Action: —"
	vbox.add_child(_stage_action_label)

	_progress_label = Label.new()
	_progress_label.text = "Progress: —"
	vbox.add_child(_progress_label)

	# 4. Vitals Section
	_vitals_label = Label.new()
	_vitals_label.text = "Energy: — | Biomass: —"
	vbox.add_child(_vitals_label)

	# 5. Spatial Section
	_spatial_label = Label.new()
	_spatial_label.text = "Pos: — | Shelter: —"
	vbox.add_child(_spatial_label)

	var sep3: HSeparator = HSeparator.new()
	vbox.add_child(sep3)

	# 6. Phenotype Section
	_phenotype_label = Label.new()
	_phenotype_label.text = "Phenotype: —"
	_phenotype_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_phenotype_label)

func _on_close_pressed() -> void:
	if _overlay != null and _overlay.has_method("select_organism"):
		_overlay.select_organism("")
	else:
		_on_organism_selected("")

func _on_organism_selected(org_id: String) -> void:
	_current_organism_id = org_id
	refresh()

func _read_required_string(dict: Dictionary, key: String, fallback_key: String = "") -> String:
	if dict.has(key) and dict[key] != null and typeof(dict[key]) == TYPE_STRING:
		var s: String = String(dict[key]).strip_edges()
		if not s.is_empty():
			return s
	if not fallback_key.is_empty() and dict.has(fallback_key) and dict[fallback_key] != null and typeof(dict[fallback_key]) == TYPE_STRING:
		var s_fb: String = String(dict[fallback_key]).strip_edges()
		if not s_fb.is_empty():
			return s_fb
	return "—"

func _read_required_number(dict: Dictionary, key: String) -> String:
	if dict.has(key) and dict[key] != null and (typeof(dict[key]) == TYPE_FLOAT or typeof(dict[key]) == TYPE_INT):
		var val: float = float(dict[key])
		if not is_nan(val) and not is_inf(val):
			return "%.2f" % val
	return "—"

func _read_required_float(dict: Dictionary, key: String, decimals: int = 1) -> String:
	if dict.has(key) and dict[key] != null and (typeof(dict[key]) == TYPE_FLOAT or typeof(dict[key]) == TYPE_INT):
		var val: float = float(dict[key])
		if not is_nan(val) and not is_inf(val):
			return ("%." + str(decimals) + "f") % val
	return "—"

func _read_required_int(dict: Dictionary, key: String) -> String:
	if dict.has(key) and dict[key] != null and (typeof(dict[key]) == TYPE_INT or typeof(dict[key]) == TYPE_FLOAT):
		var val: float = float(dict[key])
		if not is_nan(val) and not is_inf(val):
			return str(int(val))
	return "—"

func refresh() -> void:
	if _current_organism_id.is_empty():
		visible = false
		return

	if _overlay == null:
		_bind_overlay()
	if _overlay == null or not _overlay.has_method("get_organism_by_id"):
		visible = false
		return

	var org: Dictionary = _overlay.get_organism_by_id(_current_organism_id)
	if org.is_empty():
		visible = false
		return

	# Populate UI fields strictly from accepted snapshot data without fabricated fallbacks
	var status_text: String = "Status: —"
	var status_color: Color = Color(0.7, 0.7, 0.7, 1.0)
	if org.has("is_alive") and org["is_alive"] != null and typeof(org["is_alive"]) == TYPE_BOOL:
		if bool(org["is_alive"]):
			status_text = "Status: ALIVE"
			status_color = Color(0.3, 0.9, 0.3, 1.0)
		else:
			status_text = "Status: DEAD"
			status_color = Color(0.7, 0.7, 0.7, 1.0)

	var species: String = _read_required_string(org, "species_id")
	var sex: String = _read_required_string(org, "sex")
	var gen: String = _read_required_int(org, "generation")

	var stage_label: String = _read_required_string(org, "stage_display_label", "current_stage_id")
	var action_label: String = _read_required_string(org, "action_display_label", "action_intent")

	var dev_prog_str: String = "—"
	if org.has("developmental_progress") and org["developmental_progress"] != null and (typeof(org["developmental_progress"]) == TYPE_FLOAT or typeof(org["developmental_progress"]) == TYPE_INT):
		var dp: float = float(org["developmental_progress"])
		if not is_nan(dp) and not is_inf(dp):
			dev_prog_str = "%.1f%%" % (dp * 100.0)

	var energy: String = _read_required_float(org, "stored_energy", 1)
	var biomass: String = _read_required_float(org, "structural_biomass", 1)

	var pos_str: String = "—"
	if org.has("position") and org["position"] != null and typeof(org["position"]) == TYPE_DICTIONARY:
		var pos_dict: Dictionary = org["position"]
		if pos_dict.has("x") and pos_dict.has("y") and pos_dict.has("z") and pos_dict["x"] != null and pos_dict["y"] != null and pos_dict["z"] != null:
			var px: float = float(pos_dict["x"])
			var py: float = float(pos_dict["y"])
			var pz: float = float(pos_dict["z"])
			if not is_nan(px) and not is_nan(py) and not is_nan(pz) and not is_inf(px) and not is_inf(py) and not is_inf(pz):
				pos_str = "(%d, %d, %d)" % [int(px), int(py), int(pz)]

	var habitat: String = _read_required_string(org, "habitat_id")

	var shelter_str: String = "—"
	if org.has("sheltered_in"):
		var shelter: Variant = org["sheltered_in"]
		if shelter == null:
			shelter_str = "None"
		elif typeof(shelter) == TYPE_STRING:
			var s_val: String = String(shelter).strip_edges()
			shelter_str = s_val if not s_val.is_empty() else "—"
		else:
			shelter_str = String(shelter)

	var scale_idx: String = _read_required_number(org, "body_scale_index")
	var pigment: String = _read_required_number(org, "cuticle_pigment_ratio")
	var ch_horn: String = _read_required_number(org, "cephalic_horn_scale")
	var th_horn: String = _read_required_number(org, "thoracic_horn_scale")
	var tarsal: String = _read_required_number(org, "tarsal_grip_index")

	# Format Labels
	_id_label.text = "ID: %s" % _current_organism_id
	_species_label.text = "Species: %s" % species
	_sex_gen_label.text = "Sex: %s | Gen: %s" % [sex, gen]

	_status_label.text = status_text
	_status_label.modulate = status_color

	_stage_action_label.text = "Stage: %s | Action: %s" % [stage_label, action_label]
	_progress_label.text = "Progress: %s" % dev_prog_str
	_vitals_label.text = "Energy: %s | Biomass: %s" % [energy, biomass]
	_spatial_label.text = "Pos: %s | Shelter: %s" % [pos_str, shelter_str]
	_phenotype_label.text = "Scale: %s | Pigment: %s | Grip: %s\nHorns: C=%s, T=%s" % [scale_idx, pigment, tarsal, ch_horn, th_horn]

	visible = true

func get_current_organism_id() -> String:
	return _current_organism_id

func is_panel_visible() -> bool:
	return visible
