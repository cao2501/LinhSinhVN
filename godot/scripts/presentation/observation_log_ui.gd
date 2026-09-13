# ==============================================================================
# LinhSinhVN — DEMO-01-C / C-07: Presentation Observation Log UI
# File: godot/scripts/presentation/observation_log_ui.gd
# Base Commit: 60bc129
#
# PRESENTATION-ONLY CONTROLLER / DECORATOR (OPTION C).
# - Exclusive UI concern: formats rows, manages empty state, styles epoch banners, controls scrolling.
# - Zero row instantiation: ObservationLog (C-06) remains sole owner of row Label creation & eviction.
# - Zero observation authority: does not generate observations, does not mutate observation history.
# - Zero second ring buffer: inspects existing LogList children only.
# - Category badges: [SIM], [PLAY], [NET], [VIEW].
# - Verbatim summary preservation: never rewrites or infers biological facts.
# - Reset styling: decorates SIMULATION_RESET row as epoch banner without creating fake entries.
# - Auto-scroll: tracks user scroll position, pauses when user scrolls up, resumes at bottom.
# ==============================================================================

class_name ObservationLogUI
extends Node

const CATEGORY_BADGES: Dictionary = {
	"SIMULATION": "[SIM]",
	"PLAYBACK": "[PLAY]",
	"TRANSPORT": "[NET]",
	"VIEW": "[VIEW]"
}

@export var observation_log_path: NodePath = NodePath("..")
@export var empty_state_label_path: NodePath = NodePath("../MarginContainer/VBoxContainer/EmptyStateLabel")
@export var scroll_container_path: NodePath = NodePath("../MarginContainer/VBoxContainer/ScrollContainer")
@export var log_container_path: NodePath = NodePath("../MarginContainer/VBoxContainer/ScrollContainer/LogList")

@onready var _observation_log: ObservationLog = get_node_or_null(observation_log_path) as ObservationLog
@onready var _empty_state_label: Label = get_node_or_null(empty_state_label_path) as Label
@onready var _scroll_container: ScrollContainer = get_node_or_null(scroll_container_path) as ScrollContainer
@onready var _log_container: VBoxContainer = get_node_or_null(log_container_path) as VBoxContainer

var _auto_scroll_enabled: bool = true

func _ready() -> void:
	# 1. Connect to authoritative ObservationLog signals
	if _observation_log != null:
		if _observation_log.has_signal("observation_appended") and not _observation_log.observation_appended.is_connected(_on_observation_appended):
			_observation_log.observation_appended.connect(_on_observation_appended)
		if _observation_log.has_signal("log_cleared") and not _observation_log.log_cleared.is_connected(_on_log_cleared):
			_observation_log.log_cleared.connect(_on_log_cleared)

	# 2. Hook scroll bar for auto-scroll pause/resume
	if _scroll_container != null:
		var vbar: VScrollBar = _scroll_container.get_v_scroll_bar()
		if vbar != null and not vbar.value_changed.is_connected(_on_scroll_value_changed):
			vbar.value_changed.connect(_on_scroll_value_changed)

	# 3. Synchronize initial empty-state display
	_update_empty_state()

# --- Public Inspection API (For Presentation Tests & UI Query) ---

func is_empty_state_visible() -> bool:
	if _empty_state_label != null:
		return _empty_state_label.visible
	return false

func is_auto_scroll_enabled() -> bool:
	return _auto_scroll_enabled

func set_auto_scroll_enabled(enabled: bool) -> void:
	_auto_scroll_enabled = enabled

func get_displayed_row_count() -> int:
	if _log_container != null:
		return _log_container.get_child_count()
	return 0

func get_row_text(index: int) -> String:
	if _log_container != null and index >= 0 and index < _log_container.get_child_count():
		var row: Label = _log_container.get_child(index) as Label
		if row != null:
			return row.text
	return ""

# --- Formatting Helper (Deterministic Pure Function) ---

static func format_observation_text(entry: Dictionary) -> String:
	var obs_type: String = String(entry.get("type", ""))
	var epoch: int = int(entry.get("session_epoch", 0))
	var tick_val: Variant = entry.get("simulation_tick", null)
	var summary: String = String(entry.get("summary", ""))
	var seq_id: int = int(entry.get("sequence_id", 0))

	# Strict presentation tick representation (TYPE_INT and >= 0 only; float/negative/string/null -> "—")
	var tick_str: String = "—"
	if tick_val != null and typeof(tick_val) == TYPE_INT and int(tick_val) >= 0:
		tick_str = "T%d" % int(tick_val)

	# Reset visual demarcation banner: preserves verbatim summary
	if obs_type == "SIMULATION_RESET":
		if summary.is_empty():
			return "=== EPOCH %d RESET | TICK %s ===" % [epoch, tick_str]
		return "=== EPOCH %d RESET | TICK %s === %s" % [epoch, tick_str, summary]

	# Category badge lookup (SIMULATION -> [SIM], PLAYBACK -> [PLAY], TRANSPORT -> [NET], VIEW -> [VIEW])
	var cat_str: String = String(entry.get("category", "SIMULATION"))
	var badge: String = CATEGORY_BADGES.get(cat_str, "[%s]" % cat_str)

	# Standard formatted row: [#seq | E<epoch> | <tick> | <badge>] <verbatim summary>
	return "[#%d | E%d | %s | %s] %s" % [seq_id, epoch, tick_str, badge, summary]

# --- Signal Handlers ---

func _on_observation_appended(entry: Dictionary) -> void:
	# Hide empty state on first incoming observation
	if _empty_state_label != null and _empty_state_label.visible:
		_empty_state_label.visible = false

	# Single Renderer Rule: ObservationLog already instantiated and appended the row Label.
	# ObservationLogUI decorates that existing Label in place without adding/removing nodes.
	if _log_container != null and _log_container.get_child_count() > 0:
		var newest_row: Label = _log_container.get_child(_log_container.get_child_count() - 1) as Label
		if newest_row != null:
			newest_row.text = format_observation_text(entry)

	# Presentation scroll adjustment
	if _auto_scroll_enabled and _scroll_container != null:
		_scroll_to_bottom()

func _on_log_cleared() -> void:
	# Reveal empty-state label
	if _empty_state_label != null:
		_empty_state_label.visible = true

	# Reset scroll
	_auto_scroll_enabled = true
	if _scroll_container != null:
		_scroll_container.scroll_vertical = 0

func _on_scroll_value_changed(value: float) -> void:
	if _scroll_container != null:
		var vbar: VScrollBar = _scroll_container.get_v_scroll_bar()
		if vbar != null:
			# If user scrolled away from bottom by more than 4 pixels, pause auto-scroll
			var distance_from_bottom: float = vbar.max_value - (value + vbar.page)
			if distance_from_bottom > 4.0:
				_auto_scroll_enabled = false
			else:
				_auto_scroll_enabled = true

func _scroll_to_bottom() -> void:
	if _scroll_container != null:
		var vbar: VScrollBar = _scroll_container.get_v_scroll_bar()
		if vbar != null:
			_scroll_container.scroll_vertical = int(vbar.max_value)

func _update_empty_state() -> void:
	if _empty_state_label != null:
		var count: int = 0
		if _observation_log != null:
			count = _observation_log.get_observation_count()
		elif _log_container != null:
			count = _log_container.get_child_count()
		_empty_state_label.visible = (count == 0)
