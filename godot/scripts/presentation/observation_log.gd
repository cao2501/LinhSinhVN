# ==============================================================================
# LinhSinhVN — DEMO-01-C / C-06: Presentation Observation Log
# File: godot/scripts/presentation/observation_log.gd
# Base Commit: 849e93a
#
# PRESENTATION-ONLY OBSERVATION CONSUMER.
# - Owns presentation-local observation history and UI display.
# - Observes raw authoritative IPC responses (Option A) and presentation signals.
# - Zero simulation authority: no SimulationWorld, no step(), no tick advancement.
# - Zero synchronization authority: SnapshotSynchronizer remains sole authority.
# - Zero biological calculations, zero RNG, zero wall-clock timing, zero interpolation.
# - Presentation-local acceptance aligned with C-04 acceptance contract.
# - Globally monotonic sequence_id (never rewound or reset by simulation reset).
# - Command-level reset correlation (command == "reset"). Tick 0 non-reset protected.
# - Strict cross-reset diff isolation (epoch N snapshot never diffed against epoch N+1).
# - ORGANISM_APPEARED represents presentation baseline visibility, NOT biological birth.
# - Deterministic batch ordering with binary code-point string comparator.
# - Ring buffer capped at MAX_ENTRIES (100). UI clear does not reset sequence or epoch.
# ==============================================================================

class_name ObservationLog
extends Control

signal observation_appended(entry: Dictionary)
signal log_cleared()

const MAX_ENTRIES: int = 100

const TYPE_RANKS: Dictionary = {
	"SIMULATION_RESET": 0,
	"ORGANISM_APPEARED": 1,
	"STAGE_TRANSITION": 2,
	"ACTION_INTENT_CHANGED": 3,
	"ORGANISM_DIED": 4,
	"CENSUS_UPDATED": 5
}

@export var ipc_client_path: NodePath = NodePath("../../IpcClient")
@export var snapshot_synchronizer_path: NodePath = NodePath("../../SnapshotSynchronizer")
@export var world_view_path: NodePath = NodePath("../..")

# UI node references (optional / bound dynamically if present)
@onready var clear_button: Button = get_node_or_null("MarginContainer/VBoxContainer/Header/ClearButton")
@onready var log_container: VBoxContainer = get_node_or_null("MarginContainer/VBoxContainer/ScrollContainer/LogList")
@onready var scroll_container: ScrollContainer = get_node_or_null("MarginContainer/VBoxContainer/ScrollContainer")

# Presentation-local observer state
var _last_diffed_tick: int = -1
var _has_snapshot_baseline: bool = false
var _previous_snapshot_map: Dictionary = {}
var _previous_census: Dictionary = {}
var _session_epoch: int = 0
var _sequence_id: int = 0
var _observation_ring: Array = []

func _ready() -> void:
	# 1. Connect to IpcClient response_received
	var ipc: Node = get_node_or_null(ipc_client_path)
	if ipc != null:
		if ipc.has_signal("response_received") and not ipc.response_received.is_connected(_on_ipc_response_received):
			ipc.response_received.connect(_on_ipc_response_received)

	# 2. Connect to SnapshotSynchronizer signals
	var sync: Node = get_node_or_null(snapshot_synchronizer_path)
	if sync != null:
		if sync.has_signal("playback_status_changed") and not sync.playback_status_changed.is_connected(_on_playback_status_changed):
			sync.playback_status_changed.connect(_on_playback_status_changed)
		if sync.has_signal("bridge_state_changed") and not sync.bridge_state_changed.is_connected(_on_bridge_state_changed):
			sync.bridge_state_changed.connect(_on_bridge_state_changed)

	# 3. Connect to WorldView z_layer_changed
	var wv: Node = get_node_or_null(world_view_path)
	if wv != null:
		if wv.has_signal("z_layer_changed") and not wv.z_layer_changed.is_connected(_on_z_layer_changed):
			wv.z_layer_changed.connect(_on_z_layer_changed)

	# 4. Wire clear button if present
	if clear_button != null and not clear_button.pressed.is_connected(_on_clear_button_pressed):
		clear_button.pressed.connect(_on_clear_button_pressed)

# --- Public Inspection API ---

func get_last_diffed_tick() -> int:
	return _last_diffed_tick

func has_snapshot_baseline() -> bool:
	return _has_snapshot_baseline

func get_session_epoch() -> int:
	return _session_epoch

func get_sequence_id() -> int:
	return _sequence_id

func get_observation_count() -> int:
	return _observation_ring.size()

func get_observations() -> Array:
	return _observation_ring.duplicate(true)

func get_previous_census() -> Dictionary:
	return _previous_census.duplicate(true)

func clear_log() -> void:
	_observation_ring.clear()
	if log_container != null:
		for child in log_container.get_children():
			child.queue_free()
	log_cleared.emit()

func _on_clear_button_pressed() -> void:
	clear_log()

# --- Signal Handlers: Presentation-Only Observations ---

func _on_playback_status_changed(status: String) -> void:
	_append_presentation_observation("PLAYBACK", "PLAYBACK_STATE_CHANGED", "system", "Playback status: %s" % status, {"status": status})

func _on_bridge_state_changed(state: String) -> void:
	_append_presentation_observation("TRANSPORT", "BRIDGE_STATE_CHANGED", "system", "Bridge transport: %s" % state, {"state": state})

func _on_z_layer_changed(new_layer: int) -> void:
	_append_presentation_observation("VIEW", "Z_LAYER_CHANGED", "system", "Active view layer: Z=%d" % new_layer, {"z": new_layer})

# --- Signal Handler: Authoritative IPC Response Observer ---

func _on_ipc_response_received(response: Dictionary) -> void:
	# 1. Error envelopes never produce simulation observations
	var is_success: bool = bool(response.get("success", false))
	if not is_success:
		return

	var command: String = String(response.get("command", ""))
	var result_var: Variant = response.get("result", null)
	if typeof(result_var) != TYPE_DICTIONARY:
		return
	var result: Dictionary = result_var

	# 2. Filter commands that carry snapshots
	if command != "step" and command != "getSnapshot" and command != "reset":
		return

	var snapshot_var: Variant = result.get("snapshot", null)
	if typeof(snapshot_var) != TYPE_DICTIONARY:
		return
	var snapshot: Dictionary = snapshot_var

	# 3. Strict integer simulation_tick validation (TYPE_INT only, no floats, no strings)
	var tick_var: Variant = snapshot.get("simulation_tick", null)
	if typeof(tick_var) != TYPE_INT:
		push_warning("[ObservationLog] Malformed snapshot: missing or non-integer simulation_tick")
		return

	var tick: int = tick_var
	if tick < 0:
		push_warning("[ObservationLog] Malformed snapshot: negative simulation_tick %d" % tick)
		return

	# 4. Command-level reset correlation
	if command == "reset":
		_process_reset_snapshot(snapshot, tick)
		return

	# 5. Presentation-local snapshot acceptance contract
	if tick > _last_diffed_tick:
		_process_newer_snapshot(snapshot, tick)
	elif tick == _last_diffed_tick:
		# IGNORE_DUPLICATE: zero diff, zero log entries
		pass
	else:
		# REJECT_STALE: zero diff, warning, zero log entries
		push_warning("[ObservationLog] Stale snapshot dropped: tick %d < last %d (epoch %d)" % [tick, _last_diffed_tick, _session_epoch])

# --- Snapshot Processing ---

func _process_reset_snapshot(snapshot: Dictionary, tick: int) -> void:
	# Invariant: Cross-Reset Diff Isolation
	# Clear previous snapshot baseline map BEFORE seeding new epoch baseline
	_has_snapshot_baseline = false
	_session_epoch += 1
	_last_diffed_tick = tick
	_previous_snapshot_map.clear()
	_previous_census.clear()

	# Presentation UI visual cleanup on reset
	_observation_ring.clear()
	if log_container != null:
		for child in log_container.get_children():
			child.queue_free()

	# Exactly one SIMULATION_RESET observation (sequence_id preserved and incremented)
	var reset_obs: Dictionary = {
		"category": "SIMULATION",
		"type": "SIMULATION_RESET",
		"simulation_tick": tick,
		"entity_id": "system",
		"summary": "Simulation reset to tick %d (Epoch %d)" % [tick, _session_epoch],
		"details": {"epoch": _session_epoch, "tick": tick}
	}
	_append_observation(reset_obs)

	# Seed reset baseline organisms
	var organisms_var: Variant = snapshot.get("organisms", [])
	if typeof(organisms_var) == TYPE_ARRAY:
		var current_map: Dictionary = _index_organisms(organisms_var)
		var appearance_batch: Array = []

		# Sort organism IDs deterministically
		var org_ids: Array = current_map.keys()
		_sort_string_array(org_ids)

		for org_id_str in org_ids:
			var org: Dictionary = current_map[org_id_str]
			appearance_batch.append({
				"category": "SIMULATION",
				"type": "ORGANISM_APPEARED",
				"simulation_tick": tick,
				"entity_id": org_id_str,
				"summary": "Organism %s appeared in presentation snapshot as %s at (%d, %d, %d)" % [
					org_id_str,
					String(org.get("current_stage_id", "")),
					int(org.get("pos_x", 0)),
					int(org.get("pos_y", 0)),
					int(org.get("pos_z", 0))
				],
				"details": {
					"stage_id": String(org.get("current_stage_id", "")),
					"pos": {"x": int(org.get("pos_x", 0)), "y": int(org.get("pos_y", 0)), "z": int(org.get("pos_z", 0))}
				}
			})

		for obs in appearance_batch:
			_append_observation(obs)

		_previous_snapshot_map = current_map

	# Seed reset baseline census (do NOT emit CENSUS_UPDATED merely because reset occurred)
	var census_var: Variant = snapshot.get("census", null)
	if typeof(census_var) == TYPE_DICTIONARY:
		_previous_census = (census_var as Dictionary).duplicate(true)
	else:
		_previous_census.clear()

	_has_snapshot_baseline = true

func _process_newer_snapshot(snapshot: Dictionary, tick: int) -> void:
	var organisms_var: Variant = snapshot.get("organisms", [])
	if typeof(organisms_var) != TYPE_ARRAY:
		_last_diffed_tick = tick
		return

	var current_map: Dictionary = _index_organisms(organisms_var)
	var candidate_batch: Array = []

	# First snapshot of session (when _previous_snapshot_map is empty and last tick was -1)
	if not _has_snapshot_baseline:
		var org_ids: Array = current_map.keys()
		_sort_string_array(org_ids)

		for org_id_str in org_ids:
			var org: Dictionary = current_map[org_id_str]
			candidate_batch.append({
				"category": "SIMULATION",
				"type": "ORGANISM_APPEARED",
				"simulation_tick": tick,
				"entity_id": org_id_str,
				"summary": "Organism %s appeared in presentation snapshot as %s at (%d, %d, %d)" % [
					org_id_str,
					String(org.get("current_stage_id", "")),
					int(org.get("pos_x", 0)),
					int(org.get("pos_y", 0)),
					int(org.get("pos_z", 0))
				],
				"details": {
					"stage_id": String(org.get("current_stage_id", "")),
					"pos": {"x": int(org.get("pos_x", 0)), "y": int(org.get("pos_y", 0)), "z": int(org.get("pos_z", 0))}
				}
			})

		# Establish census baseline on first snapshot (do NOT emit CENSUS_UPDATED)
		var census_var: Variant = snapshot.get("census", null)
		if typeof(census_var) == TYPE_DICTIONARY:
			_previous_census = (census_var as Dictionary).duplicate(true)
		else:
			_previous_census.clear()

		_has_snapshot_baseline = true
	else:
		# Subsequent snapshot diff
		var current_ids: Array = current_map.keys()
		var all_ids_set: Dictionary = {}
		for id_var in _previous_snapshot_map.keys():
			all_ids_set[id_var] = true
		for id_var in current_ids:
			all_ids_set[id_var] = true

		var all_ids: Array = all_ids_set.keys()
		_sort_string_array(all_ids)

		for id_var in all_ids:
			var id_str: String = String(id_var)
			var in_prev: bool = _previous_snapshot_map.has(id_str)
			var in_curr: bool = current_map.has(id_str)

			if not in_prev and in_curr:
				# Organism newly appeared
				var org: Dictionary = current_map[id_str]
				candidate_batch.append({
					"category": "SIMULATION",
					"type": "ORGANISM_APPEARED",
					"simulation_tick": tick,
					"entity_id": id_str,
					"summary": "Organism %s appeared in presentation snapshot as %s at (%d, %d, %d)" % [
						id_str,
						String(org.get("current_stage_id", "")),
						int(org.get("pos_x", 0)),
						int(org.get("pos_y", 0)),
						int(org.get("pos_z", 0))
					],
					"details": {
						"stage_id": String(org.get("current_stage_id", "")),
						"pos": {"x": int(org.get("pos_x", 0)), "y": int(org.get("pos_y", 0)), "z": int(org.get("pos_z", 0))}
					}
				})
			elif in_prev and in_curr:
				var prev_org: Dictionary = _previous_snapshot_map[id_str]
				var curr_org: Dictionary = current_map[id_str]

				# 1. Stage transition check
				var prev_stage: String = String(prev_org.get("current_stage_id", ""))
				var curr_stage: String = String(curr_org.get("current_stage_id", ""))
				if prev_stage != curr_stage:
					candidate_batch.append({
						"category": "SIMULATION",
						"type": "STAGE_TRANSITION",
						"simulation_tick": tick,
						"entity_id": id_str,
						"summary": "Organism %s transitioned stage: %s -> %s" % [id_str, prev_stage, curr_stage],
						"details": {"from": prev_stage, "to": curr_stage}
					})

				# 2. Action intent check
				var prev_action: String = String(prev_org.get("action_intent", ""))
				var curr_action: String = String(curr_org.get("action_intent", ""))
				if prev_action != curr_action:
					candidate_batch.append({
						"category": "SIMULATION",
						"type": "ACTION_INTENT_CHANGED",
						"simulation_tick": tick,
						"entity_id": id_str,
						"summary": "Organism %s intent changed: %s -> %s" % [id_str, prev_action, curr_action],
						"details": {"from": prev_action, "to": curr_action}
					})

				# 3. Death check (prev alive -> curr dead)
				var prev_alive: bool = bool(prev_org.get("is_alive", true))
				var curr_alive: bool = bool(curr_org.get("is_alive", true))
				if prev_alive and not curr_alive:
					candidate_batch.append({
						"category": "SIMULATION",
						"type": "ORGANISM_DIED",
						"simulation_tick": tick,
						"entity_id": id_str,
						"summary": "Organism %s died at tick %d" % [id_str, tick],
						"details": {"tick": tick}
					})
			elif in_prev and not in_curr:
				# Organism was present and disappeared (e.g. population dropped to empty snapshot)
				var prev_org: Dictionary = _previous_snapshot_map[id_str]
				var prev_alive: bool = bool(prev_org.get("is_alive", true))
				if prev_alive:
					candidate_batch.append({
						"category": "SIMULATION",
						"type": "ORGANISM_DIED",
						"simulation_tick": tick,
						"entity_id": id_str,
						"summary": "Organism %s died at tick %d" % [id_str, tick],
						"details": {"tick": tick}
					})

		# 4. Census change check
		var census_var: Variant = snapshot.get("census", null)
		if typeof(census_var) == TYPE_DICTIONARY:
			var current_census: Dictionary = (census_var as Dictionary).duplicate(true)
			var c_prev_alive: int = int(_previous_census.get("alive_count", 0))
			var c_curr_alive: int = int(current_census.get("alive_count", 0))
			var c_prev_dead: int = int(_previous_census.get("dead_count", 0))
			var c_curr_dead: int = int(current_census.get("dead_count", 0))
			var c_prev_total: int = int(_previous_census.get("total_count", 0))
			var c_curr_total: int = int(current_census.get("total_count", 0))

			if c_prev_alive != c_curr_alive or c_prev_dead != c_curr_dead or c_prev_total != c_curr_total:
				candidate_batch.append({
					"category": "SIMULATION",
					"type": "CENSUS_UPDATED",
					"simulation_tick": tick,
					"entity_id": "system",
					"summary": "Census updated at tick %d: %d alive, %d dead, %d total" % [
						tick,
						c_curr_alive,
						c_curr_dead,
						c_curr_total
					],
					"details": {
						"alive_count": c_curr_alive,
						"dead_count": c_curr_dead,
						"total_count": c_curr_total,
						"prev_alive_count": c_prev_alive,
						"prev_dead_count": c_prev_dead,
						"prev_total_count": c_prev_total
					}
				})
			_previous_census = current_census

	# Deterministic batch sort
	_sort_observation_batch(candidate_batch)

	for obs in candidate_batch:
		_append_observation(obs)

	_last_diffed_tick = tick
	_previous_snapshot_map = current_map

# --- Helper Methods ---

func _index_organisms(org_array: Array) -> Dictionary:
	var map: Dictionary = {}
	for org_var in org_array:
		if typeof(org_var) != TYPE_DICTIONARY:
			continue
		var org: Dictionary = org_var
		var org_id: String = String(org.get("organism_id", ""))
		if org_id.is_empty():
			continue

		var pos_dict: Dictionary = {}
		var pos_var: Variant = org.get("position", {})
		if typeof(pos_var) == TYPE_DICTIONARY:
			pos_dict = pos_var

		map[org_id] = {
			"is_alive": bool(org.get("is_alive", true)),
			"current_stage_id": String(org.get("current_stage_id", "")),
			"action_intent": String(org.get("action_intent", "")),
			"pos_x": int(pos_dict.get("x", 0)),
			"pos_y": int(pos_dict.get("y", 0)),
			"pos_z": int(pos_dict.get("z", 0))
		}
	return map

func _append_presentation_observation(category: String, obs_type: String, entity_id: String, summary: String, details: Dictionary) -> void:
	var obs: Dictionary = {
		"category": category,
		"type": obs_type,
		"simulation_tick": null,
		"entity_id": entity_id,
		"summary": summary,
		"details": details
	}
	_append_observation(obs)

func _append_observation(raw_obs: Dictionary) -> void:
	_sequence_id += 1
	var entry: Dictionary = {
		"sequence_id": _sequence_id,
		"session_epoch": _session_epoch,
		"category": String(raw_obs.get("category", "SIMULATION")),
		"type": String(raw_obs.get("type", "")),
		"simulation_tick": raw_obs.get("simulation_tick", null),
		"entity_id": String(raw_obs.get("entity_id", "system")),
		"summary": String(raw_obs.get("summary", "")),
		"details": raw_obs.get("details", {})
	}

	_observation_ring.append(entry)
	if _observation_ring.size() > MAX_ENTRIES:
		_observation_ring.pop_front()

	# Update UI if attached
	if log_container != null:
		var lbl: Label = Label.new()
		lbl.text = "[#%d] %s" % [entry["sequence_id"], entry["summary"]]
		log_container.add_child(lbl)
		if log_container.get_child_count() > MAX_ENTRIES:
			var oldest: Node = log_container.get_child(0)
			oldest.queue_free()

	observation_appended.emit(entry)

# --- Deterministic String Comparator & Sorting ---

func _compare_strings(a: String, b: String) -> int:
	if a < b:
		return -1
	elif a > b:
		return 1
	else:
		return 0

func _sort_string_array(arr: Array) -> void:
	# Insertion sort using strict binary comparison (< and >)
	var n: int = arr.size()
	for i in range(1, n):
		var key: String = String(arr[i])
		var j: int = i - 1
		while j >= 0 and _compare_strings(String(arr[j]), key) > 0:
			arr[j + 1] = arr[j]
			j -= 1
		arr[j + 1] = key

func _sort_observation_batch(batch: Array) -> void:
	# Sort candidate observations deterministically:
	# Primary: type_rank ascending
	# Secondary: entity_id ascending using binary string comparator
	var n: int = batch.size()
	for i in range(1, n):
		var key_obs: Dictionary = batch[i]
		var key_rank: int = int(TYPE_RANKS.get(String(key_obs.get("type", "")), 99))
		var key_id: String = String(key_obs.get("entity_id", ""))
		var j: int = i - 1

		while j >= 0:
			var prev_obs: Dictionary = batch[j]
			var prev_rank: int = int(TYPE_RANKS.get(String(prev_obs.get("type", "")), 99))
			var prev_id: String = String(prev_obs.get("entity_id", ""))

			var should_swap: bool = false
			if prev_rank > key_rank:
				should_swap = true
			elif prev_rank == key_rank:
				if _compare_strings(prev_id, key_id) > 0:
					should_swap = true

			if should_swap:
				batch[j + 1] = batch[j]
				j -= 1
			else:
				break
		batch[j + 1] = key_obs
