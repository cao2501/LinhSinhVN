class_name OrganismInspectionUI
extends Control

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01-C / C-09-E Organism Inspection UI
#
# PRESENTATION-ONLY ORGANISM INSPECTION PANEL:
# - Displays read-only identity, biology, vitals, spatial, and phenotype data
#   from the latest accepted presentation snapshot.
# - Controlled strictly by OrganismsOverlay selection state (organism_selected signal).
# - ZERO simulation authority: never issues IPC commands, never mutates state.
# - ZERO raw genetics exposure from UI rendering.
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
	_progress_label.text = "Development: —"
	vbox.add_child(_progress_label)

	# 4. Vitals Section
	_vitals_label = Label.new()
	_vitals_label.text = "Energy: — | Biomass: —"
	vbox.add_child(_vitals_label)

	# 5. Spatial Section
	_spatial_label = Label.new()
	_spatial_label.text = "Pos: — | Habitat: —"
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

	# Populate UI fields strictly from accepted snapshot data
	var is_alive: bool = bool(org.get("is_alive", true))
	var species: String = String(org.get("species_id", "xylotrupes_rhinoceros"))
	var sex: String = String(org.get("sex", "UNKNOWN"))
	var gen: int = int(org.get("generation", 1))
	var stage_label: String = String(org.get("stage_display_label", String(org.get("current_stage_id", "STAGE_EGG"))))
	var action_label: String = String(org.get("action_display_label", String(org.get("action_intent", "IDLE"))))
	var dev_prog: float = float(org.get("developmental_progress", 0.0))
	var energy: float = float(org.get("stored_energy", 0.0))
	var biomass: float = float(org.get("structural_biomass", 0.0))

	var pos_dict: Dictionary = org.get("position", {})
	var px: int = int(pos_dict.get("x", 0))
	var py: int = int(pos_dict.get("y", 0))
	var pz: int = int(pos_dict.get("z", 0))
	var habitat: String = String(org.get("habitat_id", "unknown"))
	var shelter: Variant = org.get("sheltered_in", null)
	var shelter_str: String = String(shelter) if shelter != null else "None"

	var scale_idx: float = float(org.get("body_scale_index", 1.0))
	var pigment: float = float(org.get("cuticle_pigment_ratio", 0.5))
	var ch_horn: float = float(org.get("cephalic_horn_scale", 0.0))
	var th_horn: float = float(org.get("thoracic_horn_scale", 0.0))
	var tarsal: float = float(org.get("tarsal_grip_index", 1.0))

	# Format Labels
	_id_label.text = "ID: %s" % _current_organism_id
	_species_label.text = "Species: %s" % species
	_sex_gen_label.text = "Sex: %s | Gen: %d" % [sex, gen]

	if is_alive:
		_status_label.text = "Status: ALIVE"
		_status_label.modulate = Color(0.3, 0.9, 0.3, 1.0)
	else:
		_status_label.text = "Status: DEAD"
		_status_label.modulate = Color(0.7, 0.7, 0.7, 1.0)

	_stage_action_label.text = "Stage: %s | Action: %s" % [stage_label, action_label]
	_progress_label.text = "Progress: %.1f%%" % (dev_prog * 100.0)
	_vitals_label.text = "Energy: %.1f | Biomass: %.1f" % [energy, biomass]
	_spatial_label.text = "Pos: (%d, %d, %d) | Shelter: %s" % [px, py, pz, shelter_str]
	_phenotype_label.text = "Scale: %.2f | Pigment: %.2f | Grip: %.2f\nHorns: C=%.2f, T=%.2f" % [scale_idx, pigment, tarsal, ch_horn, th_horn]

	visible = true

func get_current_organism_id() -> String:
	return _current_organism_id

func is_panel_visible() -> bool:
	return visible
