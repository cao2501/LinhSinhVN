class_name IpcClient
extends Node

signal connected()
signal disconnected()
signal response_received(response: Dictionary)
signal bridge_failed(error_message: String)

enum ConnectionState {
	DISCONNECTED,
	CONNECTING,
	CONNECTED
}

const Protocol = preload("res://scripts/ipc/protocol_constants.gd")

var _peer: StreamPeerTCP = StreamPeerTCP.new()
var _state: ConnectionState = ConnectionState.DISCONNECTED
var _request_counter: int = 0
var _receive_buffer: PackedByteArray = PackedByteArray()
var _host: String = Protocol.DEFAULT_IPC_HOST
var _port: int = Protocol.DEFAULT_IPC_PORT

func _init() -> void:
	_peer.big_endian = true

func _ready() -> void:
	set_process(true)

func connect_to_server(host: String = Protocol.DEFAULT_IPC_HOST, port: int = Protocol.DEFAULT_IPC_PORT) -> Error:
	if _state != ConnectionState.DISCONNECTED:
		disconnect_from_server()
	
	_host = host
	_port = port
	_receive_buffer.clear()
	var err: Error = _peer.connect_to_host(host, port)
	if err == OK:
		_state = ConnectionState.CONNECTING
	else:
		_state = ConnectionState.DISCONNECTED
	return err

func disconnect_from_server() -> void:
	if _peer.get_status() != StreamPeerTCP.STATUS_NONE:
		_peer.disconnect_from_host()
	_receive_buffer.clear()
	if _state != ConnectionState.DISCONNECTED:
		_state = ConnectionState.DISCONNECTED
		disconnected.emit()

func get_connection_state() -> ConnectionState:
	return _state

func is_connected_to_server() -> bool:
	return _state == ConnectionState.CONNECTED

func next_request_id() -> String:
	_request_counter += 1
	return "godot_%06d" % _request_counter

func send_command(command: String, params: Dictionary = {}) -> bool:
	if _state != ConnectionState.CONNECTED:
		push_warning("[IpcClient] Cannot send command '%s': not connected." % command)
		return false
	
	var request_id: String = next_request_id()
	var envelope: Dictionary = {
		"protocol_version": Protocol.PROTOCOL_VERSION,
		"request_id": request_id,
		"command": command
	}
	if not params.is_empty():
		envelope["params"] = params
	
	var json_str: String = JSON.stringify(envelope)
	var payload_bytes: PackedByteArray = json_str.to_utf8_buffer()
	var payload_length: int = payload_bytes.size()
	
	if payload_length > Protocol.MAX_FRAME_SIZE:
		push_error("[IpcClient] Payload size %d exceeds MAX_FRAME_SIZE %d" % [payload_length, Protocol.MAX_FRAME_SIZE])
		return false
	
	# Send 4-byte BE length prefix followed by UTF-8 bytes
	_peer.put_u32(payload_length)
	var err: Error = _peer.put_data(payload_bytes)
	return err == OK

func step(ticks: int = 1) -> bool:
	return send_command(Protocol.COMMAND_STEP, {"ticks": ticks})

func play() -> bool:
	return send_command(Protocol.COMMAND_PLAY, {})

func pause() -> bool:
	return send_command(Protocol.COMMAND_PAUSE, {})

func reset() -> bool:
	return send_command(Protocol.COMMAND_RESET, {})

func get_snapshot() -> bool:
	return send_command(Protocol.COMMAND_GET_SNAPSHOT, {})

func _process(_delta: float) -> void:
	_peer.poll()
	var status: StreamPeerTCP.Status = _peer.get_status()
	
	match _state:
		ConnectionState.CONNECTING:
			if status == StreamPeerTCP.STATUS_CONNECTED:
				_state = ConnectionState.CONNECTED
				connected.emit()
			elif status == StreamPeerTCP.STATUS_ERROR or status == StreamPeerTCP.STATUS_NONE:
				_state = ConnectionState.DISCONNECTED
				disconnected.emit()
		
		ConnectionState.CONNECTED:
			if status != StreamPeerTCP.STATUS_CONNECTED:
				_state = ConnectionState.DISCONNECTED
				disconnected.emit()
				return
			_read_incoming_data()

func _read_incoming_data() -> void:
	var available: int = _peer.get_available_bytes()
	if available <= 0:
		return
	
	var read_res: Array = _peer.get_data(available)
	if read_res[0] != OK:
		return
	
	var new_bytes: PackedByteArray = read_res[1]
	_receive_buffer.append_array(new_bytes)
	
	# Frame parsing loop
	while _receive_buffer.size() >= 4:
		# Read 4-byte BE length prefix
		var length_slice: PackedByteArray = _receive_buffer.slice(0, 4)
		var payload_length: int = (length_slice[0] << 24) | (length_slice[1] << 16) | (length_slice[2] << 8) | length_slice[3]
		
		# Reject oversized frame
		if payload_length > Protocol.MAX_FRAME_SIZE:
			push_error("[IpcClient] Received frame exceeding MAX_FRAME_SIZE: %d bytes. Closing connection." % payload_length)
			disconnect_from_server()
			return
		
		# Check if complete frame received
		if _receive_buffer.size() < 4 + payload_length:
			break
		
		var payload_slice: PackedByteArray = _receive_buffer.slice(4, 4 + payload_length)
		_receive_buffer = _receive_buffer.slice(4 + payload_length)
		
		if payload_length == 0:
			push_warning("[IpcClient] Zero-length frame payload received.")
			continue
		
		var json_str: String = payload_slice.get_string_from_utf8()
		var parsed_res: Variant = JSON.parse_string(json_str)
		
		if typeof(parsed_res) != TYPE_DICTIONARY:
			push_warning("[IpcClient] Invalid JSON response payload.")
			continue
		
		var response_dict: Dictionary = parsed_res
		response_received.emit(response_dict)
		
		# Check for bridge FAILED state (SESSION_ERROR)
		if not response_dict.get("success", true):
			var err_dict = response_dict.get("error", {})
			if typeof(err_dict) == TYPE_DICTIONARY and err_dict.get("code", "") == Protocol.ERROR_SESSION_ERROR:
				bridge_failed.emit(err_dict.get("message", "Simulation session error"))
