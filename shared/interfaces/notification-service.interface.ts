// shared/interfaces/notification-service.interface.ts
export interface INotificationService {
  // Authentication-related notifications
  sendVerificationEmail(email: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
  sendWelcomeEmail(email: string, firstName: string): Promise<void>;
  sendPasswordChangedEmail(email: string, firstName: string): Promise<void>;
  sendLoginAlertEmail(
    email: string,
    firstName: string,
    ipAddress: string,
    userAgent: string,
    timestamp: Date,
  ): Promise<void>;
  sendSuspiciousActivityEmail(
    email: string,
    firstName: string,
    activityType: string,
    timestamp: Date,
  ): Promise<void>;

  // Appointment-related notifications
  sendAppointmentReminder(appointmentData: {
    userEmail: string;
    userName: string;
    counselorEmail: string;
    counselorName: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    meetingRoomUrl?: string;
    minutesBefore?: number;
    meetingType?: string;
  }): Promise<void>;

  sendAppointmentConfirmation(appointmentData: {
    userEmail: string;
    userName: string;
    counselorEmail: string;
    counselorName: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    meetingType?: string;
    duration?: number;
  }): Promise<void>;

  sendAppointmentCancellation(appointmentData: {
    userEmail: string;
    userName: string;
    counselorEmail: string;
    counselorName: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
    cancelledBy: 'user' | 'counselor';
  }): Promise<void>;

  // System notifications
  sendAdminNotification(notification: {
    type: string;
    messageId?: string;
    sessionId?: string;
    reason: string;
    severity: string;
    additionalData?: Record<string, any>;
  }): Promise<void>;

  sendCrisisAlert(alert: {
    sessionId: string;
    messageId: string;
    crisisType: string;
    confidence: number;
    additionalData?: Record<string, any>;
  }): Promise<void>;

  // Bulk operations
  sendBulkEmail(data: {
    userEmails: string[];
    subject: string;
    template: string;
    context: Record<string, any>;
  }): Promise<{ sent: number; failed: string[] }>;

  // Health check
  testEmailConnection(): Promise<{ isHealthy: boolean; message: string }>;
}
