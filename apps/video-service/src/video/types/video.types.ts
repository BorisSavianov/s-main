// apps/video-service/src/video/types/video.types.ts
// Comprehensive TypeScript types for video service

// WebRTC Signaling Types
export type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'renegotiate';

export interface WebRTCSignalData {
  type: SignalType;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  targetUserId?: string;
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RTCConfiguration {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: 'all' | 'relay';
  bundlePolicy?: 'balanced' | 'max-compat' | 'max-bundle';
  rtcpMuxPolicy?: 'require';
}

// Room Types
export type RoomStatus = 'waiting' | 'active' | 'ended' | 'cancelled';
export type ParticipantRole = 'host' | 'moderator' | 'participant' | 'observer';
export type ParticipantStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type SessionType = 'video_call' | 'screen_share' | 'recording' | 'live_stream';

// Media State
export interface MediaState {
  video: boolean;
  audio: boolean;
  screenShare: boolean;
  speaking: boolean;
  dominantSpeaker: boolean;
}

export interface DeviceCapabilities {
  video: boolean;
  audio: boolean;
  screenShare: boolean;
  recording: boolean;
}

// Room Settings
export interface RoomSettings {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  chatEnabled: boolean;
  waitingRoomEnabled: boolean;
  muteOnEntry: boolean;
  backgroundBlurEnabled: boolean;
  maxVideosVisible: number;
}

// Connection Quality
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

export interface ConnectionStats {
  rtt: number; // Round-trip time in ms
  jitter: number; // Jitter in ms
  packetLoss: number; // Packet loss percentage
  bandwidth: number; // Available bandwidth in kbps
  quality: ConnectionQuality;
  timestamp: Date;
}

// WebSocket Event Types
export enum VideoSocketEvent {
  // Connection events
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  AUTH_ERROR = 'auth-error',
  CONNECTION_ERROR = 'connection-error',

  // Room events
  JOIN_ROOM = 'join-room',
  JOINED_ROOM = 'joined-room',
  JOIN_ROOM_ERROR = 'join-room-error',
  LEAVE_ROOM = 'leave-room',
  LEFT_ROOM = 'left-room',
  LEAVE_ROOM_ERROR = 'leave-room-error',
  ROOM_ENDED = 'room-ended',
  END_ROOM = 'end-room',
  END_ROOM_ERROR = 'end-room-error',

  // Participant events
  PARTICIPANT_JOINED = 'participant-joined',
  PARTICIPANT_LEFT = 'participant-left',
  PARTICIPANTS_LIST = 'participants-list',
  PARTICIPANT_MEDIA_CHANGED = 'participant-media-changed',

  // WebRTC signaling
  WEBRTC_SIGNAL = 'webrtc-signal',
  WEBRTC_SIGNAL_ERROR = 'webrtc-signal-error',

  // Media state
  MEDIA_STATE_CHANGED = 'media-state-changed',
  MEDIA_STATE_ERROR = 'media-state-error',

  // Chat
  CHAT_MESSAGE = 'chat-message',
  CHAT_MESSAGE_ERROR = 'chat-message-error',

  // Recording
  START_RECORDING = 'start-recording',
  STOP_RECORDING = 'stop-recording',
  RECORDING_STARTED = 'recording-started',
  RECORDING_STOPPED = 'recording-stopped',
  RECORDING_ERROR = 'recording-error',

  // Stats
  GET_ROOM_STATS = 'get-room-stats',
  ROOM_STATS = 'room-stats',
  ROOM_STATS_ERROR = 'room-stats-error',

  // Quality
  CONNECTION_QUALITY = 'connection-quality',

  // Heartbeat
  PING = 'ping',
  PONG = 'pong',
}

// Chat Message Types
export type ChatMessageType = 'text' | 'emoji' | 'system' | 'file';

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  message: string;
  type: ChatMessageType;
  fileUrl?: string;
  fileName?: string;
  timestamp: Date;
}

// Room Response Types
export interface JoinRoomResponse {
  room: {
    id: string;
    roomId: string;
    meetingId?: string;
    status: RoomStatus;
    roomSettings: RoomSettings;
    startedAt?: Date;
    maxParticipants: number;
  };
  participant: {
    id: string;
    userId: string;
    displayName: string;
    role: ParticipantRole;
    mediaState: MediaState;
  };
  rtcConfiguration: RTCConfiguration;
  sessionToken: string;
}

export interface RoomStats {
  participantCount: number;
  sessionDuration: number;
  bandwidth: number;
  connectionQuality: ConnectionQuality;
}

// Recording Types
export interface RecordingInfo {
  id: string;
  roomId: string;
  url?: string;
  duration?: number;
  size?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: Date;
  endedAt?: Date;
}

// Participant Info
export interface ParticipantInfo {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  mediaState: MediaState;
  deviceCapabilities: DeviceCapabilities;
  connectionStats?: ConnectionStats;
  joinedAt: Date;
  lastSeen: Date;
}

// Event Payloads
export interface ParticipantJoinedPayload {
  participant: ParticipantInfo;
  timestamp: Date;
}

export interface ParticipantLeftPayload {
  participant: ParticipantInfo;
  timestamp: Date;
}

export interface MediaStateChangedPayload {
  userId: string;
  mediaState: Partial<MediaState>;
  timestamp: Date;
}

export interface RoomEndedPayload {
  roomId: string;
  reason?: string;
  duration: number;
  timestamp: Date;
}

// Utility function to calculate connection quality
export function calculateConnectionQuality(stats: Partial<ConnectionStats>): ConnectionQuality {
  const { rtt = 0, packetLoss = 0, jitter = 0 } = stats;

  if (packetLoss > 10 || rtt > 500 || jitter > 100) {
    return 'poor';
  }
  if (packetLoss > 5 || rtt > 300 || jitter > 50) {
    return 'fair';
  }
  if (packetLoss > 2 || rtt > 150 || jitter > 25) {
    return 'good';
  }
  return 'excellent';
}
